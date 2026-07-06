import logging
import traceback
from datetime import datetime, timezone
from decimal import Decimal

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal.models.trade_orders       import TradeOrders, OrderType, OrderSide, OrderStatus, OrderDuration
from portal.models.trade_executions   import TradeExecutions
from portal.models.portfolio_holdings import PortfolioHoldings
from portal.models.portfolios         import Portfolios
from portal.models.wallets            import Wallets
from portal.models.wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus
from portal.models.transactions       import Transactions, TxnType, TxnStatus
from portal.models.stocks             import Stocks
from portal.models.audit_logs         import AuditLogs
# from portal import db

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
place_parser.add_argument('portfolio_id',  type=int,   required=False, location='json')

cancel_parser = reqparse.RequestParser()
cancel_parser.add_argument('reason', type=str, required=False, location='json')

list_parser = reqparse.RequestParser()
list_parser.add_argument('page',       type=int, default=1,    location='args')
list_parser.add_argument('per_page',   type=int, default=20,   location='args')
list_parser.add_argument('status',     type=str, required=False, location='args')
list_parser.add_argument('order_side', type=str, required=False, location='args')
list_parser.add_argument('stock_id',   type=int, required=False, location='args')

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
    Simulate an immediate market-order fill.
    In production, wire this to the broker/exchange integration.
    """
    execution_price  = Decimal(str(stock.current_price or 0))
    quantity         = Decimal(str(order.quantity))
    execution_amount = quantity * execution_price
    commission       = execution_amount * Decimal('0.001')   # 0.1% fee
    net_amount       = execution_amount + commission if order.order_side == OrderSide.BUY else execution_amount - commission

    # ── Record execution ──────────────────────────────────────────────────────
    exec_rec                   = TradeExecutions()
    exec_rec.order_id          = order.order_id
    exec_rec.user_id           = order.user_id
    exec_rec.stock_id          = order.stock_id
    exec_rec.executed_quantity = quantity
    exec_rec.execution_price   = execution_price
    exec_rec.execution_amount  = execution_amount
    exec_rec.commission        = commission
    exec_rec.total_fee         = commission
    exec_rec.net_amount        = net_amount
    exec_rec.executed_at       = datetime.now(timezone.utc)
    exec_rec.save()

    # ── Update order  ───
    order.order_status      = OrderStatus.FILLED
    order.filled_quantity   = quantity
    order.remaining_quantity= Decimal('0')
    order.avg_fill_price    = execution_price
    order.filled_amount     = execution_amount
    order.total_fee         = commission
    order.filled_at         = datetime.now(timezone.utc)
    order.update()

    # ── Update wallet  ──
    if order.order_side == OrderSide.BUY:
        wallet.balance           -= net_amount
        wallet.available_balance -= net_amount
    else:
        wallet.balance           += net_amount
        wallet.available_balance += net_amount
    wallet.total_invested = (wallet.total_invested or Decimal('0')) + (net_amount if order.order_side == OrderSide.BUY else Decimal('0'))
    wallet.last_transaction_at = datetime.now(timezone.utc)
    wallet.update()

    # ── Wallet transaction ledger ─────────────────────────────────────────────
    wt                 = WalletTransactions()
    wt.wallet_id       = wallet.wallet_id
    wt.user_id         = order.user_id
    wt.transaction_type= WalletTransactionType.BUY_STOCK if order.order_side == OrderSide.BUY else WalletTransactionType.SELL_STOCK
    wt.status          = WalletTransactionStatus.COMPLETED
    wt.amount          = execution_amount
    wt.fee             = commission
    wt.net_amount      = net_amount
    wt.reference_type  = 'TRADE_ORDER'
    wt.reference_id    = order.order_id
    wt.completed_at    = datetime.now(timezone.utc)
    wt.save()

    # ── Master transactions ledger ────────────────────────────────────────────
    txn                = Transactions()
    txn.user_id        = order.user_id
    txn.txn_type       = TxnType.BUY if order.order_side == OrderSide.BUY else TxnType.SELL
    txn.txn_status     = TxnStatus.COMPLETED
    txn.stock_id       = order.stock_id
    txn.order_id       = order.order_id
    txn.portfolio_id   = order.portfolio_id
    txn.wallet_txn_id  = wt.wallet_txn_id
    txn.quantity       = quantity
    txn.price_per_unit = execution_price
    txn.gross_amount   = execution_amount
    txn.fee            = commission
    txn.net_amount     = net_amount
    txn.transacted_at  = datetime.now(timezone.utc)
    txn.save()

    # ── Update portfolio holding ──────────────────────────────────────────────
    if order.order_side == OrderSide.BUY:
        holding = PortfolioHoldings.query.filter_by(
            portfolio_id=order.portfolio_id, stock_id=order.stock_id, is_active=True
        ).first()
        if holding:
            old_qty    = Decimal(str(holding.quantity))
            old_cost   = Decimal(str(holding.total_invested))
            new_qty    = old_qty + quantity
            new_cost   = old_cost + execution_amount
            holding.quantity          = new_qty
            holding.total_invested    = new_cost
            holding.average_buy_price = new_cost / new_qty
            holding.last_traded_at    = datetime.now(timezone.utc)
            holding.update()
        else:
            holding                   = PortfolioHoldings()
            holding.portfolio_id      = order.portfolio_id
            holding.stock_id          = order.stock_id
            holding.user_id           = order.user_id
            holding.quantity          = quantity
            holding.average_buy_price = execution_price
            holding.total_invested    = execution_amount
            holding.first_bought_at   = datetime.now(timezone.utc)
            holding.last_traded_at    = datetime.now(timezone.utc)
            holding.save()
    else:
        # SELL — reduce or close holding
        holding = PortfolioHoldings.query.filter_by(
            portfolio_id=order.portfolio_id, stock_id=order.stock_id, is_active=True
        ).first()
        if holding:
            sell_qty   = quantity
            cost_basis = Decimal(str(holding.average_buy_price)) * sell_qty
            realized   = execution_amount - cost_basis
            new_qty    = Decimal(str(holding.quantity)) - sell_qty
            holding.realized_pnl  = (holding.realized_pnl or Decimal('0')) + realized
            if new_qty <= Decimal('0'):
                holding.quantity  = Decimal('0')
                holding.is_active = False
            else:
                holding.quantity      = new_qty
                holding.total_invested= new_qty * Decimal(str(holding.average_buy_price))
            holding.last_traded_at = datetime.now(timezone.utc)
            holding.update()

    return exec_rec


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
            order_side   = args['order_side'].upper()
            order_type   = args['order_type'].upper()
            quantity     = Decimal(str(args['quantity']))
            portfolio_id = args.get('portfolio_id')

            # Validations
            if order_side not in [OrderSide.BUY, OrderSide.SELL]:
                return jsonify(bool=False, status=400, response={'message': 'order_side must be BUY or SELL.'})
            if order_type not in [OrderType.MARKET, OrderType.LIMIT, OrderType.STOP, OrderType.STOP_LIMIT]:
                return jsonify(bool=False, status=400, response={'message': 'Invalid order_type.'})
            if quantity <= 0:
                return jsonify(bool=False, status=400, response={'message': 'Quantity must be > 0.'})

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
                    return jsonify(bool=False, status=400, response={'message': 'No portfolio found. Create one first.'})
                portfolio_id = default_p.portfolio_id
            else:
                portfolio = Portfolios.query.filter_by(portfolio_id=portfolio_id, user_id=user_id).first()
                if not portfolio:
                    return jsonify(bool=False, status=404, response={'message': 'Portfolio not found.'})

            wallet = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found.'})

            current_price   = Decimal(str(stock.current_price or 0))
            execution_price = Decimal(str(args.get('limit_price') or current_price))
            estimated_total = quantity * execution_price
            commission      = estimated_total * Decimal('0.001')
            estimated_cost  = estimated_total + commission

            # BUY: check wallet balance
            if order_side == OrderSide.BUY:
                if Decimal(str(wallet.available_balance)) < estimated_cost:
                    return jsonify(bool=False, status=403, response={
                        'message':         'Insufficient funds.',
                        'required':        float(estimated_cost),
                        'available':       float(wallet.available_balance),
                    })

            # SELL: check holding
            if order_side == OrderSide.SELL:
                holding = PortfolioHoldings.query.filter_by(
                    portfolio_id=portfolio_id, stock_id=stock_id, is_active=True
                ).first()
                if not holding or Decimal(str(holding.quantity)) < quantity:
                    return jsonify(bool=False, status=400, response={
                        'message':   'Insufficient shares to sell.',
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

            # Execute immediately for MARKET orders
            exec_rec = None
            if order_type == OrderType.MARKET:
                portfolio_obj = Portfolios.query.get(portfolio_id)
                exec_rec = _execute_market_order(order, stock, wallet, portfolio_obj)

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

            # Release locked wallet balance for LIMIT BUY orders
            if order.order_side == OrderSide.BUY and order.order_type != OrderType.MARKET:
                wallet = Wallets.query.filter_by(user_id=user_id).first()
                if wallet and order.estimated_amount:
                    wallet.locked_balance    = max(Decimal('0'), Decimal(str(wallet.locked_balance)) - Decimal(str(order.estimated_amount)))
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
