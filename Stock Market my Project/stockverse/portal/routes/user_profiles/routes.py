import logging
import traceback

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal.models.user_profiles import UserProfiles
from portal.models.users         import Users
from portal.models.audit_logs    import AuditLogs

from . import ns, logger


def _is_admin():
    return get_jwt().get('role') == 'ADMIN'


# ── Parser  ──────────────

profile_parser = reqparse.RequestParser()
profile_parser.add_argument('first_name',      type=str, required=False, location='json')
profile_parser.add_argument('last_name',       type=str, required=False, location='json')
profile_parser.add_argument('display_name',    type=str, required=False, location='json')
profile_parser.add_argument('bio',             type=str, required=False, location='json')
profile_parser.add_argument('phone_number',    type=str, required=False, location='json')
profile_parser.add_argument('phone_country_code', type=str, required=False, location='json')
profile_parser.add_argument('date_of_birth',   type=str, required=False, location='json')
profile_parser.add_argument('gender',          type=str, required=False, location='json')
profile_parser.add_argument('address_line1',   type=str, required=False, location='json')
profile_parser.add_argument('address_line2',   type=str, required=False, location='json')
profile_parser.add_argument('city',            type=str, required=False, location='json')
profile_parser.add_argument('state',           type=str, required=False, location='json')
profile_parser.add_argument('postal_code',     type=str, required=False, location='json')
profile_parser.add_argument('country',         type=str, required=False, location='json')
profile_parser.add_argument('country_code',    type=str, required=False, location='json')
profile_parser.add_argument('timezone',        type=str, required=False, location='json')
profile_parser.add_argument('locale',          type=str, required=False, location='json')
profile_parser.add_argument('currency_preference', type=str, required=False, location='json')
profile_parser.add_argument('avatar_url',      type=str, required=False, location='json')


def _profile_dict(p: UserProfiles) -> dict:
    return {
        'profile_id':         p.profile_id,
        'user_id':            p.user_id,
        'first_name':         p.first_name,
        'last_name':          p.last_name,
        'display_name':       p.display_name,
        'avatar_url':         p.avatar_url,
        'bio':                p.bio,
        'phone_number':       p.phone_number,
        'phone_country_code': p.phone_country_code,
        'is_phone_verified':  p.is_phone_verified,
        'date_of_birth':      str(p.date_of_birth) if p.date_of_birth else None,
        'gender':             p.gender,
        'address_line1':      p.address_line1,
        'address_line2':      p.address_line2,
        'city':               p.city,
        'state':              p.state,
        'postal_code':        p.postal_code,
        'country':            p.country,
        'country_code':       p.country_code,
        'timezone':           p.timezone,
        'locale':             p.locale,
        'currency_preference':p.currency_preference,
        'updated_on':         str(p.updated_on),
    }


# ── Get My Profile  ──────

@ns.route('/me')
class MyProfile(Resource):
    @ns.doc(description='Get own profile.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            profile = UserProfiles.query.filter_by(user_id=user_id).first()
            if not profile:
                return jsonify(bool=False, status=404, response={'message': 'Profile not found.'})
            return jsonify(bool=True, status=200, response=_profile_dict(profile))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Update own profile.')
    @jwt_required()
    @ns.expect(profile_parser, validate=False)
    def put(self):
        try:
            user_id = int(get_jwt_identity())
            profile = UserProfiles.query.filter_by(user_id=user_id).first()
            if not profile:
                return jsonify(bool=False, status=404, response={'message': 'Profile not found.'})

            args = profile_parser.parse_args(strict=False)
            fields = [
                'first_name','last_name','display_name','bio',
                'phone_number','phone_country_code','gender',
                'address_line1','address_line2','city','state',
                'postal_code','country','country_code',
                'timezone','locale','currency_preference','avatar_url',
            ]
            for field in fields:
                if args.get(field) is not None:
                    setattr(profile, field, args[field])

            if args.get('date_of_birth'):
                from datetime import date
                profile.date_of_birth = date.fromisoformat(args['date_of_birth'])

            profile.update()

            log = AuditLogs()
            log.user_id        = user_id
            log.action         = 'UPDATE_PROFILE'
            log.action_category= 'PROFILE'
            log.entity_type    = 'USER_PROFILE'
            log.entity_id      = profile.profile_id
            log.status         = 'SUCCESS'
            log.save()

            return jsonify(bool=True, status=200, response={'message': 'Profile updated successfully.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: Get Any User's Profile ──────────────────────────────────────────────

@ns.route('/<int:user_id>')
class UserProfileAdmin(Resource):
    @ns.doc(description='[ADMIN] Get profile of any user.')
    @jwt_required()
    def get(self, user_id):
        try:
            if not _is_admin():
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            profile = UserProfiles.query.filter_by(user_id=user_id).first()
            if not profile:
                return jsonify(bool=False, status=404, response={'message': 'Profile not found.'})

            return jsonify(bool=True, status=200, response=_profile_dict(profile))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Update profile of any user.')
    @jwt_required()
    @ns.expect(profile_parser, validate=False)
    def put(self, user_id):
        try:
            if not _is_admin():
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            profile = UserProfiles.query.filter_by(user_id=user_id).first()
            if not profile:
                return jsonify(bool=False, status=404, response={'message': 'Profile not found.'})

            args = profile_parser.parse_args(strict=False)
            fields = [
                'first_name','last_name','display_name','bio',
                'phone_number','phone_country_code','gender',
                'address_line1','address_line2','city','state',
                'postal_code','country','country_code',
                'timezone','locale','currency_preference','avatar_url',
            ]
            for field in fields:
                if args.get(field) is not None:
                    setattr(profile, field, args[field])

            if args.get('date_of_birth'):
                from datetime import date
                profile.date_of_birth = date.fromisoformat(args['date_of_birth'])

            profile.update()
            return jsonify(bool=True, status=200, response={'message': 'Profile updated by admin.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
