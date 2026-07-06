import logging
import traceback

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity

from portal.models.watchlists       import Watchlists
from portal.models.watchlist_items  import WatchlistItems
from portal.models.watchlist_alerts import WatchlistAlerts, AlertStatus
from portal.models.stocks           import Stocks

from .import ns, logger

create_wl_parser = reqparse.RequestParser()
create_wl_parser.add_argument('watchlist_name', type=str, required=True,  location='json')
create_wl_parser.add_argument('description',    type=str, required=False, location='json')
create_wl_parser.add_argument('emoji_icon',     type=str, required=False, location='json')

update_wl_parser = reqparse.RequestParser()
update_wl_parser.add_argument('watchlist_name', type=str, required=False, location='json')
update_wl_parser.add_argument('description',    type=str, required=False, location='json')
update_wl_parser.add_argument('emoji_icon',     type=str, required=False, location='json')

add_item_parser = reqparse.RequestParser()
add_item_parser.add_argument('stock_id', type=int, required=True,  location='json')
add_item_parser.add_argument('notes',    type=str, required=False, location='json')

alert_parser = reqparse.RequestParser()
alert_parser.add_argument('condition',    type=str,   required=True,  location='json')
alert_parser.add_argument('target_value', type=float, required=True,  location='json')
alert_parser.add_argument('notify_email', type=bool,  required=False, location='json', default=True)
alert_parser.add_argument('notify_push',  type=bool,  required=False, location='json', default=True)
alert_parser.add_argument('notify_sms',   type=bool,  required=False, location='json', default=False)
alert_parser.add_argument('repeat_alert', type=bool,  required=False, location='json', default=False)


def _wl_dict(w: Watchlists) -> dict:
    return {
        'watchlist_id':  w.watchlist_id,
        'watchlist_name':w.watchlist_name,
        'description':   w.description,
        'emoji_icon':    w.emoji_icon,
        'is_default':    w.is_default,
        'items_count':   w.items_count,
        'sort_order':    w.sort_order,
        'created_on':    str(w.created_on),
    }


def _item_dict(i: WatchlistItems) -> dict:
    s = i.stock
    return {
        'item_id':              i.item_id,
        'stock_id':             i.stock_id,
        'ticker_symbol':        s.ticker_symbol if s else None,
        'company_name':         s.company_name  if s else None,
        'logo_url':             s.logo_url       if s else None,
        'sector':               s.sector         if s else None,
        'current_price':        float(s.current_price) if s and s.current_price else None,
        'price_change_percent': float(s.price_change_percent) if s and s.price_change_percent else None,
        'price_at_add':         float(i.price_at_add) if i.price_at_add else None,
        'sparkline_data':       i.sparkline_data,
        'notes':                i.notes,
        'sort_order':           i.sort_order,
        'added_on':             str(i.created_on),
    }


# ── Create Watchlist  

@ns.route('/create')
class CreateWatchlist(Resource):
    @ns.doc(description='Create a new watchlist.')
    @jwt_required()
    @ns.expect(create_wl_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = create_wl_parser.parse_args(strict=False)

            wl               = Watchlists()
            wl.user_id       = user_id
            wl.watchlist_name= args['watchlist_name'].strip()
            wl.description   = args.get('description', '')
            wl.emoji_icon    = args.get('emoji_icon', '')
            wl.save()

            return jsonify(bool=True, status=200, response={
                'message':      'Watchlist created.',
                'watchlist_id': wl.watchlist_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── List My Watchlists  ──

@ns.route('/my')
class MyWatchlists(Resource):
    @ns.doc(description='List all watchlists for the current user.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            wls     = Watchlists.query.filter_by(user_id=user_id, is_active=True)\
                        .order_by(Watchlists.sort_order.asc()).all()
            return jsonify(bool=True, status=200, response={
                'watchlists': [_wl_dict(w) for w in wls],
                'total':      len(wls),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get / Update / Delete Watchlist ───────────────────────────────────────────

@ns.route('/<int:watchlist_id>')
class WatchlistDetail(Resource):
    @ns.doc(description='Get watchlist and all its items.')
    @jwt_required()
    def get(self, watchlist_id):
        try:
            user_id = int(get_jwt_identity())
            wl      = Watchlists.query.filter_by(watchlist_id=watchlist_id, user_id=user_id).first()
            if not wl:
                return jsonify(bool=False, status=404, response={'message': 'Watchlist not found.'})

            items = WatchlistItems.query.filter_by(watchlist_id=watchlist_id)\
                      .order_by(WatchlistItems.sort_order.asc()).all()
            data         = _wl_dict(wl)
            data['items']= [_item_dict(i) for i in items]
            return jsonify(bool=True, status=200, response=data)

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Update watchlist name / description / emoji.')
    @jwt_required()
    @ns.expect(update_wl_parser, validate=False)
    def put(self, watchlist_id):
        try:
            user_id = int(get_jwt_identity())
            wl      = Watchlists.query.filter_by(watchlist_id=watchlist_id, user_id=user_id).first()
            if not wl:
                return jsonify(bool=False, status=404, response={'message': 'Watchlist not found.'})

            args = update_wl_parser.parse_args(strict=False)
            if args.get('watchlist_name'): wl.watchlist_name = args['watchlist_name'].strip()
            if args.get('description')   is not None: wl.description = args['description']
            if args.get('emoji_icon')    is not None: wl.emoji_icon  = args['emoji_icon']
            wl.update()

            return jsonify(bool=True, status=200, response={'message': 'Watchlist updated.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Delete a watchlist and all its items.')
    @jwt_required()
    def delete(self, watchlist_id):
        try:
            user_id = int(get_jwt_identity())
            wl      = Watchlists.query.filter_by(watchlist_id=watchlist_id, user_id=user_id).first()
            if not wl:
                return jsonify(bool=False, status=404, response={'message': 'Watchlist not found.'})
            if wl.is_default:
                return jsonify(bool=False, status=400, response={'message': 'Cannot delete the default watchlist.'})

            wl.is_active = False
            wl.update()
            return jsonify(bool=True, status=200, response={'message': 'Watchlist deleted.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Add Item  ────────

@ns.route('/<int:watchlist_id>/items/add')
class AddWatchlistItem(Resource):
    @ns.doc(description='Add a stock to a watchlist.')
    @jwt_required()
    @ns.expect(add_item_parser, validate=True)
    def post(self, watchlist_id):
        try:
            user_id = int(get_jwt_identity())
            wl      = Watchlists.query.filter_by(watchlist_id=watchlist_id, user_id=user_id).first()
            if not wl:
                return jsonify(bool=False, status=404, response={'message': 'Watchlist not found.'})

            args     = add_item_parser.parse_args(strict=False)
            stock_id = args['stock_id']
            stock    = Stocks.query.get(stock_id)
            if not stock:
                return jsonify(bool=False, status=404, response={'message': 'Stock not found.'})

            existing = WatchlistItems.query.filter_by(watchlist_id=watchlist_id, stock_id=stock_id).first()
            if existing:
                return jsonify(bool=False, status=400, response={'message': 'Stock already in watchlist.'})

            item               = WatchlistItems()
            item.watchlist_id  = watchlist_id
            item.stock_id      = stock_id
            item.user_id       = user_id
            item.notes         = args.get('notes', '')
            item.price_at_add  = stock.current_price
            item.save()

            wl.items_count = (wl.items_count or 0) + 1
            wl.update()

            return jsonify(bool=True, status=200, response={
                'message': 'Stock added to watchlist.',
                'item_id': item.item_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Remove Item  ─────

@ns.route('/<int:watchlist_id>/items/<int:item_id>/remove')
class RemoveWatchlistItem(Resource):
    @ns.doc(description='Remove a stock from a watchlist.')
    @jwt_required()
    def delete(self, watchlist_id, item_id):
        try:
            user_id = int(get_jwt_identity())
            item    = WatchlistItems.query.filter_by(item_id=item_id, watchlist_id=watchlist_id, user_id=user_id).first()
            if not item:
                return jsonify(bool=False, status=404, response={'message': 'Watchlist item not found.'})

            wl = Watchlists.query.get(watchlist_id)
            if wl:
                wl.items_count = max(0, (wl.items_count or 1) - 1)
                wl.update()

            item.delete()
            return jsonify(bool=True, status=200, response={'message': 'Stock removed from watchlist.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Add Alert to Watchlist Item ────────────────────────────────────────────────

@ns.route('/items/<int:item_id>/alerts/add')
class AddWatchlistAlert(Resource):
    @ns.doc(description='Add a price alert to a watchlist item.')
    @jwt_required()
    @ns.expect(alert_parser, validate=True)
    def post(self, item_id):
        try:
            user_id = int(get_jwt_identity())
            item    = WatchlistItems.query.filter_by(item_id=item_id, user_id=user_id).first()
            if not item:
                return jsonify(bool=False, status=404, response={'message': 'Watchlist item not found.'})

            args               = alert_parser.parse_args(strict=False)
            alert              = WatchlistAlerts()
            alert.item_id      = item_id
            alert.user_id      = user_id
            alert.stock_id     = item.stock_id
            alert.condition    = args['condition'].upper()
            alert.target_value = args['target_value']
            alert.notify_email = args.get('notify_email', True)
            alert.notify_push  = args.get('notify_push', True)
            alert.notify_sms   = args.get('notify_sms', False)
            alert.repeat_alert = args.get('repeat_alert', False)
            alert.save()

            return jsonify(bool=True, status=200, response={
                'message':  'Alert created.',
                'alert_id': alert.alert_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── List Alerts for Item  

@ns.route('/items/<int:item_id>/alerts')
class WatchlistItemAlerts(Resource):
    @ns.doc(description='Get all alerts for a watchlist item.')
    @jwt_required()
    def get(self, item_id):
        try:
            user_id = int(get_jwt_identity())
            alerts  = WatchlistAlerts.query.filter_by(item_id=item_id, user_id=user_id).all()
            return jsonify(bool=True, status=200, response={
                'alerts': [{
                    'alert_id':      a.alert_id,
                    'condition':     a.condition,
                    'target_value':  float(a.target_value),
                    'status':        a.status,
                    'notify_email':  a.notify_email,
                    'notify_push':   a.notify_push,
                    'repeat_alert':  a.repeat_alert,
                    'triggered_at':  str(a.triggered_at) if a.triggered_at else None,
                } for a in alerts]
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Cancel Alert  ───

@ns.route('/alerts/<int:alert_id>/cancel')
class CancelWatchlistAlert(Resource):
    @ns.doc(description='Cancel a watchlist alert.')
    @jwt_required()
    def post(self, alert_id):
        try:
            user_id = int(get_jwt_identity())
            alert   = WatchlistAlerts.query.filter_by(alert_id=alert_id, user_id=user_id).first()
            if not alert:
                return jsonify(bool=False, status=404, response={'message': 'Alert not found.'})

            alert.status = AlertStatus.CANCELLED
            alert.update()
            return jsonify(bool=True, status=200, response={'message': 'Alert cancelled.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
