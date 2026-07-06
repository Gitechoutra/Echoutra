import sys
import os
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import logging
import traceback
from datetime import datetime, timezone
from decimal import Decimal

from flask import jsonify, request
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity

from portal import db
from portal.models.payment_transactions import PaymentTransactions, PaymentStatus
from portal.models.wallets import Wallets
from portal.models.wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus
from portal.models.trade_orders import TradeOrders, OrderType, OrderSide, OrderStatus, OrderDuration
from portal.models.portfolio_holdings import PortfolioHoldings
from portal.models.portfolios import Portfolios
from portal.models.stocks import Stocks
from portal.models.transactions import Transactions, TxnType, TxnStatus

# Import from helpers
from portal.helpers.razorpay_helper import (
    create_order,
    verify_payment_signature,
    fetch_payment
)

from . import ns, logger

# Parsers
create_order_parser = reqparse.RequestParser()
create_order_parser.add_argument('amount', type=float, required=True, location='json')
create_order_parser.add_argument('stock_id', type=int, required=True, location='json')
create_order_parser.add_argument('quantity', type=float, required=True, location='json')
create_order_parser.add_argument('order_data', type=dict, required=True, location='json')

verify_parser = reqparse.RequestParser()
verify_parser.add_argument('razorpay_order_id', type=str, required=True, location='json')
verify_parser.add_argument('razorpay_payment_id', type=str, required=True, location='json')
verify_parser.add_argument('razorpay_signature', type=str, required=True, location='json')
verify_parser.add_argument('order_data', type=dict, required=True, location='json')


@ns.route('/create_order')
class CreateRazorpayOrder(Resource):
    @ns.doc(description='Create a Razorpay order for a stock purchase')
    @jwt_required()
    @ns.expect(create_order_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args = create_order_parser.parse_args(strict=False)
            
            amount = args['amount']
            stock_id = args['stock_id']
            quantity = args['quantity']
            order_data = args['order_data']
            
            # Validate stock exists
            stock = Stocks.query.get(stock_id)
            if not stock:
                return jsonify(bool=False, status=404, response={'message': 'Stock not found.'})
            
            # Create Razorpay order
            result = create_order(amount, stock_id, {
                'user_id': user_id,
                'stock_id': stock_id,
                'stock_symbol': stock.ticker_symbol,
                'quantity': quantity,
                'order_type': order_data.get('order_type', 'MARKET'),
                'app': 'TradeFlow'
            })
            
            if not result['success']:
                return jsonify(bool=False, status=500, response={'message': result.get('error', 'Failed to create payment order')})
            
            # Save payment transaction record
            payment_txn = PaymentTransactions()
            payment_txn.user_id = user_id
            payment_txn.razorpay_order_id = result['order_id']
            payment_txn.amount = amount
            payment_txn.currency = result['currency']
            payment_txn.status = PaymentStatus.CREATED
            payment_txn.payment_metadata = {
                'stock_id': stock_id,
                'quantity': quantity,
                'order_data': order_data
            }
            payment_txn.save()
            
            return jsonify(bool=True, status=200, response={
                'order_id': result['order_id'],
                'amount': result['amount'],
                'amount_paise': result['amount_paise'],
                'currency': result['currency'],
                'key_id': result['key_id']
            })
            
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/verify')
class VerifyPayment(Resource):
    @ns.doc(description='Verify Razorpay payment signature and place trade order')
    @jwt_required()
    @ns.expect(verify_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args = verify_parser.parse_args(strict=False)
            
            razorpay_order_id = args['razorpay_order_id']
            razorpay_payment_id = args['razorpay_payment_id']
            razorpay_signature = args['razorpay_signature']
            order_data = args['order_data']
            
            # Verify signature
            is_valid = verify_payment_signature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
            
            if not is_valid:
                return jsonify(bool=False, status=400, response={'message': 'Invalid payment signature'})
            
            # Get payment transaction
            payment_txn = PaymentTransactions.query.filter_by(
                razorpay_order_id=razorpay_order_id,
                user_id=user_id
            ).first()
            
            if not payment_txn:
                return jsonify(bool=False, status=404, response={'message': 'Payment transaction not found'})
            
            # Fetch payment details from Razorpay
            payment_details = fetch_payment(razorpay_payment_id)
            if not payment_details.get('success'):
                return jsonify(bool=False, status=500, response={'message': 'Failed to fetch payment details'})
            
            # Update payment transaction
            payment_txn.razorpay_payment_id = razorpay_payment_id
            payment_txn.razorpay_signature = razorpay_signature
            payment_txn.status = PaymentStatus.COMPLETED
            payment_txn.completed_on = datetime.now(timezone.utc)
            payment_txn.update()
            
            # Get wallet
            wallet = Wallets.query.filter_by(user_id=user_id).first()
            if not wallet:
                return jsonify(bool=False, status=404, response={'message': 'Wallet not found'})
            
            # Add funds to wallet
            amount = float(payment_txn.amount)
            from decimal import Decimal
            wallet.balance += Decimal(str(amount))
            wallet.available_balance += Decimal(str(amount))
            wallet.update()
            
            # Create wallet transaction record
            wt = WalletTransactions()
            wt.wallet_id = wallet.wallet_id
            wt.user_id = user_id
            wt.transaction_type = WalletTransactionType.DEPOSIT
            wt.status = WalletTransactionStatus.COMPLETED
            wt.amount = Decimal(str(amount))
            wt.fee = Decimal('0')
            wt.net_amount = Decimal(str(amount))
            wt.description = f"Payment via Razorpay - Order {razorpay_order_id}"
            wt.reference_type = 'RAZORPAY_PAYMENT'
            wt.reference_id = razorpay_payment_id
            wt.completed_at = datetime.now(timezone.utc)
            wt.save()
            
            # Now place the trade order
            stock_id = payment_txn.payment_metadata.get('stock_id')
            quantity = payment_txn.payment_metadata.get('quantity')
            trade_order_data = payment_txn.payment_metadata.get('order_data', {})
            
            stock = Stocks.query.get(stock_id)
            if not stock:
                return jsonify(bool=False, status=404, response={'message': 'Stock not found'})
            
            # Resolve portfolio
            portfolio = Portfolios.query.filter_by(user_id=user_id, is_default=True, is_active=True).first()
            if not portfolio:
                portfolio = Portfolios.query.filter_by(user_id=user_id, is_active=True).first()
            
            if not portfolio:
                return jsonify(bool=False, status=400, response={'message': 'No portfolio found'})
            
            current_price = Decimal(str(stock.current_price or 0))
            quantity_dec = Decimal(str(quantity))
            execution_amount = quantity_dec * current_price
            commission = execution_amount * Decimal('0.001')
            net_amount = execution_amount + commission
            
            # Create order record
            order = TradeOrders()
            order.user_id = user_id
            order.stock_id = stock_id
            order.portfolio_id = portfolio.portfolio_id
            order.order_type = trade_order_data.get('order_type', 'MARKET')
            order.order_side = OrderSide.BUY
            order.order_status = OrderStatus.FILLED
            order.order_duration = trade_order_data.get('order_duration', 'DAY')
            order.quantity = quantity_dec
            order.filled_quantity = quantity_dec
            order.remaining_quantity = Decimal('0')
            order.avg_fill_price = current_price
            order.filled_amount = execution_amount
            order.total_fee = commission
            order.submitted_at = datetime.now(timezone.utc)
            order.filled_at = datetime.now(timezone.utc)
            order.order_source = 'WEB'
            order.save()
            
            # Update portfolio holding
            holding = PortfolioHoldings.query.filter_by(
                portfolio_id=portfolio.portfolio_id, stock_id=stock_id, is_active=True
            ).first()
            
            if holding:
                old_qty = Decimal(str(holding.quantity))
                old_cost = Decimal(str(holding.total_invested or 0))
                new_qty = old_qty + quantity_dec
                new_cost = old_cost + execution_amount
                holding.quantity = new_qty
                holding.total_invested = new_cost
                holding.average_buy_price = new_cost / new_qty if new_qty > 0 else Decimal('0')
                holding.last_traded_at = datetime.now(timezone.utc)
                holding.update()
            else:
                holding = PortfolioHoldings()
                holding.portfolio_id = portfolio.portfolio_id
                holding.stock_id = stock_id
                holding.user_id = user_id
                holding.quantity = quantity_dec
                holding.average_buy_price = current_price
                holding.total_invested = execution_amount
                holding.first_bought_at = datetime.now(timezone.utc)
                holding.last_traded_at = datetime.now(timezone.utc)
                holding.save()
            
            # Create transaction record
            txn = Transactions()
            txn.user_id = user_id
            txn.txn_type = TxnType.BUY
            txn.txn_status = TxnStatus.COMPLETED
            txn.stock_id = stock_id
            txn.order_id = order.order_id
            txn.portfolio_id = portfolio.portfolio_id
            txn.wallet_txn_id = wt.wallet_txn_id
            txn.quantity = quantity_dec
            txn.price_per_unit = current_price
            txn.gross_amount = execution_amount
            txn.fee = commission
            txn.net_amount = net_amount
            txn.transacted_at = datetime.now(timezone.utc)
            txn.save()
            
            # Update portfolio totals
            portfolio.total_invested = (portfolio.total_invested or Decimal('0')) + execution_amount
            portfolio.current_value = (portfolio.current_value or Decimal('0')) + (quantity_dec * current_price)
            portfolio.update()
            
            return jsonify(bool=True, status=200, response={
                'message': 'Payment verified and trade order placed successfully',
                'order_id': order.order_id,
                'payment_id': razorpay_payment_id
            })
            
        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})