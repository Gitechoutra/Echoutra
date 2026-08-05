"""
portal/apis/transactions/routes.py
====================================
Transactions — Full master ledger for all financial activity.
Covers BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, FEE, ADJUSTMENT, SPLIT.

User APIs  : list, filter, detail, summary, statement
Admin APIs : list all, filter, detail, summary, reverse
"""

import logging
import traceback
from datetime import datetime, timezone
from decimal import Decimal

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal.models.transactions  import Transactions, TxnType, TxnStatus
from portal.models.wallets       import Wallets
from portal.models.wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus
from portal.models.audit_logs    import AuditLogs
from portal.models.trade_orders  import TradeOrders
from portal import db

from . import ns, logger


# ── Parsers  ─────────────

list_parser = reqparse.RequestParser()
list_parser.add_argument('page',         type=int, default=1,    location='args')
list_parser.add_argument('per_page',     type=int, default=20,   location='args')
list_parser.add_argument('type',         type=str, required=False, location='args',
                          help='BUY | SELL | DIVIDEND | DEPOSIT | WITHDRAWAL | FEE | ADJUSTMENT | SPLIT')
list_parser.add_argument('status',       type=str, required=False, location='args',
                          help='COMPLETED | PENDING | FAILED | REVERSED')
list_parser.add_argument('stock_id',     type=int, required=False, location='args')
list_parser.add_argument('portfolio_id', type=int, required=False, location='args')
# Intraday vs Delivery. Read through the order the fill came from — Transactions
# has no trade_mode column of its own.
list_parser.add_argument('trade_mode',   type=str, required=False, location='args',
                         help='INTRADAY | DELIVERY')
list_parser.add_argument('from_date',    type=str, required=False, location='args',
                          help='ISO format: 2025-01-01')
list_parser.add_argument('to_date',      type=str, required=False, location='args',
                          help='ISO format: 2025-01-31')
list_parser.add_argument('sort_by',      type=str, default='transacted_at', location='args')
list_parser.add_argument('order',        type=str, default='desc', location='args')

admin_list_parser = reqparse.RequestParser()
admin_list_parser.add_argument('page',     type=int, default=1,  location='args')
admin_list_parser.add_argument('per_page', type=int, default=20, location='args')
admin_list_parser.add_argument('user_id',  type=int, required=False, location='args')
admin_list_parser.add_argument('type',     type=str, required=False, location='args')
admin_list_parser.add_argument('status',   type=str, required=False, location='args')
admin_list_parser.add_argument('stock_id', type=int, required=False, location='args')
admin_list_parser.add_argument('from_date',type=str, required=False, location='args')
admin_list_parser.add_argument('to_date',  type=str, required=False, location='args')

statement_parser = reqparse.RequestParser()
statement_parser.add_argument('from_date', type=str, required=False, location='args')
statement_parser.add_argument('to_date',   type=str, required=False, location='args')

reverse_parser = reqparse.RequestParser()
reverse_parser.add_argument('reason', type=str, required=True, location='json')


def _require_admin():
    if get_jwt().get('role') != 'ADMIN':
        return jsonify(bool=False, status=403,
                       response={'message': 'Admin access required.'})
    return None


def _txn_dict(t: Transactions) -> dict:
    """Serialize a Transactions row to a dict."""
    return {
        'txn_id':          t.txn_id,
        'user_id':         t.user_id,
        'txn_type':        t.txn_type,
        'txn_status':      t.txn_status,
        'stock_id':        t.stock_id,
        'ticker_symbol':   t.stock.ticker_symbol if t.stock  else None,
        'company_name':    t.stock.company_name  if t.stock  else None,
        'logo_url':        t.stock.logo_url       if t.stock  else None,
        'order_id':        t.order_id,
        # Which book this trade belongs to. Transactions has no trade_mode of its
        # own — it is a property of the order that produced the fill — so it is
        # read through the relationship rather than duplicated onto every row.
        # Wallet-only rows (deposits, withdrawals) have no order and stay None.
        'trade_mode':      (t.order.trade_mode or 'DELIVERY') if t.order else None,
        'portfolio_id':    t.portfolio_id,
        'wallet_txn_id':   t.wallet_txn_id,
        'quantity':        float(t.quantity)       if t.quantity       else None,
        'price_per_unit':  float(t.price_per_unit) if t.price_per_unit else None,
        'gross_amount':    float(t.gross_amount),
        'fee':             float(t.fee),
        'tax':             float(t.tax),
        'net_amount':      float(t.net_amount),
        'currency':        t.currency,
        'description':     t.description,
        'reference_number':t.reference_number,
        'transacted_at':   str(t.transacted_at),
        'created_on':      str(t.created_on),
    }


def _wallet_as_txn_dict(w: WalletTransactions) -> dict:
    """Normalise a WalletTransactions row into the same shape as a Transactions
    row, so wallet deposits/withdrawals can appear in the unified transaction
    history alongside trades."""
    net = w.net_amount if w.net_amount is not None else w.amount
    return {
        'txn_id':           f'W{w.wallet_txn_id}',   # prefixed — never collides with a trade txn_id
        'user_id':          w.user_id,
        'txn_type':         w.transaction_type,       # DEPOSIT / WITHDRAWAL
        'txn_status':       w.status,
        'stock_id':         None,
        'ticker_symbol':    None,
        'company_name':     None,
        'logo_url':         None,
        'order_id':         None,
        'portfolio_id':     None,
        'wallet_txn_id':    w.wallet_txn_id,
        'quantity':         None,
        'price_per_unit':   None,
        'gross_amount':     float(w.amount or 0),
        'fee':              float(w.fee or 0),
        'tax':              0.0,
        'net_amount':       float(net or 0),
        'currency':         w.currency,
        'description':      w.description,
        'reference_number': w.external_reference,
        'transacted_at':    str(w.completed_at or w.created_on),
        'created_on':       str(w.created_on),
    }


def _apply_filters(query, args, user_id=None):
    """Apply common query filters to a Transactions query."""
    if user_id:
        query = query.filter(Transactions.user_id == user_id)
    if args.get('user_id'):
        query = query.filter(Transactions.user_id == args['user_id'])
    if args.get('type'):
        query = query.filter(Transactions.txn_type == args['type'].upper())
    if args.get('status'):
        query = query.filter(Transactions.txn_status == args['status'].upper())
    if args.get('stock_id'):
        query = query.filter(Transactions.stock_id == args['stock_id'])
    if args.get('portfolio_id'):
        query = query.filter(Transactions.portfolio_id == args['portfolio_id'])
    if args.get('trade_mode'):
        # trade_mode lives on the ORDER, so this filters through the order the
        # fill came from. Done in SQL rather than on the page the client happens
        # to be showing, so pagination counts stay honest.
        # DELIVERY also claims legacy rows whose trade_mode was never set, which
        # is what they were before the column existed.
        mode = args['trade_mode'].upper()
        query = query.join(TradeOrders, Transactions.order_id == TradeOrders.order_id)
        if mode == 'DELIVERY':
            query = query.filter(db.or_(TradeOrders.trade_mode == mode,
                                        TradeOrders.trade_mode.is_(None)))
        else:
            query = query.filter(TradeOrders.trade_mode == mode)
    if args.get('from_date'):
        query = query.filter(
            Transactions.transacted_at >= datetime.fromisoformat(args['from_date'])
        )
    if args.get('to_date'):
        query = query.filter(
            Transactions.transacted_at <= datetime.fromisoformat(args['to_date'] + 'T23:59:59')
        )
    return query


#  
#  USER ENDPOINTS
#  

@ns.route('/my')
class MyTransactions(Resource):
    @ns.doc(
        description='List all transactions for the current user. '
                    'Filter by type (BUY/SELL/DIVIDEND/DEPOSIT/WITHDRAWAL/FEE), '
                    'status, stock_id, portfolio_id or date range.'
    )
    @jwt_required()
    @ns.expect(list_parser)
    def get(self):
        try:
            user_id  = int(get_jwt_identity())
            args     = list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])
            ttype    = (args.get('type') or '').upper()

            # DEPOSIT / WITHDRAWAL live in the wallet_transactions table, not the
            # trades table — this endpoint merges both so the history is complete.
            WALLET_TYPES = {'DEPOSIT', 'WITHDRAWAL'}
            rows = []

            # ── Trades (skip when a wallet-only type is requested) ──
            if ttype not in WALLET_TYPES:
                tq = _apply_filters(Transactions.query, args, user_id=user_id)
                rows.extend(_txn_dict(t) for t in tq.all())

            # ── Wallet deposits/withdrawals (when no type filter or a wallet type) ──
            # Only DEPOSIT/WITHDRAWAL — trade cash-movements (BUY_STOCK, SELL_STOCK,
            # FEE, …) are already represented by their Transactions rows, so pulling
            # them in here would create duplicate rows with no stock symbol.
            # A deposit or withdrawal belongs to neither book, so asking for
            # Intraday or Delivery excludes them rather than showing wallet rows
            # under a heading they have nothing to do with.
            if (not ttype or ttype in WALLET_TYPES) and not args.get('trade_mode'):
                wq = WalletTransactions.query.filter(
                    WalletTransactions.user_id == user_id,
                    WalletTransactions.transaction_type.in_(list(WALLET_TYPES)),
                )
                if ttype in WALLET_TYPES:
                    wq = wq.filter(WalletTransactions.transaction_type == ttype)
                if args.get('status'):
                    wq = wq.filter(WalletTransactions.status == args['status'].upper())
                if args.get('from_date'):
                    wq = wq.filter(WalletTransactions.created_on >= datetime.fromisoformat(args['from_date']))
                if args.get('to_date'):
                    wq = wq.filter(WalletTransactions.created_on <= datetime.fromisoformat(args['to_date'] + 'T23:59:59'))
                rows.extend(_wallet_as_txn_dict(w) for w in wq.all())

            # Newest first (both tables share the ISO 'transacted_at' string)
            rows.sort(key=lambda r: r.get('transacted_at') or r.get('created_on') or '',
                      reverse=(args.get('order', 'desc') != 'asc'))

            total       = len(rows)
            start       = (page - 1) * per_page
            page_rows   = rows[start:start + per_page]
            total_pages = (total + per_page - 1) // per_page if per_page else 1

            return jsonify(bool=True, status=200, response={
                'transactions': page_rows,
                'total':        total,
                'page':         page,
                'per_page':     per_page,
                'total_pages':  total_pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/<int:txn_id>')
class TransactionDetail(Resource):
    @ns.doc(description='Get a single transaction by ID. '
                        'Users can only view their own. Admin can view any.')
    @jwt_required()
    def get(self, txn_id):
        try:
            user_id = int(get_jwt_identity())
            claims  = get_jwt()

            txn = Transactions.query.get(txn_id)
            if not txn:
                return jsonify(bool=False, status=404,
                               response={'message': 'Transaction not found.'})

            # Access control
            if txn.user_id != user_id and claims.get('role') != 'ADMIN':
                return jsonify(bool=False, status=403,
                               response={'message': 'Access denied.'})

            return jsonify(bool=True, status=200, response=_txn_dict(txn))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/summary')
class MyTransactionSummary(Resource):
    @ns.doc(
        description='Get a P&L summary for the current user — '
                    'total invested, total sold, total fees, realized P&L, '
                    'dividend income, total deposits, total withdrawals.'
    )
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())

            from sqlalchemy import func

            def _sum(txn_type):
                result = (db.session.query(func.sum(Transactions.net_amount))
                          .filter_by(user_id=user_id, txn_type=txn_type,
                                     txn_status=TxnStatus.COMPLETED)
                          .scalar())
                return float(result or 0)

            def _count(txn_type):
                return (Transactions.query
                        .filter_by(user_id=user_id, txn_type=txn_type,
                                   txn_status=TxnStatus.COMPLETED)
                        .count())

            total_fees = float(
                db.session.query(func.sum(Transactions.fee))
                .filter_by(user_id=user_id, txn_status=TxnStatus.COMPLETED)
                .scalar() or 0
            )

            total_bought    = _sum(TxnType.BUY)
            total_sold      = _sum(TxnType.SELL)
            total_dividends = _sum(TxnType.DIVIDEND)
            total_deposits  = _sum(TxnType.DEPOSIT)
            total_withdrawn = _sum(TxnType.WITHDRAWAL)
            realized_pnl    = total_sold - total_bought if total_sold > 0 else 0

            return jsonify(bool=True, status=200, response={
                'user_id':           user_id,
                'total_invested':    round(total_bought, 2),
                'total_sold':        round(total_sold, 2),
                'realized_pnl':      round(realized_pnl, 2),
                'total_dividends':   round(total_dividends, 2),
                'total_fees_paid':   round(total_fees, 2),
                'total_deposited':   round(total_deposits, 2),
                'total_withdrawn':   round(total_withdrawn, 2),
                'buy_count':         _count(TxnType.BUY),
                'sell_count':        _count(TxnType.SELL),
                'as_of':             str(datetime.now(timezone.utc)),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/statement')
class TransactionStatement(Resource):
    @ns.doc(
        description='Get a filtered transaction statement for a date range. '
                    'Returns all transactions between from_date and to_date '
                    'with a summary at the top — useful for PDF generation.'
    )
    @jwt_required()
    @ns.expect(statement_parser)
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            args    = statement_parser.parse_args(strict=False)

            # Dates optional: default to the last 12 months so a plain
            # "download statement" (no range) returns recent history instead of 400.
            from datetime import timedelta as _td
            to_date   = (datetime.fromisoformat(args['to_date'] + 'T23:59:59')
                         if args.get('to_date') else datetime.now())
            from_date = (datetime.fromisoformat(args['from_date'])
                         if args.get('from_date') else to_date - _td(days=365))

            txns = (Transactions.query
                    .filter(
                        Transactions.user_id      == user_id,
                        Transactions.transacted_at >= from_date,
                        Transactions.transacted_at <= to_date,
                        Transactions.txn_status   == TxnStatus.COMPLETED,
                    )
                    .order_by(Transactions.transacted_at.asc())
                    .all())

            # Quick summary totals
            total_credits = sum(
                float(t.net_amount)
                for t in txns
                if t.txn_type in [TxnType.SELL, TxnType.DIVIDEND, TxnType.DEPOSIT]
            )
            total_debits = sum(
                float(t.net_amount)
                for t in txns
                if t.txn_type in [TxnType.BUY, TxnType.WITHDRAWAL, TxnType.FEE]
            )
            total_fees = sum(float(t.fee) for t in txns)

            return jsonify(bool=True, status=200, response={
                'statement_period': {
                    'from_date': from_date.strftime('%Y-%m-%d'),
                    'to_date':   to_date.strftime('%Y-%m-%d'),
                },
                'summary': {
                    'total_transactions': len(txns),
                    'total_credits':      round(total_credits, 2),
                    'total_debits':       round(total_debits, 2),
                    'total_fees_paid':    round(total_fees, 2),
                    'net_flow':           round(total_credits - total_debits, 2),
                },
                'transactions': [_txn_dict(t) for t in txns],
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  ADMIN ENDPOINTS
#  

@ns.route('/admin/all')
class AdminAllTransactions(Resource):
    @ns.doc(
        description='[ADMIN] List all platform transactions. '
                    'Filter by user_id, type, status, stock_id or date range.'
    )
    @jwt_required()
    @ns.expect(admin_list_parser)
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            args     = admin_list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])

            query = Transactions.query
            query = _apply_filters(query, args)
            query = query.order_by(Transactions.transacted_at.desc())

            paginated = query.paginate(page=page, per_page=per_page, error_out=False)

            return jsonify(bool=True, status=200, response={
                'transactions': [_txn_dict(t) for t in paginated.items],
                'total':        paginated.total,
                'page':         page,
                'per_page':     per_page,
                'total_pages':  paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin/<int:txn_id>')
class AdminTransactionDetail(Resource):
    @ns.doc(description='[ADMIN] Get full detail of any transaction by ID.')
    @jwt_required()
    def get(self, txn_id):
        try:
            err = _require_admin()
            if err:
                return err

            txn = Transactions.query.get(txn_id)
            if not txn:
                return jsonify(bool=False, status=404,
                               response={'message': 'Transaction not found.'})

            return jsonify(bool=True, status=200, response=_txn_dict(txn))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin/summary')
class AdminTransactionSummary(Resource):
    @ns.doc(
        description='[ADMIN] Platform-wide transaction summary — '
                    'total volume by type, total fees collected, '
                    'total buy/sell counts for today, 7d and 30d.'
    )
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            from sqlalchemy import func
            from datetime import timedelta

            today  = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            last7d = today - timedelta(days=7)
            last30d= today - timedelta(days=30)

            def _vol(txn_type, since=None):
                q = (db.session.query(func.sum(Transactions.gross_amount))
                     .filter_by(txn_type=txn_type, txn_status=TxnStatus.COMPLETED))
                if since:
                    q = q.filter(Transactions.transacted_at >= since)
                return float(q.scalar() or 0)

            def _cnt(txn_type, since=None):
                q = Transactions.query.filter_by(
                    txn_type=txn_type, txn_status=TxnStatus.COMPLETED
                )
                if since:
                    q = q.filter(Transactions.transacted_at >= since)
                return q.count()

            total_fees = float(
                db.session.query(func.sum(Transactions.fee))
                .filter_by(txn_status=TxnStatus.COMPLETED)
                .scalar() or 0
            )

            return jsonify(bool=True, status=200, response={
                'all_time': {
                    'buy_volume':      round(_vol(TxnType.BUY), 2),
                    'sell_volume':     round(_vol(TxnType.SELL), 2),
                    'dividend_income': round(_vol(TxnType.DIVIDEND), 2),
                    'deposit_volume':  round(_vol(TxnType.DEPOSIT), 2),
                    'withdrawal_volume':round(_vol(TxnType.WITHDRAWAL), 2),
                    'total_fees_collected': round(total_fees, 2),
                    'buy_count':       _cnt(TxnType.BUY),
                    'sell_count':      _cnt(TxnType.SELL),
                },
                'last_30d': {
                    'buy_volume':  round(_vol(TxnType.BUY, last30d), 2),
                    'sell_volume': round(_vol(TxnType.SELL, last30d), 2),
                    'buy_count':   _cnt(TxnType.BUY, last30d),
                    'sell_count':  _cnt(TxnType.SELL, last30d),
                },
                'last_7d': {
                    'buy_volume':  round(_vol(TxnType.BUY, last7d), 2),
                    'sell_volume': round(_vol(TxnType.SELL, last7d), 2),
                    'buy_count':   _cnt(TxnType.BUY, last7d),
                    'sell_count':  _cnt(TxnType.SELL, last7d),
                },
                'today': {
                    'buy_volume':  round(_vol(TxnType.BUY, today), 2),
                    'sell_volume': round(_vol(TxnType.SELL, today), 2),
                    'buy_count':   _cnt(TxnType.BUY, today),
                    'sell_count':  _cnt(TxnType.SELL, today),
                },
                'as_of': str(datetime.now(timezone.utc)),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin/<int:txn_id>/reverse')
class AdminReverseTransaction(Resource):
    @ns.doc(
        description='[ADMIN] Reverse a completed transaction. '
                    'Marks it as REVERSED, creates a counter-entry in the wallet '
                    'and logs the admin action.'
    )
    @jwt_required()
    @ns.expect(reverse_parser, validate=True)
    def post(self, txn_id):
        try:
            err = _require_admin()
            if err:
                return err

            args   = reverse_parser.parse_args(strict=False)
            reason = args['reason'].strip()
            claims = get_jwt()

            txn = Transactions.query.get(txn_id)
            if not txn:
                return jsonify(bool=False, status=404,
                               response={'message': 'Transaction not found.'})

            if txn.txn_status == TxnStatus.REVERSED:
                return jsonify(bool=False, status=400,
                               response={'message': 'Transaction is already reversed.'})

            if txn.txn_status != TxnStatus.COMPLETED:
                return jsonify(bool=False, status=400,
                               response={'message': f"Cannot reverse a transaction with status '{txn.txn_status}'."})

            # Mark original as reversed
            txn.txn_status  = TxnStatus.REVERSED
            txn.description = f"REVERSED: {reason}"
            txn.update()

            # Refund wallet if it was a BUY
            wallet = Wallets.query.filter_by(user_id=txn.user_id).first()
            if wallet:
                refund_amount = Decimal(str(txn.net_amount))

                if txn.txn_type == TxnType.BUY:
                    # Refund the money back to wallet
                    wallet.balance           += refund_amount
                    wallet.available_balance += refund_amount
                    wallet.update()

                    wt                   = WalletTransactions()
                    wt.wallet_id         = wallet.wallet_id
                    wt.user_id           = txn.user_id
                    wt.transaction_type  = WalletTransactionType.REFUND
                    wt.status            = WalletTransactionStatus.COMPLETED
                    wt.amount            = refund_amount
                    wt.fee               = Decimal('0')
                    wt.net_amount        = refund_amount
                    wt.description       = f"Reversal of transaction #{txn_id}: {reason}"
                    wt.reference_type    = 'TRANSACTION_REVERSAL'
                    wt.reference_id      = txn_id
                    wt.completed_at      = datetime.now(timezone.utc)
                    wt.save()

            # Create reversal counter-entry in Transactions
            reversal                   = Transactions()
            reversal.user_id           = txn.user_id
            reversal.txn_type          = TxnType.ADJUSTMENT
            reversal.txn_status        = TxnStatus.COMPLETED
            reversal.stock_id          = txn.stock_id
            reversal.order_id          = txn.order_id
            reversal.portfolio_id      = txn.portfolio_id
            reversal.gross_amount      = txn.gross_amount
            reversal.fee               = Decimal('0')
            reversal.tax               = Decimal('0')
            reversal.net_amount        = txn.net_amount
            reversal.currency          = txn.currency
            reversal.description       = f"Reversal of transaction #{txn_id}: {reason}"
            reversal.transacted_at     = datetime.now(timezone.utc)
            reversal.save()

            # Audit log
            from portal.models.admin_activity_logs import AdminActivityLogs
            log                  = AdminActivityLogs()
            log.admin_user_id    = claims.get('user_id')
            log.action_type      = 'REVERSE_TRANSACTION'
            log.target_entity_type = 'TRANSACTION'
            log.target_entity_id   = txn_id
            log.target_user_id   = txn.user_id
            log.reason           = reason
            log.before_state     = {'txn_status': TxnStatus.COMPLETED}
            log.after_state      = {'txn_status': TxnStatus.REVERSED}
            log.description      = f"Transaction #{txn_id} reversed. Amount: {txn.net_amount}"
            log.status           = 'SUCCESS'
            log.save()

            logger.info(f"[Transactions] TXN #{txn_id} reversed by admin {claims.get('user_id')}")

            return jsonify(bool=True, status=200, response={
                'message':          f'Transaction #{txn_id} reversed successfully.',
                'original_txn_id':  txn_id,
                'reversal_txn_id':  reversal.txn_id,
                'refund_amount':    float(txn.net_amount),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})