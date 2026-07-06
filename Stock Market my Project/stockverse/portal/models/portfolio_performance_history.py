from datetime import datetime
from portal import db


class SnapshotInterval:
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"

    CHOICES = [DAILY, WEEKLY, MONTHLY]


class PortfolioPerformanceHistory(db.Model):
    __tablename__ = 'portfolio_performance_history'

    perf_history_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    portfolio_id = db.Column(db.Integer, db.ForeignKey('portfolios.portfolio_id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    snapshot_date = db.Column(db.Date, nullable=False, index=True)
    interval = db.Column(db.String(10), default=SnapshotInterval.DAILY)

    # Portfolio value snapshot
    total_value = db.Column(db.Numeric(15, 2), nullable=False)
    total_invested = db.Column(db.Numeric(15, 2), nullable=False)
    cash_balance = db.Column(db.Numeric(15, 2), nullable=True)

    # Return metrics for this snapshot
    daily_return = db.Column(db.Numeric(15, 2), nullable=True)
    daily_return_percent = db.Column(db.Numeric(8, 4), nullable=True)
    cumulative_return = db.Column(db.Numeric(15, 2), nullable=True)
    cumulative_return_percent = db.Column(db.Numeric(8, 4), nullable=True)

    realized_pnl = db.Column(db.Numeric(15, 2), nullable=True)
    unrealized_pnl = db.Column(db.Numeric(15, 2), nullable=True)

    # Holdings count snapshot
    holdings_count = db.Column(db.Integer, nullable=True)

    # Sector allocation snapshot
    sector_allocation = db.Column(db.JSON, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)

    __table_args__ = (
        db.UniqueConstraint('portfolio_id', 'snapshot_date', 'interval', name='uq_portfolio_perf_snapshot'),
    )

    # Relationships
    portfolio = db.relationship('Portfolios', back_populates='performance_history')

    def __repr__(self):
        return f"<PortfolioPerformanceHistory portfolio_id={self.portfolio_id} date={self.snapshot_date}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
