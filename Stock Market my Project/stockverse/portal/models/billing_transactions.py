from datetime import datetime
from portal import db


class TransactionStatus:
    PENDING    = "PENDING"
    SUCCESS    = "SUCCESS"
    FAILED     = "FAILED"
    REFUNDED   = "REFUNDED"
    CHARGEBACK = "CHARGEBACK"

    CHOICES = [PENDING, SUCCESS, FAILED, REFUNDED, CHARGEBACK]


class BillingTransactions(db.Model):
    __tablename__ = 'billing_transactions'

    transaction_id  = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id         = db.Column(db.Integer, db.ForeignKey('users.user_id'),                         nullable=False, index=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey('user_subscriptions.subscription_id'),    nullable=True)

    transaction_type = db.Column(db.String(30), nullable=False)   # SUBSCRIPTION, UPGRADE, REFUND, ADDON
    status           = db.Column(db.String(20), default=TransactionStatus.PENDING)

    amount          = db.Column(db.Numeric(10, 2), nullable=False)
    tax_amount      = db.Column(db.Numeric(10, 2), default=0.00)
    discount_amount = db.Column(db.Numeric(10, 2), default=0.00)
    total_amount    = db.Column(db.Numeric(10, 2), nullable=False)
    # FIX: Default changed from 'USD' to 'INR' — billing goes through
    # Razorpay which processes in INR for Indian users.
    currency = db.Column(db.String(5), default='INR')

    # Payment details
    payment_method         = db.Column(db.String(50),  nullable=True)   # CARD, UPI, NET_BANKING, WALLET
    payment_gateway        = db.Column(db.String(50),  nullable=True)   # RAZORPAY (primary gateway)
    gateway_transaction_id = db.Column(db.String(255), nullable=True, unique=True)
    gateway_response       = db.Column(db.JSON,        nullable=True)

    # Card info (masked)
    card_last4 = db.Column(db.String(4),  nullable=True)
    card_brand = db.Column(db.String(20), nullable=True)    # VISA, MASTERCARD, RUPAY

    # Invoice
    invoice_number = db.Column(db.String(50),  unique=True, nullable=True)
    invoice_url    = db.Column(db.String(500), nullable=True)

    description     = db.Column(db.String(500), nullable=True)
    failure_reason  = db.Column(db.String(500), nullable=True)

    refunded_at    = db.Column(db.DateTime, nullable=True)
    refund_reason  = db.Column(db.String(500), nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    subscription = db.relationship('UserSubscriptions', back_populates='billing_transactions')

    def __repr__(self):
        return f"<BillingTransaction transaction_id={self.transaction_id} amount={self.total_amount}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()





















# from datetime import datetime
# from portal import db


# class TransactionStatus:
#     PENDING = "PENDING"
#     SUCCESS = "SUCCESS"
#     FAILED = "FAILED"
#     REFUNDED = "REFUNDED"
#     CHARGEBACK = "CHARGEBACK"

#     CHOICES = [PENDING, SUCCESS, FAILED, REFUNDED, CHARGEBACK]


# class BillingTransactions(db.Model):
#     __tablename__ = 'billing_transactions'

#     transaction_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
#     user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
#     subscription_id = db.Column(db.Integer, db.ForeignKey('user_subscriptions.subscription_id'), nullable=True)

#     transaction_type = db.Column(db.String(30), nullable=False)  # SUBSCRIPTION, UPGRADE, REFUND, ADDON
#     status = db.Column(db.String(20), default=TransactionStatus.PENDING)

#     amount = db.Column(db.Numeric(10, 2), nullable=False)
#     tax_amount = db.Column(db.Numeric(10, 2), default=0.00)
#     discount_amount = db.Column(db.Numeric(10, 2), default=0.00)
#     total_amount = db.Column(db.Numeric(10, 2), nullable=False)
#     currency = db.Column(db.String(5), default='USD')

#     # Payment details
#     payment_method = db.Column(db.String(50), nullable=True)    # CARD, PAYPAL, BANK_TRANSFER, WALLET
#     payment_gateway = db.Column(db.String(50), nullable=True)   # STRIPE, PAYPAL, RAZORPAY
#     gateway_transaction_id = db.Column(db.String(255), nullable=True, unique=True)
#     gateway_response = db.Column(db.JSON, nullable=True)

#     # Card info (masked)
#     card_last4 = db.Column(db.String(4), nullable=True)
#     card_brand = db.Column(db.String(20), nullable=True)        # VISA, MASTERCARD, AMEX

#     # Invoice
#     invoice_number = db.Column(db.String(50), unique=True, nullable=True)
#     invoice_url = db.Column(db.String(500), nullable=True)

#     description = db.Column(db.String(500), nullable=True)
#     failure_reason = db.Column(db.String(500), nullable=True)

#     refunded_at = db.Column(db.DateTime, nullable=True)
#     refund_reason = db.Column(db.String(500), nullable=True)

#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     # Relationships
#     subscription = db.relationship('UserSubscriptions', back_populates='billing_transactions')

#     def __repr__(self):
#         return f"<BillingTransaction transaction_id={self.transaction_id} amount={self.total_amount}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
