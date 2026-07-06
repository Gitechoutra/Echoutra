import logging
import traceback
import pyotp

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from werkzeug.security import check_password_hash

from portal.models.user_security_settings import UserSecuritySettings
from portal.models.user_sessions          import UserSessions, SessionStatus
from portal.models.users                  import Users
from portal.models.audit_logs             import AuditLogs

from . import ns, logger

two_fa_enable_parser = reqparse.RequestParser()
two_fa_enable_parser.add_argument('method',  type=str, required=True,  location='json')  # TOTP, SMS, EMAIL
two_fa_enable_parser.add_argument('otp_code',type=str, required=False, location='json')

two_fa_disable_parser = reqparse.RequestParser()
two_fa_disable_parser.add_argument('password', type=str, required=True, location='json')

session_timeout_parser = reqparse.RequestParser()
session_timeout_parser.add_argument('timeout_minutes', type=int, required=True, location='json')

ip_parser = reqparse.RequestParser()
ip_parser.add_argument('ip_address', type=str, required=True, location='json')


def _sec_dict(s: UserSecuritySettings) -> dict:
    return {
        'security_id':              s.security_id,
        'is_2fa_enabled':           s.is_2fa_enabled,
        'two_fa_method':            s.two_fa_method,
        'session_timeout_minutes':  s.session_timeout_minutes,
        'max_sessions':             s.max_sessions,
        'auto_logout_on_inactivity':s.auto_logout_on_inactivity,
        'login_alert_email':        s.login_alert_email,
        'login_alert_new_device':   s.login_alert_new_device,
        'login_alert_new_location': s.login_alert_new_location,
        'failed_login_attempts':    s.failed_login_attempts,
        'ip_whitelist':             s.ip_whitelist or [],
        'updated_on':               str(s.updated_on),
    }


# ── Get Security Settings ──────────────────────────────────────────────────────

@ns.route('/me')
class MySecuritySettings(Resource):
    @ns.doc(description='Get own security settings.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            sec     = UserSecuritySettings.query.filter_by(user_id=user_id).first()
            if not sec:
                return jsonify(bool=False, status=404, response={'message': 'Security settings not found.'})
            return jsonify(bool=True, status=200, response=_sec_dict(sec))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Generate TOTP Setup  ─

@ns.route('/2fa/setup_totp')
class SetupTOTP(Resource):
    @ns.doc(description='Generate TOTP secret and provisioning URI for authenticator app.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            user    = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            secret = pyotp.random_base32()
            totp   = pyotp.TOTP(secret)
            uri    = totp.provisioning_uri(name=user.email, issuer_name='TradeFlow')

            # Store secret temporarily (user must confirm before enabling)
            sec = user.security_settings
            sec.totp_secret = secret  # Should be encrypted at rest in production
            sec.update()

            return jsonify(bool=True, status=200, response={
                'secret':           secret,
                'provisioning_uri': uri,
                'message':          'Scan the QR code with your authenticator app, then call /enable_totp.',
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Enable 2FA  ──────────

@ns.route('/2fa/enable')
class Enable2FA(Resource):
    @ns.doc(description='Enable 2FA after confirming OTP code from authenticator app.')
    @jwt_required()
    @ns.expect(two_fa_enable_parser, validate=True)
    def post(self):
        try:
            from datetime import datetime, timezone
            user_id = int(get_jwt_identity())
            args    = two_fa_enable_parser.parse_args(strict=False)
            method  = args['method'].upper()
            otp_code= args.get('otp_code', '').strip()

            sec = UserSecuritySettings.query.filter_by(user_id=user_id).first()
            if not sec:
                return jsonify(bool=False, status=404, response={'message': 'Security settings not found.'})

            if method == 'TOTP':
                if not sec.totp_secret:
                    return jsonify(bool=False, status=400, response={'message': 'Call /2fa/setup_totp first.'})
                totp = pyotp.TOTP(sec.totp_secret)
                if not totp.verify(otp_code):
                    return jsonify(bool=False, status=400, response={'message': 'Invalid TOTP code.'})

            sec.is_2fa_enabled    = True
            sec.two_fa_method     = method
            sec.totp_enabled_on   = datetime.now(timezone.utc)
            sec.update()

            log = AuditLogs()
            log.user_id         = user_id
            log.action          = 'ENABLE_2FA'
            log.action_category = 'SECURITY'
            log.description     = f'2FA enabled via {method}'
            log.status          = 'SUCCESS'
            log.save()

            return jsonify(bool=True, status=200, response={'message': f'2FA enabled via {method}.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Disable 2FA  ─────────

@ns.route('/2fa/disable')
class Disable2FA(Resource):
    @ns.doc(description='Disable 2FA (requires password confirmation).')
    @jwt_required()
    @ns.expect(two_fa_disable_parser, validate=True)
    def post(self):
        try:
            user_id  = int(get_jwt_identity())
            args     = two_fa_disable_parser.parse_args(strict=False)
            password = args['password']

            user = Users.query.get(user_id)
            if not check_password_hash(user.password_hash, password):
                return jsonify(bool=False, status=400, response={'message': 'Incorrect password.'})

            sec = user.security_settings
            sec.is_2fa_enabled = False
            sec.two_fa_method  = None
            sec.totp_secret    = None
            sec.update()

            return jsonify(bool=True, status=200, response={'message': '2FA disabled successfully.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Update Session Timeout ─────────────────────────────────────────────────────

@ns.route('/session_timeout')
class SessionTimeout(Resource):
    @ns.doc(description='Update session idle timeout (minutes).')
    @jwt_required()
    @ns.expect(session_timeout_parser, validate=True)
    def put(self):
        try:
            user_id = int(get_jwt_identity())
            args    = session_timeout_parser.parse_args(strict=False)
            minutes = args['timeout_minutes']
            if minutes < 5 or minutes > 1440:
                return jsonify(bool=False, status=400, response={'message': 'Timeout must be 5–1440 minutes.'})

            sec = UserSecuritySettings.query.filter_by(user_id=user_id).first()
            sec.session_timeout_minutes = minutes
            sec.update()
            return jsonify(bool=True, status=200, response={'message': 'Session timeout updated.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Add IP to Whitelist  ─

@ns.route('/ip_whitelist/add')
class AddIPWhitelist(Resource):
    @ns.doc(description='Add an IP address to the personal whitelist.')
    @jwt_required()
    @ns.expect(ip_parser, validate=True)
    def post(self):
        try:
            user_id    = int(get_jwt_identity())
            args       = ip_parser.parse_args(strict=False)
            ip_address = args['ip_address'].strip()

            sec = UserSecuritySettings.query.filter_by(user_id=user_id).first()
            whitelist = sec.ip_whitelist or []
            if ip_address not in whitelist:
                whitelist.append(ip_address)
                sec.ip_whitelist = whitelist
                sec.update()

            return jsonify(bool=True, status=200, response={
                'message':      f'IP {ip_address} added to whitelist.',
                'ip_whitelist': whitelist,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Remove IP from Whitelist ───────────────────────────────────────────────────

@ns.route('/ip_whitelist/remove')
class RemoveIPWhitelist(Resource):
    @ns.doc(description='Remove an IP address from personal whitelist.')
    @jwt_required()
    @ns.expect(ip_parser, validate=True)
    def post(self):
        try:
            user_id    = int(get_jwt_identity())
            args       = ip_parser.parse_args(strict=False)
            ip_address = args['ip_address'].strip()

            sec = UserSecuritySettings.query.filter_by(user_id=user_id).first()
            whitelist = sec.ip_whitelist or []
            if ip_address in whitelist:
                whitelist.remove(ip_address)
                sec.ip_whitelist = whitelist
                sec.update()

            return jsonify(bool=True, status=200, response={
                'message':      f'IP {ip_address} removed from whitelist.',
                'ip_whitelist': whitelist,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── My Active Sessions  ──

@ns.route('/sessions')
class MySessions(Resource):
    @ns.doc(description='List all active sessions for current user.')
    @jwt_required()
    def get(self):
        try:
            user_id  = int(get_jwt_identity())
            sessions = (UserSessions.query
                        .filter_by(user_id=user_id)
                        .order_by(UserSessions.created_on.desc())
                        .limit(10).all())

            return jsonify(bool=True, status=200, response={
                'sessions': [{
                    'session_id':   s.session_id,
                    'status':       s.status,
                    'device_type':  s.device_type,
                    'device_name':  s.device_name,
                    'browser':      s.browser,
                    'os':           s.os,
                    'ip_address':   s.ip_address,
                    'city':         s.city,
                    'country':      s.country,
                    'last_activity':str(s.last_activity),
                    'created_on':   str(s.created_on),
                } for s in sessions]
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/sessions/<int:session_id>/revoke')
class RevokeSession(Resource):
    @ns.doc(description='Revoke a specific session.')
    @jwt_required()
    def post(self, session_id):
        try:
            user_id = int(get_jwt_identity())
            session = UserSessions.query.filter_by(session_id=session_id, user_id=user_id).first()
            if not session:
                return jsonify(bool=False, status=404, response={'message': 'Session not found.'})

            session.status = SessionStatus.REVOKED
            session.update()
            return jsonify(bool=True, status=200, response={'message': 'Session revoked.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
