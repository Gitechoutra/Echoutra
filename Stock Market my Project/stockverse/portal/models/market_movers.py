from datetime import datetime
from portal import db


class MoverCategory:
    TOP_GAINER = "TOP_GAINER"
    TOP_LOSER = "TOP_LOSER"
    MOST_ACTIVE = "MOST_ACTIVE"
    MOST_WATCHED = "MOST_WATCHED"
    TRENDING = "TRENDING"
    NEW_HIGH_52W = "NEW_HIGH_52W"
    NEW_LOW_52W = "NEW_LOW_52W"

    CHOICES = [TOP_GAINER, TOP_LOSER, MOST_ACTIVE, MOST_WATCHED, TRENDING, NEW_HIGH_52W, NEW_LOW_52W]


class MoverTimeframe:
    INTRADAY = "INTRADAY"
    ONE_WEEK = "ONE_WEEK"
    ONE_MONTH = "ONE_MONTH"

    CHOICES = [INTRADAY, ONE_WEEK, ONE_MONTH]


class MarketMovers(db.Model):
    """
    Snapshot of top market movers by category and timeframe.
    Refreshed periodically (e.g. every 15 minutes during market hours).
    Powers the Market screen and Admin All Stocks overview.
    """
    __tablename__ = 'market_movers'

    mover_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)

    category = db.Column(db.String(20), nullable=False, index=True)
    timeframe = db.Column(db.String(20), default=MoverTimeframe.INTRADAY)

    rank = db.Column(db.Integer, nullable=False)

    price = db.Column(db.Numeric(15, 4), nullable=True)
    price_change = db.Column(db.Numeric(10, 4), nullable=True)
    price_change_percent = db.Column(db.Numeric(8, 4), nullable=True)
    volume = db.Column(db.BigInteger, nullable=True)

    snapshot_at = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)

    created_on = db.Column(db.DateTime, default=datetime.now)

    __table_args__ = (
        db.Index('ix_market_movers_category_timeframe_snapshot', 'category', 'timeframe', 'snapshot_at'),
    )

    # Relationships
    stock = db.relationship('Stocks', back_populates='market_movers')

    def __repr__(self):
        return f"<MarketMover mover_id={self.mover_id} category={self.category} rank={self.rank}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
