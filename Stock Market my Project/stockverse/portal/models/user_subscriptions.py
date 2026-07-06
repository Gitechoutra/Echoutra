from datetime import datetime
from portal import db


class SubscriptionStatus:
    ACTIVE    = "ACTIVE"
    CANCELLED = "CANCELLED"
    EXPIRED   = "EXPIRED"
    PAUSED    = "PAUSED"
    TRIAL     = "TRIAL"
    PAST_DUE  = "PAST_DUE"

    CHOICES = [ACTIVE, CANCELLED, EXPIRED, PAUSED, TRIAL, PAST_DUE]


class UserSubscriptions(db.Model):
    __tablename__ = 'user_subscriptions'

    subscription_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id         = db.Column(db.Integer, db.ForeignKey('users.user_id'),              nullable=False, index=True)
    plan_id         = db.Column(db.Integer, db.ForeignKey('subscription_plans.plan_id'), nullable=False)

    status        = db.Column(db.String(20), default=SubscriptionStatus.ACTIVE)
    billing_cycle = db.Column(db.String(20), nullable=False)   # MONTHLY, QUARTERLY, ANNUALLY

    # Amount paid for this subscription period
    amount_paid      = db.Column(db.Numeric(10, 2), nullable=True)
    # FIX: Default changed from 'USD' to 'INR' — all subscription payments
    # go through Razorpay in Indian Rupees. The ₹ symbol is used throughout the UI.
    currency         = db.Column(db.String(5), default='INR')
    discount_applied = db.Column(db.Numeric(5, 2), default=0.00)   # Percentage discount
    promo_code       = db.Column(db.String(50), nullable=True)

    # Dates
    trial_start           = db.Column(db.DateTime, nullable=True)
    trial_end             = db.Column(db.DateTime, nullable=True)
    current_period_start  = db.Column(db.DateTime, nullable=False)
    current_period_end    = db.Column(db.DateTime, nullable=False)
    cancelled_at          = db.Column(db.DateTime, nullable=True)
    cancellation_reason   = db.Column(db.String(500), nullable=True)

    # Renewal
    auto_renew        = db.Column(db.Boolean, default=True)
    next_billing_date = db.Column(db.DateTime, nullable=True)

    # External payment gateway reference (Razorpay subscription ID, etc.)
    external_subscription_id = db.Column(db.String(255), nullable=True)
    payment_method_id        = db.Column(db.String(255), nullable=True)

    # Admin override fields
    upgraded_by_admin = db.Column(db.Boolean, default=False)
    admin_note        = db.Column(db.String(500), nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user                  = db.relationship('Users',             back_populates='subscriptions')
    plan                  = db.relationship('SubscriptionPlans', back_populates='subscriptions')
    billing_transactions  = db.relationship('BillingTransactions', back_populates='subscription', lazy='dynamic')

    def __repr__(self):
        return f"<UserSubscription subscription_id={self.subscription_id} user_id={self.user_id}>"

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


# class SubscriptionStatus:
#     ACTIVE = "ACTIVE"
#     CANCELLED = "CANCELLED"
#     EXPIRED = "EXPIRED"
#     PAUSED = "PAUSED"
#     TRIAL = "TRIAL"
#     PAST_DUE = "PAST_DUE"

#     CHOICES = [ACTIVE, CANCELLED, EXPIRED, PAUSED, TRIAL, PAST_DUE]


# class UserSubscriptions(db.Model):
#     __tablename__ = 'user_subscriptions'

#     subscription_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
#     user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
#     plan_id = db.Column(db.Integer, db.ForeignKey('subscription_plans.plan_id'), nullable=False)

#     status = db.Column(db.String(20), default=SubscriptionStatus.ACTIVE)
#     billing_cycle = db.Column(db.String(20), nullable=False)     # MONTHLY, QUARTERLY, ANNUALLY

#     # Amount paid for this subscription period
#     amount_paid = db.Column(db.Numeric(10, 2), nullable=True)
#     currency = db.Column(db.String(5), default='USD')
#     discount_applied = db.Column(db.Numeric(5, 2), default=0.00)  # Percentage discount
#     promo_code = db.Column(db.String(50), nullable=True)

#     # Dates
#     trial_start = db.Column(db.DateTime, nullable=True)
#     trial_end = db.Column(db.DateTime, nullable=True)
#     current_period_start = db.Column(db.DateTime, nullable=False)
#     current_period_end = db.Column(db.DateTime, nullable=False)
#     cancelled_at = db.Column(db.DateTime, nullable=True)
#     cancellation_reason = db.Column(db.String(500), nullable=True)

#     # Renewal
#     auto_renew = db.Column(db.Boolean, default=True)
#     next_billing_date = db.Column(db.DateTime, nullable=True)

#     # External payment gateway reference
#     external_subscription_id = db.Column(db.String(255), nullable=True)   # Stripe/PayPal subscription ID
#     payment_method_id = db.Column(db.String(255), nullable=True)

#     # Admin override fields
#     upgraded_by_admin = db.Column(db.Boolean, default=False)
#     admin_note = db.Column(db.String(500), nullable=True)

#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     # Relationships
#     user = db.relationship('Users', back_populates='subscriptions')
#     plan = db.relationship('SubscriptionPlans', back_populates='subscriptions')
#     billing_transactions = db.relationship('BillingTransactions', back_populates='subscription', lazy='dynamic')

#     def __repr__(self):
#         return f"<UserSubscription subscription_id={self.subscription_id} user_id={self.user_id}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
