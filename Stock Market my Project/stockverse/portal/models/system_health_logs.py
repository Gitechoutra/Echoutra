from datetime import datetime
from portal import db


class HealthStatus:
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"
    UNKNOWN = "UNKNOWN"

    CHOICES = [HEALTHY, DEGRADED, DOWN, UNKNOWN]


class ServiceType:
    API_SERVER = "API_SERVER"
    DATABASE = "DATABASE"
    CACHE = "CACHE"
    QUEUE = "QUEUE"
    MARKET_DATA_FEED = "MARKET_DATA_FEED"
    EMAIL_SERVICE = "EMAIL_SERVICE"
    SMS_SERVICE = "SMS_SERVICE"
    PAYMENT_GATEWAY = "PAYMENT_GATEWAY"
    STORAGE = "STORAGE"
    SEARCH = "SEARCH"

    CHOICES = [API_SERVER, DATABASE, CACHE, QUEUE, MARKET_DATA_FEED,
               EMAIL_SERVICE, SMS_SERVICE, PAYMENT_GATEWAY, STORAGE, SEARCH]


class SystemHealthLogs(db.Model):
    """
    Periodic health-check snapshots for all platform services.
    Powers the System Health section of the Admin Settings screen.
    """
    __tablename__ = 'system_health_logs'

    health_log_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    service_name = db.Column(db.String(100), nullable=False, index=True)
    service_type = db.Column(db.String(50), nullable=False)

    status = db.Column(db.String(20), nullable=False, default=HealthStatus.UNKNOWN)
    status_message = db.Column(db.String(500), nullable=True)

    # Performance metrics
    response_time_ms = db.Column(db.Integer, nullable=True)
    cpu_usage_percent = db.Column(db.Numeric(5, 2), nullable=True)
    memory_usage_percent = db.Column(db.Numeric(5, 2), nullable=True)
    disk_usage_percent = db.Column(db.Numeric(5, 2), nullable=True)
    error_rate_percent = db.Column(db.Numeric(6, 4), nullable=True)
    requests_per_minute = db.Column(db.Integer, nullable=True)

    # Uptime
    uptime_seconds = db.Column(db.BigInteger, nullable=True)
    last_downtime_at = db.Column(db.DateTime, nullable=True)
    downtime_duration_seconds = db.Column(db.Integer, nullable=True)

    # Additional metadata
    version = db.Column(db.String(50), nullable=True)
    region = db.Column(db.String(50), nullable=True)
    host = db.Column(db.String(200), nullable=True)
    extra_data = db.Column(db.JSON, nullable=True)

    checked_at = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)
    created_on = db.Column(db.DateTime, default=datetime.now)

    def __repr__(self):
        return f"<SystemHealthLog service={self.service_name} status={self.status} at={self.checked_at}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
