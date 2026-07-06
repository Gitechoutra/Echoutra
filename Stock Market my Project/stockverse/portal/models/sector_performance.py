from datetime import datetime
from portal import db


class SectorPerformance(db.Model):
    """
    Daily snapshot of sector-level performance metrics.
    Powers sector allocation charts in the Admin Analytics and User Portfolio screens.
    """
    __tablename__ = 'sector_performance'

    sector_perf_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    sector_name = db.Column(db.String(100), nullable=False, index=True)
    snapshot_date = db.Column(db.Date, nullable=False, index=True)

    # Aggregate price performance for the sector
    open_index = db.Column(db.Numeric(12, 4), nullable=True)
    close_index = db.Column(db.Numeric(12, 4), nullable=True)
    day_change = db.Column(db.Numeric(8, 4), nullable=True)
    day_change_percent = db.Column(db.Numeric(8, 4), nullable=True)

    week_change_percent = db.Column(db.Numeric(8, 4), nullable=True)
    month_change_percent = db.Column(db.Numeric(8, 4), nullable=True)
    ytd_change_percent = db.Column(db.Numeric(8, 4), nullable=True)

    # Platform-specific sector stats
    platform_aum_in_sector = db.Column(db.Numeric(20, 2), nullable=True)
    platform_aum_percent = db.Column(db.Numeric(8, 4), nullable=True)
    total_stocks_in_sector = db.Column(db.Integer, nullable=True)
    total_users_in_sector = db.Column(db.Integer, nullable=True)

    # Sentiment
    sentiment = db.Column(db.String(20), nullable=True)    # BULLISH, BEARISH, NEUTRAL
    sentiment_score = db.Column(db.Numeric(5, 4), nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)

    __table_args__ = (
        db.UniqueConstraint('sector_name', 'snapshot_date', name='uq_sector_date'),
    )

    def __repr__(self):
        return f"<SectorPerformance {self.sector_name} date={self.snapshot_date}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
