"""
portal/routes/support/routes.py
===============================
User ↔ Admin support chat.

Model: one thread per user (keyed by `user_id`). Users talk to "support";
any admin can read and reply to any user's thread. Delivery is near-real-time
via short-interval polling on both the user widget and the admin chat panel.

Endpoints
---------
User (own thread):
    POST /support/send            {message}            -> send a message
    GET  /support/thread                               -> my messages (marks admin msgs read)
    GET  /support/unread_count                         -> # admin msgs I haven't read

Admin:
    GET  /support/admin/conversations                  -> all threads (last msg + unread)
    GET  /support/admin/thread/<user_id>               -> a user's thread (marks user msgs read)
    POST /support/admin/reply/<user_id>  {message}     -> reply to a user
    GET  /support/admin/unread_count                   -> total unread from users
"""

import traceback
from datetime import datetime, timezone

from flask import jsonify
from flask_restx import Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal import db
from portal.models.support_messages import SupportMessages, SupportSenderRole
from portal.models.users import Users, UserStatus

from . import ns, logger

send_parser = reqparse.RequestParser()
send_parser.add_argument('message', type=str, required=True, location='json')


def _is_admin():
    return get_jwt().get('role') == 'ADMIN'


# NOTE: Chat messages deliberately do NOT create bell notifications for either
# the user or the admin. Unread chat is surfaced only as WhatsApp-style numeric
# badges on the chat icons, driven by the /support/*unread_count endpoints — so
# chat stays separate from the system-notification bell.


# ══════════════════════════════════════════════════════════════════════════════
#  USER ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@ns.route('/send')
class SendMessage(Resource):
    @ns.doc(description='Send a support message (from the logged-in user).')
    @jwt_required()
    @ns.expect(send_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = send_parser.parse_args(strict=False)
            text    = (args['message'] or '').strip()
            if not text:
                return jsonify(bool=False, status=400, response={'message': 'Message cannot be empty.'})

            msg                  = SupportMessages()
            msg.user_id          = user_id
            msg.sender_role      = SupportSenderRole.USER
            msg.sender_id        = user_id
            msg.message          = text
            msg.is_read_by_user  = True     # the sender has obviously seen it
            msg.is_read_by_admin = False
            msg.save()

            # No bell notification — unread is shown via the admin chat badge only.
            return jsonify(bool=True, status=200, response={'message': 'Sent.', 'chat': msg.to_dict()})
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/thread')
class MyThread(Resource):
    @ns.doc(description='Get the logged-in user\'s support thread (marks admin messages as read).')
    @jwt_required()
    def get(self):
        try:
            user_id  = int(get_jwt_identity())
            messages = (SupportMessages.query
                        .filter_by(user_id=user_id)
                        .order_by(SupportMessages.created_on.asc())
                        .all())

            # Mark admin messages as read by the user
            SupportMessages.query.filter_by(
                user_id=user_id, sender_role=SupportSenderRole.ADMIN, is_read_by_user=False
            ).update({'is_read_by_user': True})
            db.session.commit()

            return jsonify(bool=True, status=200, response={
                'messages': [m.to_dict() for m in messages],
                'count':    len(messages),
            })
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/unread_count')
class MyUnread(Resource):
    @ns.doc(description='Count of admin replies the user has not read yet.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            count = SupportMessages.query.filter_by(
                user_id=user_id, sender_role=SupportSenderRole.ADMIN, is_read_by_user=False
            ).count()
            return jsonify(bool=True, status=200, response={'unread_count': count})
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ══════════════════════════════════════════════════════════════════════════════
#  ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@ns.route('/admin/conversations')
class AdminConversations(Resource):
    @ns.doc(description='[ADMIN] List all support threads with last message and unread count.')
    @jwt_required()
    def get(self):
        try:
            if not _is_admin():
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            # Distinct user_ids that have any message
            user_ids = [r.user_id for r in
                        SupportMessages.query.with_entities(SupportMessages.user_id).distinct().all()]

            conversations = []
            for uid in user_ids:
                last = (SupportMessages.query.filter_by(user_id=uid)
                        .order_by(SupportMessages.created_on.desc()).first())
                unread = SupportMessages.query.filter_by(
                    user_id=uid, sender_role=SupportSenderRole.USER, is_read_by_admin=False
                ).count()
                u = Users.query.get(uid)
                conversations.append({
                    'user_id':      uid,
                    'name':         (u.full_name or u.username) if u else f'User {uid}',
                    'email':        u.email if u else None,
                    'last_message': last.message if last else '',
                    'last_role':    last.sender_role if last else None,
                    'last_at':      str(last.created_on) if last else None,
                    'unread_count': unread,
                })

            conversations.sort(key=lambda c: c['last_at'] or '', reverse=True)
            total_unread = sum(c['unread_count'] for c in conversations)
            return jsonify(bool=True, status=200, response={
                'conversations': conversations,
                'total_unread':  total_unread,
            })
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin/thread/<int:user_id>')
class AdminThread(Resource):
    @ns.doc(description='[ADMIN] Get a specific user\'s thread (marks their messages as read).')
    @jwt_required()
    def get(self, user_id):
        try:
            if not _is_admin():
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            messages = (SupportMessages.query
                        .filter_by(user_id=user_id)
                        .order_by(SupportMessages.created_on.asc())
                        .all())

            SupportMessages.query.filter_by(
                user_id=user_id, sender_role=SupportSenderRole.USER, is_read_by_admin=False
            ).update({'is_read_by_admin': True})
            db.session.commit()

            return jsonify(bool=True, status=200, response={
                'user': {
                    'user_id':   user.user_id,
                    'name':      user.full_name or user.username,
                    'email':     user.email,
                },
                'messages': [m.to_dict() for m in messages],
                'count':    len(messages),
            })
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin/reply/<int:user_id>')
class AdminReply(Resource):
    @ns.doc(description='[ADMIN] Reply to a specific user\'s support thread.')
    @jwt_required()
    @ns.expect(send_parser, validate=True)
    def post(self, user_id):
        try:
            if not _is_admin():
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            args = send_parser.parse_args(strict=False)
            text = (args['message'] or '').strip()
            if not text:
                return jsonify(bool=False, status=400, response={'message': 'Message cannot be empty.'})

            admin_id = get_jwt().get('user_id')
            msg                  = SupportMessages()
            msg.user_id          = user_id
            msg.sender_role      = SupportSenderRole.ADMIN
            msg.sender_id        = admin_id
            msg.message          = text
            msg.is_read_by_admin = True
            msg.is_read_by_user  = False
            msg.save()

            # No bell notification — unread is shown via the user's chat badge only.
            return jsonify(bool=True, status=200, response={'message': 'Reply sent.', 'chat': msg.to_dict()})
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin/unread_count')
class AdminUnread(Resource):
    @ns.doc(description='[ADMIN] Total number of unread user messages across all threads.')
    @jwt_required()
    def get(self):
        try:
            if not _is_admin():
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})
            count = SupportMessages.query.filter_by(
                sender_role=SupportSenderRole.USER, is_read_by_admin=False
            ).count()
            return jsonify(bool=True, status=200, response={'unread_count': count})
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
