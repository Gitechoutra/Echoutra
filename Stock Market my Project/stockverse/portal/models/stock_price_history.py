from datetime import datetime
from portal import db


class PriceInterval:
    ONE_MINUTE = "1m"
    FIVE_MINUTES = "5m"
    FIFTEEN_MINUTES = "15m"
    THIRTY_MINUTES = "30m"
    ONE_HOUR = "1h"
    FOUR_HOURS = "4h"
    ONE_DAY = "1d"
    ONE_WEEK = "1w"
    ONE_MONTH = "1mo"

    CHOICES = [ONE_MINUTE, FIVE_MINUTES, FIFTEEN_MINUTES, THIRTY_MINUTES,
               ONE_HOUR, FOUR_HOURS, ONE_DAY, ONE_WEEK, ONE_MONTH]


class StockPriceHistory(db.Model):
    __tablename__ = 'stock_price_history'

    price_history_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)

    interval = db.Column(db.String(5), nullable=False)         # 1m, 5m, 1h, 1d, 1w, 1mo
    timestamp = db.Column(db.DateTime, nullable=False, index=True)

    open_price = db.Column(db.Numeric(15, 4), nullable=False)
    high_price = db.Column(db.Numeric(15, 4), nullable=False)
    low_price = db.Column(db.Numeric(15, 4), nullable=False)
    close_price = db.Column(db.Numeric(15, 4), nullable=False)
    adjusted_close = db.Column(db.Numeric(15, 4), nullable=True)

    volume = db.Column(db.BigInteger, nullable=True)
    vwap = db.Column(db.Numeric(15, 4), nullable=True)         # Volume Weighted Average Price

    # Technical indicators snapshot
    sma_20 = db.Column(db.Numeric(15, 4), nullable=True)       # 20-day Simple Moving Average
    sma_50 = db.Column(db.Numeric(15, 4), nullable=True)
    ema_12 = db.Column(db.Numeric(15, 4), nullable=True)
    ema_26 = db.Column(db.Numeric(15, 4), nullable=True)
    rsi = db.Column(db.Numeric(8, 4), nullable=True)
    macd = db.Column(db.Numeric(10, 4), nullable=True)
    bollinger_upper = db.Column(db.Numeric(15, 4), nullable=True)
    bollinger_lower = db.Column(db.Numeric(15, 4), nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)

    __table_args__ = (
        db.UniqueConstraint('stock_id', 'interval', 'timestamp', name='uq_stock_interval_timestamp'),
        db.Index('ix_stock_price_history_stock_interval', 'stock_id', 'interval'),
    )

    # Relationships
    stock = db.relationship('Stocks', back_populates='price_history')

    def __repr__(self):
        return f"<StockPriceHistory stock_id={self.stock_id} interval={self.interval} timestamp={self.timestamp}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
