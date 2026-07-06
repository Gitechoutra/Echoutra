from datetime import datetime
from portal import db


class KYCStatus:
    NOT_STARTED = "NOT_STARTED"
    PENDING = "PENDING"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"

    CHOICES = [NOT_STARTED, PENDING, UNDER_REVIEW, APPROVED, REJECTED, EXPIRED]


class DocumentType:
    PASSPORT = "PASSPORT"
    NATIONAL_ID = "NATIONAL_ID"
    DRIVERS_LICENSE = "DRIVERS_LICENSE"
    UTILITY_BILL = "UTILITY_BILL"
    BANK_STATEMENT = "BANK_STATEMENT"
    TAX_DOCUMENT = "TAX_DOCUMENT"

    CHOICES = [PASSPORT, NATIONAL_ID, DRIVERS_LICENSE, UTILITY_BILL, BANK_STATEMENT, TAX_DOCUMENT]


class KYCVerifications(db.Model):
    """
    Know Your Customer verification records for users.
    Tracks document submission, review status, and admin actions.
    """
    __tablename__ = 'kyc_verifications'

    kyc_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, unique=True)

    kyc_status = db.Column(db.String(20), default=KYCStatus.NOT_STARTED, index=True)

    # Personal Information submitted
    legal_first_name = db.Column(db.String(100), nullable=True)
    legal_last_name = db.Column(db.String(100), nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    nationality = db.Column(db.String(100), nullable=True)
    country_of_residence = db.Column(db.String(100), nullable=True)
    tax_id = db.Column(db.String(50), nullable=True)        # SSN, PAN, etc. (encrypted)

    # Primary Identity Document
    id_document_type = db.Column(db.String(30), nullable=True)
    id_document_number = db.Column(db.String(100), nullable=True)
    id_document_expiry = db.Column(db.Date, nullable=True)
    id_document_front_url = db.Column(db.String(500), nullable=True)
    id_document_back_url = db.Column(db.String(500), nullable=True)

    # Selfie / Liveness check
    selfie_url = db.Column(db.String(500), nullable=True)
    liveness_check_passed = db.Column(db.Boolean, nullable=True)

    # Address proof
    address_document_type = db.Column(db.String(30), nullable=True)
    address_document_url = db.Column(db.String(500), nullable=True)

    # Review
    reviewed_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.String(500), nullable=True)
    admin_notes = db.Column(db.Text, nullable=True)

    # External KYC provider (e.g. Onfido, Jumio)
    provider = db.Column(db.String(100), nullable=True)
    provider_reference_id = db.Column(db.String(255), nullable=True)
    provider_response = db.Column(db.JSON, nullable=True)

    submitted_at = db.Column(db.DateTime, nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship(
    'Users',
    back_populates='kyc_verification',
    foreign_keys=[user_id])

    reviewer = db.relationship(
    'Users',
    foreign_keys=[reviewed_by])

    def __repr__(self):
        return f"<KYCVerification kyc_id={self.kyc_id} user_id={self.user_id} status={self.kyc_status}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
