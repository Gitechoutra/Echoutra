
import logging
import traceback
from datetime import datetime, timedelta, timezone

from flask import jsonify, request
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from werkzeug.security import generate_password_hash, check_password_hash

from portal.models.users                  import Users, UserStatus
from portal.models.roles                  import Roles
from portal.models.user_profiles          import UserProfiles
from portal.models.user_preferences       import UserPreferences
from portal.models.user_security_settings import UserSecuritySettings
from portal.models.user_sessions          import UserSessions, SessionStatus
from portal.models.otp_verifications      import OTPVerifications, OTPPurpose, OTPStatus
from portal.models.login_history          import LoginHistory, LoginStatus
from portal.models.wallets                import Wallets
from portal.models.notification_preferences import NotificationPreferences
from portal.models.audit_logs             import AuditLogs

from portal.helpers.email import (
    send_otp_email,
    send_welcome_email,
    send_password_reset_email,
    send_password_changed_email,
)

# ── Fix: import db from portal, NOT APP ──────────────────────────────────────
from portal import db

from . import ns, logger


# ── Helpers  ─────────────

def _client_ip():
    return request.headers.get('X-Forwarded-For', request.remote_addr)


def _build_tokens(user: Users):
    additional = {
        'role':     user.role.role_name,
        'email':    user.email,
        'user_id':  user.user_id,
        'username': user.username,
    }
    access  = create_access_token(identity=str(user.user_id), additional_claims=additional)
    refresh = create_refresh_token(identity=str(user.user_id), additional_claims=additional)
    return access, refresh


def _log_login(user_id, status, reason=None, session_id=None):
    try:
        h                = LoginHistory()
        h.user_id        = user_id
        h.status         = status
        h.failure_reason = reason
        h.ip_address     = _client_ip()
        h.user_agent     = request.headers.get('User-Agent', '')
        h.session_id     = session_id
        h.save()
    except Exception as e:
        logger.warning(f"[Auth] _log_login failed (non-fatal): {e}")


# ── Parsers  ─────────────

register_parser = reqparse.RequestParser()
register_parser.add_argument('email',     type=str, required=True,  location='json')
register_parser.add_argument('username',  type=str, required=True,  location='json')
register_parser.add_argument('password',  type=str, required=True,  location='json')
register_parser.add_argument('full_name', type=str, required=False, location='json')
register_parser.add_argument('role_name', type=str, required=False, location='json', default='USER')

login_parser = reqparse.RequestParser()
login_parser.add_argument('email',    type=str, required=True, location='json')
login_parser.add_argument('password', type=str, required=True, location='json')

otp_parser = reqparse.RequestParser()
otp_parser.add_argument('otp_code', type=str, required=True, location='json')
otp_parser.add_argument('purpose',  type=str, required=True, location='json')

resend_otp_parser = reqparse.RequestParser()
resend_otp_parser.add_argument('purpose', type=str, required=True, location='json')

pw_reset_req_parser = reqparse.RequestParser()
pw_reset_req_parser.add_argument('email', type=str, required=True, location='json')

pw_reset_parser = reqparse.RequestParser()
pw_reset_parser.add_argument('email',        type=str, required=True, location='json')
pw_reset_parser.add_argument('otp_code',     type=str, required=True, location='json')
pw_reset_parser.add_argument('new_password', type=str, required=True, location='json')

change_pw_parser = reqparse.RequestParser()
change_pw_parser.add_argument('old_password', type=str, required=True, location='json')
change_pw_parser.add_argument('new_password', type=str, required=True, location='json')


# ── Register  ────────────

@ns.route('/register')
class Register(Resource):
    @ns.doc(
        description='Create a new user account and send OTP to email.',
        responses={200: 'Created', 400: 'Validation error', 500: 'Server error'}
    )
    @ns.expect(register_parser, validate=True)
    def post(self):
        try:
            args      = register_parser.parse_args(strict=False)
            email     = args['email'].strip().lower()
            username  = args['username'].strip()
            password  = args['password']
            full_name = (args.get('full_name') or '').strip()
            role_name = (args.get('role_name') or 'USER').strip().upper()

            print(request.json, "33333333333333333333333333333")

            # ── Duplicate checks ──────────────────────────────────────────────
            if Users.query.filter_by(email=email).first():
                return jsonify(bool=False, status=400,
                               response={'message': 'Email already registered.'})
            if Users.query.filter_by(username=username).first():
                return jsonify(bool=False, status=400,
                               response={'message': 'Username already taken.'})

            # ── Role lookup ───────────────────────────────────────────────────
            role = Roles.query.filter_by(role_name=role_name).first()
            if not role:
                return jsonify(bool=False, status=400,
                               response={'message': f"Role '{role_name}' not found."})
            
            print(request.json, "22222222222222222222222222222222")

            # ── Create user ───────────────────────────────────────────────────
            user               = Users()
            user.email         = email
            user.username      = username
            user.password_hash = generate_password_hash(password)
            user.full_name     = full_name
            user.role_id       = role.role_id
            user.status        = UserStatus.PENDING
            user.save()
            print(request.json, "1111111111111111111111111111111111")

            # ── Companion records ─────────────────────────────────────────────
            profile         = UserProfiles();            profile.user_id  = user.user_id; profile.save()
            prefs           = UserPreferences();         prefs.user_id    = user.user_id; prefs.save()
            sec             = UserSecuritySettings();    sec.user_id      = user.user_id; sec.save()
            wallet          = Wallets();                 wallet.user_id   = user.user_id; wallet.save()
            notif_pref      = NotificationPreferences(); notif_pref.user_id = user.user_id; notif_pref.save()

            # ── Generate + store OTP ──────────────────────────────────────────
            import random
            raw_otp = str(random.randint(100000, 999999))  # plain 6-digit code

            otp                 = OTPVerifications()
            otp.user_id         = user.user_id
            otp.otp_code        = generate_password_hash(raw_otp)  # hash for storage
            otp.purpose         = OTPPurpose.EMAIL_VERIFICATION
            otp.delivery_method = 'EMAIL'
            otp.delivery_target = email
            otp.expires_at      = datetime.now(timezone.utc) + timedelta(minutes=10)
            otp.save()

            print(request.json, "444444444444444444444444444444")

            # ── Send OTP email (raw_otp goes to user, hash stays in DB) ───────
            email_sent = send_otp_email(
                to_email=email,
                full_name=full_name or username,
                otp_code=raw_otp        # ← send the PLAIN code, NOT the hash
            )
            if not email_sent:
                logger.warning(f"[Auth] OTP email failed for {email} — check MAIL config in .env")

            # ── Build tokens ──────────────────────────────────────────────────
            access, refresh = _build_tokens(user)

            print(request.json, "555555555555555555555555555555")

            logger.info(f"[Auth] User registered: {email} | OTP email sent: {email_sent}")

            return jsonify(bool=True, status=200, response={
                'message':       'Registration successful. OTP sent to your email.',
                'access_token':  access,
                'refresh_token': refresh,
                'user_id':       user.user_id,
                'email':         user.email,
                'role':          role.role_name,
                'otp_email_sent':email_sent,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Login  ───────────────

@ns.route('/login')
class Login(Resource):
    @ns.doc(
        description='Login with email and password. Returns JWT access + refresh tokens.',
        responses={200: 'OK', 400: 'Bad credentials', 403: 'Suspended/Banned', 500: 'Server error'}
    )
    @ns.expect(login_parser, validate=True)
    def post(self):
        try:
            args     = login_parser.parse_args(strict=False)
            email    = args['email'].strip().lower()
            password = args['password']

            user = Users.query.filter_by(email=email).first()

            if not user or not check_password_hash(user.password_hash, password):
                if user:
                    _log_login(user.user_id, LoginStatus.FAILED, 'Invalid password')
                return jsonify(bool=False, status=400,
                               response={'message': 'Invalid email or password.'})

            if user.status == UserStatus.SUSPENDED:
                _log_login(user.user_id, LoginStatus.BLOCKED, 'Account suspended')
                return jsonify(bool=False, status=403,
                               response={'message': 'Account suspended. Contact support.'})

            if user.status == UserStatus.BANNED:
                _log_login(user.user_id, LoginStatus.BLOCKED, 'Account banned')
                return jsonify(bool=False, status=403,
                               response={'message': 'Account banned.'})

            # 2FA check
            sec = user.security_settings
            if sec and sec.is_2fa_enabled:
                return jsonify(bool=True, status=202, response={
                    'message':         'Two-factor authentication required.',
                    'two_fa_required': True,
                    'user_id':         user.user_id,
                })

            access, refresh = _build_tokens(user)

            # Session record
            session               = UserSessions()
            session.user_id       = user.user_id
            session.session_token = access
            session.refresh_token = refresh
            session.status        = SessionStatus.ACTIVE
            session.ip_address    = _client_ip()
            session.user_agent    = request.headers.get('User-Agent', '')
            session.expires_at    = datetime.now(timezone.utc) + timedelta(hours=2)
            session.save()

            user.last_login = datetime.now(timezone.utc)
            user.update()

            _log_login(user.user_id, LoginStatus.SUCCESS, session_id=session.session_id)

            return jsonify(bool=True, status=200, response={
                'message':           'Login successful.',
                'access_token':      access,
                'refresh_token':     refresh,
                'user_id':           user.user_id,
                'role':              user.role.role_name,
                'email':             user.email,
                'username':          user.username,
                'is_email_verified': user.is_email_verified,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Verify OTP  ──────────

@ns.route('/verify_otp')
class VerifyOTP(Resource):
    @ns.doc(
        description='Verify OTP code. Purpose: EMAIL_VERIFICATION, PASSWORD_RESET, TWO_FA, etc.',
        responses={200: 'Verified', 400: 'Invalid/Expired OTP', 500: 'Server error'}
    )
    @jwt_required()
    @ns.expect(otp_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = otp_parser.parse_args(strict=False)
            raw_otp = args['otp_code'].strip()
            purpose = args['purpose'].strip().upper()

            otp = (OTPVerifications.query
                   .filter_by(user_id=user_id, purpose=purpose, status=OTPStatus.PENDING)
                   .order_by(OTPVerifications.created_on.desc())
                   .first())

            if not otp:
                return jsonify(bool=False, status=400,
                               response={'message': 'No pending OTP found.'})

            # Check expiry
            if datetime.now(timezone.utc) > otp.expires_at.replace(tzinfo=timezone.utc):
                otp.status = OTPStatus.EXPIRED
                otp.update()
                return jsonify(bool=False, status=400,
                               response={'message': 'OTP has expired. Please request a new one.'})

            # Increment attempts
            otp.attempts = (otp.attempts or 0) + 1
            if otp.attempts > otp.max_attempts:
                otp.status = OTPStatus.FAILED
                otp.update()
                return jsonify(bool=False, status=400,
                               response={'message': 'Maximum OTP attempts exceeded. Request a new OTP.'})

            # Verify hash
            if not check_password_hash(otp.otp_code, raw_otp):
                otp.update()
                return jsonify(bool=False, status=400, response={
                    'message':            'Invalid OTP.',
                    'attempts_remaining': otp.max_attempts - otp.attempts,
                })

            # ── OTP is valid ──────────────────────────────────────────────────
            otp.status      = OTPStatus.VERIFIED
            otp.verified_at = datetime.now(timezone.utc)
            otp.update()

            # Activate account on email verification
            if purpose == OTPPurpose.EMAIL_VERIFICATION:
                user = Users.query.get(user_id)
                if user:
                    user.is_email_verified = True
                    user.status            = UserStatus.ACTIVE
                    user.update()
                    # Send welcome email
                    send_welcome_email(
                        to_email=user.email,
                        full_name=user.full_name or user.username
                    )

            return jsonify(bool=True, status=200, response={
                'message': 'OTP verified successfully.',
                'purpose': purpose,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Resend OTP  ──────────

@ns.route('/resend_otp')
class ResendOTP(Resource):
    @ns.doc(description='Resend a fresh OTP to the authenticated user\'s email.')
    @jwt_required()
    @ns.expect(resend_otp_parser, validate=True)
    def post(self):
        try:
            import random
            user_id = int(get_jwt_identity())
            args    = resend_otp_parser.parse_args(strict=False)
            purpose = args['purpose'].strip().upper()

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404,
                               response={'message': 'User not found.'})

            # ── Fix: use db.session.commit() (imported from portal) ───────────
            (OTPVerifications.query
             .filter_by(user_id=user_id, purpose=purpose, status=OTPStatus.PENDING)
             .update({'status': OTPStatus.EXPIRED}))
            db.session.commit()   # ← was broken before (was using APP instead of db)

            # Generate new OTP
            raw_otp = str(random.randint(100000, 999999))

            otp                 = OTPVerifications()
            otp.user_id         = user_id
            otp.otp_code        = generate_password_hash(raw_otp)
            otp.purpose         = purpose
            otp.delivery_method = 'EMAIL'
            otp.delivery_target = user.email
            otp.expires_at      = datetime.now(timezone.utc) + timedelta(minutes=10)
            otp.save()

            # Send email
            email_sent = send_otp_email(
                to_email=user.email,
                full_name=user.full_name or user.username,
                otp_code=raw_otp
            )

            logger.info(f"[Auth] OTP resent to {user.email} | email_sent={email_sent}")

            return jsonify(bool=True, status=200, response={
                'message':       'OTP resent successfully.',
                'otp_email_sent':email_sent,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Forgot Password  ─────

@ns.route('/forgot_password')
class ForgotPassword(Resource):
    @ns.doc(description='Request a password-reset OTP by email.')
    @ns.expect(pw_reset_req_parser, validate=True)
    def post(self):
        try:
            import random
            args  = pw_reset_req_parser.parse_args(strict=False)
            email = args['email'].strip().lower()

            user = Users.query.filter_by(email=email).first()
            # Always return success to prevent email enumeration
            if user:
                raw_otp             = str(random.randint(100000, 999999))
                otp                 = OTPVerifications()
                otp.user_id         = user.user_id
                otp.otp_code        = generate_password_hash(raw_otp)
                otp.purpose         = OTPPurpose.PASSWORD_RESET
                otp.delivery_method = 'EMAIL'
                otp.delivery_target = email
                otp.expires_at      = datetime.now(timezone.utc) + timedelta(minutes=15)
                otp.save()

                send_otp_email(
                    to_email=email,
                    full_name=user.full_name or user.username,
                    otp_code=raw_otp
                )

            return jsonify(bool=True, status=200, response={
                'message': 'If that email exists, a reset OTP has been sent.'
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Reset Password  ──────

@ns.route('/reset_password')
class ResetPassword(Resource):
    @ns.doc(description='Reset password using the OTP received by email.')
    @ns.expect(pw_reset_parser, validate=True)
    def post(self):
        try:
            args         = pw_reset_parser.parse_args(strict=False)
            email        = args['email'].strip().lower()
            raw_otp      = args['otp_code'].strip()
            new_password = args['new_password']

            user = Users.query.filter_by(email=email).first()
            if not user:
                return jsonify(bool=False, status=404,
                               response={'message': 'User not found.'})

            otp = (OTPVerifications.query
                   .filter_by(user_id=user.user_id,
                               purpose=OTPPurpose.PASSWORD_RESET,
                               status=OTPStatus.PENDING)
                   .order_by(OTPVerifications.created_on.desc())
                   .first())

            if not otp:
                return jsonify(bool=False, status=400,
                               response={'message': 'No pending OTP found.'})

            if datetime.now(timezone.utc) > otp.expires_at.replace(tzinfo=timezone.utc):
                otp.status = OTPStatus.EXPIRED
                otp.update()
                return jsonify(bool=False, status=400,
                               response={'message': 'OTP has expired.'})

            if not check_password_hash(otp.otp_code, raw_otp):
                return jsonify(bool=False, status=400,
                               response={'message': 'Invalid OTP.'})

            user.password_hash        = generate_password_hash(new_password)
            user.last_password_change = datetime.now(timezone.utc)
            user.update()

            otp.status      = OTPStatus.VERIFIED
            otp.verified_at = datetime.now(timezone.utc)
            otp.update()

            send_password_changed_email(
                to_email=user.email,
                full_name=user.full_name or user.username
            )

            return jsonify(bool=True, status=200,
                           response={'message': 'Password reset successfully.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Change Password  ─────

@ns.route('/change_password')
class ChangePassword(Resource):
    @ns.doc(description='Authenticated user changes their own password.')
    @jwt_required()
    @ns.expect(change_pw_parser, validate=True)
    def post(self):
        try:
            user_id      = int(get_jwt_identity())
            args         = change_pw_parser.parse_args(strict=False)
            old_password = args['old_password']
            new_password = args['new_password']

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404,
                               response={'message': 'User not found.'})

            if not check_password_hash(user.password_hash, old_password):
                return jsonify(bool=False, status=400,
                               response={'message': 'Old password is incorrect.'})

            user.password_hash        = generate_password_hash(new_password)
            user.last_password_change = datetime.now(timezone.utc)
            user.update()

            send_password_changed_email(
                to_email=user.email,
                full_name=user.full_name or user.username
            )

            return jsonify(bool=True, status=200,
                           response={'message': 'Password changed successfully.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Refresh Token  ───────

@ns.route('/refresh')
class RefreshToken(Resource):
    @ns.doc(description='Get a new access token using the refresh token.')
    @jwt_required(refresh=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            user    = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404,
                               response={'message': 'User not found.'})

            access, _ = _build_tokens(user)
            return jsonify(bool=True, status=200, response={'access_token': access})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Logout  ──────────────

@ns.route('/logout')
class Logout(Resource):
    @ns.doc(description='Logout — revokes the current active session.')
    @jwt_required()
    def post(self):
        try:
            user_id = int(get_jwt_identity())

            session = UserSessions.query.filter_by(
                user_id=user_id, status=SessionStatus.ACTIVE
            ).first()
            if session:
                session.status = SessionStatus.REVOKED
                session.update()

            return jsonify(bool=True, status=200,
                           response={'message': 'Logged out successfully.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Me  ──────────────────

@ns.route('/me')
class Me(Resource):
    @ns.doc(description='Return the currently authenticated user\'s profile.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            user    = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404,
                               response={'message': 'User not found.'})

            return jsonify(bool=True, status=200, response={
                'user_id':            user.user_id,
                'email':              user.email,
                'username':           user.username,
                'full_name':          user.full_name,
                'role':               user.role.role_name,
                'status':             user.status,
                'is_email_verified':  user.is_email_verified,
                'last_login':         str(user.last_login) if user.last_login else None,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})













