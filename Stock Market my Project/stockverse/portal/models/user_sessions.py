from datetime import datetime
from portal import db


class SessionStatus:
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"

    CHOICES = [ACTIVE, EXPIRED, REVOKED]


class UserSessions(db.Model):
    __tablename__ = 'user_sessions'

    session_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    session_token = db.Column(db.String(500), unique=True, nullable=False)
    refresh_token = db.Column(db.String(500), unique=True, nullable=True)

    status = db.Column(db.String(20), default=SessionStatus.ACTIVE)  # ACTIVE, EXPIRED, REVOKED

    # Device / Client Info
    device_type = db.Column(db.String(50), nullable=True)    # DESKTOP, MOBILE, TABLET
    device_name = db.Column(db.String(200), nullable=True)
    device_fingerprint = db.Column(db.String(255), nullable=True)
    browser = db.Column(db.String(100), nullable=True)
    browser_version = db.Column(db.String(50), nullable=True)
    os = db.Column(db.String(100), nullable=True)
    os_version = db.Column(db.String(50), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)

    # Location
    ip_address = db.Column(db.String(50), nullable=True)
    city = db.Column(db.String(100), nullable=True)
    country = db.Column(db.String(100), nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)

    # Timing
    expires_at = db.Column(db.DateTime, nullable=False)
    last_activity = db.Column(db.DateTime, default=datetime.now)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='sessions')

    def __repr__(self):
        return f"<UserSession session_id={self.session_id} user_id={self.user_id}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
