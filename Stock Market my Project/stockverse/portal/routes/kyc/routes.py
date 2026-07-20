import logging
import os
import re
import traceback
import uuid
from datetime import date, datetime, timezone

from flask import jsonify, request, send_file, current_app
from werkzeug.utils import secure_filename
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt, decode_token

from portal.models.kyc_verifications  import KYCVerifications, KYCStatus, DocumentType
from portal.models.admin_activity_logs import AdminActivityLogs
from portal.models.users              import Users
from portal.helpers.validators import (
    Validator, validate_name, validate_dob, validate_choice, validate_pan,
    validate_aadhaar, validate_date, validate_notes, validate_pagination,
    normalize_text,
)

from . import ns, logger

submit_parser = reqparse.RequestParser()
submit_parser.add_argument('legal_first_name',      type=str, required=True,  location='json')
submit_parser.add_argument('legal_last_name',       type=str, required=True,  location='json')
submit_parser.add_argument('date_of_birth',         type=str, required=True,  location='json')
submit_parser.add_argument('nationality',           type=str, required=False, location='json')
submit_parser.add_argument('country_of_residence',  type=str, required=False, location='json')
submit_parser.add_argument('tax_id',                type=str, required=False, location='json')
submit_parser.add_argument('id_document_type',      type=str, required=True,  location='json')
submit_parser.add_argument('id_document_number',    type=str, required=True,  location='json')
submit_parser.add_argument('id_document_expiry',    type=str, required=False, location='json')
submit_parser.add_argument('id_document_front_url', type=str, required=True,  location='json')
submit_parser.add_argument('id_document_back_url',  type=str, required=False, location='json')
submit_parser.add_argument('selfie_url',            type=str, required=False, location='json')
submit_parser.add_argument('address_document_type', type=str, required=False, location='json')
submit_parser.add_argument('address_document_url',  type=str, required=False, location='json')

review_parser = reqparse.RequestParser()
review_parser.add_argument('action',           type=str, required=True,  location='json')  # APPROVE / REJECT
review_parser.add_argument('rejection_reason', type=str, required=False, location='json')
review_parser.add_argument('admin_notes',      type=str, required=False, location='json')


# ── Document upload configuration ─────────────────────────────────────────────
# KYC documents are identity papers, so unlike the profile avatar (a base64 data
# URI in a TEXT column) they are stored as files: the *_url columns are only
# String(500) and a scan would never fit, and these must stay access-controlled
# rather than embedded in any JSON a client can fetch.
ALLOWED_DOC_EXT  = {'png', 'jpg', 'jpeg', 'webp'}
ALLOWED_DOC_MIME = {'image/png', 'image/jpeg', 'image/webp'}
MAX_DOC_BYTES    = 5 * 1024 * 1024   # 5 MB, matching the support-chat cap
KYC_SUBDIR       = 'kyc'

# Files are named <uuid4hex>.<ext> by us and never by the client. Re-validating
# that shape on read is what makes the path join below traversal-safe.
_STORED_NAME_RE = re.compile(r'^[0-9a-f]{32}\.(png|jpg|jpeg|webp)$')


def _kyc_upload_dir(user_id):
    """Absolute path to one user's KYC folder (created on demand)."""
    path = os.path.join(current_app.config['UPLOAD_FOLDER'], KYC_SUBDIR, str(int(user_id)))
    os.makedirs(path, exist_ok=True)
    return path


def _save_kyc_document(file_storage, user_id):
    """
    Validate and persist one uploaded document.
    Returns (relative_url, None) on success or (None, error_response) on failure.
    """
    if file_storage is None or file_storage.filename == '':
        return None, jsonify(bool=False, status=400, response={'message': 'No file provided.'})

    original = secure_filename(file_storage.filename)
    ext      = original.rsplit('.', 1)[-1].lower() if '.' in original else ''
    if ext not in ALLOWED_DOC_EXT:
        return None, jsonify(bool=False, status=400, response={
            'message': 'Unsupported file type. Allowed: png, jpg, jpeg, webp.'})

    if file_storage.mimetype and file_storage.mimetype not in ALLOWED_DOC_MIME:
        return None, jsonify(bool=False, status=400, response={'message': 'Unsupported image format.'})

    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size == 0:
        return None, jsonify(bool=False, status=400, response={'message': 'File is empty.'})
    if size > MAX_DOC_BYTES:
        return None, jsonify(bool=False, status=400, response={'message': 'File is too large (max 5 MB).'})

    stored_name = f'{uuid.uuid4().hex}.{ext}'
    file_storage.save(os.path.join(_kyc_upload_dir(user_id), stored_name))

    # Relative path — the frontend prefixes its own API base, and the column is
    # String(500) so this comfortably fits.
    return f'/kyc/document/{int(user_id)}/{stored_name}', None


def validate_document_url(value, user_id, label, *, required=False):
    """
    A submitted document must be one this user actually uploaded.

    Without this the field is a free-text string: a user could submit
    /kyc/document/<someone-else's-id>/... and attach another person's identity
    scan to their own KYC record. Returns an error string or None.
    """
    value = (value or '').strip()
    if not value:
        return f'{label} is required.' if required else None
    m = re.fullmatch(r'/kyc/document/(\d+)/([0-9a-f]{32}\.(?:png|jpg|jpeg|webp))', value)
    if not m:
        return f'{label} must be an uploaded document.'
    if int(m.group(1)) != int(user_id):
        return f'{label} does not belong to you.'
    if not os.path.exists(os.path.join(_kyc_upload_dir(user_id), m.group(2))):
        return f'{label} could not be found — please upload it again.'
    return None

admin_list_parser = reqparse.RequestParser()
admin_list_parser.add_argument('page',       type=int, default=1,  location='args')
admin_list_parser.add_argument('per_page',   type=int, default=20, location='args')
admin_list_parser.add_argument('kyc_status', type=str, required=False, location='args')


def _kyc_dict(k: KYCVerifications, admin=False) -> dict:
    data = {
        'kyc_id':             k.kyc_id,
        'user_id':            k.user_id,
        'kyc_status':         k.kyc_status,
        'legal_first_name':   k.legal_first_name,
        'legal_last_name':    k.legal_last_name,
        'date_of_birth':      str(k.date_of_birth) if k.date_of_birth else None,
        'nationality':        k.nationality,
        'country_of_residence':k.country_of_residence,
        'id_document_type':   k.id_document_type,
        'id_document_expiry': str(k.id_document_expiry) if k.id_document_expiry else None,
        'liveness_check_passed': k.liveness_check_passed,
        'submitted_at':       str(k.submitted_at)  if k.submitted_at  else None,
        'approved_at':        str(k.approved_at)   if k.approved_at   else None,
        'expires_at':         str(k.expires_at)    if k.expires_at    else None,
        'rejection_reason':   k.rejection_reason,
        'updated_on':         str(k.updated_on),
    }
    if admin:
        data.update({
            'id_document_number':   k.id_document_number,
            'id_document_front_url':k.id_document_front_url,
            'id_document_back_url': k.id_document_back_url,
            'selfie_url':           k.selfie_url,
            'address_document_type':k.address_document_type,
            'address_document_url': k.address_document_url,
            'admin_notes':          k.admin_notes,
            'reviewed_by':          k.reviewed_by,
            'reviewed_at':          str(k.reviewed_at) if k.reviewed_at else None,
            'tax_id':               k.tax_id,
            'provider':             k.provider,
            'provider_reference_id':k.provider_reference_id,
        })
    return data


def _registration_prefill(user_id: int) -> dict:
    """
    KYC fields we can seed from what the user already gave us at registration
    (see the register endpoint: first/last name, DOB and country all land in
    user_profiles). Only fields actually captured at signup appear here —
    nationality, tax ID and document details are never inferred, since guessing
    them on an identity form would be worse than leaving them blank.

    Every value is a suggestion the user can overwrite; the form still requires
    the legal name to match their ID document.
    """
    user = Users.query.get(user_id)
    if not user:
        return {}

    profile = user.profile
    first   = (profile.first_name if profile else '') or ''
    last    = (profile.last_name  if profile else '') or ''

    # Older accounts may predate the first/last split on the profile, so fall
    # back to splitting the full_name the users row always carries.
    if not first and not last and user.full_name:
        parts = user.full_name.strip().split()
        if parts:
            first = parts[0]
            last  = ' '.join(parts[1:])

    return {
        'legal_first_name':     first,
        'legal_last_name':      last,
        'date_of_birth':        str(profile.date_of_birth) if profile and profile.date_of_birth else '',
        'country_of_residence': (profile.country if profile else '') or '',
    }


# ── Get My KYC Status  ───

@ns.route('/status')
class MyKYCStatus(Resource):
    @ns.doc(description='Get current user\'s KYC verification status, plus a '
                        '`prefill` block seeded from their registration details.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            kyc     = KYCVerifications.query.filter_by(user_id=user_id).first()
            prefill = _registration_prefill(user_id)
            if not kyc:
                return jsonify(bool=True, status=200, response={
                    'kyc_status': KYCStatus.NOT_STARTED,
                    'message':    'KYC not yet started.',
                    'prefill':    prefill,
                })
            # Sent alongside the record so a re-submission (e.g. after a
            # rejection) can fall back to registration data for any field the
            # previous submission left empty.
            return jsonify(bool=True, status=200, response={**_kyc_dict(kyc), 'prefill': prefill})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Upload / serve documents ─────────────────────────────────────────────────

@ns.route('/upload')
class UploadKYCDocument(Resource):
    @ns.doc(description='Upload one KYC document image (multipart field `file`). '
                        'Returns the relative URL to store in the submit payload.')
    @jwt_required()
    def post(self):
        try:
            user_id  = int(get_jwt_identity())
            url, err = _save_kyc_document(request.files.get('file'), user_id)
            if err:
                return err
            return jsonify(bool=True, status=200, response={
                'message': 'Document uploaded.',
                'url':     url,
            })
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/document/<int:owner_id>/<string:stored_name>')
class ServeKYCDocument(Resource):
    @ns.doc(description='Serve a KYC document. Auth via Authorization header or ?token=<jwt>. '
                        'Readable only by the owner or an admin.')
    def get(self, owner_id, stored_name):
        try:
            # <img> tags cannot send an Authorization header, so accept the JWT
            # as a query param too, then authorise manually.
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
            if not is_admin and requester_id != owner_id:
                return jsonify(bool=False, status=403, response={'message': 'Not authorised.'})

            if not _STORED_NAME_RE.match(stored_name or ''):
                return jsonify(bool=False, status=400, response={'message': 'Invalid document name.'})

            path = os.path.join(_kyc_upload_dir(owner_id), stored_name)
            if not os.path.exists(path):
                return jsonify(bool=False, status=404, response={'message': 'File missing on server.'})

            ext  = stored_name.rsplit('.', 1)[1].lower()
            mime = 'image/png' if ext == 'png' else 'image/webp' if ext == 'webp' else 'image/jpeg'
            return send_file(path, mimetype=mime, conditional=True)
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Submit KYC  ──────────

@ns.route('/submit')
class SubmitKYC(Resource):
    @ns.doc(description='Submit KYC documents for verification.')
    @jwt_required()
    @ns.expect(submit_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = submit_parser.parse_args(strict=False)

            kyc = KYCVerifications.query.filter_by(user_id=user_id).first()
            if not kyc:
                kyc = KYCVerifications()
                kyc.user_id = user_id

            if kyc.kyc_status == KYCStatus.APPROVED:
                return jsonify(bool=False, status=400, response={'message': 'KYC already approved.'})
            if kyc.kyc_status == KYCStatus.UNDER_REVIEW:
                return jsonify(bool=False, status=400, response={'message': 'KYC is currently under review.'})

            doc_type = (args.get('id_document_type') or '').strip().upper()
            doc_num  = (args.get('id_document_number') or '').strip().upper()
            tax_id   = (args.get('tax_id') or '').strip().upper()
            country  = normalize_text(args.get('country_of_residence'))

            # ── Validation ────────────────────────────────────────────────────
            # This endpoint had none: a malformed date_of_birth reached
            # strptime() and surfaced as a 500 with the raw exception text.
            v = Validator()
            v.check('legal_first_name', validate_name(args.get('legal_first_name'), 'Legal first name'))
            v.check('legal_last_name',  validate_name(args.get('legal_last_name'), 'Legal last name'))
            v.check('date_of_birth',    validate_dob(args.get('date_of_birth')))
            v.check('id_document_type', validate_choice(doc_type, DocumentType.CHOICES, label='ID document type'))
            v.check('nationality',      validate_name(args.get('nationality'), 'Nationality', required=False))
            v.check('country_of_residence', validate_name(country, 'Country of residence', required=False))
            v.check('id_document_expiry', validate_date(
                args.get('id_document_expiry'), label='ID document expiry',
                min_date=date.today(), required=False))

            # Document fields now hold paths to files uploaded via /kyc/upload,
            # so they are validated as such rather than trusted verbatim.
            v.check('id_document_front_url', validate_document_url(
                args.get('id_document_front_url'), user_id, 'ID front image', required=True))
            v.check('id_document_back_url', validate_document_url(
                args.get('id_document_back_url'), user_id, 'ID back image'))
            v.check('selfie_url', validate_document_url(
                args.get('selfie_url'), user_id, 'Selfie'))
            v.check('address_document_url', validate_document_url(
                args.get('address_document_url'), user_id, 'Address proof'))

            # India-specific formats. tax_id is the PAN; a NATIONAL_ID for an
            # Indian resident is the Aadhaar. Other countries' IDs only get the
            # generic shape check, since their formats differ.
            is_india = country.upper() in ('INDIA', 'IN', '')
            if tax_id and is_india:
                v.check('tax_id', validate_pan(tax_id))
            if doc_type == DocumentType.NATIONAL_ID and is_india:
                v.check('id_document_number', validate_aadhaar(doc_num))
            elif not doc_num:
                v.check('id_document_number', 'ID document number is required.')
            elif not re.fullmatch(r'[A-Z0-9\-]{4,30}', doc_num):
                v.check('id_document_number',
                        'ID document number can only contain letters, digits and hyphens.')
            if not v.ok:
                return v.response()

            kyc.legal_first_name      = normalize_text(args['legal_first_name'])
            kyc.legal_last_name       = normalize_text(args['legal_last_name'])
            kyc.date_of_birth         = datetime.strptime(args['date_of_birth'].strip(), '%Y-%m-%d').date()
            kyc.nationality           = normalize_text(args.get('nationality'))
            kyc.country_of_residence  = country
            kyc.tax_id                = tax_id
            kyc.id_document_type      = doc_type
            kyc.id_document_number    = doc_num
            kyc.id_document_front_url = args['id_document_front_url']
            kyc.id_document_back_url  = args.get('id_document_back_url', '')
            kyc.selfie_url            = args.get('selfie_url', '')
            kyc.address_document_type = args.get('address_document_type', '')
            kyc.address_document_url  = args.get('address_document_url', '')

            if args.get('id_document_expiry'):
                kyc.id_document_expiry = datetime.strptime(args['id_document_expiry'], '%Y-%m-%d').date()

            kyc.kyc_status   = KYCStatus.PENDING
            kyc.submitted_at = datetime.now(timezone.utc)

            if not kyc.kyc_id:
                kyc.save()
            else:
                kyc.update()

            # Put the request in every admin's bell. notify_admins swallows its
            # own errors, so a notification failure never fails the submission.
            from portal.helpers.notify import notify_admins
            from portal.models.notifications import NotificationType, NotificationPriority
            applicant = f"{kyc.legal_first_name} {kyc.legal_last_name}".strip()
            notify_admins(
                NotificationType.KYC_SUBMITTED,
                title="New KYC verification request 🪪",
                body=f"{applicant or 'A user'} submitted KYC documents for review.",
                priority=NotificationPriority.HIGH,
                action_url=f"/admin/users?kyc_id={kyc.kyc_id}",
                reference_type="KYC",
                reference_id=kyc.kyc_id,
            )

            return jsonify(bool=True, status=200, response={
                'message':   'KYC documents submitted for review.',
                'kyc_status':kyc.kyc_status,
                'kyc_id':    kyc.kyc_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: List KYC Submissions ────────────────────────────────────────────────

@ns.route('/admin/list')
class AdminKYCList(Resource):
    @ns.doc(description='[ADMIN] List all KYC submissions with optional status filter.')
    @jwt_required()
    @ns.expect(admin_list_parser)
    def get(self):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            args     = admin_list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(50, args['per_page'])
            query    = KYCVerifications.query

            if args.get('kyc_status'):
                query = query.filter(KYCVerifications.kyc_status == args['kyc_status'].upper())

            paginated = query.order_by(KYCVerifications.submitted_at.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'kyc_submissions': [_kyc_dict(k, admin=True) for k in paginated.items],
                'total':           paginated.total,
                'page':            page,
                'per_page':        per_page,
                'total_pages':     paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: Get KYC Detail ──────────────────────────────────────────────────────

@ns.route('/admin/<int:kyc_id>')
class AdminKYCDetail(Resource):
    @ns.doc(description='[ADMIN] Get full KYC submission detail.')
    @jwt_required()
    def get(self, kyc_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            kyc = KYCVerifications.query.get(kyc_id)
            if not kyc:
                return jsonify(bool=False, status=404, response={'message': 'KYC record not found.'})

            return jsonify(bool=True, status=200, response=_kyc_dict(kyc, admin=True))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: Review KYC (Approve / Reject) ──────────────────────────────────────

@ns.route('/admin/<int:kyc_id>/review')
class AdminKYCReview(Resource):
    @ns.doc(description='[ADMIN] Approve or reject a KYC submission.')
    @jwt_required()
    @ns.expect(review_parser, validate=True)
    def post(self, kyc_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            kyc = KYCVerifications.query.get(kyc_id)
            if not kyc:
                return jsonify(bool=False, status=404, response={'message': 'KYC record not found.'})

            args   = review_parser.parse_args(strict=False)
            action = args['action'].upper()
            claims = get_jwt()
            now    = datetime.now(timezone.utc)

            if action == 'APPROVE':
                from datetime import timedelta
                kyc.kyc_status      = KYCStatus.APPROVED
                kyc.approved_at     = now
                kyc.expires_at      = now.replace(year=now.year + 2)   # 2-year validity
                kyc.rejection_reason= None
            elif action == 'REJECT':
                kyc.kyc_status       = KYCStatus.REJECTED
                kyc.rejection_reason = args.get('rejection_reason', 'Documents do not meet requirements.')
            else:
                return jsonify(bool=False, status=400, response={'message': 'action must be APPROVE or REJECT.'})

            kyc.reviewed_by  = claims.get('user_id')
            kyc.reviewed_at  = now
            kyc.admin_notes  = args.get('admin_notes', '')
            kyc.update()

            log = AdminActivityLogs()
            log.admin_user_id  = claims.get('user_id')
            log.action_type    = f'KYC_{action}'
            log.target_user_id = kyc.user_id
            log.description    = f'KYC {action.lower()}d for user {kyc.user_id}'
            log.after_state    = {'kyc_status': kyc.kyc_status}
            log.save()

            # ── Notify the user of the KYC decision (best-effort) ─────────────
            from portal.helpers.notify import notify_user
            from portal.models.notifications import NotificationType, NotificationPriority
            if action == 'APPROVE':
                notify_user(
                    kyc.user_id,
                    NotificationType.KYC_APPROVED,
                    title="KYC Approved ✅",
                    body="Your identity verification has been approved. Your account is now fully verified.",
                    priority=NotificationPriority.HIGH,
                    action_url="/user/settings",
                    reference_type="KYC",
                    reference_id=kyc.kyc_id,
                )
            else:  # REJECT
                notify_user(
                    kyc.user_id,
                    NotificationType.KYC_REJECTED,
                    title="KYC Rejected ❌",
                    body=f"Your KYC submission was rejected. Reason: {kyc.rejection_reason} Please re-submit your documents.",
                    priority=NotificationPriority.HIGH,
                    action_url="/user/settings",
                    reference_type="KYC",
                    reference_id=kyc.kyc_id,
                )

            return jsonify(bool=True, status=200, response={
                'message':   f'KYC {action.lower()}d successfully.',
                'kyc_status':kyc.kyc_status,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: Mark Under Review ───────────────────────────────────────────────────

@ns.route('/admin/<int:kyc_id>/mark_under_review')
class MarkUnderReview(Resource):
    @ns.doc(description='[ADMIN] Move KYC to UNDER_REVIEW status.')
    @jwt_required()
    def post(self, kyc_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            kyc = KYCVerifications.query.get(kyc_id)
            if not kyc:
                return jsonify(bool=False, status=404, response={'message': 'KYC not found.'})

            kyc.kyc_status = KYCStatus.UNDER_REVIEW
            kyc.update()
            return jsonify(bool=True, status=200, response={'message': 'KYC marked as under review.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
