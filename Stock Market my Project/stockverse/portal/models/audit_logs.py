from datetime import datetime
from portal import db


class AuditLogs(db.Model):
    """
    Immutable audit trail of every user and admin action on the platform.
    Records who did what, when, and from where.
    """
    __tablename__ = 'audit_logs'

    log_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True, index=True)

    # Action details
    action = db.Column(db.String(100), nullable=False, index=True)  # e.g. USER_LOGIN, PLACE_ORDER, PROFILE_UPDATE
    action_category = db.Column(db.String(50), nullable=True)        # AUTH, TRADE, PROFILE, ADMIN, BILLING
    description = db.Column(db.Text, nullable=True)

    # Target entity (what was acted upon)
    entity_type = db.Column(db.String(50), nullable=True)    # USER, STOCK, ORDER, PORTFOLIO, etc.
    entity_id = db.Column(db.Integer, nullable=True)

    # Before / after state for change tracking
    old_value = db.Column(db.JSON, nullable=True)
    new_value = db.Column(db.JSON, nullable=True)

    # Request context
    ip_address = db.Column(db.String(50), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)
    request_method = db.Column(db.String(10), nullable=True)   # GET, POST, PUT, DELETE
    request_path = db.Column(db.String(500), nullable=True)

    # Status
    status = db.Column(db.String(20), nullable=True)           # SUCCESS, FAILED, PARTIAL
    error_message = db.Column(db.Text, nullable=True)

    # Duration
    duration_ms = db.Column(db.Integer, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now, index=True)

    # Relationships
    user = db.relationship('Users', back_populates='audit_logs')

    def __repr__(self):
        return f"<AuditLog log_id={self.log_id} action={self.action} user_id={self.user_id}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
