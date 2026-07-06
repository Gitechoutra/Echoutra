from datetime import datetime
from portal import db


class AdminActivityLogs(db.Model):
    """
    Specific log of admin-initiated actions — separate from the general audit log
    for security accountability and admin reporting screens.
    """
    __tablename__ = 'admin_activity_logs'

    activity_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    admin_user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    action_type = db.Column(db.String(100), nullable=False, index=True)
    # e.g. SUSPEND_USER, RESET_PASSWORD, UPGRADE_PLAN, MODIFY_SETTING,
    #      DELETE_USER, IMPERSONATE_USER, EXPORT_DATA, CHANGE_FEATURE_FLAG

    # Target (who/what was affected)
    target_entity_type = db.Column(db.String(50), nullable=True)  # USER, STOCK, PLAN, SETTING
    target_entity_id = db.Column(db.Integer, nullable=True)
    target_user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    description = db.Column(db.Text, nullable=True)
    reason = db.Column(db.String(500), nullable=True)       # Admin's stated reason for action
    notes = db.Column(db.Text, nullable=True)

    # State change
    before_state = db.Column(db.JSON, nullable=True)
    after_state = db.Column(db.JSON, nullable=True)

    # Request context
    ip_address = db.Column(db.String(50), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)

    status = db.Column(db.String(20), nullable=True)        # SUCCESS, FAILED
    error_message = db.Column(db.Text, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now, index=True)

    def __repr__(self):
        return f"<AdminActivityLog activity_id={self.activity_id} admin={self.admin_user_id} action={self.action_type}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
