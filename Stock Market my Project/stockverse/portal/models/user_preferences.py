from datetime import datetime
from portal import db


class ExperienceLevel:
    BEGINNER = "BEGINNER"
    INTERMEDIATE = "INTERMEDIATE"
    ADVANCED = "ADVANCED"
    EXPERT = "EXPERT"

    CHOICES = [BEGINNER, INTERMEDIATE, ADVANCED, EXPERT]


class UserPreferences(db.Model):
    __tablename__ = 'user_preferences'

    preference_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, unique=True)

    # Onboarding / Sign-up Step 2
    experience_level = db.Column(db.String(20), nullable=True)  # BEGINNER, INTERMEDIATE, ADVANCED, EXPERT
    investment_interests = db.Column(db.JSON, nullable=True)  # ["STOCKS", "ETFs", "CRYPTO", "FOREX", "OPTIONS"]
    risk_tolerance = db.Column(db.String(20), nullable=True)   # LOW, MEDIUM, HIGH
    investment_goal = db.Column(db.String(50), nullable=True)  # GROWTH, INCOME, PRESERVATION, SPECULATION

    # UI Preferences
    theme = db.Column(db.String(20), default='DARK')           # LIGHT, DARK, AUTO
    default_chart_type = db.Column(db.String(20), default='LINE')  # LINE, CANDLESTICK, BAR
    default_chart_period = db.Column(db.String(10), default='1M')  # 1D, 1W, 1M, 3M, 1Y, ALL
    show_portfolio_value = db.Column(db.Boolean, default=True)
    show_percentage_change = db.Column(db.Boolean, default=True)
    compact_view = db.Column(db.Boolean, default=False)

    # Market Preferences
    default_market = db.Column(db.String(50), nullable=True, default='NYSE')
    watchlist_sort_by = db.Column(db.String(30), default='ALPHABETICAL')  # ALPHABETICAL, PRICE, CHANGE
    news_categories = db.Column(db.JSON, nullable=True)  # ["TECH", "FINANCE", "ENERGY", ...]

    # Language & Region
    language = db.Column(db.String(10), default='en')
    date_format = db.Column(db.String(20), default='MM/DD/YYYY')
    number_format = db.Column(db.String(20), default='1,234.56')

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='preferences')

    def __repr__(self):
        return f"<UserPreferences user_id={self.user_id}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
