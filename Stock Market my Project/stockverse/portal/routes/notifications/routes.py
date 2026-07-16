import logging
import traceback

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from datetime import datetime, timezone

from portal.models.notifications             import Notifications
from portal.models.notification_preferences import NotificationPreferences

from . import ns, logger

list_parser = reqparse.RequestParser()
list_parser.add_argument('page',          type=int,  default=1,    location='args')
list_parser.add_argument('per_page',      type=int,  default=20,   location='args')
list_parser.add_argument('is_read',       type=bool, required=False, location='args')
list_parser.add_argument('type',          type=str,  required=False, location='args')

prefs_parser = reqparse.RequestParser()
prefs_parser.add_argument('push_enabled',         type=bool, required=False, location='json')
prefs_parser.add_argument('push_price_alerts',    type=bool, required=False, location='json')
prefs_parser.add_argument('push_order_updates',   type=bool, required=False, location='json')
prefs_parser.add_argument('push_news_alerts',     type=bool, required=False, location='json')
prefs_parser.add_argument('push_security',        type=bool, required=False, location='json')
prefs_parser.add_argument('push_account',         type=bool, required=False, location='json')
prefs_parser.add_argument('push_marketing',       type=bool, required=False, location='json')
prefs_parser.add_argument('email_enabled',        type=bool, required=False, location='json')
prefs_parser.add_argument('email_price_alerts',   type=bool, required=False, location='json')
prefs_parser.add_argument('email_order_updates',  type=bool, required=False, location='json')
prefs_parser.add_argument('email_news_digest',    type=bool, required=False, location='json')
prefs_parser.add_argument('email_news_digest_frequency', type=str, required=False, location='json')
prefs_parser.add_argument('email_security',       type=bool, required=False, location='json')
prefs_parser.add_argument('email_account',        type=bool, required=False, location='json')
prefs_parser.add_argument('email_marketing',      type=bool, required=False, location='json')
prefs_parser.add_argument('sms_enabled',          type=bool, required=False, location='json')
prefs_parser.add_argument('sms_security',         type=bool, required=False, location='json')
prefs_parser.add_argument('quiet_hours_enabled',  type=bool, required=False, location='json')
prefs_parser.add_argument('quiet_hours_start',    type=str,  required=False, location='json')
prefs_parser.add_argument('quiet_hours_end',      type=str,  required=False, location='json')

admin_send_parser = reqparse.RequestParser()
admin_send_parser.add_argument('user_id',          type=int,  required=False, location='json')
admin_send_parser.add_argument('broadcast',        type=bool, required=False, location='json', default=False)
admin_send_parser.add_argument('notification_type',type=str,  required=True,  location='json')
admin_send_parser.add_argument('title',            type=str,  required=True,  location='json')
admin_send_parser.add_argument('body',             type=str,  required=True,  location='json')
admin_send_parser.add_argument('action_url',       type=str,  required=False, location='json')
admin_send_parser.add_argument('priority',         type=str,  required=False, location='json', default='MEDIUM')


def _notif_dict(n: Notifications) -> dict:
    return {
        'notification_id':  n.notification_id,
        'notification_type':n.notification_type,
        'priority':         n.priority,
        'title':            n.title,
        'body':             n.body,
        'icon':             n.icon,
        'image_url':        n.image_url,
        'action_url':       n.action_url,
        'reference_type':   n.reference_type,
        'reference_id':     n.reference_id,
        'is_read':          n.is_read,
        'read_at':          str(n.read_at)      if n.read_at      else None,
        'is_dismissed':     n.is_dismissed,
        'created_on':       str(n.created_on),
    }


# ── List My Notifications ──────────────────────────────────────────────────────

@ns.route('/my')
class MyNotifications(Resource):
    @ns.doc(description='List notifications for the current user.')
    @jwt_required()
    @ns.expect(list_parser)
    def get(self):
        try:
            user_id  = int(get_jwt_identity())
            args     = list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(50, args['per_page'])

            query = Notifications.query.filter_by(user_id=user_id, is_dismissed=False)
            if args.get('is_read') is not None:
                query = query.filter(Notifications.is_read == args['is_read'])
            if args.get('type'):
                query = query.filter(Notifications.notification_type == args['type'].upper())

            paginated = query.order_by(Notifications.created_on.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            unread_count = Notifications.query.filter_by(user_id=user_id, is_read=False, is_dismissed=False).count()

            return jsonify(bool=True, status=200, response={
                'notifications': [_notif_dict(n) for n in paginated.items],
                'total':         paginated.total,
                'unread_count':  unread_count,
                'page':          page,
                'per_page':      per_page,
                'total_pages':   paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Mark as Read  ────────

@ns.route('/<int:notification_id>/read')
class MarkRead(Resource):
    @ns.doc(description='Mark a single notification as read.')
    @jwt_required()
    def post(self, notification_id):
        try:
            user_id = int(get_jwt_identity())
            notif   = Notifications.query.filter_by(notification_id=notification_id, user_id=user_id).first()
            if not notif:
                return jsonify(bool=False, status=404, response={'message': 'Notification not found.'})

            notif.is_read = True
            notif.read_at = datetime.now(timezone.utc)
            notif.update()
            return jsonify(bool=True, status=200, response={'message': 'Notification marked as read.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Mark All as Read  ────

@ns.route('/mark_all_read')
class MarkAllRead(Resource):
    @ns.doc(description='Mark all unread notifications as read.')
    @jwt_required()
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            now     = datetime.now(timezone.utc)
            updated = Notifications.query.filter_by(user_id=user_id, is_read=False).update({
                'is_read': True,
                'read_at': now,
            })
            from portal import db; db.session.commit()
            return jsonify(bool=True, status=200, response={
                'message':       f'{updated} notification(s) marked as read.',
                'updated_count': updated,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Dismiss Notification  

@ns.route('/<int:notification_id>/dismiss')
class DismissNotification(Resource):
    @ns.doc(description='Dismiss (hide) a notification permanently.')
    @jwt_required()
    def post(self, notification_id):
        try:
            user_id = int(get_jwt_identity())
            notif   = Notifications.query.filter_by(notification_id=notification_id, user_id=user_id).first()
            if not notif:
                return jsonify(bool=False, status=404, response={'message': 'Notification not found.'})

            notif.is_dismissed  = True
            notif.dismissed_at  = datetime.now(timezone.utc)
            notif.update()
            return jsonify(bool=True, status=200, response={'message': 'Notification dismissed.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Unread Count  ────────

@ns.route('/unread_count')
class UnreadCount(Resource):
    @ns.doc(description='Get count of unread notifications (for badge display).')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            count   = Notifications.query.filter_by(user_id=user_id, is_read=False, is_dismissed=False).count()
            return jsonify(bool=True, status=200, response={'unread_count': count})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Notification Preferences ───────────────────────────────────────────────────

@ns.route('/preferences')
class NotificationPrefs(Resource):
    @ns.doc(description='Get notification preferences for the current user.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            prefs   = NotificationPreferences.query.filter_by(user_id=user_id).first()
            if not prefs:
                return jsonify(bool=False, status=404, response={'message': 'Preferences not found.'})

            return jsonify(bool=True, status=200, response={
                'pref_id':                     prefs.pref_id,
                'push_enabled':                prefs.push_enabled,
                'push_price_alerts':           prefs.push_price_alerts,
                'push_order_updates':          prefs.push_order_updates,
                'push_news_alerts':            prefs.push_news_alerts,
                'push_security':               prefs.push_security,
                'push_account':                prefs.push_account,
                'push_marketing':              prefs.push_marketing,
                'email_enabled':               prefs.email_enabled,
                'email_price_alerts':          prefs.email_price_alerts,
                'email_order_updates':         prefs.email_order_updates,
                'email_news_digest':           prefs.email_news_digest,
                'email_news_digest_frequency': prefs.email_news_digest_frequency,
                'email_security':              prefs.email_security,
                'email_account':               prefs.email_account,
                'email_marketing':             prefs.email_marketing,
                'sms_enabled':                 prefs.sms_enabled,
                'sms_security':                prefs.sms_security,
                'quiet_hours_enabled':         prefs.quiet_hours_enabled,
                'quiet_hours_start':           str(prefs.quiet_hours_start) if prefs.quiet_hours_start else None,
                'quiet_hours_end':             str(prefs.quiet_hours_end)   if prefs.quiet_hours_end   else None,
                'updated_on':                  str(prefs.updated_on),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Update notification preferences (partial update supported).')
    @jwt_required()
    @ns.expect(prefs_parser, validate=False)
    def put(self):
        try:
            user_id = int(get_jwt_identity())
            prefs   = NotificationPreferences.query.filter_by(user_id=user_id).first()
            if not prefs:
                return jsonify(bool=False, status=404, response={'message': 'Preferences not found.'})

            args   = prefs_parser.parse_args(strict=False)
            fields = [
                'push_enabled','push_price_alerts','push_order_updates','push_news_alerts',
                'push_security','push_account','push_marketing',
                'email_enabled','email_price_alerts','email_order_updates','email_news_digest',
                'email_news_digest_frequency','email_security','email_account','email_marketing',
                'sms_enabled','sms_security',
                'quiet_hours_enabled',
            ]
            for field in fields:
                if args.get(field) is not None:
                    setattr(prefs, field, args[field])

            from datetime import time
            if args.get('quiet_hours_start'):
                h, m = map(int, args['quiet_hours_start'].split(':'))
                prefs.quiet_hours_start = time(h, m)
            if args.get('quiet_hours_end'):
                h, m = map(int, args['quiet_hours_end'].split(':'))
                prefs.quiet_hours_end = time(h, m)

            prefs.update()
            return jsonify(bool=True, status=200, response={'message': 'Notification preferences updated.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin/send')
class AdminSendNotification(Resource):
    @ns.doc(description='[ADMIN] Send a notification to a specific user or broadcast to all users.')
    @jwt_required()
    @ns.expect(admin_send_parser, validate=True)
    def post(self):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            from portal.models.users import Users, UserStatus
            args      = admin_send_parser.parse_args(strict=False)
            broadcast = args.get('broadcast', False)

            if broadcast:
                # FIXED: was Users.query.filter_by(is_active=True) — that column
                # does not exist on Users and raised AttributeError every time.
                users = Users.query.filter_by(status=UserStatus.ACTIVE).all()
                if not users:
                    return jsonify(bool=False, status=404, response={
                        'message': 'No active users found to broadcast to.'
                    })
            elif args.get('user_id'):
                user = Users.query.get(args['user_id'])
                if not user:
                    return jsonify(bool=False, status=404, response={
                        'message': f"User with id {args['user_id']} not found."
                    })
                users = [user]
            else:
                return jsonify(bool=False, status=400, response={
                    'message': 'Provide user_id or set broadcast=true.'
                })

            count        = 0
            failed_users = []
            notified_ids = []

            for user in users:
                try:
                    n                   = Notifications()
                    n.user_id           = user.user_id
                    n.notification_type = args['notification_type'].upper()
                    n.priority          = args.get('priority', 'MEDIUM').upper()
                    n.title             = args['title']
                    n.body              = args['body']
                    n.action_url        = args.get('action_url', '')
                    n.is_read           = False
                    n.is_dismissed      = False
                    n.save()
                    count += 1
                    notified_ids.append(user.user_id)
                except Exception as row_err:
                    # Don't let one bad insert abort the entire batch silently —
                    # log it and keep going, then report which ones failed.
                    traceback.print_exc()
                    failed_users.append({'user_id': user.user_id, 'error': str(row_err)})

            if count == 0:
                # Every single insert failed — surface the first error clearly
                # instead of a generic unhelpful message.
                first_err = failed_users[0]['error'] if failed_users else 'Unknown error'
                return jsonify(bool=False, status=500, response={
                    'message':      f'Failed to create any notifications. First error: {first_err}',
                    'failed_users': failed_users,
                })

            response_payload = {
                'message':      f'Notification sent to {count} user(s).',
                'sent_count':   count,
                'notified_ids': notified_ids,
            }
            if failed_users:
                response_payload['partial_failures'] = failed_users

            return jsonify(bool=True, status=200, response=response_payload)

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})




