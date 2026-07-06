from datetime import datetime
from portal import db


class StockAnalytics(db.Model):
    __tablename__ = 'stock_analytics'

    analytics_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, unique=True)

    # Platform-level popularity metrics
    total_holders = db.Column(db.Integer, default=0)          # Users holding this stock on platform
    total_watchers = db.Column(db.Integer, default=0)          # Users watching this stock
    total_trades_count = db.Column(db.Integer, default=0)      # Total number of trades on platform
    platform_aum = db.Column(db.Numeric(20, 2), default=0.00)  # Total value held by all users
    platform_aum_percent = db.Column(db.Numeric(8, 4), default=0.00)  # % of platform AUM

    popularity_rank = db.Column(db.Integer, nullable=True)     # Rank among all stocks on platform
    popularity_score = db.Column(db.Numeric(10, 4), default=0.00)

    # Return metrics
    return_1d = db.Column(db.Numeric(8, 4), nullable=True)
    return_1w = db.Column(db.Numeric(8, 4), nullable=True)
    return_1m = db.Column(db.Numeric(8, 4), nullable=True)
    return_3m = db.Column(db.Numeric(8, 4), nullable=True)
    return_6m = db.Column(db.Numeric(8, 4), nullable=True)
    return_1y = db.Column(db.Numeric(8, 4), nullable=True)
    return_ytd = db.Column(db.Numeric(8, 4), nullable=True)

    # Volatility
    volatility_30d = db.Column(db.Numeric(8, 4), nullable=True)
    avg_true_range = db.Column(db.Numeric(10, 4), nullable=True)

    # Sentiment
    sentiment_score = db.Column(db.Numeric(5, 2), nullable=True)  # -1.0 to 1.0
    news_sentiment = db.Column(db.String(20), nullable=True)       # BULLISH, BEARISH, NEUTRAL
    social_mentions_24h = db.Column(db.Integer, default=0)

    # Analyst consensus
    analyst_buy_count = db.Column(db.Integer, default=0)
    analyst_hold_count = db.Column(db.Integer, default=0)
    analyst_sell_count = db.Column(db.Integer, default=0)
    consensus_rating = db.Column(db.String(20), nullable=True)     # STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL
    price_target_avg = db.Column(db.Numeric(15, 4), nullable=True)
    price_target_high = db.Column(db.Numeric(15, 4), nullable=True)
    price_target_low = db.Column(db.Numeric(15, 4), nullable=True)

    last_updated = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    stock = db.relationship('Stocks', back_populates='analytics')

    def __repr__(self):
        return f"<StockAnalytics stock_id={self.stock_id} holders={self.total_holders}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
