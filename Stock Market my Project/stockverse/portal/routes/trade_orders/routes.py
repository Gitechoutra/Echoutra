import logging
import traceback
from datetime import datetime, timezone
from decimal import Decimal

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal.models.trade_orders       import TradeOrders, OrderType, OrderSide, OrderStatus, OrderDuration, TradeMode
from portal.models.trade_executions   import TradeExecutions
from portal.models.portfolio_holdings import PortfolioHoldings
from portal.models.portfolios         import Portfolios
from portal.models.wallets            import Wallets, WalletStatus
from portal.models.wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus
from portal.models.transactions       import Transactions, TxnType, TxnStatus
from portal.models.stocks             import Stocks
from portal.models.audit_logs         import AuditLogs
from portal.helpers.order_engine      import execute_order as engine_execute_order
from portal.helpers.validators        import (
    Validator, validate_quantity, validate_price, validate_choice,
    validate_pagination, validate_notes,
)
from portal import db

from . import ns, logger

# ── Parsers  ─────────────

place_parser = reqparse.RequestParser()
place_parser.add_argument('stock_id',      type=int,   required=True,  location='json')
place_parser.add_argument('order_side',    type=str,   required=True,  location='json')   # BUY / SELL
place_parser.add_argument('order_type',    type=str,   required=True,  location='json')   # MARKET / LIMIT
place_parser.add_argument('quantity',      type=float, required=True,  location='json')
place_parser.add_argument('limit_price',   type=float, required=False, location='json')
place_parser.add_argument('stop_price',    type=float, required=False, location='json')
place_parser.add_argument('order_duration',type=str,   required=False, location='json', default='DAY')
place_parser.add_argument('trade_mode',    type=str,   required=False, location='json', default='DELIVERY')  # DELIVERY / INTRADAY
place_parser.add_argument('portfolio_id',  type=int,   required=False, location='json')

cancel_parser = reqparse.RequestParser()
cancel_parser.add_argument('reason', type=str, required=False, location='json')

list_parser = reqparse.RequestParser()
list_parser.add_argument('page',       type=int, default=1,    location='args')
list_parser.add_argument('per_page',   type=int, default=20,   location='args')
list_parser.add_argument('status',     type=str, required=False, location='args')
list_parser.add_argument('order_side', type=str, required=False, location='args')
list_parser.add_argument('stock_id',   type=int, required=False, location='args')
list_parser.add_argument('trade_mode', type=str, required=False, location='args')

admin_list_parser = reqparse.RequestParser()
admin_list_parser.add_argument('page',     type=int, default=1,  location='args')
admin_list_parser.add_argument('per_page', type=int, default=20, location='args')
admin_list_parser.add_argument('user_id',  type=int, required=False, location='args')
admin_list_parser.add_argument('status',   type=str, required=False, location='args')


def _order_dict(o: TradeOrders) -> dict:
    return {
        'order_id':         o.order_id,
        'user_id':          o.user_id,
        'stock_id':         o.stock_id,
        'ticker_symbol':    o.stock.ticker_symbol if o.stock else None,
        'company_name':     o.stock.company_name  if o.stock else None,
        'logo_url':         o.stock.logo_url       if o.stock else None,
        'portfolio_id':     o.portfolio_id,
        'order_type':       o.order_type,
        'order_side':       o.order_side,
        'order_status':     o.order_status,
        'order_duration':   o.order_duration,
        'trade_mode':       o.trade_mode or 'DELIVERY',
        'quantity':         float(o.quantity),
        'filled_quantity':  float(o.filled_quantity),
        'remaining_quantity': float(o.remaining_quantity) if o.remaining_quantity else None,
        'limit_price':      float(o.limit_price)    if o.limit_price    else None,
        'stop_price':       float(o.stop_price)     if o.stop_price     else None,
        'avg_fill_price':   float(o.avg_fill_price) if o.avg_fill_price else None,
        'estimated_amount': float(o.estimated_amount) if o.estimated_amount else None,
        'filled_amount':    float(o.filled_amount)    if o.filled_amount    else None,
        'total_fee':        float(o.total_fee),
        'submitted_at':     str(o.submitted_at),
        'filled_at':        str(o.filled_at)    if o.filled_at    else None,
        'cancelled_at':     str(o.cancelled_at) if o.cancelled_at else None,
        'rejection_reason': o.rejection_reason,
    }


def _execute_market_order(order: TradeOrders, stock: Stocks, wallet: Wallets, portfolio: Portfolios):
    """
    Immediate MARKET fill at the stock's current price. Delegates to the shared
    order engine so market, limit and stop fills all update the wallet, holdings,
    ledgers and portfolio through one consistent code path.
    `funds_locked=False` — a MARKET order placed here settles from available cash.
    """
    return engine_execute_order(order, stock.current_price or 0, funds_locked=False)


# ── Place Order  ─────────

@ns.route('/place')
class PlaceOrder(Resource):
    @ns.doc(
        description='Place a BUY or SELL order. MARKET orders execute immediately; '
                    'LIMIT/STOP orders are queued.',
        responses={200: 'Order placed', 400: 'Validation error', 403: 'Insufficient funds', 500: 'Server error'}
    )
    @jwt_required()
    @ns.expect(place_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = place_parser.parse_args(strict=False)

            stock_id     = args['stock_id']
            order_side   = (args.get('order_side') or '').upper()
            order_type   = (args.get('order_type') or '').upper()
            trade_mode   = (args.get('trade_mode') or TradeMode.DELIVERY).upper()
            portfolio_id = args.get('portfolio_id')

            # ── Validations ───────────────────────────────────────────────────
            # quantity/limit_price/stop_price arrive as floats from reqparse, so
            # 'NaN' and 'Infinity' reach us intact. validate_* rejects both;
            # the old `quantity <= 0` guard silently passed NaN (every
            # comparison against NaN is False) straight into the order engine.
            v = Validator()
            v.check('order_side',  validate_choice(order_side, [OrderSide.BUY, OrderSide.SELL], label='order_side'))
            v.check('order_type',  validate_choice(
                order_type,
                [OrderType.MARKET, OrderType.LIMIT, OrderType.STOP, OrderType.STOP_LIMIT],
                label='order_type'))
            v.check('trade_mode',  validate_choice(trade_mode, TradeMode.CHOICES, label='trade_mode'))
            v.check('quantity',    validate_quantity(args.get('quantity')))
            if args.get('limit_price') is not None:
                v.check('limit_price', validate_price(args['limit_price'], label='Limit price'))
            if args.get('stop_price') is not None:
                v.check('stop_price', validate_price(args['stop_price'], label='Stop price'))
            if not v.ok:
                return v.response()

            # Delivery is a cash-and-carry buy/sell — Market orders only. Limit &
            # Stop-loss are reserved for Intraday.
            if trade_mode == TradeMode.DELIVERY and order_type != OrderType.MARKET:
                return jsonify(bool=False, status=400, response={
                    'message': 'Delivery supports Market orders only. Use Intraday for Limit / Stop orders.'})

            quantity = Decimal(str(args['quantity']))

            stock = Stocks.query.get(stock_id)
            if not stock:
                return jsonify(bool=False, status=404, response={'message': 'Stock not found.'})
            if not stock.is_tradable:
                return jsonify(bool=False, status=400, response={'message': 'Stock is not currently tradable.'})

            # Resolve portfolio
            if not portfolio_id:
                default_p = Portfolios.query.filter_by(user_id=user_id, is_default=True).first()
                if not default_p:
                    default_p = Portfolios.query.filter_by(user_id=user_id, is_active=True).first()
                if not default_p:
                    # FIX: auto-create a default portfolio instead of erroring out.
                    # New users (from signup) don't get a portfolio row, which
                    # blocked their very first trade with "No portfolio found."
                    default_p                = Portfolios()
                    default_p.user_id        = user_id
                    default_p.portfolio_name = 'My Portfolio'
                    default_p.is_default     = True
                    default_p.is_active      = True
                    default_p.save()
                portfolio_id = default_p.portfolio_id
            else:
                portfolio = Portfolios.query.filter_by(portfolio_id=portfolio_id, user_id=user_id).first()
                if not portfolio:
                    return jsonify(bool=False, status=404, response={'message': 'Portfolio not found.'})

            wallet = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found.'})

            # A frozen/suspended wallet blocks ALL trading, not just deposits and
            # withdrawals — a SELL credits the wallet and a BUY debits it, so both
            # sides move money an admin has explicitly locked down.
            if wallet.status != WalletStatus.ACTIVE:
                return jsonify(bool=False, status=403, response={
                    'message':       f'Your wallet is {wallet.status.lower()}. Trading is disabled — please contact support.',
                    'wallet_status': wallet.status,
                })

            # Queued order types need their trigger price(s).
            if order_type in (OrderType.LIMIT, OrderType.STOP_LIMIT) and not args.get('limit_price'):
                return jsonify(bool=False, status=400, response={'message': 'limit_price is required for LIMIT orders.'})
            if order_type in (OrderType.STOP, OrderType.STOP_LIMIT) and not args.get('stop_price'):
                return jsonify(bool=False, status=400, response={'message': 'stop_price is required for STOP orders.'})

            current_price   = Decimal(str(stock.current_price or 0))
            # Reserve at the order's own price (limit → limit_price, stop → stop_price),
            # falling back to the current market price for MARKET orders.
            reserve_price   = Decimal(str(args.get('limit_price') or args.get('stop_price') or current_price))
            estimated_total = quantity * reserve_price
            commission      = estimated_total * Decimal('0.001')
            estimated_cost  = estimated_total + commission
            is_queued       = order_type != OrderType.MARKET

            # BUY: check wallet balance
            if order_side == OrderSide.BUY:
                if Decimal(str(wallet.available_balance)) < estimated_cost:
                    return jsonify(bool=False, status=403, response={
                        'message':         'Insufficient funds.',
                        'required':        float(estimated_cost),
                        'available':       float(wallet.available_balance),
                    })

            # SELL: check holding within the SAME trade_mode (delivery holdings and
            # intraday positions are independent).
            if order_side == OrderSide.SELL:
                holding = PortfolioHoldings.query.filter_by(
                    portfolio_id=portfolio_id, stock_id=stock_id,
                    trade_mode=trade_mode, is_active=True
                ).first()
                if not holding or Decimal(str(holding.quantity)) < quantity:
                    return jsonify(bool=False, status=400, response={
                        'message':   f'Insufficient {trade_mode.lower()} shares to sell.',
                        'available': float(holding.quantity) if holding else 0,
                        'requested': float(quantity),
                    })

            # Create order record
            order                   = TradeOrders()
            order.user_id           = user_id
            order.stock_id          = stock_id
            order.portfolio_id      = portfolio_id
            order.order_type        = order_type
            order.order_side        = order_side
            order.trade_mode        = trade_mode
            order.order_status      = OrderStatus.PENDING
            order.order_duration    = args.get('order_duration', OrderDuration.DAY).upper()
            order.quantity          = quantity
            order.filled_quantity   = Decimal('0')
            order.remaining_quantity= quantity
            order.limit_price       = args.get('limit_price')
            order.stop_price        = args.get('stop_price')
            order.estimated_amount  = estimated_total
            order.submitted_at      = datetime.now(timezone.utc)
            order.order_source      = 'WEB'
            order.save()

            # Execute immediately for MARKET orders; queue the rest for the engine.
            exec_rec = None
            if order_type == OrderType.MARKET:
                portfolio_obj = Portfolios.query.get(portfolio_id)
                exec_rec = _execute_market_order(order, stock, wallet, portfolio_obj)
            elif order_side == OrderSide.BUY:
                # Reserve buying power for a pending BUY LIMIT/STOP so the funds
                # can't be spent elsewhere. Released on cancel/expiry, or settled
                # from locked_balance when the engine fills the order.
                wallet.locked_balance    = Decimal(str(wallet.locked_balance)) + estimated_cost
                wallet.available_balance = Decimal(str(wallet.balance)) - Decimal(str(wallet.locked_balance))
                wallet.update()

            log            = AuditLogs()
            log.user_id    = user_id
            log.action     = 'PLACE_ORDER'
            log.action_category = 'TRADE'
            log.entity_type= 'TRADE_ORDER'
            log.entity_id  = order.order_id
            log.new_value  = {'side': order_side, 'type': order_type, 'qty': float(quantity)}
            log.status     = 'SUCCESS'
            log.save()

            return jsonify(bool=True, status=200, response={
                'message':        'Order placed successfully.',
                'order_id':       order.order_id,
                'order_status':   order.order_status,
                'execution_id':   exec_rec.execution_id if exec_rec else None,
                'fill_price':     float(order.avg_fill_price) if order.avg_fill_price else None,
                'filled_amount':  float(order.filled_amount)  if order.filled_amount  else None,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Cancel Order  ────────

@ns.route('/<int:order_id>/cancel')
class CancelOrder(Resource):
    @ns.doc(description='Cancel a pending or open order.')
    @jwt_required()
    @ns.expect(cancel_parser, validate=False)
    def post(self, order_id):
        try:
            user_id = int(get_jwt_identity())
            args    = cancel_parser.parse_args(strict=False)
            order   = TradeOrders.query.filter_by(order_id=order_id, user_id=user_id).first()
            if not order:
                return jsonify(bool=False, status=404, response={'message': 'Order not found.'})

            if order.order_status in [OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED]:
                return jsonify(bool=False, status=400, response={
                    'message': f'Cannot cancel an order with status {order.order_status}.'
                })

            order.order_status  = OrderStatus.CANCELLED
            order.cancelled_at  = datetime.now(timezone.utc)
            order.cancelled_by  = 'USER'
            order.rejection_reason = args.get('reason', 'Cancelled by user')
            order.update()

            # Release the reserved buying power for a pending BUY LIMIT/STOP order.
            # The lock included commission (estimated_amount * 1.001), so release
            # the same amount to keep available_balance = balance - locked.
            if order.order_side == OrderSide.BUY and order.order_type != OrderType.MARKET:
                wallet = Wallets.query.filter_by(user_id=user_id).first()
                if wallet and order.estimated_amount:
                    reserved = Decimal(str(order.estimated_amount)) * Decimal('1.001')
                    wallet.locked_balance    = max(Decimal('0'), Decimal(str(wallet.locked_balance)) - reserved)
                    wallet.available_balance = Decimal(str(wallet.balance)) - Decimal(str(wallet.locked_balance))
                    wallet.update()

            return jsonify(bool=True, status=200, response={
                'message':  'Order cancelled.',
                'order_id': order_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get Order Detail  ────

@ns.route('/<int:order_id>')
class OrderDetail(Resource):
    @ns.doc(description='Get order details including execution fills.')
    @jwt_required()
    def get(self, order_id):
        try:
            user_id = int(get_jwt_identity())
            claims  = get_jwt()
            order   = TradeOrders.query.get(order_id)
            if not order:
                return jsonify(bool=False, status=404, response={'message': 'Order not found.'})

            if order.user_id != user_id and claims.get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Access denied.'})

            data = _order_dict(order)

            # Execution fills
            executions = order.executions.order_by(TradeExecutions.executed_at.asc()).all()
            data['executions'] = [{
                'execution_id':      e.execution_id,
                'executed_quantity': float(e.executed_quantity),
                'execution_price':   float(e.execution_price),
                'execution_amount':  float(e.execution_amount),
                'commission':        float(e.commission),
                'net_amount':        float(e.net_amount),
                'executed_at':       str(e.executed_at),
            } for e in executions]

            return jsonify(bool=True, status=200, response=data)

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── List My Orders  ──────

@ns.route('/my')
class MyOrders(Resource):
    @ns.doc(description='List all orders for the current user with optional filters.')
    @jwt_required()
    @ns.expect(list_parser)
    def get(self):
        try:
            user_id  = int(get_jwt_identity())
            args     = list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])

            query = TradeOrders.query.filter_by(user_id=user_id)
            if args.get('status'):
                query = query.filter(TradeOrders.order_status == args['status'].upper())
            if args.get('order_side'):
                query = query.filter(TradeOrders.order_side == args['order_side'].upper())
            if args.get('stock_id'):
                query = query.filter(TradeOrders.stock_id == args['stock_id'])
            if args.get('trade_mode'):
                query = query.filter(TradeOrders.trade_mode == args['trade_mode'].upper())

            paginated = query.order_by(TradeOrders.submitted_at.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'orders':      [_order_dict(o) for o in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: All Orders  ───

@ns.route('/admin/all')
class AdminAllOrders(Resource):
    @ns.doc(description='[ADMIN] List all trade orders across all users.')
    @jwt_required()
    @ns.expect(admin_list_parser)
    def get(self):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            args     = admin_list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])
            query    = TradeOrders.query

            if args.get('user_id'):
                query = query.filter_by(user_id=args['user_id'])
            if args.get('status'):
                query = query.filter(TradeOrders.order_status == args['status'].upper())

            paginated = query.order_by(TradeOrders.submitted_at.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'orders':      [_order_dict(o) for o in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Trade History (Transactions) ───────────────────────────────────────────────

@ns.route('/history')
class TradeHistory(Resource):
    @ns.doc(description='Get the full trade transaction history for the current user.')
    @jwt_required()
    @ns.expect(list_parser)
    def get(self):
        try:
            from portal.models.transactions import Transactions
            user_id  = int(get_jwt_identity())
            args     = list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])

            query = Transactions.query.filter(
                Transactions.user_id == user_id,
                Transactions.txn_type.in_([TxnType.BUY, TxnType.SELL])
            )
            if args.get('stock_id'):
                query = query.filter(Transactions.stock_id == args['stock_id'])

            paginated = query.order_by(Transactions.transacted_at.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'transactions': [{
                    'txn_id':         t.txn_id,
                    'txn_type':       t.txn_type,
                    'txn_status':     t.txn_status,
                    'stock_id':       t.stock_id,
                    'ticker_symbol':  t.stock.ticker_symbol if t.stock else None,
                    'quantity':       float(t.quantity) if t.quantity else None,
                    'price_per_unit': float(t.price_per_unit) if t.price_per_unit else None,
                    'gross_amount':   float(t.gross_amount),
                    'fee':            float(t.fee),
                    'net_amount':     float(t.net_amount),
                    'transacted_at':  str(t.transacted_at),
                } for t in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
