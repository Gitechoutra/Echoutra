from datetime import datetime
from portal import db


class StockNewsMapping(db.Model):
    __tablename__ = 'stock_news_mapping'

    mapping_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)
    news_id = db.Column(db.Integer, db.ForeignKey('market_news.news_id'), nullable=False, index=True)

    # How relevant is this news to the stock
    relevance_score = db.Column(db.Numeric(5, 4), nullable=True)   # 0.0 to 1.0
    sentiment = db.Column(db.String(20), nullable=True)            # POSITIVE, NEGATIVE, NEUTRAL
    is_primary = db.Column(db.Boolean, default=False)               # Primary stock mentioned in article

    created_on = db.Column(db.DateTime, default=datetime.now)

    __table_args__ = (
        db.UniqueConstraint('stock_id', 'news_id', name='uq_stock_news'),
    )

    # Relationships
    stock = db.relationship('Stocks', back_populates='news_mappings')
    news = db.relationship('MarketNews', back_populates='stock_mappings')

    def __repr__(self):
        return f"<StockNewsMapping stock_id={self.stock_id} news_id={self.news_id}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
