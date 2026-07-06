import logging
import traceback

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from portal.models.user_preferences import UserPreferences

from . import ns, logger

prefs_parser = reqparse.RequestParser()
prefs_parser.add_argument('experience_level',       type=str,  required=False, location='json')
prefs_parser.add_argument('investment_interests',   type=list, required=False, location='json')
prefs_parser.add_argument('risk_tolerance',         type=str,  required=False, location='json')
prefs_parser.add_argument('investment_goal',        type=str,  required=False, location='json')
prefs_parser.add_argument('theme',                  type=str,  required=False, location='json')
prefs_parser.add_argument('default_chart_type',     type=str,  required=False, location='json')
prefs_parser.add_argument('default_chart_period',   type=str,  required=False, location='json')
prefs_parser.add_argument('show_portfolio_value',   type=bool, required=False, location='json')
prefs_parser.add_argument('show_percentage_change', type=bool, required=False, location='json')
prefs_parser.add_argument('compact_view',           type=bool, required=False, location='json')
prefs_parser.add_argument('default_market',         type=str,  required=False, location='json')
prefs_parser.add_argument('watchlist_sort_by',      type=str,  required=False, location='json')
prefs_parser.add_argument('news_categories',        type=list, required=False, location='json')
prefs_parser.add_argument('language',               type=str,  required=False, location='json')
prefs_parser.add_argument('date_format',            type=str,  required=False, location='json')
prefs_parser.add_argument('number_format',          type=str,  required=False, location='json')


def _prefs_dict(p: UserPreferences) -> dict:
    return {
        'preference_id':         p.preference_id,
        'user_id':               p.user_id,
        'experience_level':      p.experience_level,
        'investment_interests':  p.investment_interests,
        'risk_tolerance':        p.risk_tolerance,
        'investment_goal':       p.investment_goal,
        'theme':                 p.theme,
        'default_chart_type':    p.default_chart_type,
        'default_chart_period':  p.default_chart_period,
        'show_portfolio_value':  p.show_portfolio_value,
        'show_percentage_change':p.show_percentage_change,
        'compact_view':          p.compact_view,
        'default_market':        p.default_market,
        'watchlist_sort_by':     p.watchlist_sort_by,
        'news_categories':       p.news_categories,
        'language':              p.language,
        'date_format':           p.date_format,
        'number_format':         p.number_format,
        'updated_on':            str(p.updated_on),
    }


@ns.route('/me')
class MyPreferences(Resource):
    @ns.doc(description='Get own preferences.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            prefs   = UserPreferences.query.filter_by(user_id=user_id).first()
            if not prefs:
                return jsonify(bool=False, status=404, response={'message': 'Preferences not found.'})
            return jsonify(bool=True, status=200, response=_prefs_dict(prefs))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Update own preferences (partial update supported).')
    @jwt_required()
    @ns.expect(prefs_parser, validate=False)
    def put(self):
        try:
            user_id = int(get_jwt_identity())
            prefs   = UserPreferences.query.filter_by(user_id=user_id).first()
            if not prefs:
                return jsonify(bool=False, status=404, response={'message': 'Preferences not found.'})

            args = prefs_parser.parse_args(strict=False)
            fields = [
                'experience_level','investment_interests','risk_tolerance','investment_goal',
                'theme','default_chart_type','default_chart_period',
                'show_portfolio_value','show_percentage_change','compact_view',
                'default_market','watchlist_sort_by','news_categories',
                'language','date_format','number_format',
            ]
            for field in fields:
                val = args.get(field)
                if val is not None:
                    setattr(prefs, field, val)

            prefs.update()
            return jsonify(bool=True, status=200, response={'message': 'Preferences updated successfully.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/<int:user_id>')
class UserPreferencesAdmin(Resource):
    @ns.doc(description='[ADMIN] Get preferences of any user.')
    @jwt_required()
    def get(self, user_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            prefs = UserPreferences.query.filter_by(user_id=user_id).first()
            if not prefs:
                return jsonify(bool=False, status=404, response={'message': 'Preferences not found.'})
            return jsonify(bool=True, status=200, response=_prefs_dict(prefs))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
