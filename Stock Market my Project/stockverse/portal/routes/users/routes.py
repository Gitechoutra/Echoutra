import logging
import traceback
from datetime import datetime, timezone

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from werkzeug.security import generate_password_hash

from portal.models.users              import Users, UserStatus
from portal.models.roles              import Roles
from portal.models.user_sessions      import UserSessions, SessionStatus
from portal.models.login_history      import LoginHistory
from portal.models.admin_activity_logs import AdminActivityLogs
from portal.models.audit_logs         import AuditLogs

from . import ns, logger


def _require_admin():
    claims = get_jwt()
    if claims.get('role') != 'ADMIN':
        return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})
    return None


# ── Parsers  ─────────────

list_parser = reqparse.RequestParser()
list_parser.add_argument('page',     type=int, default=1,     location='args')
list_parser.add_argument('per_page', type=int, default=20,    location='args')
list_parser.add_argument('status',   type=str, required=False, location='args')
list_parser.add_argument('role',     type=str, required=False, location='args')
list_parser.add_argument('search',   type=str, required=False, location='args')
list_parser.add_argument('sort_by',  type=str, default='created_on', location='args')
list_parser.add_argument('order',    type=str, default='desc', location='args')

suspend_parser = reqparse.RequestParser()
suspend_parser.add_argument('reason', type=str, required=True, location='json')

status_parser = reqparse.RequestParser()
status_parser.add_argument('status', type=str, required=True, location='json')
status_parser.add_argument('reason', type=str, required=False, location='json')

role_parser = reqparse.RequestParser()
role_parser.add_argument('role_name', type=str, required=True, location='json')

admin_note_parser = reqparse.RequestParser()
admin_note_parser.add_argument('note', type=str, required=True, location='json')


def _user_dict(u: Users) -> dict:
    profile = u.profile
    return {
        'user_id':           u.user_id,
        'email':             u.email,
        'username':          u.username,
        'full_name':         u.full_name,
        'role':              u.role.role_name if u.role else None,
        'status':            u.status,
        'is_email_verified': u.is_email_verified,
        'last_login':        str(u.last_login) if u.last_login else None,
        'country':           profile.country if profile else None,
        'avatar_url':        profile.avatar_url if profile else None,
        'created_on':        str(u.created_on),
    }


# ── List Users (Admin)  ──

@ns.route('/list_users')
class ListUsers(Resource):
    @ns.doc(description='[ADMIN] List all users with filters, search and pagination.')
    @jwt_required()
    @ns.expect(list_parser)
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            args     = list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])
            query    = Users.query

            if args.get('status'):
                query = query.filter(Users.status == args['status'].upper())
            if args.get('role'):
                role = Roles.query.filter_by(role_name=args['role'].upper()).first()
                if role:
                    query = query.filter(Users.role_id == role.role_id)
            if args.get('search'):
                s = f"%{args['search']}%"
                query = query.filter(
                    (Users.email.ilike(s)) |
                    (Users.username.ilike(s)) |
                    (Users.full_name.ilike(s))
                )

            sort_col = getattr(Users, args.get('sort_by', 'created_on'), Users.created_on)
            query    = query.order_by(sort_col.desc() if args['order'] == 'desc' else sort_col.asc())

            paginated = query.paginate(page=page, per_page=per_page, error_out=False)

            return jsonify(bool=True, status=200, response={
                'users':      [_user_dict(u) for u in paginated.items],
                'total':      paginated.total,
                'page':       page,
                'per_page':   per_page,
                'total_pages':paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get User by ID  ──────

@ns.route('/<int:user_id>')
class UserDetail(Resource):
    @ns.doc(description='[ADMIN] Get detailed information about a specific user.')
    @jwt_required()
    def get(self, user_id):
        try:
            err = _require_admin()
            if err:
                return err

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            profile = user.profile
            prefs   = user.preferences
            kyc     = user.kyc_verification

            # Recent login history
            recent_logins = (LoginHistory.query
                             .filter_by(user_id=user_id)
                             .order_by(LoginHistory.created_on.desc())
                             .limit(5).all())

            return jsonify(bool=True, status=200, response={
                **_user_dict(user),
                'profile': {
                    'phone_number': profile.phone_number if profile else None,
                    'city':         profile.city         if profile else None,
                    'country':      profile.country      if profile else None,
                    'date_of_birth':str(profile.date_of_birth) if profile and profile.date_of_birth else None,
                } if profile else {},
                'kyc_status':   kyc.kyc_status if kyc else 'NOT_STARTED',
                'experience_level': prefs.experience_level if prefs else None,
                'recent_logins': [{
                    'status':     l.status,
                    'ip_address': l.ip_address,
                    'city':       l.city,
                    'country':    l.country,
                    'created_on': str(l.created_on),
                } for l in recent_logins],
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Suspend User  ────────

@ns.route('/<int:user_id>/suspend')
class SuspendUser(Resource):
    @ns.doc(description='[ADMIN] Suspend a user account.')
    @jwt_required()
    @ns.expect(suspend_parser, validate=True)
    def post(self, user_id):
        try:
            err = _require_admin()
            if err:
                return err

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            args   = suspend_parser.parse_args(strict=False)
            reason = args['reason']

            user.status = UserStatus.SUSPENDED
            user.update()

            # Revoke all active sessions
            (UserSessions.query
             .filter_by(user_id=user_id, status=SessionStatus.ACTIVE)
             .update({'status': SessionStatus.REVOKED}))

            claims = get_jwt()
            log = AdminActivityLogs()
            log.admin_user_id    = claims.get('user_id')
            log.action_type      = 'SUSPEND_USER'
            log.target_user_id   = user_id
            log.reason           = reason
            log.after_state      = {'status': UserStatus.SUSPENDED}
            log.save()

            return jsonify(bool=True, status=200, response={'message': f'User {user_id} suspended.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Update User Status (activate / ban / unsuspend) ───────────────────────────

@ns.route('/<int:user_id>/status')
class UpdateUserStatus(Resource):
    @ns.doc(description='[ADMIN] Update a user status: ACTIVE, SUSPENDED, BANNED, PENDING.')
    @jwt_required()
    @ns.expect(status_parser, validate=True)
    def put(self, user_id):
        try:
            err = _require_admin()
            if err:
                return err

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            args       = status_parser.parse_args(strict=False)
            new_status = args['status'].upper()
            reason     = args.get('reason', '')

            if new_status not in [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BANNED, UserStatus.PENDING]:
                return jsonify(bool=False, status=400, response={'message': 'Invalid status value.'})

            old_status  = user.status
            user.status = new_status
            user.update()

            if new_status in [UserStatus.SUSPENDED, UserStatus.BANNED]:
                (UserSessions.query
                 .filter_by(user_id=user_id, status=SessionStatus.ACTIVE)
                 .update({'status': SessionStatus.REVOKED}))

            claims = get_jwt()
            log = AdminActivityLogs()
            log.admin_user_id  = claims.get('user_id')
            log.action_type    = 'UPDATE_USER_STATUS'
            log.target_user_id = user_id
            log.reason         = reason
            log.before_state   = {'status': old_status}
            log.after_state    = {'status': new_status}
            log.save()

            return jsonify(bool=True, status=200, response={'message': f'User status updated to {new_status}.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Change User Role  ────

@ns.route('/<int:user_id>/role')
class ChangeUserRole(Resource):
    @ns.doc(description='[ADMIN] Change user role (e.g. promote to ADMIN).')
    @jwt_required()
    @ns.expect(role_parser, validate=True)
    def put(self, user_id):
        try:
            err = _require_admin()
            if err:
                return err

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            args      = role_parser.parse_args(strict=False)
            role_name = args['role_name'].upper()
            role      = Roles.query.filter_by(role_name=role_name).first()
            if not role:
                return jsonify(bool=False, status=404, response={'message': f"Role '{role_name}' not found."})

            old_role     = user.role.role_name
            user.role_id = role.role_id
            user.update()

            claims = get_jwt()
            log = AdminActivityLogs()
            log.admin_user_id  = claims.get('user_id')
            log.action_type    = 'CHANGE_USER_ROLE'
            log.target_user_id = user_id
            log.before_state   = {'role': old_role}
            log.after_state    = {'role': role_name}
            log.save()

            return jsonify(bool=True, status=200, response={'message': f'User role changed to {role_name}.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Force Reset Password  

@ns.route('/<int:user_id>/reset_password')
class AdminResetPassword(Resource):
    @ns.doc(description='[ADMIN] Force-reset a user password and flag for change on next login.')
    @jwt_required()
    def post(self, user_id):
        try:
            err = _require_admin()
            if err:
                return err

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            import secrets
            temp_password = secrets.token_urlsafe(12)
            user.password_hash    = generate_password_hash(temp_password)
            user.security_settings.force_password_change = True
            user.update()

            claims = get_jwt()
            log = AdminActivityLogs()
            log.admin_user_id  = claims.get('user_id')
            log.action_type    = 'ADMIN_RESET_PASSWORD'
            log.target_user_id = user_id
            log.description    = 'Admin forced password reset.'
            log.save()

            return jsonify(bool=True, status=200, response={
                'message':          'Password reset. User must change on next login.',
                'temp_password':    temp_password,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get User Sessions  ───

@ns.route('/<int:user_id>/sessions')
class UserSessions_(Resource):
    @ns.doc(description='[ADMIN] Get all active sessions for a user.')
    @jwt_required()
    def get(self, user_id):
        try:
            err = _require_admin()
            if err:
                return err

            sessions = (UserSessions.query
                        .filter_by(user_id=user_id)
                        .order_by(UserSessions.created_on.desc())
                        .limit(20).all())

            return jsonify(bool=True, status=200, response={
                'sessions': [{
                    'session_id':   s.session_id,
                    'status':       s.status,
                    'device_type':  s.device_type,
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


# ── Revoke All Sessions  ─

@ns.route('/<int:user_id>/revoke_sessions')
class RevokeSessions(Resource):
    @ns.doc(description='[ADMIN] Revoke all active sessions for a user.')
    @jwt_required()
    def post(self, user_id):
        try:
            err = _require_admin()
            if err:
                return err

            updated = (UserSessions.query
                       .filter_by(user_id=user_id, status=SessionStatus.ACTIVE)
                       .update({'status': SessionStatus.REVOKED}))
            from portal import db; db.session.commit()

            return jsonify(bool=True, status=200, response={
                'message':          f'{updated} session(s) revoked.',
                'sessions_revoked': updated,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Delete User  ─────────

@ns.route('/<int:user_id>/delete')
class DeleteUser(Resource):
    @ns.doc(description='[ADMIN] Permanently delete a user account and all associated data.')
    @jwt_required()
    def delete(self, user_id):
        try:
            err = _require_admin()
            if err:
                return err

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            claims = get_jwt()
            log = AdminActivityLogs()
            log.admin_user_id  = claims.get('user_id')
            log.action_type    = 'DELETE_USER'
            log.target_user_id = user_id
            log.description    = f'User {user.email} permanently deleted.'
            log.save()

            user.delete()
            return jsonify(bool=True, status=200, response={'message': 'User deleted successfully.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
