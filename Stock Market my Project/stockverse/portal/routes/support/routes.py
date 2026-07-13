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

import os
import uuid
import traceback
from datetime import datetime, timezone

from flask import jsonify, request, send_file, current_app
from werkzeug.utils import secure_filename
from flask_restx import Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity, decode_token

from portal import db
from portal.models.support_messages import SupportMessages, SupportSenderRole
from portal.models.support_attachments import SupportAttachments
from portal.models.users import Users, UserStatus

from . import ns, logger

send_parser = reqparse.RequestParser()
send_parser.add_argument('message', type=str, required=True, location='json')

# ── Image upload configuration ────────────────────────────────────────────────
ALLOWED_IMAGE_EXT  = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_IMAGE_MIME = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}
MAX_IMAGE_BYTES    = 5 * 1024 * 1024   # 5 MB
SUPPORT_SUBDIR     = 'support_chat'


def _is_admin():
    return get_jwt().get('role') == 'ADMIN'


def _support_upload_dir():
    """Absolute path to the support-chat upload folder (created on demand)."""
    base = current_app.config['UPLOAD_FOLDER']
    path = os.path.join(base, SUPPORT_SUBDIR)
    os.makedirs(path, exist_ok=True)
    return path


def _ext_ok(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXT


def _save_chat_image(file_storage, *, thread_user_id, sender_role, sender_id, caption):
    """
    Validate + persist an uploaded image, then create the message and its
    attachment row. Returns (message, error_response). On success error_response
    is None; on failure message is None and error_response is a jsonify(...) tuple
    already shaped like the rest of this module.
    """
    if file_storage is None or file_storage.filename == '':
        return None, jsonify(bool=False, status=400, response={'message': 'No image file provided.'})

    original = secure_filename(file_storage.filename)
    if not _ext_ok(original):
        return None, jsonify(bool=False, status=400,
                             response={'message': 'Unsupported file type. Allowed: png, jpg, jpeg, gif, webp.'})

    if file_storage.mimetype and file_storage.mimetype not in ALLOWED_IMAGE_MIME:
        return None, jsonify(bool=False, status=400,
                             response={'message': 'Unsupported image format.'})

    # Size check (seek to end, then rewind)
    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size > MAX_IMAGE_BYTES:
        return None, jsonify(bool=False, status=400,
                             response={'message': 'Image is too large (max 5 MB).'})
    if size == 0:
        return None, jsonify(bool=False, status=400, response={'message': 'Image is empty.'})

    ext         = original.rsplit('.', 1)[1].lower()
    stored_name = f'{uuid.uuid4().hex}.{ext}'
    dest        = os.path.join(_support_upload_dir(), stored_name)
    file_storage.save(dest)

    # Create the message (image-only messages carry an empty caption).
    msg              = SupportMessages()
    msg.user_id      = thread_user_id
    msg.sender_role  = sender_role
    msg.sender_id    = sender_id
    msg.message      = (caption or '').strip()
    if sender_role == SupportSenderRole.USER:
        msg.is_read_by_user, msg.is_read_by_admin = True, False
    else:
        msg.is_read_by_user, msg.is_read_by_admin = False, True
    db.session.add(msg)
    db.session.flush()   # assign message_id without a second commit

    att              = SupportAttachments()
    att.message_id   = msg.message_id
    att.user_id      = thread_user_id
    att.uploaded_by  = sender_id
    att.file_name    = original
    att.stored_name  = stored_name
    att.mime_type    = file_storage.mimetype
    att.file_size    = size
    db.session.add(att)
    db.session.commit()

    return msg, None


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


@ns.route('/upload')
class UploadImage(Resource):
    @ns.doc(description='Send an image (with optional caption) from the logged-in user.')
    @jwt_required()
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            msg, err = _save_chat_image(
                request.files.get('file'),
                thread_user_id=user_id,
                sender_role=SupportSenderRole.USER,
                sender_id=user_id,
                caption=request.form.get('message', ''),
            )
            if err:
                return err
            return jsonify(bool=True, status=200, response={'message': 'Sent.', 'chat': msg.to_dict()})
        except Exception as e:
            db.session.rollback()
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/attachment/<int:attachment_id>')
class ServeAttachment(Resource):
    @ns.doc(description='Serve a support-chat image. Auth via Authorization header or ?token=<jwt>. '
                        'Accessible to the thread owner or any admin.')
    def get(self, attachment_id):
        try:
            # <img> tags can't send an Authorization header, so accept the JWT as
            # a query param too. Verify and authorise manually.
            raw = request.args.get('token')
            if not raw:
                hdr = request.headers.get('Authorization', '')
                if hdr.startswith('Bearer '):
                    raw = hdr[7:]
            if not raw:
                return jsonify(bool=False, status=401, response={'message': 'Token required.'})

            try:
                claims = decode_token(raw)
            except Exception:
                return jsonify(bool=False, status=401, response={'message': 'Invalid or expired token.'})

            requester_id = int(claims.get('sub'))
            is_admin     = claims.get('role') == 'ADMIN'

            att = SupportAttachments.query.get(attachment_id)
            if not att:
                return jsonify(bool=False, status=404, response={'message': 'Attachment not found.'})

            # Only the thread owner or an admin may view it.
            if not is_admin and requester_id != att.user_id:
                return jsonify(bool=False, status=403, response={'message': 'Not authorised.'})

            path = os.path.join(_support_upload_dir(), att.stored_name)
            if not os.path.exists(path):
                return jsonify(bool=False, status=404, response={'message': 'File missing on server.'})

            return send_file(path, mimetype=att.mime_type or 'application/octet-stream',
                             download_name=att.file_name, conditional=True)
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


@ns.route('/admin/upload/<int:user_id>')
class AdminUploadImage(Resource):
    @ns.doc(description='[ADMIN] Send an image (with optional caption) to a user\'s support thread.')
    @jwt_required()
    def post(self, user_id):
        try:
            if not _is_admin():
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            user = Users.query.get(user_id)
            if not user:
                return jsonify(bool=False, status=404, response={'message': 'User not found.'})

            admin_id = get_jwt().get('user_id')
            msg, err = _save_chat_image(
                request.files.get('file'),
                thread_user_id=user_id,
                sender_role=SupportSenderRole.ADMIN,
                sender_id=admin_id,
                caption=request.form.get('message', ''),
            )
            if err:
                return err
            return jsonify(bool=True, status=200, response={'message': 'Reply sent.', 'chat': msg.to_dict()})
        except Exception as e:
            db.session.rollback()
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
