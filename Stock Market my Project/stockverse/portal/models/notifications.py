from datetime import datetime
from portal import db


class NotificationType:
    PRICE_ALERT = "PRICE_ALERT"
    ORDER_FILLED = "ORDER_FILLED"
    ORDER_CANCELLED = "ORDER_CANCELLED"
    ORDER_REJECTED = "ORDER_REJECTED"
    DIVIDEND = "DIVIDEND"
    NEWS_ALERT = "NEWS_ALERT"
    STOCK_LISTED = "STOCK_LISTED"
    ACCOUNT = "ACCOUNT"
    SECURITY = "SECURITY"
    SUBSCRIPTION = "SUBSCRIPTION"
    SYSTEM = "SYSTEM"
    ADMIN_MESSAGE = "ADMIN_MESSAGE"

    CHOICES = [PRICE_ALERT, ORDER_FILLED, ORDER_CANCELLED, ORDER_REJECTED,
               DIVIDEND, NEWS_ALERT, STOCK_LISTED, ACCOUNT, SECURITY, SUBSCRIPTION,
               SYSTEM, ADMIN_MESSAGE]


class NotificationPriority:
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

    CHOICES = [LOW, MEDIUM, HIGH, CRITICAL]


class Notifications(db.Model):
    __tablename__ = 'notifications'

    notification_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    notification_type = db.Column(db.String(30), nullable=False)
    priority = db.Column(db.String(10), default=NotificationPriority.MEDIUM)

    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)
    icon = db.Column(db.String(100), nullable=True)
    image_url = db.Column(db.String(500), nullable=True)
    action_url = db.Column(db.String(500), nullable=True)   # Deep link / redirect URL

    # Reference to the entity that triggered this notification
    reference_type = db.Column(db.String(50), nullable=True)   # TRADE_ORDER, STOCK, NEWS, etc.
    reference_id = db.Column(db.Integer, nullable=True)

    # Delivery channels
    sent_via_push = db.Column(db.Boolean, default=False)
    sent_via_email = db.Column(db.Boolean, default=False)
    sent_via_sms = db.Column(db.Boolean, default=False)

    is_read = db.Column(db.Boolean, default=False)
    read_at = db.Column(db.DateTime, nullable=True)
    is_dismissed = db.Column(db.Boolean, default=False)
    dismissed_at = db.Column(db.DateTime, nullable=True)

    expires_at = db.Column(db.DateTime, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='notifications')

    def __repr__(self):
        return f"<Notification notification_id={self.notification_id} type={self.notification_type}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
