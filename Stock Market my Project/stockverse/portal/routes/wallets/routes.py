import json
import logging
import re
import traceback
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from portal.models.admin_settings     import AdminSettings
from portal.models.kyc_verifications  import KYCVerifications, KYCStatus
from portal.models.payout_methods     import PayoutMethods, PayoutMethodType
from portal.models.payment_transactions import PaymentTransactions, PaymentStatus
from portal.models.wallets             import Wallets, WalletStatus
from portal.models.wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus
from portal.helpers.razorpay_helper    import verify_payment_signature

from . import ns, logger

deposit_parser = reqparse.RequestParser()
deposit_parser.add_argument('amount',              type=float, required=True,  location='json')
deposit_parser.add_argument('payment_method',      type=str,   required=False, location='json', default='RAZORPAY')
deposit_parser.add_argument('notes',               type=str,   required=False, location='json')
# SECURITY: crediting the wallet now REQUIRES proof of a completed Razorpay
# payment. Without these three fields, and a signature that verifies against the
# gateway secret, the deposit is refused — previously the wallet was credited on
# request alone, letting any authenticated user mint unlimited balance.
deposit_parser.add_argument('razorpay_order_id',   type=str,   required=True,  location='json')
deposit_parser.add_argument('razorpay_payment_id', type=str,   required=True,  location='json')
deposit_parser.add_argument('razorpay_signature',  type=str,   required=True,  location='json')

withdraw_parser = reqparse.RequestParser()
withdraw_parser.add_argument('amount',           type=float, required=True,  location='json')
withdraw_parser.add_argument('payout_method_id', type=int,   required=True,  location='json')
withdraw_parser.add_argument('notes',            type=str,   required=False, location='json')

payout_method_parser = reqparse.RequestParser()
payout_method_parser.add_argument('method_type',    type=str, required=True,  location='json')
payout_method_parser.add_argument('label',          type=str, required=False, location='json')
payout_method_parser.add_argument('upi_id',         type=str, required=False, location='json')
payout_method_parser.add_argument('account_holder', type=str, required=False, location='json')
payout_method_parser.add_argument('bank_name',      type=str, required=False, location='json')
payout_method_parser.add_argument('account_number', type=str, required=False, location='json')
payout_method_parser.add_argument('ifsc',           type=str, required=False, location='json')
payout_method_parser.add_argument('is_primary',     type=bool, required=False, location='json', default=False)

txn_list_parser = reqparse.RequestParser()
txn_list_parser.add_argument('page',     type=int, default=1,    location='args')
txn_list_parser.add_argument('per_page', type=int, default=20,   location='args')
txn_list_parser.add_argument('type',     type=str, required=False, location='args')
txn_list_parser.add_argument('from_date',type=str, required=False, location='args')
txn_list_parser.add_argument('to_date',  type=str, required=False, location='args')


def _wallet_dict(w: Wallets) -> dict:
    return {
        'wallet_id':        w.wallet_id,
        'user_id':          w.user_id,
        'balance':          float(w.balance),
        'available_balance':float(w.available_balance),
        'locked_balance':   float(w.locked_balance),
        'currency':         w.currency,
        'status':           w.status,
        # Surfaced so the client can reject an over-limit deposit *before* opening
        # the Razorpay sheet — otherwise the user is charged and then refused.
        'max_single_deposit': float(_max_single_deposit()),
        # Lets the wallet UI explain *why* Add Money is unavailable without a
        # second round-trip to the KYC endpoint.
        'kyc_status':         _kyc_status(w.user_id),
        'can_deposit':        _kyc_status(w.user_id) == KYCStatus.APPROVED and w.status == WalletStatus.ACTIVE,
        'total_deposited':  float(w.total_deposited),
        'total_withdrawn':  float(w.total_withdrawn),
        'total_invested':   float(w.total_invested),
        'last_transaction_at': str(w.last_transaction_at) if w.last_transaction_at else None,
        'updated_on':       str(w.updated_on),
    }


# ── Withdrawal fees ────────────────────────────────────────────────────────────
# Net banking settlements are routed through the bank's payment rails, which levy a
# flat per-transfer charge that UPI (free) and direct account credits do not.
_NET_BANKING_FEE = Decimal('5.00')


def _money(d: Decimal) -> Decimal:
    """Round to 2dp the way currency is stored (Numeric(15, 2))."""
    return d.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _kyc_status(user_id) -> str:
    """The user's KYC status, or NOT_STARTED when they have no record yet."""
    kyc = KYCVerifications.query.filter_by(user_id=user_id).first()
    return kyc.kyc_status if kyc and kyc.kyc_status else KYCStatus.NOT_STARTED


# Reason shown to the user when a deposit is refused for KYC, per status.
_KYC_DEPOSIT_BLOCK_REASON = {
    KYCStatus.NOT_STARTED:  'Complete your KYC verification before adding money to your wallet.',
    KYCStatus.PENDING:      'Your KYC is pending admin approval. You can add money once it is approved.',
    KYCStatus.UNDER_REVIEW: 'Your KYC is under review. You can add money once it is approved.',
    KYCStatus.REJECTED:     'Your KYC was rejected. Please re-submit your documents to add money.',
    KYCStatus.EXPIRED:      'Your KYC has expired. Please re-verify to add money.',
}


def _max_single_deposit() -> Decimal:
    """
    The admin-configured per-deposit cap (TRADING_MAX_SINGLE_DEPOSIT, set on the
    admin Settings page), in INR. Falls back to the seeded 100000 when the row is
    missing or unparseable. Returns Decimal('0') to mean "no limit".
    """
    try:
        row = AdminSettings.query.filter_by(setting_key='TRADING_MAX_SINGLE_DEPOSIT').first()
        if row and row.setting_value is not None and str(row.setting_value).strip() != '':
            return Decimal(str(row.setting_value))
    except Exception as e:
        logger.debug(f"_max_single_deposit: falling back to default ({e})")
    return Decimal('100000')


def _fmt_inr(amount: Decimal) -> str:
    """Format an amount the way Indian users read it: 100000 -> '1,00,000'."""
    whole = int(amount)
    s = str(whole)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ','.join(parts) + ',' + tail


def _withdrawal_fee_percent() -> Decimal:
    """
    Platform withdrawal fee %, as configured on the admin Finance page
    (FINANCE_TAX_SETTINGS.withdrawal_fee_percent). Falls back to 0 when the row is
    absent or unparseable, matching the seeded default.
    """
    try:
        row = AdminSettings.query.filter_by(setting_key='FINANCE_TAX_SETTINGS').first()
        if row and row.setting_value:
            return Decimal(str(json.loads(row.setting_value).get('withdrawal_fee_percent') or '0'))
    except Exception as e:
        logger.debug(f"_withdrawal_fee_percent: falling back to 0 ({e})")
    return Decimal('0')


def _quote_withdrawal(amount: Decimal, method_type: str) -> dict:
    """
    Break an withdrawal amount into the fees charged and what actually lands in the
    user's account. `amount` is always what leaves the wallet; `net` is what is paid out.
    """
    platform_fee = _money(amount * _withdrawal_fee_percent() / Decimal('100'))
    gateway_fee  = _NET_BANKING_FEE if method_type == PayoutMethodType.NET_BANKING else Decimal('0')
    total_fee    = platform_fee + gateway_fee
    return {
        'platform_fee': platform_fee,
        'gateway_fee':  gateway_fee,
        'total_fee':    total_fee,
        'net':          _money(amount - total_fee),
    }


def _validate_payout_method(args) -> str | None:
    """Return an error message for invalid payout-method input, else None."""
    method_type = (args.get('method_type') or '').strip().upper()
    if method_type not in PayoutMethodType.CHOICES:
        return f'method_type must be one of: {", ".join(PayoutMethodType.CHOICES)}.'

    if method_type == PayoutMethodType.UPI:
        upi = (args.get('upi_id') or '').strip()
        if not upi:
            return 'UPI ID is required.'
        # e.g. name@okhdfcbank — handle@provider, no spaces
        if not re.fullmatch(r'[\w.\-]{2,60}@[a-zA-Z]{2,30}', upi):
            return 'Enter a valid UPI ID (e.g. name@okhdfcbank).'
        return None

    # BANK_ACCOUNT / NET_BANKING
    for field, label in (('account_holder', 'Account holder name'),
                         ('bank_name',      'Bank name'),
                         ('account_number', 'Account number'),
                         ('ifsc',           'IFSC code')):
        if not (args.get(field) or '').strip():
            return f'{label} is required.'

    acct = (args.get('account_number') or '').strip()
    if not re.fullmatch(r'\d{9,18}', acct):
        return 'Account number must be 9–18 digits.'

    ifsc = (args.get('ifsc') or '').strip().upper()
    if not re.fullmatch(r'[A-Z]{4}0[A-Z0-9]{6}', ifsc):
        return 'Enter a valid IFSC code (e.g. HDFC0001234).'
    return None


def _txn_dict(t: WalletTransactions) -> dict:
    return {
        'wallet_txn_id':  t.wallet_txn_id,
        'transaction_type':t.transaction_type,
        'status':         t.status,
        'amount':         float(t.amount),
        'fee':            float(t.fee),
        'net_amount':     float(t.net_amount),
        'currency':       t.currency,
        'balance_before': float(t.balance_before) if t.balance_before else None,
        'balance_after':  float(t.balance_after)  if t.balance_after  else None,
        'description':    t.description,
        'reference_type': t.reference_type,
        'reference_id':   t.reference_id,
        'completed_at':   str(t.completed_at) if t.completed_at else None,
        'created_on':     str(t.created_on),
    }


# ── Get My Wallet ──────────────────────────────────────────────────────────────

@ns.route('/me')
class MyWallet(Resource):
    @ns.doc(description='Get current user\'s wallet balance and summary.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            wallet  = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found.'})
            return jsonify(bool=True, status=200, response=_wallet_dict(wallet))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Deposit ────────────────────────────────────────────────────────────────────

@ns.route('/deposit')
class Deposit(Resource):
    @ns.doc(description='Deposit funds into the wallet.')
    @jwt_required()
    @ns.expect(deposit_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = deposit_parser.parse_args(strict=False)
            amount  = Decimal(str(args['amount']))

            if amount <= 0:
                return jsonify(bool=False, status=400, response={'message': 'Amount must be > 0.'})

            # Money may only enter the wallet once an admin has approved KYC.
            kyc_status = _kyc_status(user_id)
            if kyc_status != KYCStatus.APPROVED:
                return jsonify(bool=False, status=403, response={
                    'message':    _KYC_DEPOSIT_BLOCK_REASON.get(
                        kyc_status, 'KYC verification is required before adding money.'),
                    'kyc_status': kyc_status,
                    'kyc_required': True,
                })

            # The cap is whatever the admin set on the Settings page — not a constant.
            max_deposit = _max_single_deposit()
            if max_deposit > 0 and amount > max_deposit:
                return jsonify(bool=False, status=400, response={
                    'message':     f'Single deposit limit is ₹{_fmt_inr(max_deposit)}. '
                                   f'You tried to add ₹{_fmt_inr(amount)}.',
                    'max_deposit': float(max_deposit),
                    'requested':   float(amount),
                })

            wallet = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found.'})
            if wallet.status != WalletStatus.ACTIVE:
                return jsonify(bool=False, status=403, response={
                    'message':       f'Your wallet is {wallet.status.lower()}. You cannot add money — please contact support.',
                    'wallet_status': wallet.status,
                })

            # ── SECURITY: verify the Razorpay payment before crediting a rupee ──
            # 1) The HMAC signature must verify against the gateway secret, proving
            #    Razorpay (not the client) produced it.
            # 2) It must correspond to an order this platform created for THIS user
            #    (a CREATED PaymentTransactions row), so a signature from an
            #    unrelated payment can't be replayed.
            # 3) The order's amount must match, and it must not already be COMPLETED
            #    (idempotency — the same payment can't be credited twice).
            rzp_order_id   = (args.get('razorpay_order_id')   or '').strip()
            rzp_payment_id = (args.get('razorpay_payment_id') or '').strip()
            rzp_signature  = (args.get('razorpay_signature')  or '').strip()

            if not verify_payment_signature(rzp_order_id, rzp_payment_id, rzp_signature):
                return jsonify(bool=False, status=400, response={
                    'message': 'Payment could not be verified. The wallet was not credited.'})

            pay_txn = PaymentTransactions.query.filter_by(
                razorpay_order_id=rzp_order_id, user_id=user_id).first()
            if not pay_txn:
                return jsonify(bool=False, status=404, response={
                    'message': 'No matching payment order for this account.'})
            if pay_txn.status == PaymentStatus.COMPLETED:
                return jsonify(bool=False, status=409, response={
                    'message': 'This payment has already been credited.'})
            if Decimal(str(pay_txn.amount)) != amount:
                return jsonify(bool=False, status=400, response={
                    'message': 'Payment amount does not match the order.'})

            pay_txn.razorpay_payment_id = rzp_payment_id
            pay_txn.razorpay_signature  = rzp_signature
            pay_txn.status              = PaymentStatus.COMPLETED
            pay_txn.completed_on        = datetime.now(timezone.utc)
            pay_txn.update()

            bal_before = Decimal(str(wallet.balance))
            wallet.balance           += amount
            wallet.available_balance += amount
            wallet.total_deposited    = Decimal(str(wallet.total_deposited)) + amount
            wallet.last_transaction_at= datetime.now(timezone.utc)
            wallet.update()

            t                   = WalletTransactions()
            t.wallet_id         = wallet.wallet_id
            t.user_id           = user_id
            t.transaction_type  = WalletTransactionType.DEPOSIT
            t.status            = WalletTransactionStatus.COMPLETED
            t.amount            = amount
            t.fee               = Decimal('0')
            t.net_amount        = amount
            t.balance_before    = bal_before
            t.balance_after     = bal_before + amount
            t.description       = 'Deposit via Razorpay'
            t.reference_type    = 'RAZORPAY_PAYMENT'
            t.reference_id      = rzp_payment_id
            t.external_reference= rzp_order_id
            t.notes             = args.get('notes', '')
            t.completed_at      = datetime.now(timezone.utc)
            t.save()

            return jsonify(bool=True, status=200, response={
                'message':       'Deposit successful.',
                'amount':        float(amount),
                'new_balance':   float(wallet.balance),
                'wallet_txn_id': t.wallet_txn_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Withdraw ───────────────────────────────────────────────────────────────────

@ns.route('/withdraw')
class Withdraw(Resource):
    @ns.doc(description='Withdraw funds from the wallet to a saved payout method. '
                        'NOTE: the payout itself is SIMULATED — no money leaves the '
                        'platform. Real transfers need RazorpayX Payouts.')
    @jwt_required()
    @ns.expect(withdraw_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = withdraw_parser.parse_args(strict=False)
            amount  = _money(Decimal(str(args['amount'])))

            if amount <= 0:
                return jsonify(bool=False, status=400, response={'message': 'Amount must be > 0.'})

            method = PayoutMethods.query.filter_by(
                payout_method_id=args['payout_method_id'], user_id=user_id, is_active=True
            ).first()
            if not method:
                return jsonify(bool=False, status=404, response={'message': 'Payout method not found.'})

            wallet = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found.'})
            if wallet.status != WalletStatus.ACTIVE:
                return jsonify(bool=False, status=403, response={'message': 'Wallet is not active.'})
            if Decimal(str(wallet.available_balance)) < amount:
                return jsonify(bool=False, status=400, response={
                    'message':   'Insufficient available balance.',
                    'available': float(wallet.available_balance),
                    'requested': float(amount),
                })

            quote = _quote_withdrawal(amount, method.method_type)
            if quote['net'] <= 0:
                return jsonify(bool=False, status=400, response={
                    'message': f'Amount is too small to cover the ₹{quote["total_fee"]} fee.',
                })

            bal_before = Decimal(str(wallet.balance))
            wallet.balance           = bal_before - amount
            wallet.available_balance = Decimal(str(wallet.available_balance)) - amount
            wallet.total_withdrawn   = Decimal(str(wallet.total_withdrawn)) + amount
            wallet.last_transaction_at = datetime.now(timezone.utc)
            wallet.update()

            t                   = WalletTransactions()
            t.wallet_id         = wallet.wallet_id
            t.user_id           = user_id
            t.transaction_type  = WalletTransactionType.WITHDRAWAL
            t.status            = WalletTransactionStatus.COMPLETED
            t.amount            = amount
            t.fee               = quote['total_fee']
            t.net_amount        = quote['net']
            t.balance_before    = bal_before
            t.balance_after     = bal_before - amount
            detail              = f' ({method.display_detail})' if method.display_detail else ''
            t.description       = f'Withdrawal to {method.display_name}{detail}'
            t.reference_type    = 'PAYOUT_METHOD'
            t.reference_id      = str(method.payout_method_id)
            # No real payout rail is wired up, so the reference is flagged as simulated
            # rather than carrying a bank/UTR number that does not exist.
            t.external_reference = f'SIM-PAYOUT-{uuid.uuid4().hex[:12].upper()}'
            t.notes             = args.get('notes', '')
            t.completed_at      = datetime.now(timezone.utc)
            t.save()

            return jsonify(bool=True, status=200, response={
                'message':       'Withdrawal successful (simulated payout).',
                'simulated':     True,
                'amount':        float(amount),
                'fee':           float(quote['total_fee']),
                'platform_fee':  float(quote['platform_fee']),
                'gateway_fee':   float(quote['gateway_fee']),
                'net_amount':    float(quote['net']),
                'new_balance':   float(wallet.balance),
                'payout_method': method.to_dict(),
                'reference':     t.external_reference,
                'wallet_txn_id': t.wallet_txn_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Withdrawal Quote ───────────────────────────────────────────────────────────

@ns.route('/withdraw/quote')
class WithdrawQuote(Resource):
    @ns.doc(description='Preview the fees for a withdrawal without performing it.')
    @jwt_required()
    @ns.expect(withdraw_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = withdraw_parser.parse_args(strict=False)
            amount  = _money(Decimal(str(args['amount'])))

            method = PayoutMethods.query.filter_by(
                payout_method_id=args['payout_method_id'], user_id=user_id, is_active=True
            ).first()
            if not method:
                return jsonify(bool=False, status=404, response={'message': 'Payout method not found.'})

            quote = _quote_withdrawal(max(amount, Decimal('0')), method.method_type)
            return jsonify(bool=True, status=200, response={
                'amount':       float(amount),
                'platform_fee': float(quote['platform_fee']),
                'gateway_fee':  float(quote['gateway_fee']),
                'total_fee':    float(quote['total_fee']),
                'net_amount':   float(quote['net']),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Payout Methods ─────────────────────────────────────────────────────────────

@ns.route('/payout_methods')
class PayoutMethodList(Resource):
    @ns.doc(description='List the current user\'s saved payout methods.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            methods = (PayoutMethods.query
                       .filter_by(user_id=user_id, is_active=True)
                       .order_by(PayoutMethods.is_primary.desc(), PayoutMethods.created_on.asc())
                       .all())
            return jsonify(bool=True, status=200, response={
                'payout_methods': [m.to_dict() for m in methods],
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Add a payout method (UPI, bank account, or net banking).')
    @jwt_required()
    @ns.expect(payout_method_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = payout_method_parser.parse_args(strict=False)

            error = _validate_payout_method(args)
            if error:
                return jsonify(bool=False, status=400, response={'message': error})

            method_type = args['method_type'].strip().upper()

            existing = PayoutMethods.query.filter_by(user_id=user_id, is_active=True).all()
            if len(existing) >= 5:
                return jsonify(bool=False, status=400, response={
                    'message': 'You can save up to 5 payout methods. Remove one first.',
                })

            m             = PayoutMethods()
            m.user_id     = user_id
            m.method_type = method_type
            m.label       = (args.get('label') or '').strip() or None

            if method_type == PayoutMethodType.UPI:
                m.upi_id = args['upi_id'].strip()
                if any(e.method_type == PayoutMethodType.UPI and e.upi_id == m.upi_id for e in existing):
                    return jsonify(bool=False, status=400, response={'message': 'That UPI ID is already saved.'})
            else:
                m.account_holder = args['account_holder'].strip()
                m.bank_name      = args['bank_name'].strip()
                m.account_number = args['account_number'].strip()
                m.ifsc           = args['ifsc'].strip().upper()
                if any(e.method_type == method_type and e.account_number == m.account_number
                       for e in existing):
                    return jsonify(bool=False, status=400, response={'message': 'That account is already saved.'})

            # First method is primary by default; an explicit request demotes the rest.
            make_primary = bool(args.get('is_primary')) or not existing
            if make_primary:
                for e in existing:
                    e.is_primary = False
            m.is_primary = make_primary
            m.save()

            return jsonify(bool=True, status=200, response={
                'message':       'Payout method added.',
                'payout_method': m.to_dict(),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/payout_methods/<int:payout_method_id>')
class PayoutMethodItem(Resource):
    @ns.doc(description='Remove a saved payout method.')
    @jwt_required()
    def delete(self, payout_method_id):
        try:
            user_id = int(get_jwt_identity())
            m = PayoutMethods.query.filter_by(
                payout_method_id=payout_method_id, user_id=user_id, is_active=True
            ).first()
            if not m:
                return jsonify(bool=False, status=404, response={'message': 'Payout method not found.'})

            # Soft delete: past withdrawals reference this row by id.
            m.is_active  = False
            m.is_primary = False
            m.update()

            # Promote the oldest remaining method so a primary always exists.
            remaining = (PayoutMethods.query
                         .filter_by(user_id=user_id, is_active=True)
                         .order_by(PayoutMethods.created_on.asc()).first())
            if remaining and not PayoutMethods.query.filter_by(
                    user_id=user_id, is_active=True, is_primary=True).first():
                remaining.is_primary = True
                remaining.update()

            return jsonify(bool=True, status=200, response={'message': 'Payout method removed.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/payout_methods/<int:payout_method_id>/primary')
class PayoutMethodPrimary(Resource):
    @ns.doc(description='Set a payout method as the default withdrawal destination.')
    @jwt_required()
    def post(self, payout_method_id):
        try:
            user_id = int(get_jwt_identity())
            target = PayoutMethods.query.filter_by(
                payout_method_id=payout_method_id, user_id=user_id, is_active=True
            ).first()
            if not target:
                return jsonify(bool=False, status=404, response={'message': 'Payout method not found.'})

            for m in PayoutMethods.query.filter_by(user_id=user_id, is_active=True).all():
                m.is_primary = (m.payout_method_id == payout_method_id)
            target.update()

            return jsonify(bool=True, status=200, response={
                'message':       'Primary payout method updated.',
                'payout_method': target.to_dict(),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Transaction History ────────────────────────────────────────────────────────

@ns.route('/transactions')
class WalletTransactionHistory(Resource):
    @ns.doc(description='Get paginated wallet transaction history for the current user.')
    @jwt_required()
    @ns.expect(txn_list_parser)
    def get(self):
        try:
            user_id  = int(get_jwt_identity())
            args     = txn_list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])
            query    = WalletTransactions.query.filter_by(user_id=user_id)

            if args.get('type'):
                query = query.filter(WalletTransactions.transaction_type == args['type'].upper())
            if args.get('from_date'):
                from datetime import datetime
                query = query.filter(WalletTransactions.created_on >= datetime.fromisoformat(args['from_date']))
            if args.get('to_date'):
                from datetime import datetime
                query = query.filter(WalletTransactions.created_on <= datetime.fromisoformat(args['to_date']))

            paginated = query.order_by(WalletTransactions.created_on.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
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


# ── Admin: Get Any User's Wallet ───────────────────────────────────────────────

@ns.route('/admin/<int:user_id>')
class AdminWallet(Resource):
    @ns.doc(description='[ADMIN] Get wallet and transaction summary for any user.')
    @jwt_required()
    def get(self, user_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            wallet = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found.'})

            recent_txns = (WalletTransactions.query
                           .filter_by(user_id=user_id)
                           .order_by(WalletTransactions.created_on.desc())
                           .limit(10).all())

            return jsonify(bool=True, status=200, response={
                **_wallet_dict(wallet),
                'recent_transactions': [_txn_dict(t) for t in recent_txns],
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: Freeze / Unfreeze Wallet ───────────────────────────────────────────

@ns.route('/admin/<int:user_id>/freeze')
class FreezeWallet(Resource):
    @ns.doc(description='[ADMIN] Freeze a user\'s wallet.')
    @jwt_required()
    def post(self, user_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            wallet = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found.'})

            wallet.status = WalletStatus.FROZEN
            wallet.update()
            return jsonify(bool=True, status=200, response={'message': f'Wallet for user {user_id} frozen.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin/<int:user_id>/unfreeze')
class UnfreezeWallet(Resource):
    @ns.doc(description='[ADMIN] Unfreeze a user\'s wallet.')
    @jwt_required()
    def post(self, user_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            wallet = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found.'})

            wallet.status = WalletStatus.ACTIVE
            wallet.update()
            return jsonify(bool=True, status=200, response={'message': f'Wallet for user {user_id} unfrozen.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
