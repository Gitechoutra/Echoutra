from datetime import datetime
from portal import db


class WatchlistItems(db.Model):
    __tablename__ = 'watchlist_items'

    item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    watchlist_id = db.Column(db.Integer, db.ForeignKey('watchlists.watchlist_id'), nullable=False, index=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    notes = db.Column(db.String(500), nullable=True)
    sort_order = db.Column(db.Integer, default=0)

    # Price at the time of adding to watchlist (for reference)
    price_at_add = db.Column(db.Numeric(15, 4), nullable=True)

    # Show mini sparkline data (cached for performance)
    sparkline_data = db.Column(db.JSON, nullable=True)    # List of recent closing prices
    sparkline_updated_at = db.Column(db.DateTime, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        db.UniqueConstraint('watchlist_id', 'stock_id', name='uq_watchlist_stock'),
    )

    # Relationships
    watchlist = db.relationship('Watchlists', back_populates='items')
    stock = db.relationship('Stocks', back_populates='watchlist_items')
    alerts = db.relationship('WatchlistAlerts', back_populates='watchlist_item', lazy='dynamic')

    def __repr__(self):
        return f"<WatchlistItem item_id={self.item_id} stock_id={self.stock_id}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
