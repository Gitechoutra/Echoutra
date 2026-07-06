import logging
import traceback
from datetime import datetime, timezone

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from portal.models.kyc_verifications  import KYCVerifications, KYCStatus
from portal.models.admin_activity_logs import AdminActivityLogs

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


# ── Get My KYC Status  ───

@ns.route('/status')
class MyKYCStatus(Resource):
    @ns.doc(description='Get current user\'s KYC verification status.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            kyc     = KYCVerifications.query.filter_by(user_id=user_id).first()
            if not kyc:
                return jsonify(bool=True, status=200, response={
                    'kyc_status': KYCStatus.NOT_STARTED,
                    'message':    'KYC not yet started.',
                })
            return jsonify(bool=True, status=200, response=_kyc_dict(kyc))

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

            kyc.legal_first_name      = args['legal_first_name'].strip()
            kyc.legal_last_name       = args['legal_last_name'].strip()
            kyc.date_of_birth         = datetime.strptime(args['date_of_birth'], '%Y-%m-%d').date()
            kyc.nationality           = args.get('nationality', '')
            kyc.country_of_residence  = args.get('country_of_residence', '')
            kyc.tax_id                = args.get('tax_id', '')
            kyc.id_document_type      = args['id_document_type'].upper()
            kyc.id_document_number    = args['id_document_number'].strip()
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
