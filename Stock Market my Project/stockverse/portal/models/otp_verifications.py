from datetime import datetime
from portal import db


class OTPPurpose:
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PHONE_VERIFICATION = "PHONE_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"
    TWO_FA = "TWO_FA"
    TRADE_CONFIRMATION = "TRADE_CONFIRMATION"
    WITHDRAWAL = "WITHDRAWAL"

    CHOICES = [
        EMAIL_VERIFICATION, PHONE_VERIFICATION, PASSWORD_RESET,
        TWO_FA, TRADE_CONFIRMATION, WITHDRAWAL
    ]


class OTPStatus:
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    EXPIRED = "EXPIRED"
    FAILED = "FAILED"

    CHOICES = [PENDING, VERIFIED, EXPIRED, FAILED]


class OTPVerifications(db.Model):
    __tablename__ = 'otp_verifications'

    otp_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    otp_code = db.Column(db.String(255), nullable=False)   # Hashed OTP
    purpose = db.Column(db.String(30), nullable=False)    # EMAIL_VERIFICATION, PHONE_VERIFICATION, etc.
    delivery_method = db.Column(db.String(20), nullable=False)  # EMAIL, SMS, AUTHENTICATOR_APP
    delivery_target = db.Column(db.String(255), nullable=True)  # Email address or phone number

    status = db.Column(db.String(20), default=OTPStatus.PENDING)

    attempts = db.Column(db.Integer, default=0)
    max_attempts = db.Column(db.Integer, default=5)

    expires_at = db.Column(db.DateTime, nullable=False)
    verified_at = db.Column(db.DateTime, nullable=True)

    ip_address = db.Column(db.String(50), nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='otp_verifications')

    def __repr__(self):
        return f"<OTPVerification otp_id={self.otp_id} purpose={self.purpose}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
