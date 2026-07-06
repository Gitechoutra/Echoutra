from datetime import datetime
from portal import db


class LoginStatus:
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    TWO_FA_REQUIRED = "TWO_FA_REQUIRED"

    CHOICES = [SUCCESS, FAILED, BLOCKED, TWO_FA_REQUIRED]


class LoginHistory(db.Model):
    __tablename__ = 'login_history'

    login_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    status = db.Column(db.String(20), nullable=False)   # SUCCESS, FAILED, BLOCKED, TWO_FA_REQUIRED
    failure_reason = db.Column(db.String(200), nullable=True)

    # Device / Location
    ip_address = db.Column(db.String(50), nullable=True)
    device_type = db.Column(db.String(50), nullable=True)
    device_name = db.Column(db.String(200), nullable=True)
    browser = db.Column(db.String(100), nullable=True)
    os = db.Column(db.String(100), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)

    city = db.Column(db.String(100), nullable=True)
    country = db.Column(db.String(100), nullable=True)
    country_code = db.Column(db.String(5), nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)

    # Auth method used
    auth_method = db.Column(db.String(30), nullable=True)  # PASSWORD, GOOGLE_OAUTH, APPLE_OAUTH, TWO_FA

    session_id = db.Column(db.Integer, db.ForeignKey('user_sessions.session_id'), nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='login_history')

    def __repr__(self):
        return f"<LoginHistory login_id={self.login_id} user_id={self.user_id} status={self.status}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
