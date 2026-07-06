from datetime import datetime
from portal import db


class NotificationPreferences(db.Model):
    __tablename__ = 'notification_preferences'

    pref_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, unique=True)

    # Push notifications
    push_enabled = db.Column(db.Boolean, default=True)
    push_price_alerts = db.Column(db.Boolean, default=True)
    push_order_updates = db.Column(db.Boolean, default=True)
    push_news_alerts = db.Column(db.Boolean, default=False)
    push_dividend = db.Column(db.Boolean, default=True)
    push_security = db.Column(db.Boolean, default=True)
    push_account = db.Column(db.Boolean, default=True)
    push_marketing = db.Column(db.Boolean, default=False)

    # Email notifications
    email_enabled = db.Column(db.Boolean, default=True)
    email_price_alerts = db.Column(db.Boolean, default=True)
    email_order_updates = db.Column(db.Boolean, default=True)
    email_news_digest = db.Column(db.Boolean, default=True)    # Daily/weekly digest
    email_news_digest_frequency = db.Column(db.String(20), default='DAILY')  # DAILY, WEEKLY, NEVER
    email_dividend = db.Column(db.Boolean, default=True)
    email_security = db.Column(db.Boolean, default=True)
    email_account = db.Column(db.Boolean, default=True)
    email_marketing = db.Column(db.Boolean, default=False)
    email_subscription = db.Column(db.Boolean, default=True)

    # SMS notifications
    sms_enabled = db.Column(db.Boolean, default=False)
    sms_price_alerts = db.Column(db.Boolean, default=False)
    sms_order_updates = db.Column(db.Boolean, default=False)
    sms_security = db.Column(db.Boolean, default=True)

    # Quiet hours (local time)
    quiet_hours_enabled = db.Column(db.Boolean, default=False)
    quiet_hours_start = db.Column(db.Time, nullable=True)   # e.g. 22:00
    quiet_hours_end = db.Column(db.Time, nullable=True)     # e.g. 07:00

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    def __repr__(self):
        return f"<NotificationPreferences user_id={self.user_id}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
