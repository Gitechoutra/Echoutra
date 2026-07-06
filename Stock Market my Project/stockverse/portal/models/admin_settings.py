from datetime import datetime
from portal import db


class SettingDataType:
    STRING = "STRING"
    INTEGER = "INTEGER"
    FLOAT = "FLOAT"
    BOOLEAN = "BOOLEAN"
    JSON = "JSON"
    TEXT = "TEXT"

    CHOICES = [STRING, INTEGER, FLOAT, BOOLEAN, JSON, TEXT]


class AdminSettings(db.Model):
    """
    Key-value store for platform-wide admin-controlled configuration.
    Covers platform config, feature flags, security settings, and system health thresholds.
    """
    __tablename__ = 'admin_settings'

    setting_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    setting_key = db.Column(db.String(200), unique=True, nullable=False, index=True)
    setting_value = db.Column(db.Text, nullable=True)
    default_value = db.Column(db.Text, nullable=True)
    data_type = db.Column(db.String(20), default=SettingDataType.STRING)

    category = db.Column(db.String(100), nullable=True)       # PLATFORM, SECURITY, TRADING, NOTIFICATIONS
    label = db.Column(db.String(200), nullable=True)          # Human-readable label for admin UI
    description = db.Column(db.Text, nullable=True)

    is_sensitive = db.Column(db.Boolean, default=False)       # Mask value in logs / UI
    is_editable = db.Column(db.Boolean, default=True)
    is_public = db.Column(db.Boolean, default=False)          # Expose to frontend

    # Who last changed this setting
    last_modified_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    def __repr__(self):
        return f"<AdminSetting {self.setting_key}={self.setting_value}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
