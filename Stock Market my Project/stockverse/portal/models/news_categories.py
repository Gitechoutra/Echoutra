from datetime import datetime
from portal import db


class NewsCategories(db.Model):
    __tablename__ = 'news_categories'

    category_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    category_name = db.Column(db.String(100), unique=True, nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)        # URL-friendly key e.g. "tech"
    description = db.Column(db.String(500), nullable=True)
    icon = db.Column(db.String(100), nullable=True)                      # Icon name or emoji
    color_hex = db.Column(db.String(10), nullable=True)                  # Badge color e.g. "#00C4FF"

    is_active = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    news_articles = db.relationship('MarketNews', back_populates='category', lazy='dynamic')

    def __repr__(self):
        return f"<NewsCategory {self.category_name}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
