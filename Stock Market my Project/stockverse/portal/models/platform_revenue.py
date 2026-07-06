from datetime import datetime
from portal import db


class RevenueType:
    SUBSCRIPTION   = "SUBSCRIPTION"
    TRADING_FEE    = "TRADING_FEE"
    WITHDRAWAL_FEE = "WITHDRAWAL_FEE"
    PREMIUM_DATA   = "PREMIUM_DATA"
    API_ACCESS     = "API_ACCESS"
    OTHER          = "OTHER"

    CHOICES = [SUBSCRIPTION, TRADING_FEE, WITHDRAWAL_FEE, PREMIUM_DATA, API_ACCESS, OTHER]


class PlatformRevenue(db.Model):
    """
    Daily revenue breakdown by type. Powers the Admin Analytics revenue charts
    and MRR / ARR calculations on the Admin Dashboard.
    """
    __tablename__ = 'platform_revenue'

    revenue_id    = db.Column(db.Integer, primary_key=True, autoincrement=True)
    snapshot_date = db.Column(db.Date, nullable=False, index=True)
    revenue_type  = db.Column(db.String(30), nullable=False)

    gross_revenue     = db.Column(db.Numeric(15, 2), default=0.00)
    refunds           = db.Column(db.Numeric(15, 2), default=0.00)
    chargebacks       = db.Column(db.Numeric(15, 2), default=0.00)
    net_revenue       = db.Column(db.Numeric(15, 2), default=0.00)   # gross - refunds - chargebacks

    transaction_count = db.Column(db.Integer, default=0)
    # FIX: Default changed from 'USD' to 'INR' — platform revenue is earned
    # in INR via Razorpay payments (subscriptions, trading fees, withdrawal fees).
    currency = db.Column(db.String(5), default='INR')

    # Plan breakdown for SUBSCRIPTION type (JSON)
    plan_breakdown = db.Column(db.JSON, nullable=True)
    # e.g. {"FREE": 0, "BASIC": 12000.00, "PRO": 45000.00, "PREMIUM": 80000.00}

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        db.UniqueConstraint('snapshot_date', 'revenue_type', name='uq_revenue_date_type'),
    )

    def __repr__(self):
        return (f"<PlatformRevenue date={self.snapshot_date} "
                f"type={self.revenue_type} net={self.net_revenue}>")

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


# class RevenueType:
#     SUBSCRIPTION = "SUBSCRIPTION"
#     TRADING_FEE = "TRADING_FEE"
#     WITHDRAWAL_FEE = "WITHDRAWAL_FEE"
#     PREMIUM_DATA = "PREMIUM_DATA"
#     API_ACCESS = "API_ACCESS"
#     OTHER = "OTHER"

#     CHOICES = [SUBSCRIPTION, TRADING_FEE, WITHDRAWAL_FEE, PREMIUM_DATA, API_ACCESS, OTHER]


# class PlatformRevenue(db.Model):
#     """
#     Daily revenue breakdown by type. Powers the Admin Analytics revenue charts
#     and MRR / ARR calculations on the Admin Dashboard.
#     """
#     __tablename__ = 'platform_revenue'

#     revenue_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
#     snapshot_date = db.Column(db.Date, nullable=False, index=True)
#     revenue_type = db.Column(db.String(30), nullable=False)

#     gross_revenue = db.Column(db.Numeric(15, 2), default=0.00)
#     refunds = db.Column(db.Numeric(15, 2), default=0.00)
#     chargebacks = db.Column(db.Numeric(15, 2), default=0.00)
#     net_revenue = db.Column(db.Numeric(15, 2), default=0.00)   # gross - refunds - chargebacks

#     transaction_count = db.Column(db.Integer, default=0)
#     currency = db.Column(db.String(5), default='USD')

#     # Plan breakdown for SUBSCRIPTION type (JSON)
#     plan_breakdown = db.Column(db.JSON, nullable=True)
#     # e.g. {"FREE": 0, "BASIC": 1200.00, "PRO": 4500.00, "PREMIUM": 8000.00}

#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     __table_args__ = (
#         db.UniqueConstraint('snapshot_date', 'revenue_type', name='uq_revenue_date_type'),
#     )

#     def __repr__(self):
#         return f"<PlatformRevenue date={self.snapshot_date} type={self.revenue_type} net={self.net_revenue}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
