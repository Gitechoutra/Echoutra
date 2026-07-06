from datetime import datetime
from portal import db


class Watchlists(db.Model):
    __tablename__ = 'watchlists'

    watchlist_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    watchlist_name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(500), nullable=True)
    emoji_icon = db.Column(db.String(10), nullable=True)      # Optional emoji for label

    is_default = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)

    items_count = db.Column(db.Integer, default=0)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='watchlists')
    items = db.relationship('WatchlistItems', back_populates='watchlist', lazy='dynamic')

    def __repr__(self):
        return f"<Watchlist watchlist_id={self.watchlist_id} name={self.watchlist_name}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
