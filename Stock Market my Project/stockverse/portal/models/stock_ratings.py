from datetime import datetime
from portal import db


class RatingAction:
    INITIATED = "INITIATED"
    UPGRADED = "UPGRADED"
    DOWNGRADED = "DOWNGRADED"
    MAINTAINED = "MAINTAINED"
    REITERATED = "REITERATED"

    CHOICES = [INITIATED, UPGRADED, DOWNGRADED, MAINTAINED, REITERATED]


class AnalystRating:
    STRONG_BUY = "STRONG_BUY"
    BUY = "BUY"
    HOLD = "HOLD"
    SELL = "SELL"
    STRONG_SELL = "STRONG_SELL"
    OUTPERFORM = "OUTPERFORM"
    UNDERPERFORM = "UNDERPERFORM"
    NEUTRAL = "NEUTRAL"

    CHOICES = [STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL, OUTPERFORM, UNDERPERFORM, NEUTRAL]


class StockRatings(db.Model):
    __tablename__ = 'stock_ratings'

    rating_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)

    analyst_firm = db.Column(db.String(200), nullable=False)
    analyst_name = db.Column(db.String(200), nullable=True)
    analyst_logo_url = db.Column(db.String(500), nullable=True)

    rating = db.Column(db.String(20), nullable=False)           # STRONG_BUY, BUY, HOLD, SELL, etc.
    previous_rating = db.Column(db.String(20), nullable=True)
    action = db.Column(db.String(20), nullable=True)            # INITIATED, UPGRADED, DOWNGRADED, etc.

    price_target = db.Column(db.Numeric(15, 4), nullable=True)
    previous_price_target = db.Column(db.Numeric(15, 4), nullable=True)

    rating_date = db.Column(db.Date, nullable=False)
    notes = db.Column(db.Text, nullable=True)

    source_url = db.Column(db.String(500), nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    stock = db.relationship('Stocks', back_populates='ratings')

    def __repr__(self):
        return f"<StockRating rating_id={self.rating_id} stock_id={self.stock_id} firm={self.analyst_firm}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
