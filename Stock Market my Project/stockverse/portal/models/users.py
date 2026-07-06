from datetime import datetime
from portal import db


class UserStatus:
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    PENDING = "PENDING"
    BANNED = "BANNED"

    CHOICES = [ACTIVE, SUSPENDED, PENDING, BANNED]


class Users(db.Model):
    __tablename__ = 'users'

    user_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.role_id'), nullable=False)

    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    username = db.Column(db.String(100), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(200), nullable=True)

    is_email_verified = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    status = db.Column(db.String(20), default=UserStatus.PENDING)  # ACTIVE, SUSPENDED, PENDING, BANNED

    last_login = db.Column(db.DateTime, nullable=True)
    last_password_change = db.Column(db.DateTime, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    role = db.relationship('Roles', back_populates='users')
    profile = db.relationship('UserProfiles', back_populates='user', uselist=False)
    preferences = db.relationship('UserPreferences', back_populates='user', uselist=False)
    security_settings = db.relationship('UserSecuritySettings', back_populates='user', uselist=False)
    sessions = db.relationship('UserSessions', back_populates='user', lazy='dynamic')
    otp_verifications = db.relationship('OTPVerifications', back_populates='user', lazy='dynamic')
    login_history = db.relationship('LoginHistory', back_populates='user', lazy='dynamic')
    subscriptions = db.relationship('UserSubscriptions', back_populates='user', lazy='dynamic')
    wallets = db.relationship('Wallets', back_populates='user', uselist=False)
    portfolios = db.relationship('Portfolios', back_populates='user', lazy='dynamic')
    watchlists = db.relationship('Watchlists', back_populates='user', lazy='dynamic')
    trade_orders = db.relationship('TradeOrders', back_populates='user', lazy='dynamic')
    notifications = db.relationship('Notifications', back_populates='user', lazy='dynamic')
    price_alerts = db.relationship('PriceAlerts', back_populates='user', lazy='dynamic')
    kyc_verification = db.relationship('KYCVerifications',back_populates='user',uselist=False,foreign_keys='KYCVerifications.user_id')
    dashboard_layouts = db.relationship('UserDashboardLayouts', back_populates='user', lazy='dynamic')
    audit_logs = db.relationship('AuditLogs', back_populates='user', lazy='dynamic')
    payment_transactions = db.relationship("PaymentTransactions",back_populates="user",lazy="dynamic")

    def __repr__(self):
        return f"<User {self.email}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
