from datetime import datetime
from portal import db


class TxnType:
    BUY        = "BUY"
    SELL       = "SELL"
    DIVIDEND   = "DIVIDEND"
    DEPOSIT    = "DEPOSIT"
    WITHDRAWAL = "WITHDRAWAL"
    FEE        = "FEE"
    ADJUSTMENT = "ADJUSTMENT"
    SPLIT      = "SPLIT"

    CHOICES = [BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, FEE, ADJUSTMENT, SPLIT]


class TxnStatus:
    COMPLETED = "COMPLETED"
    PENDING   = "PENDING"
    FAILED    = "FAILED"
    REVERSED  = "REVERSED"

    CHOICES = [COMPLETED, PENDING, FAILED, REVERSED]


class Transactions(db.Model):
    """
    Master ledger of all financial transactions for a user — trades, dividends,
    deposits, withdrawals and fees in one place.
    """
    __tablename__ = 'transactions'

    txn_id  = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    txn_type   = db.Column(db.String(20), nullable=False)
    txn_status = db.Column(db.String(20), default=TxnStatus.COMPLETED)

    # Related entities (nullable depending on type)
    stock_id      = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'),                    nullable=True)
    order_id      = db.Column(db.Integer, db.ForeignKey('trade_orders.order_id'),              nullable=True)
    portfolio_id  = db.Column(db.Integer, db.ForeignKey('portfolios.portfolio_id'),            nullable=True)
    wallet_txn_id = db.Column(db.Integer, db.ForeignKey('wallet_transactions.wallet_txn_id'),  nullable=True)

    quantity       = db.Column(db.Numeric(15, 6), nullable=True)
    price_per_unit = db.Column(db.Numeric(15, 4), nullable=True)
    gross_amount   = db.Column(db.Numeric(15, 2), nullable=False)
    fee            = db.Column(db.Numeric(10, 4), default=0.0000)
    tax            = db.Column(db.Numeric(10, 4), default=0.0000)
    net_amount     = db.Column(db.Numeric(15, 2), nullable=False)
    # FIX: Default changed from 'USD' to 'INR' — trades are settled in INR
    # on Indian exchanges (NSE/BSE). USD-based trades (NYSE/NASDAQ) override per-record.
    currency = db.Column(db.String(5), default='INR')

    description      = db.Column(db.String(500), nullable=True)
    reference_number = db.Column(db.String(100), unique=True, nullable=True)

    transacted_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    created_on    = db.Column(db.DateTime, default=datetime.now)
    updated_on    = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # ── Relationships ──────────────────────────────────────────────────────────
    stock     = db.relationship('Stocks',      foreign_keys=[stock_id],     lazy='select')
    order     = db.relationship('TradeOrders', foreign_keys=[order_id],     lazy='select')
    portfolio = db.relationship('Portfolios',  foreign_keys=[portfolio_id], lazy='select')

    def __repr__(self):
        return f"<Transaction txn_id={self.txn_id} type={self.txn_type} amount={self.net_amount}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()






















# from datetime import datetime
# from . import db


# class TxnType:
#     BUY = "BUY"
#     SELL = "SELL"
#     DIVIDEND = "DIVIDEND"
#     DEPOSIT = "DEPOSIT"
#     WITHDRAWAL = "WITHDRAWAL"
#     FEE = "FEE"
#     ADJUSTMENT = "ADJUSTMENT"
#     SPLIT = "SPLIT"

#     CHOICES = [BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, FEE, ADJUSTMENT, SPLIT]


# class TxnStatus:
#     COMPLETED = "COMPLETED"
#     PENDING = "PENDING"
#     FAILED = "FAILED"
#     REVERSED = "REVERSED"

#     CHOICES = [COMPLETED, PENDING, FAILED, REVERSED]


# class Transactions(db.Model):
#     """
#     Master ledger of all financial transactions for a user — trades, dividends,
#     deposits, withdrawals and fees in one place.
#     """
#     __tablename__ = 'transactions'

#     txn_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
#     user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

#     txn_type = db.Column(db.String(20), nullable=False)
#     txn_status = db.Column(db.String(20), default=TxnStatus.COMPLETED)

#     # Related entities (nullable depending on type)
#     stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=True)
#     order_id = db.Column(db.Integer, db.ForeignKey('trade_orders.order_id'), nullable=True)
#     portfolio_id = db.Column(db.Integer, db.ForeignKey('portfolios.portfolio_id'), nullable=True)
#     wallet_txn_id = db.Column(db.Integer, db.ForeignKey('wallet_transactions.wallet_txn_id'), nullable=True)

#     quantity = db.Column(db.Numeric(15, 6), nullable=True)
#     price_per_unit = db.Column(db.Numeric(15, 4), nullable=True)
#     gross_amount = db.Column(db.Numeric(15, 2), nullable=False)
#     fee = db.Column(db.Numeric(10, 4), default=0.0000)
#     tax = db.Column(db.Numeric(10, 4), default=0.0000)
#     net_amount = db.Column(db.Numeric(15, 2), nullable=False)
#     currency = db.Column(db.String(5), default='USD')

#     description = db.Column(db.String(500), nullable=True)
#     reference_number = db.Column(db.String(100), unique=True, nullable=True)

#     transacted_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     # ── Relationships ──────────────────────────────────────────────────────────
#     stock     = db.relationship('Stocks',       foreign_keys=[stock_id],     lazy='select')
#     order     = db.relationship('TradeOrders',  foreign_keys=[order_id],     lazy='select')
#     portfolio = db.relationship('Portfolios',   foreign_keys=[portfolio_id], lazy='select')

#     def __repr__(self):
#         return f"<Transaction txn_id={self.txn_id} type={self.txn_type} amount={self.net_amount}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
















# from datetime import datetime
# from portal import db


# class TxnType:
#     BUY = "BUY"
#     SELL = "SELL"
#     DIVIDEND = "DIVIDEND"
#     DEPOSIT = "DEPOSIT"
#     WITHDRAWAL = "WITHDRAWAL"
#     FEE = "FEE"
#     ADJUSTMENT = "ADJUSTMENT"
#     SPLIT = "SPLIT"

#     CHOICES = [BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, FEE, ADJUSTMENT, SPLIT]


# class TxnStatus:
#     COMPLETED = "COMPLETED"
#     PENDING = "PENDING"
#     FAILED = "FAILED"
#     REVERSED = "REVERSED"

#     CHOICES = [COMPLETED, PENDING, FAILED, REVERSED]


# class Transactions(db.Model):
#     """
#     Master ledger of all financial transactions for a user — trades, dividends,
#     deposits, withdrawals and fees in one place.
#     """
#     __tablename__ = 'transactions'

#     txn_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
#     user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

#     txn_type = db.Column(db.String(20), nullable=False)
#     txn_status = db.Column(db.String(20), default=TxnStatus.COMPLETED)

#     # Related entities (nullable depending on type)
#     stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=True)
#     order_id = db.Column(db.Integer, db.ForeignKey('trade_orders.order_id'), nullable=True)
#     portfolio_id = db.Column(db.Integer, db.ForeignKey('portfolios.portfolio_id'), nullable=True)
#     wallet_txn_id = db.Column(db.Integer, db.ForeignKey('wallet_transactions.wallet_txn_id'), nullable=True)

#     quantity = db.Column(db.Numeric(15, 6), nullable=True)
#     price_per_unit = db.Column(db.Numeric(15, 4), nullable=True)
#     gross_amount = db.Column(db.Numeric(15, 2), nullable=False)
#     fee = db.Column(db.Numeric(10, 4), default=0.0000)
#     tax = db.Column(db.Numeric(10, 4), default=0.0000)
#     net_amount = db.Column(db.Numeric(15, 2), nullable=False)
#     currency = db.Column(db.String(5), default='USD')

#     description = db.Column(db.String(500), nullable=True)
#     reference_number = db.Column(db.String(100), unique=True, nullable=True)

#     transacted_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     def __repr__(self):
#         return f"<Transaction txn_id={self.txn_id} type={self.txn_type} amount={self.net_amount}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
