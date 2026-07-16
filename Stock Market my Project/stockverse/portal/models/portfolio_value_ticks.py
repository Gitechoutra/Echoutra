from datetime import datetime
from portal import db


class PortfolioValueTicks(db.Model):
    """
    Intraday portfolio value samples — one row per portfolio per scheduler tick.

    `portfolio_performance_history` is uniquely keyed on (portfolio, date, interval),
    so it can only ever hold ONE point per day. That makes it correct for long-range
    history but useless for a chart on the day a user starts trading: a single point
    has no shape. The value genuinely moves all day as live prices update, and that
    movement was simply being discarded.

    These ticks record it, so the performance chart is drawn from real samples rather
    than an interpolated guess. Short-lived by design — pruned to `RETENTION_DAYS`,
    after which the daily snapshots remain the long-term record.
    """
    __tablename__ = 'portfolio_value_ticks'

    tick_id      = db.Column(db.Integer, primary_key=True, autoincrement=True)
    portfolio_id = db.Column(db.Integer, db.ForeignKey('portfolios.portfolio_id'), nullable=False, index=True)
    user_id      = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    captured_at    = db.Column(db.DateTime, nullable=False, index=True)
    total_value    = db.Column(db.Numeric(15, 2), nullable=False)
    total_invested = db.Column(db.Numeric(15, 2), nullable=False)

    created_on = db.Column(db.DateTime, default=datetime.now)

    __table_args__ = (
        db.Index('ix_portfolio_tick_lookup', 'portfolio_id', 'captured_at'),
    )

    def __repr__(self):
        return (f"<PortfolioValueTick portfolio_id={self.portfolio_id} "
                f"at={self.captured_at} value={self.total_value}>")

    def save(self):
        db.session.add(self)
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
