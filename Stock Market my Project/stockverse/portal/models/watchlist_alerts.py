from datetime import datetime
from portal import db


class AlertCondition:
    PRICE_ABOVE = "PRICE_ABOVE"
    PRICE_BELOW = "PRICE_BELOW"
    PERCENT_CHANGE_UP = "PERCENT_CHANGE_UP"
    PERCENT_CHANGE_DOWN = "PERCENT_CHANGE_DOWN"
    VOLUME_SPIKE = "VOLUME_SPIKE"
    NEW_ANALYST_RATING = "NEW_ANALYST_RATING"
    NEWS_MENTION = "NEWS_MENTION"

    CHOICES = [PRICE_ABOVE, PRICE_BELOW, PERCENT_CHANGE_UP, PERCENT_CHANGE_DOWN,
               VOLUME_SPIKE, NEW_ANALYST_RATING, NEWS_MENTION]


class AlertStatus:
    ACTIVE = "ACTIVE"
    TRIGGERED = "TRIGGERED"
    EXPIRED = "EXPIRED"
    PAUSED = "PAUSED"
    CANCELLED = "CANCELLED"

    CHOICES = [ACTIVE, TRIGGERED, EXPIRED, PAUSED, CANCELLED]


class WatchlistAlerts(db.Model):
    __tablename__ = 'watchlist_alerts'

    alert_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    item_id = db.Column(db.Integer, db.ForeignKey('watchlist_items.item_id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)

    condition = db.Column(db.String(30), nullable=False)     # PRICE_ABOVE, PRICE_BELOW, etc.
    target_value = db.Column(db.Numeric(15, 4), nullable=True)   # Target price or percent change
    status = db.Column(db.String(20), default=AlertStatus.ACTIVE)

    # Notification method
    notify_email = db.Column(db.Boolean, default=True)
    notify_push = db.Column(db.Boolean, default=True)
    notify_sms = db.Column(db.Boolean, default=False)

    triggered_at = db.Column(db.DateTime, nullable=True)
    triggered_value = db.Column(db.Numeric(15, 4), nullable=True)  # Actual price when triggered
    repeat_alert = db.Column(db.Boolean, default=False)   # Re-trigger on each occurrence
    expires_at = db.Column(db.DateTime, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    watchlist_item = db.relationship('WatchlistItems', back_populates='alerts')

    def __repr__(self):
        return f"<WatchlistAlert alert_id={self.alert_id} condition={self.condition}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
