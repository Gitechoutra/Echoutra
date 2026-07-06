from datetime import datetime
from portal import db


class CountryStatistics(db.Model):
    """
    Aggregated user and revenue metrics per country.
    Powers the "Users by Country" map on the Admin Analytics screen.
    """
    __tablename__ = 'country_statistics'

    country_stat_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    snapshot_date = db.Column(db.Date, nullable=False, index=True)

    country_name = db.Column(db.String(100), nullable=False)
    country_code = db.Column(db.String(5), nullable=False)       # ISO Alpha-2 code e.g. "US", "IN"

    # User metrics
    total_users = db.Column(db.Integer, default=0)
    active_users = db.Column(db.Integer, default=0)
    new_users = db.Column(db.Integer, default=0)

    # Plan distribution
    free_users = db.Column(db.Integer, default=0)
    paid_users = db.Column(db.Integer, default=0)

    # Financial metrics
    total_aum = db.Column(db.Numeric(20, 2), default=0.00)
    total_revenue = db.Column(db.Numeric(15, 2), default=0.00)

    # Trading activity
    total_trades = db.Column(db.Integer, default=0)
    total_trade_volume = db.Column(db.Numeric(20, 2), default=0.00)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        db.UniqueConstraint('snapshot_date', 'country_code', name='uq_country_stat_date'),
    )

    def __repr__(self):
        return f"<CountryStatistics {self.country_code} date={self.snapshot_date} users={self.total_users}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
