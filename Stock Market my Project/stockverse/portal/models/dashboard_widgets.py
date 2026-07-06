from datetime import datetime
from portal import db


class WidgetType:
    PORTFOLIO_SUMMARY = "PORTFOLIO_SUMMARY"
    HOLDINGS_TABLE = "HOLDINGS_TABLE"
    SECTOR_ALLOCATION = "SECTOR_ALLOCATION"
    PERFORMANCE_CHART = "PERFORMANCE_CHART"
    WATCHLIST = "WATCHLIST"
    NEWS_FEED = "NEWS_FEED"
    MARKET_MOVERS = "MARKET_MOVERS"
    RECENT_ORDERS = "RECENT_ORDERS"
    PRICE_ALERT_LIST = "PRICE_ALERT_LIST"
    PLATFORM_STATS = "PLATFORM_STATS"      # Admin only
    USER_GROWTH_CHART = "USER_GROWTH_CHART"  # Admin only
    REVENUE_CHART = "REVENUE_CHART"          # Admin only
    CUSTOM = "CUSTOM"

    CHOICES = [
        PORTFOLIO_SUMMARY, HOLDINGS_TABLE, SECTOR_ALLOCATION, PERFORMANCE_CHART,
        WATCHLIST, NEWS_FEED, MARKET_MOVERS, RECENT_ORDERS, PRICE_ALERT_LIST,
        PLATFORM_STATS, USER_GROWTH_CHART, REVENUE_CHART, CUSTOM
    ]


class WidgetRole:
    ADMIN = "ADMIN"
    USER = "USER"
    BOTH = "BOTH"

    CHOICES = [ADMIN, USER, BOTH]


class DashboardWidgets(db.Model):
    """
    Master catalogue of available widgets that can be placed on dashboards.
    Both admin and user dashboard widgets are defined here.
    """
    __tablename__ = 'dashboard_widgets'

    widget_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    widget_type = db.Column(db.String(50), unique=True, nullable=False)
    widget_name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(500), nullable=True)
    icon = db.Column(db.String(100), nullable=True)

    available_for_role = db.Column(db.String(10), default=WidgetRole.USER)  # ADMIN, USER, BOTH

    # Default sizing in grid units
    default_width = db.Column(db.Integer, default=4)     # Out of 12 column grid
    default_height = db.Column(db.Integer, default=2)    # In rows
    min_width = db.Column(db.Integer, default=2)
    min_height = db.Column(db.Integer, default=1)
    max_width = db.Column(db.Integer, default=12)

    is_resizable = db.Column(db.Boolean, default=True)
    is_removable = db.Column(db.Boolean, default=True)
    is_active = db.Column(db.Boolean, default=True)

    # Required subscription tier to use this widget
    required_plan = db.Column(db.String(20), nullable=True)   # NULL = available on all plans

    # Widget config schema (JSON Schema for frontend validation)
    config_schema = db.Column(db.JSON, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user_layouts = db.relationship('UserDashboardLayouts', back_populates='widget', lazy='dynamic')

    def __repr__(self):
        return f"<DashboardWidget {self.widget_type}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
