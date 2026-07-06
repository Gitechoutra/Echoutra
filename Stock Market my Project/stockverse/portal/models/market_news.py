from datetime import datetime
from portal import db


class NewsSentiment:
    POSITIVE = "POSITIVE"
    NEGATIVE = "NEGATIVE"
    NEUTRAL = "NEUTRAL"

    CHOICES = [POSITIVE, NEGATIVE, NEUTRAL]


class MarketNews(db.Model):
    __tablename__ = 'market_news'

    news_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category_id = db.Column(db.Integer, db.ForeignKey('news_categories.category_id'), nullable=True)

    title = db.Column(db.String(500), nullable=False)
    summary = db.Column(db.Text, nullable=True)
    content = db.Column(db.Text, nullable=True)
    author = db.Column(db.String(200), nullable=True)
    source_name = db.Column(db.String(200), nullable=True)     # Reuters, Bloomberg, etc.
    source_url = db.Column(db.String(1000), nullable=True)
    image_url = db.Column(db.String(1000), nullable=True)

    sentiment = db.Column(db.String(20), nullable=True)         # POSITIVE, NEGATIVE, NEUTRAL
    sentiment_score = db.Column(db.Numeric(5, 4), nullable=True)  # -1.0 to 1.0

    # Tags / Keywords for filtering
    tags = db.Column(db.JSON, nullable=True)                    # ["Fed", "Interest Rates", "Inflation"]
    is_breaking = db.Column(db.Boolean, default=False)
    is_featured = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)

    # Views / Engagement
    view_count = db.Column(db.Integer, default=0)
    read_count = db.Column(db.Integer, default=0)

    published_at = db.Column(db.DateTime, nullable=False, index=True)
    external_id = db.Column(db.String(255), nullable=True, unique=True)   # ID from news provider

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    category = db.relationship('NewsCategories', back_populates='news_articles')
    stock_mappings = db.relationship('StockNewsMapping', back_populates='news', lazy='dynamic')

    def __repr__(self):
        return f"<MarketNews news_id={self.news_id} title={self.title[:50]}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
