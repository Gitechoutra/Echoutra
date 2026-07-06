from datetime import datetime
from portal import db


class UserSecuritySettings(db.Model):
    __tablename__ = 'user_security_settings'

    security_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, unique=True)

    # Two-Factor Authentication
    is_2fa_enabled = db.Column(db.Boolean, default=False)
    two_fa_method = db.Column(db.String(20), nullable=True)  # TOTP, SMS, EMAIL
    totp_secret = db.Column(db.String(255), nullable=True)  # Encrypted TOTP secret
    totp_enabled_on = db.Column(db.DateTime, nullable=True)

    # Backup codes (hashed)
    backup_codes = db.Column(db.JSON, nullable=True)  # List of hashed backup codes

    # Session security
    session_timeout_minutes = db.Column(db.Integer, default=60)
    max_sessions = db.Column(db.Integer, default=3)
    auto_logout_on_inactivity = db.Column(db.Boolean, default=True)

    # Login alerts
    login_alert_email = db.Column(db.Boolean, default=True)
    login_alert_new_device = db.Column(db.Boolean, default=True)
    login_alert_new_location = db.Column(db.Boolean, default=True)

    # Password policy
    password_expiry_days = db.Column(db.Integer, nullable=True)  # NULL = never expires
    force_password_change = db.Column(db.Boolean, default=False)
    failed_login_attempts = db.Column(db.Integer, default=0)
    lockout_until = db.Column(db.DateTime, nullable=True)

    # Trusted devices (JSON list of device fingerprints)
    trusted_devices = db.Column(db.JSON, nullable=True)

    # IP whitelist
    ip_whitelist = db.Column(db.JSON, nullable=True)  # List of allowed IPs

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='security_settings')

    def __repr__(self):
        return f"<UserSecuritySettings user_id={self.user_id}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
