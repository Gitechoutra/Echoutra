from datetime import datetime
from portal import db


class FlagRolloutType:
    ALL_USERS = "ALL_USERS"
    PERCENTAGE = "PERCENTAGE"
    PLAN_BASED = "PLAN_BASED"
    USER_LIST = "USER_LIST"
    DISABLED = "DISABLED"

    CHOICES = [ALL_USERS, PERCENTAGE, PLAN_BASED, USER_LIST, DISABLED]


class FeatureFlags(db.Model):
    """
    Platform-wide feature flags controllable from the Admin Settings screen.
    Used to enable / disable features for all users, specific plans, or rollout percentages.
    """
    __tablename__ = 'feature_flags'

    flag_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    flag_key = db.Column(db.String(200), unique=True, nullable=False, index=True)
    flag_name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=True)       # TRADING, UI, ANALYTICS, NOTIFICATIONS

    is_enabled = db.Column(db.Boolean, default=False)
    rollout_type = db.Column(db.String(20), default=FlagRolloutType.ALL_USERS)

    # Rollout controls
    rollout_percentage = db.Column(db.Integer, nullable=True)         # 0-100 for PERCENTAGE rollout
    enabled_for_plans = db.Column(db.JSON, nullable=True)             # ["PRO", "PREMIUM"] for PLAN_BASED
    enabled_for_user_ids = db.Column(db.JSON, nullable=True)          # List of user_ids for USER_LIST

    # Scheduling
    starts_at = db.Column(db.DateTime, nullable=True)
    ends_at = db.Column(db.DateTime, nullable=True)

    # Metadata
    owner = db.Column(db.String(200), nullable=True)                  # Team / person responsible
    jira_ticket = db.Column(db.String(50), nullable=True)

    last_modified_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    def __repr__(self):
        return f"<FeatureFlag {self.flag_key} enabled={self.is_enabled}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
