from datetime import datetime
from portal import db


class PlatformStatistics(db.Model):
    """
    Daily aggregated platform-wide metrics snapshot used for the
    Admin Dashboard and Admin Analytics screens.
    """
    __tablename__ = 'platform_statistics'

    stat_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    snapshot_date = db.Column(db.Date, nullable=False, unique=True, index=True)

    # User metrics
    total_registered_users = db.Column(db.Integer, default=0)
    active_users_today = db.Column(db.Integer, default=0)
    active_users_7d = db.Column(db.Integer, default=0)
    active_users_30d = db.Column(db.Integer, default=0)
    new_users_today = db.Column(db.Integer, default=0)
    new_users_7d = db.Column(db.Integer, default=0)
    new_users_30d = db.Column(db.Integer, default=0)
    suspended_users = db.Column(db.Integer, default=0)

    # Subscription breakdown
    free_plan_users = db.Column(db.Integer, default=0)
    basic_plan_users = db.Column(db.Integer, default=0)
    pro_plan_users = db.Column(db.Integer, default=0)
    premium_plan_users = db.Column(db.Integer, default=0)
    enterprise_plan_users = db.Column(db.Integer, default=0)

    # Financial / AUM metrics
    total_aum = db.Column(db.Numeric(20, 2), default=0.00)        # Assets Under Management
    total_revenue_today = db.Column(db.Numeric(15, 2), default=0.00)
    total_revenue_7d = db.Column(db.Numeric(15, 2), default=0.00)
    total_revenue_30d = db.Column(db.Numeric(15, 2), default=0.00)
    total_revenue_all_time = db.Column(db.Numeric(20, 2), default=0.00)
    mrr = db.Column(db.Numeric(15, 2), default=0.00)              # Monthly Recurring Revenue
    arr = db.Column(db.Numeric(15, 2), default=0.00)              # Annual Recurring Revenue

    # Trading metrics
    total_trades_today = db.Column(db.Integer, default=0)
    total_trades_7d = db.Column(db.Integer, default=0)
    total_trade_volume_today = db.Column(db.Numeric(20, 2), default=0.00)
    total_trade_volume_7d = db.Column(db.Numeric(20, 2), default=0.00)

    # Portfolio / Holdings
    total_portfolios = db.Column(db.Integer, default=0)
    total_holdings = db.Column(db.Integer, default=0)
    total_unique_stocks = db.Column(db.Integer, default=0)

    # Watchlist
    total_watchlist_items = db.Column(db.Integer, default=0)
    total_price_alerts = db.Column(db.Integer, default=0)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    def __repr__(self):
        return f"<PlatformStatistics date={self.snapshot_date} aum={self.total_aum}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
