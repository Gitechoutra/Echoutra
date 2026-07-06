from datetime import datetime
from portal import db


class WalletTransactionType:
    DEPOSIT      = "DEPOSIT"
    WITHDRAWAL   = "WITHDRAWAL"
    BUY_STOCK    = "BUY_STOCK"
    SELL_STOCK   = "SELL_STOCK"
    DIVIDEND     = "DIVIDEND"
    FEE          = "FEE"
    REFUND       = "REFUND"
    TRANSFER_IN  = "TRANSFER_IN"
    TRANSFER_OUT = "TRANSFER_OUT"

    CHOICES = [DEPOSIT, WITHDRAWAL, BUY_STOCK, SELL_STOCK, DIVIDEND,
               FEE, REFUND, TRANSFER_IN, TRANSFER_OUT]


class WalletTransactionStatus:
    PENDING   = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED    = "FAILED"
    REVERSED  = "REVERSED"

    CHOICES = [PENDING, COMPLETED, FAILED, REVERSED]


class WalletTransactions(db.Model):
    __tablename__ = 'wallet_transactions'

    wallet_txn_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    wallet_id     = db.Column(db.Integer, db.ForeignKey('wallets.wallet_id'), nullable=False, index=True)
    user_id       = db.Column(db.Integer, db.ForeignKey('users.user_id'),    nullable=False, index=True)

    transaction_type = db.Column(db.String(30), nullable=False)
    status           = db.Column(db.String(20), default=WalletTransactionStatus.PENDING)

    amount     = db.Column(db.Numeric(15, 2), nullable=False)
    fee        = db.Column(db.Numeric(10, 2), default=0.00)
    net_amount = db.Column(db.Numeric(15, 2), nullable=False)   # amount - fee
    # FIX: Default changed from 'USD' to 'INR' — all wallet transactions are
    # processed in INR via Razorpay. The Razorpay integration uses currency='INR'.
    currency = db.Column(db.String(5), default='INR')

    # Balance snapshot after transaction
    balance_before = db.Column(db.Numeric(15, 2), nullable=True)
    balance_after  = db.Column(db.Numeric(15, 2), nullable=True)

    # Reference to linked entity (trade order, billing transaction, etc.)
    reference_type = db.Column(db.String(50),  nullable=True)
    reference_id   = db.Column(db.String(255), nullable=True)

    description = db.Column(db.String(500), nullable=True)
    notes       = db.Column(db.Text, nullable=True)

    # External payment reference (Razorpay payment_id, order_id, etc.)
    external_reference = db.Column(db.String(255), nullable=True)

    completed_at = db.Column(db.DateTime, nullable=True)
    created_on   = db.Column(db.DateTime, default=datetime.now)
    updated_on   = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    wallet = db.relationship('Wallets', back_populates='transactions')

    def __repr__(self):
        return (f"<WalletTransaction wallet_txn_id={self.wallet_txn_id} "
                f"type={self.transaction_type} amount={self.amount}>")

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


# class WalletTransactionType:
#     DEPOSIT = "DEPOSIT"
#     WITHDRAWAL = "WITHDRAWAL"
#     BUY_STOCK = "BUY_STOCK"
#     SELL_STOCK = "SELL_STOCK"
#     DIVIDEND = "DIVIDEND"
#     FEE = "FEE"
#     REFUND = "REFUND"
#     TRANSFER_IN = "TRANSFER_IN"
#     TRANSFER_OUT = "TRANSFER_OUT"

#     CHOICES = [DEPOSIT, WITHDRAWAL, BUY_STOCK, SELL_STOCK, DIVIDEND, FEE, REFUND, TRANSFER_IN, TRANSFER_OUT]


# class WalletTransactionStatus:
#     PENDING = "PENDING"
#     COMPLETED = "COMPLETED"
#     FAILED = "FAILED"
#     REVERSED = "REVERSED"

#     CHOICES = [PENDING, COMPLETED, FAILED, REVERSED]


# class WalletTransactions(db.Model):
#     __tablename__ = 'wallet_transactions'

#     wallet_txn_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
#     wallet_id = db.Column(db.Integer, db.ForeignKey('wallets.wallet_id'), nullable=False, index=True)
#     user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

#     transaction_type = db.Column(db.String(30), nullable=False)
#     status = db.Column(db.String(20), default=WalletTransactionStatus.PENDING)

#     amount = db.Column(db.Numeric(15, 2), nullable=False)
#     fee = db.Column(db.Numeric(10, 2), default=0.00)
#     net_amount = db.Column(db.Numeric(15, 2), nullable=False)  # amount - fee
#     currency = db.Column(db.String(5), default='USD')

#     # Balance snapshot after transaction
#     balance_before = db.Column(db.Numeric(15, 2), nullable=True)
#     balance_after = db.Column(db.Numeric(15, 2), nullable=True)

#     # Reference to linked entity (trade order, billing transaction, etc.)
#     reference_type = db.Column(
#         db.String(50),
#         nullable=True
#     )
    
#     reference_id = db.Column(
#         db.String(255),
#         nullable=True
#     )

#     description = db.Column(db.String(500), nullable=True)
#     notes = db.Column(db.Text, nullable=True)

#     # External payment reference
#     external_reference = db.Column(db.String(255), nullable=True)

#     completed_at = db.Column(db.DateTime, nullable=True)
#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     # Relationships
#     wallet = db.relationship('Wallets', back_populates='transactions')

#     def __repr__(self):
#         return f"<WalletTransaction wallet_txn_id={self.wallet_txn_id} type={self.transaction_type} amount={self.amount}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
