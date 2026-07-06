from datetime import datetime
from portal import db


class PriceAlertCondition:
    ABOVE = "ABOVE"
    BELOW = "BELOW"
    PERCENT_UP = "PERCENT_UP"
    PERCENT_DOWN = "PERCENT_DOWN"
    CROSSES = "CROSSES"         # Price crosses a specific level either way

    CHOICES = [ABOVE, BELOW, PERCENT_UP, PERCENT_DOWN, CROSSES]


class PriceAlertStatus:
    ACTIVE = "ACTIVE"
    TRIGGERED = "TRIGGERED"
    PAUSED = "PAUSED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"

    CHOICES = [ACTIVE, TRIGGERED, PAUSED, CANCELLED, EXPIRED]


class PriceAlerts(db.Model):
    __tablename__ = 'price_alerts'

    price_alert_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)

    condition = db.Column(db.String(20), nullable=False)
    target_value = db.Column(db.Numeric(15, 4), nullable=False)   # Price level or percent threshold

    status = db.Column(db.String(20), default=PriceAlertStatus.ACTIVE)

    # Notification channels
    notify_push = db.Column(db.Boolean, default=True)
    notify_email = db.Column(db.Boolean, default=True)
    notify_sms = db.Column(db.Boolean, default=False)

    # Optional note
    note = db.Column(db.String(500), nullable=True)

    repeat = db.Column(db.Boolean, default=False)            # Re-arm after triggering
    max_triggers = db.Column(db.Integer, nullable=True)      # NULL = unlimited
    trigger_count = db.Column(db.Integer, default=0)

    first_triggered_at = db.Column(db.DateTime, nullable=True)
    last_triggered_at = db.Column(db.DateTime, nullable=True)
    last_triggered_price = db.Column(db.Numeric(15, 4), nullable=True)

    expires_at = db.Column(db.DateTime, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='price_alerts')
    stock = db.relationship('Stocks', back_populates='price_alerts')

    def __repr__(self):
        return f"<PriceAlert price_alert_id={self.price_alert_id} stock_id={self.stock_id} condition={self.condition}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
