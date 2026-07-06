from datetime import datetime
from portal import db


class WalletStatus:
    ACTIVE    = "ACTIVE"
    FROZEN    = "FROZEN"
    SUSPENDED = "SUSPENDED"

    CHOICES = [ACTIVE, FROZEN, SUSPENDED]


class Wallets(db.Model):
    __tablename__ = 'wallets'

    wallet_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id   = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, unique=True)

    balance           = db.Column(db.Numeric(15, 2), default=0.00, nullable=False)
    available_balance = db.Column(db.Numeric(15, 2), default=0.00, nullable=False)  # Balance minus pending
    locked_balance    = db.Column(db.Numeric(15, 2), default=0.00, nullable=False)  # Held for pending orders

    # FIX: Default changed from 'USD' to 'INR' — the platform operates in Indian Rupees
    # via Razorpay. Users deposit/withdraw in INR; all wallet balances are in INR.
    currency = db.Column(db.String(5), default='INR', nullable=False)
    status   = db.Column(db.String(20), default=WalletStatus.ACTIVE)

    total_deposited = db.Column(db.Numeric(15, 2), default=0.00)
    total_withdrawn = db.Column(db.Numeric(15, 2), default=0.00)
    total_invested  = db.Column(db.Numeric(15, 2), default=0.00)

    last_transaction_at = db.Column(db.DateTime, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user         = db.relationship('Users',              back_populates='wallets')
    transactions = db.relationship('WalletTransactions', back_populates='wallet', lazy='dynamic')

    def __repr__(self):
        return f"<Wallet wallet_id={self.wallet_id} user_id={self.user_id} balance={self.balance}>"

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


# class WalletStatus:
#     ACTIVE = "ACTIVE"
#     FROZEN = "FROZEN"
#     SUSPENDED = "SUSPENDED"

#     CHOICES = [ACTIVE, FROZEN, SUSPENDED]


# class Wallets(db.Model):
#     __tablename__ = 'wallets'

#     wallet_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
#     user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, unique=True)

#     balance = db.Column(db.Numeric(15, 2), default=0.00, nullable=False)
#     available_balance = db.Column(db.Numeric(15, 2), default=0.00, nullable=False)  # Balance minus pending
#     locked_balance = db.Column(db.Numeric(15, 2), default=0.00, nullable=False)     # Held for pending orders

#     currency = db.Column(db.String(5), default='USD', nullable=False)
#     status = db.Column(db.String(20), default=WalletStatus.ACTIVE)

#     total_deposited = db.Column(db.Numeric(15, 2), default=0.00)
#     total_withdrawn = db.Column(db.Numeric(15, 2), default=0.00)
#     total_invested = db.Column(db.Numeric(15, 2), default=0.00)

#     last_transaction_at = db.Column(db.DateTime, nullable=True)

#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     # Relationships
#     user = db.relationship('Users', back_populates='wallets')
#     transactions = db.relationship('WalletTransactions', back_populates='wallet', lazy='dynamic')

#     def __repr__(self):
#         return f"<Wallet wallet_id={self.wallet_id} user_id={self.user_id} balance={self.balance}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
