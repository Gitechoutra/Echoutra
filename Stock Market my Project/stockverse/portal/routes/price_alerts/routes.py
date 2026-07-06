import logging
import traceback

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from portal.models.price_alerts import PriceAlerts, PriceAlertStatus
from portal.models.stocks       import Stocks

from . import ns, logger

create_parser = reqparse.RequestParser()
create_parser.add_argument('stock_id',      type=int,   required=True,  location='json')
create_parser.add_argument('condition',     type=str,   required=True,  location='json')
create_parser.add_argument('target_value',  type=float, required=True,  location='json')
create_parser.add_argument('note',          type=str,   required=False, location='json')
create_parser.add_argument('notify_push',   type=bool,  required=False, location='json', default=True)
create_parser.add_argument('notify_email',  type=bool,  required=False, location='json', default=True)
create_parser.add_argument('notify_sms',    type=bool,  required=False, location='json', default=False)
create_parser.add_argument('repeat',        type=bool,  required=False, location='json', default=False)
create_parser.add_argument('max_triggers',  type=int,   required=False, location='json')
create_parser.add_argument('expires_at',    type=str,   required=False, location='json')

update_parser = reqparse.RequestParser()
update_parser.add_argument('target_value', type=float, required=False, location='json')
update_parser.add_argument('notify_push',  type=bool,  required=False, location='json')
update_parser.add_argument('notify_email', type=bool,  required=False, location='json')
update_parser.add_argument('notify_sms',   type=bool,  required=False, location='json')
update_parser.add_argument('repeat',       type=bool,  required=False, location='json')
update_parser.add_argument('note',         type=str,   required=False, location='json')

list_parser = reqparse.RequestParser()
list_parser.add_argument('page',     type=int, default=1,  location='args')
list_parser.add_argument('per_page', type=int, default=20, location='args')
list_parser.add_argument('status',   type=str, required=False, location='args')
list_parser.add_argument('stock_id', type=int, required=False, location='args')


def _alert_dict(a: PriceAlerts) -> dict:
    return {
        'price_alert_id':    a.price_alert_id,
        'user_id':           a.user_id,
        'stock_id':          a.stock_id,
        'ticker_symbol':     a.stock.ticker_symbol if a.stock else None,
        'company_name':      a.stock.company_name  if a.stock else None,
        'current_price':     float(a.stock.current_price) if a.stock and a.stock.current_price else None,
        'logo_url':          a.stock.logo_url       if a.stock else None,
        'condition':         a.condition,
        'target_value':      float(a.target_value),
        'status':            a.status,
        'notify_push':       a.notify_push,
        'notify_email':      a.notify_email,
        'notify_sms':        a.notify_sms,
        'note':              a.note,
        'repeat':            a.repeat,
        'max_triggers':      a.max_triggers,
        'trigger_count':     a.trigger_count,
        'first_triggered_at':str(a.first_triggered_at)  if a.first_triggered_at  else None,
        'last_triggered_at': str(a.last_triggered_at)   if a.last_triggered_at   else None,
        'last_triggered_price': float(a.last_triggered_price) if a.last_triggered_price else None,
        'expires_at':        str(a.expires_at) if a.expires_at else None,
        'created_on':        str(a.created_on),
    }


# ── Create Alert  ────────

@ns.route('/create')
class CreatePriceAlert(Resource):
    @ns.doc(description='Create a new price alert for a stock.')
    @jwt_required()
    @ns.expect(create_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = create_parser.parse_args(strict=False)

            stock = Stocks.query.get(args['stock_id'])
            if not stock:
                return jsonify(bool=False, status=404, response={'message': 'Stock not found.'})

            # Enforce per-user alert limit (based on plan — simplified check)
            existing_count = PriceAlerts.query.filter_by(user_id=user_id, status=PriceAlertStatus.ACTIVE).count()
            if existing_count >= 50:
                return jsonify(bool=False, status=400, response={'message': 'Active alert limit reached (50).'})

            alert              = PriceAlerts()
            alert.user_id      = user_id
            alert.stock_id     = args['stock_id']
            alert.condition    = args['condition'].upper()
            alert.target_value = args['target_value']
            alert.note         = args.get('note', '')
            alert.notify_push  = args.get('notify_push', True)
            alert.notify_email = args.get('notify_email', True)
            alert.notify_sms   = args.get('notify_sms', False)
            alert.repeat       = args.get('repeat', False)
            alert.max_triggers = args.get('max_triggers')
            if args.get('expires_at'):
                from datetime import datetime
                alert.expires_at = datetime.fromisoformat(args['expires_at'])
            alert.save()

            return jsonify(bool=True, status=200, response={
                'message':       'Price alert created.',
                'price_alert_id':alert.price_alert_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── List My Alerts  ──────

@ns.route('/my')
class MyPriceAlerts(Resource):
    @ns.doc(description='List all price alerts for the current user.')
    @jwt_required()
    @ns.expect(list_parser)
    def get(self):
        try:
            user_id  = int(get_jwt_identity())
            args     = list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(50, args['per_page'])
            query    = PriceAlerts.query.filter_by(user_id=user_id)

            if args.get('status'):
                query = query.filter(PriceAlerts.status == args['status'].upper())
            if args.get('stock_id'):
                query = query.filter(PriceAlerts.stock_id == args['stock_id'])

            paginated = query.order_by(PriceAlerts.created_on.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'alerts':      [_alert_dict(a) for a in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get / Update / Delete Alert ────────────────────────────────────────────────

@ns.route('/<int:price_alert_id>')
class PriceAlertDetail(Resource):
    @ns.doc(description='Get a price alert by ID.')
    @jwt_required()
    def get(self, price_alert_id):
        try:
            user_id = int(get_jwt_identity())
            alert   = PriceAlerts.query.filter_by(price_alert_id=price_alert_id, user_id=user_id).first()
            if not alert:
                return jsonify(bool=False, status=404, response={'message': 'Alert not found.'})
            return jsonify(bool=True, status=200, response=_alert_dict(alert))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Update an existing price alert.')
    @jwt_required()
    @ns.expect(update_parser, validate=False)
    def put(self, price_alert_id):
        try:
            user_id = int(get_jwt_identity())
            alert   = PriceAlerts.query.filter_by(price_alert_id=price_alert_id, user_id=user_id).first()
            if not alert:
                return jsonify(bool=False, status=404, response={'message': 'Alert not found.'})

            args = update_parser.parse_args(strict=False)
            for field in ['target_value','notify_push','notify_email','notify_sms','repeat','note']:
                if args.get(field) is not None:
                    setattr(alert, field, args[field])
            alert.update()

            return jsonify(bool=True, status=200, response={'message': 'Price alert updated.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Delete a price alert.')
    @jwt_required()
    def delete(self, price_alert_id):
        try:
            user_id = int(get_jwt_identity())
            alert   = PriceAlerts.query.filter_by(price_alert_id=price_alert_id, user_id=user_id).first()
            if not alert:
                return jsonify(bool=False, status=404, response={'message': 'Alert not found.'})
            alert.delete()
            return jsonify(bool=True, status=200, response={'message': 'Price alert deleted.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Pause / Resume Alert  

@ns.route('/<int:price_alert_id>/pause')
class PauseAlert(Resource):
    @ns.doc(description='Pause an active price alert.')
    @jwt_required()
    def post(self, price_alert_id):
        try:
            user_id = int(get_jwt_identity())
            alert   = PriceAlerts.query.filter_by(price_alert_id=price_alert_id, user_id=user_id).first()
            if not alert:
                return jsonify(bool=False, status=404, response={'message': 'Alert not found.'})
            alert.status = PriceAlertStatus.PAUSED
            alert.update()
            return jsonify(bool=True, status=200, response={'message': 'Alert paused.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/<int:price_alert_id>/resume')
class ResumeAlert(Resource):
    @ns.doc(description='Resume a paused price alert.')
    @jwt_required()
    def post(self, price_alert_id):
        try:
            user_id = int(get_jwt_identity())
            alert   = PriceAlerts.query.filter_by(price_alert_id=price_alert_id, user_id=user_id).first()
            if not alert:
                return jsonify(bool=False, status=404, response={'message': 'Alert not found.'})
            alert.status = PriceAlertStatus.ACTIVE
            alert.update()
            return jsonify(bool=True, status=200, response={'message': 'Alert resumed.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
