"""
portal/routes/admin/finance_routes.py
======================================
Admin **Finance** section — secured money-management endpoints, mounted under the
existing `admin` namespace at `/v1/admin/finance/*`.

Two kinds of endpoints:

* **Config** (get/put) — company bank account, payment-gateway credentials, GST and
  tax settings. Stored as JSON blobs in the existing `admin_settings` table
  (category ``FINANCE``) via the get-or-create helper below, so no migration/seeder
  is needed. Sensitive fields (gateway secrets, bank account number) are masked on read.

* **Reports** (get) — read-only aggregations of the money that already flows through the
  platform: trading commissions (`transactions.fee`), wallet transactions, deposits and
  withdrawals (`wallet_transactions`), plus a running "company earnings" ledger that sums
  commissions + subscription revenue.

Every endpoint requires a valid JWT **and** ADMIN role (`_require_admin`). Config writes
are recorded in `AdminActivityLogs`, mirroring the platform-settings PUT in ``routes.py``.
"""

import json
import traceback
from datetime import datetime

from flask import jsonify
from flask_restx import Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import func

from portal.models import db
from portal.models.admin_settings      import AdminSettings, SettingDataType
from portal.models.admin_activity_logs import AdminActivityLogs
from portal.models.transactions        import Transactions, TxnType, TxnStatus
from portal.models.wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus
from portal.models.payment_transactions import PaymentTransactions, PaymentStatus
from portal.models.users               import Users
from portal.models.stocks              import Stocks

from .routes import _require_admin
from . import ns, logger


# ── FINANCE config keys + their default JSON payloads ───────────────────────────
_FINANCE_KEYS = {
    'FINANCE_COMPANY_BANK_ACCOUNT': {
        'default': {
            'account_holder': '', 'bank_name': '', 'account_number': '',
            'ifsc': '', 'branch': '', 'upi_id': '',
        },
        'sensitive': False,
        'label': 'Company Bank Account',
        'description': 'Bank account where platform earnings (commission + subscriptions) are settled.',
    },
    'FINANCE_PAYMENT_GATEWAY': {
        'default': {
            'provider': 'RAZORPAY', 'mode': 'test',
            'key_id': '', 'key_secret': '', 'webhook_secret': '',
        },
        'sensitive': True,
        'label': 'Payment Gateway',
        'description': 'Payment-gateway credentials (e.g. Razorpay). Editable if the gateway changes.',
    },
    'FINANCE_GST_DETAILS': {
        'default': {
            'gstin': '', 'legal_name': '', 'trade_name': '',
            'address': '', 'state': '', 'gst_rate': '18',
        },
        'sensitive': False,
        'label': 'GST Details',
        'description': 'Company GST registration details used on invoices.',
    },
    'FINANCE_TAX_SETTINGS': {
        'default': {
            'commission_percent': '0.1', 'withdrawal_fee_percent': '0',
            'tds_percent': '0', 'gst_on_commission': '18',
        },
        'sensitive': False,
        'label': 'Tax Settings',
        'description': 'Platform-wide tax and fee percentages.',
    },
}

# fields masked (never returned in full) per config key
_MASK_FIELDS = {
    'FINANCE_COMPANY_BANK_ACCOUNT': ['account_number'],
    'FINANCE_PAYMENT_GATEWAY':      ['key_secret', 'webhook_secret'],
}


# ── helpers ─────────────────────────────────────────────────────────────────────
def _d(x):
    """Numeric → float, None-safe."""
    return float(x or 0)


def _mask(value):
    """Mask a secret, keeping the last 4 chars: 'abcd1234' -> '••••1234'."""
    value = (value or '').strip()
    if not value:
        return ''
    if len(value) <= 4:
        return '•' * len(value)
    return '••••' + value[-4:]


def _finance_setting(key):
    """Get-or-create the AdminSettings row for a FINANCE config key; return (row, data_dict)."""
    meta = _FINANCE_KEYS[key]
    row  = AdminSettings.query.filter_by(setting_key=key).first()
    if not row:
        row = AdminSettings()
        row.setting_key   = key
        row.setting_value = json.dumps(meta['default'])
        row.default_value = json.dumps(meta['default'])
        row.data_type     = SettingDataType.JSON if hasattr(SettingDataType, 'JSON') else 'JSON'
        row.category      = 'FINANCE'
        row.label         = meta['label']
        row.description   = meta['description']
        row.is_sensitive  = meta['sensitive']
        row.is_editable   = True
        row.is_public     = False
        row.save()
    try:
        data = json.loads(row.setting_value) if row.setting_value else {}
    except (ValueError, TypeError):
        data = {}
    # backfill any missing keys from defaults
    merged = dict(meta['default'])
    merged.update({k: v for k, v in data.items() if k in meta['default']})
    return row, merged


def _masked_view(key, data):
    """Return a copy of the config dict with masked fields obscured for read."""
    out = dict(data)
    for f in _MASK_FIELDS.get(key, []):
        out[f] = _mask(out.get(f))
    return out


def _log_finance_change(key, before, after):
    claims = get_jwt()
    log = AdminActivityLogs()
    log.admin_user_id      = claims.get('user_id')
    log.action_type        = 'MODIFY_FINANCE'
    log.target_entity_type = 'SETTING'
    log.description        = f"Finance config '{key}' updated."
    # never persist raw secrets into the audit log — store masked
    log.before_state       = _masked_view(key, before)
    log.after_state        = _masked_view(key, after)
    log.status             = 'SUCCESS'
    log.save()


def _update_config(key):
    """Shared PUT handler: merge posted fields into the stored JSON config."""
    err = _require_admin()
    if err:
        return err

    meta = _FINANCE_KEYS[key]
    p = reqparse.RequestParser()
    for field in meta['default']:
        p.add_argument(field, type=str, required=False, location='json')
    args = p.parse_args(strict=False)

    row, before = _finance_setting(key)
    after = dict(before)
    for field in meta['default']:
        val = args.get(field)
        if val is None:
            continue
        # ignore a masked placeholder being sent back unchanged
        if field in _MASK_FIELDS.get(key, []) and set(val.strip()) <= {'•'} and val.strip():
            continue
        after[field] = val.strip()

    row.setting_value    = json.dumps(after)
    row.last_modified_by = get_jwt().get('user_id')
    row.update()

    try:
        _log_finance_change(key, before, after)
    except Exception:                      # audit log must never block the save
        traceback.print_exc()

    return jsonify(bool=True, status=200, response={
        'message': f"{meta['label']} updated.",
        'data':    _masked_view(key, after),
    })


# ──────────────────────────────────────────────────────────────────────────────
#  OVERVIEW  (running ledger)
# ──────────────────────────────────────────────────────────────────────────────
@ns.route('/finance/overview')
class FinanceOverview(Resource):
    @ns.doc(description='[ADMIN][FINANCE] Company earnings ledger + money-flow summary.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            # commission collected from trades (fee on every filled BUY/SELL)
            total_commission = _d(db.session.query(func.sum(Transactions.fee)).filter(
                Transactions.txn_type.in_([TxnType.BUY, TxnType.SELL]),
                Transactions.txn_status == TxnStatus.COMPLETED,
            ).scalar())
            commission_count = db.session.query(func.count(Transactions.txn_id)).filter(
                Transactions.txn_type.in_([TxnType.BUY, TxnType.SELL]),
                Transactions.fee > 0,
            ).scalar() or 0

            # subscription revenue (real Razorpay payments)
            total_subscription = _d(db.session.query(func.sum(PaymentTransactions.amount)).filter(
                PaymentTransactions.status == PaymentStatus.COMPLETED,
            ).scalar())
            subscription_count = db.session.query(func.count(PaymentTransactions.payment_id)).filter(
                PaymentTransactions.status == PaymentStatus.COMPLETED,
            ).scalar() or 0

            # wallet money flow
            total_deposits = _d(db.session.query(func.sum(WalletTransactions.amount)).filter(
                WalletTransactions.transaction_type == WalletTransactionType.DEPOSIT,
                WalletTransactions.status == WalletTransactionStatus.COMPLETED,
            ).scalar())
            total_withdrawals = _d(db.session.query(func.sum(WalletTransactions.amount)).filter(
                WalletTransactions.transaction_type == WalletTransactionType.WITHDRAWAL,
                WalletTransactions.status == WalletTransactionStatus.COMPLETED,
            ).scalar())

            company_earnings = total_commission + total_subscription

            _, bank = _finance_setting('FINANCE_COMPANY_BANK_ACCOUNT')

            return jsonify(bool=True, status=200, response={
                'currency':               'INR',
                'company_earnings':       round(company_earnings, 2),
                'total_commission':       round(total_commission, 2),
                'commission_count':       int(commission_count),
                'total_subscription':     round(total_subscription, 2),
                'subscription_count':     int(subscription_count),
                'total_deposits':         round(total_deposits, 2),
                'total_withdrawals':      round(total_withdrawals, 2),
                'settled_to': {
                    'account_holder': bank.get('account_holder', ''),
                    'bank_name':      bank.get('bank_name', ''),
                    'account_number': _mask(bank.get('account_number')),
                    'configured':     bool(bank.get('account_number')),
                },
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ──────────────────────────────────────────────────────────────────────────────
#  CONFIG CARDS  (get / put)
# ──────────────────────────────────────────────────────────────────────────────
@ns.route('/finance/bank_account')
class FinanceBankAccount(Resource):
    @ns.doc(description='[ADMIN][FINANCE] Get company bank account (account number masked).')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err
            _, data = _finance_setting('FINANCE_COMPANY_BANK_ACCOUNT')
            return jsonify(bool=True, status=200, response={'data': _masked_view('FINANCE_COMPANY_BANK_ACCOUNT', data)})
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN][FINANCE] Update company bank account.')
    @jwt_required()
    def put(self):
        try:
            return _update_config('FINANCE_COMPANY_BANK_ACCOUNT')
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/finance/payment_gateway')
class FinancePaymentGateway(Resource):
    @ns.doc(description='[ADMIN][FINANCE] Get payment-gateway config (secrets masked).')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err
            _, data = _finance_setting('FINANCE_PAYMENT_GATEWAY')
            return jsonify(bool=True, status=200, response={'data': _masked_view('FINANCE_PAYMENT_GATEWAY', data)})
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN][FINANCE] Update payment-gateway config.')
    @jwt_required()
    def put(self):
        try:
            return _update_config('FINANCE_PAYMENT_GATEWAY')
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/finance/gst')
class FinanceGST(Resource):
    @ns.doc(description='[ADMIN][FINANCE] Get GST details.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err
            _, data = _finance_setting('FINANCE_GST_DETAILS')
            return jsonify(bool=True, status=200, response={'data': data})
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN][FINANCE] Update GST details.')
    @jwt_required()
    def put(self):
        try:
            return _update_config('FINANCE_GST_DETAILS')
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/finance/tax_settings')
class FinanceTaxSettings(Resource):
    @ns.doc(description='[ADMIN][FINANCE] Get tax settings.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err
            _, data = _finance_setting('FINANCE_TAX_SETTINGS')
            return jsonify(bool=True, status=200, response={'data': data})
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN][FINANCE] Update tax settings.')
    @jwt_required()
    def put(self):
        try:
            return _update_config('FINANCE_TAX_SETTINGS')
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ──────────────────────────────────────────────────────────────────────────────
#  REPORT CARDS  (get, paginated)
# ──────────────────────────────────────────────────────────────────────────────
def _pagination_args():
    p = reqparse.RequestParser()
    p.add_argument('page',      type=int, default=1,  location='args')
    p.add_argument('per_page',  type=int, default=20, location='args')
    p.add_argument('user_id',   type=int, required=False, location='args')
    p.add_argument('from_date', type=str, required=False, location='args')
    p.add_argument('to_date',   type=str, required=False, location='args')
    p.add_argument('status',    type=str, required=False, location='args')
    args = p.parse_args(strict=False)
    args['page']     = max(1, args['page'])
    args['per_page'] = min(100, args['per_page'])
    return args


@ns.route('/finance/commission_report')
class FinanceCommissionReport(Resource):
    @ns.doc(description='[ADMIN][FINANCE] Per-trade commission collected from users.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            args  = _pagination_args()
            query = Transactions.query.filter(
                Transactions.txn_type.in_([TxnType.BUY, TxnType.SELL]),
                Transactions.fee > 0,
            )
            if args.get('user_id'):
                query = query.filter(Transactions.user_id == args['user_id'])
            if args.get('from_date'):
                query = query.filter(Transactions.transacted_at >= datetime.fromisoformat(args['from_date']))
            if args.get('to_date'):
                query = query.filter(Transactions.transacted_at <= datetime.fromisoformat(args['to_date']))

            # aggregate total across the (filtered) set, not just the page
            total_commission = _d(query.with_entities(func.sum(Transactions.fee)).scalar())

            paginated = query.order_by(Transactions.transacted_at.desc()).paginate(
                page=args['page'], per_page=args['per_page'], error_out=False
            )

            # resolve user/stock names in bulk
            user_ids  = {t.user_id for t in paginated.items}
            stock_ids = {t.stock_id for t in paginated.items if t.stock_id}
            users  = {u.user_id: u for u in Users.query.filter(Users.user_id.in_(user_ids)).all()} if user_ids else {}
            stocks = {s.stock_id: s for s in Stocks.query.filter(Stocks.stock_id.in_(stock_ids)).all()} if stock_ids else {}

            rows = []
            for t in paginated.items:
                u = users.get(t.user_id)
                s = stocks.get(t.stock_id)
                rows.append({
                    'txn_id':      t.txn_id,
                    'user_id':     t.user_id,
                    'user_name':   (u.full_name or u.username) if u else None,
                    'user_email':  u.email if u else None,
                    'stock':       s.ticker_symbol if s else None,
                    'side':        t.txn_type,
                    'gross_amount': _d(t.gross_amount),
                    'commission':  _d(t.fee),
                    'currency':    t.currency,
                    'transacted_at': str(t.transacted_at),
                })

            return jsonify(bool=True, status=200, response={
                'rows':             rows,
                'total_commission': round(total_commission, 2),
                'total':            paginated.total,
                'page':             args['page'],
                'per_page':         args['per_page'],
                'total_pages':      paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


def _wallet_txn_query(force_type=None):
    args  = _pagination_args()
    query = WalletTransactions.query
    if force_type:
        query = query.filter(WalletTransactions.transaction_type == force_type)
    if args.get('user_id'):
        query = query.filter(WalletTransactions.user_id == args['user_id'])
    if args.get('status'):
        query = query.filter(WalletTransactions.status == args['status'].upper())
    if args.get('from_date'):
        query = query.filter(WalletTransactions.created_on >= datetime.fromisoformat(args['from_date']))
    if args.get('to_date'):
        query = query.filter(WalletTransactions.created_on <= datetime.fromisoformat(args['to_date']))
    return args, query


def _serialize_wallet_txns(paginated):
    user_ids = {w.user_id for w in paginated.items}
    users = {u.user_id: u for u in Users.query.filter(Users.user_id.in_(user_ids)).all()} if user_ids else {}
    rows = []
    for w in paginated.items:
        u = users.get(w.user_id)
        rows.append({
            'wallet_txn_id':    w.wallet_txn_id,
            'user_id':          w.user_id,
            'user_name':        (u.full_name or u.username) if u else None,
            'user_email':       u.email if u else None,
            'transaction_type': w.transaction_type,
            'status':           w.status,
            'amount':           _d(w.amount),
            'fee':              _d(w.fee),
            'net_amount':       _d(w.net_amount),
            'currency':         w.currency,
            'description':      w.description,
            'created_on':       str(w.created_on),
        })
    return rows


@ns.route('/finance/wallet_transactions')
class FinanceWalletTransactions(Resource):
    @ns.doc(description='[ADMIN][FINANCE] All wallet transactions across users.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err
            args, query = _wallet_txn_query()
            paginated = query.order_by(WalletTransactions.created_on.desc()).paginate(
                page=args['page'], per_page=args['per_page'], error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'rows':        _serialize_wallet_txns(paginated),
                'total':       paginated.total,
                'page':        args['page'],
                'per_page':    args['per_page'],
                'total_pages': paginated.pages,
            })
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/finance/withdrawals')
class FinanceWithdrawals(Resource):
    @ns.doc(description='[ADMIN][FINANCE] Wallet withdrawals.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err
            args, query = _wallet_txn_query(force_type=WalletTransactionType.WITHDRAWAL)
            total_amount = _d(query.with_entities(func.sum(WalletTransactions.amount)).scalar())
            paginated = query.order_by(WalletTransactions.created_on.desc()).paginate(
                page=args['page'], per_page=args['per_page'], error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'rows':         _serialize_wallet_txns(paginated),
                'total_amount': round(total_amount, 2),
                'total':        paginated.total,
                'page':         args['page'],
                'per_page':     args['per_page'],
                'total_pages':  paginated.pages,
            })
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/finance/deposits')
class FinanceDeposits(Resource):
    @ns.doc(description='[ADMIN][FINANCE] Wallet deposits.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err
            args, query = _wallet_txn_query(force_type=WalletTransactionType.DEPOSIT)
            total_amount = _d(query.with_entities(func.sum(WalletTransactions.amount)).scalar())
            paginated = query.order_by(WalletTransactions.created_on.desc()).paginate(
                page=args['page'], per_page=args['per_page'], error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'rows':         _serialize_wallet_txns(paginated),
                'total_amount': round(total_amount, 2),
                'total':        paginated.total,
                'page':         args['page'],
                'per_page':     args['per_page'],
                'total_pages':  paginated.pages,
            })
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
