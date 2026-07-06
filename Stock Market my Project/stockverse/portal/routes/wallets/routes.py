import logging
import traceback
from datetime import datetime, timezone
from decimal import Decimal

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from portal.models.wallets             import Wallets, WalletStatus
from portal.models.wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus

from . import ns, logger

deposit_parser = reqparse.RequestParser()
deposit_parser.add_argument('amount',         type=float, required=True,  location='json')
deposit_parser.add_argument('payment_method', type=str,   required=False, location='json', default='BANK_TRANSFER')
deposit_parser.add_argument('notes',          type=str,   required=False, location='json')

withdraw_parser = reqparse.RequestParser()
withdraw_parser.add_argument('amount',      type=float, required=True,  location='json')
withdraw_parser.add_argument('bank_account',type=str,   required=False, location='json')
withdraw_parser.add_argument('notes',       type=str,   required=False, location='json')

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
        'total_deposited':  float(w.total_deposited),
        'total_withdrawn':  float(w.total_withdrawn),
        'total_invested':   float(w.total_invested),
        'last_transaction_at': str(w.last_transaction_at) if w.last_transaction_at else None,
        'updated_on':       str(w.updated_on),
    }


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
            if amount > Decimal('100000'):
                return jsonify(bool=False, status=400, response={'message': 'Single deposit limit is $100,000.'})

            wallet = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found.'})
            if wallet.status != WalletStatus.ACTIVE:
                return jsonify(bool=False, status=403, response={'message': 'Wallet is not active.'})

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
            t.description       = f'Deposit via {args.get("payment_method", "BANK_TRANSFER")}'
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
    @ns.doc(description='Withdraw funds from the wallet.')
    @jwt_required()
    @ns.expect(withdraw_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = withdraw_parser.parse_args(strict=False)
            amount  = Decimal(str(args['amount']))
            fee     = amount * Decimal('0.001')   # 0.1% withdrawal fee
            net     = amount - fee

            if amount <= 0:
                return jsonify(bool=False, status=400, response={'message': 'Amount must be > 0.'})

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

            bal_before = Decimal(str(wallet.balance))
            wallet.balance           -= amount
            wallet.available_balance -= amount
            wallet.total_withdrawn    = Decimal(str(wallet.total_withdrawn)) + net
            wallet.last_transaction_at= datetime.now(timezone.utc)
            wallet.update()

            t                   = WalletTransactions()
            t.wallet_id         = wallet.wallet_id
            t.user_id           = user_id
            t.transaction_type  = WalletTransactionType.WITHDRAWAL
            t.status            = WalletTransactionStatus.COMPLETED
            t.amount            = amount
            t.fee               = fee
            t.net_amount        = net
            t.balance_before    = bal_before
            t.balance_after     = bal_before - amount
            t.description       = 'Withdrawal to bank account'
            t.notes             = args.get('notes', '')
            t.completed_at      = datetime.now(timezone.utc)
            t.save()

            return jsonify(bool=True, status=200, response={
                'message':       'Withdrawal initiated.',
                'amount':        float(amount),
                'fee':           float(fee),
                'net_amount':    float(net),
                'new_balance':   float(wallet.balance),
                'wallet_txn_id': t.wallet_txn_id,
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
