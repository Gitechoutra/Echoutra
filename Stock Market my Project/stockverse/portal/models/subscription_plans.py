from datetime import datetime
from portal import db


class PlanTier:
    FREE       = "FREE"
    BASIC      = "BASIC"
    PRO        = "PRO"
    PREMIUM    = "PREMIUM"
    ENTERPRISE = "ENTERPRISE"

    CHOICES = [FREE, BASIC, PRO, PREMIUM, ENTERPRISE]


class BillingCycle:
    MONTHLY   = "MONTHLY"
    QUARTERLY = "QUARTERLY"
    ANNUALLY  = "ANNUALLY"

    CHOICES = [MONTHLY, QUARTERLY, ANNUALLY]


class SubscriptionPlans(db.Model):
    __tablename__ = 'subscription_plans'

    plan_id   = db.Column(db.Integer, primary_key=True, autoincrement=True)
    plan_name = db.Column(db.String(100), nullable=False)
    plan_tier = db.Column(db.String(20),  nullable=False)   # FREE, BASIC, PRO, PREMIUM, ENTERPRISE
    description = db.Column(db.Text, nullable=True)
    tagline     = db.Column(db.String(200), nullable=True)

    # Pricing
    price_monthly   = db.Column(db.Numeric(10, 2), default=0.00)
    price_quarterly = db.Column(db.Numeric(10, 2), default=0.00)
    price_annually  = db.Column(db.Numeric(10, 2), default=0.00)
    # FIX: Default changed from 'USD' to 'INR' — subscription pricing is in Indian Rupees
    # (e.g. ₹1,599/mo for Pro, ₹3,999/mo for Elite as shown in the SignUpPage).
    currency = db.Column(db.String(5), default='INR')

    # Features / Limits
    max_watchlist_items = db.Column(db.Integer, nullable=True)   # NULL = unlimited
    max_portfolios      = db.Column(db.Integer, nullable=True)
    max_price_alerts    = db.Column(db.Integer, nullable=True)
    real_time_data      = db.Column(db.Boolean, default=False)
    advanced_charts     = db.Column(db.Boolean, default=False)
    analyst_ratings     = db.Column(db.Boolean, default=False)
    news_access         = db.Column(db.Boolean, default=True)
    api_access          = db.Column(db.Boolean, default=False)
    priority_support    = db.Column(db.Boolean, default=False)

    # Feature flags (JSON list of enabled feature keys)
    features = db.Column(db.JSON, nullable=True)

    is_active  = db.Column(db.Boolean, default=True)
    is_popular = db.Column(db.Boolean, default=False)   # Highlight "Most Popular" badge

    sort_order = db.Column(db.Integer, default=0)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    subscriptions = db.relationship('UserSubscriptions', back_populates='plan', lazy='dynamic')

    def __repr__(self):
        return f"<SubscriptionPlan {self.plan_name}>"

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


# class PlanTier:
#     FREE = "FREE"
#     BASIC = "BASIC"
#     PRO = "PRO"
#     PREMIUM = "PREMIUM"
#     ENTERPRISE = "ENTERPRISE"

#     CHOICES = [FREE, BASIC, PRO, PREMIUM, ENTERPRISE]


# class BillingCycle:
#     MONTHLY = "MONTHLY"
#     QUARTERLY = "QUARTERLY"
#     ANNUALLY = "ANNUALLY"

#     CHOICES = [MONTHLY, QUARTERLY, ANNUALLY]


# class SubscriptionPlans(db.Model):
#     __tablename__ = 'subscription_plans'

#     plan_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

#     plan_name = db.Column(db.String(100), nullable=False)
#     plan_tier = db.Column(db.String(20), nullable=False)       # FREE, BASIC, PRO, PREMIUM, ENTERPRISE
#     description = db.Column(db.Text, nullable=True)
#     tagline = db.Column(db.String(200), nullable=True)

#     # Pricing
#     price_monthly = db.Column(db.Numeric(10, 2), default=0.00)
#     price_quarterly = db.Column(db.Numeric(10, 2), default=0.00)
#     price_annually = db.Column(db.Numeric(10, 2), default=0.00)
#     currency = db.Column(db.String(5), default='USD')

#     # Features / Limits
#     max_watchlist_items = db.Column(db.Integer, nullable=True)      # NULL = unlimited
#     max_portfolios = db.Column(db.Integer, nullable=True)
#     max_price_alerts = db.Column(db.Integer, nullable=True)
#     real_time_data = db.Column(db.Boolean, default=False)
#     advanced_charts = db.Column(db.Boolean, default=False)
#     analyst_ratings = db.Column(db.Boolean, default=False)
#     news_access = db.Column(db.Boolean, default=True)
#     api_access = db.Column(db.Boolean, default=False)
#     priority_support = db.Column(db.Boolean, default=False)

#     # Feature flags (JSON list of enabled feature keys)
#     features = db.Column(db.JSON, nullable=True)

#     is_active = db.Column(db.Boolean, default=True)
#     is_popular = db.Column(db.Boolean, default=False)   # Highlight "Most Popular" badge

#     sort_order = db.Column(db.Integer, default=0)

#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     # Relationships
#     subscriptions = db.relationship('UserSubscriptions', back_populates='plan', lazy='dynamic')

#     def __repr__(self):
#         return f"<SubscriptionPlan {self.plan_name}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
