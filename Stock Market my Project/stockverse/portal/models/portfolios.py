from datetime import datetime
from portal import db


class PortfolioType:
    MAIN = "MAIN"
    PAPER = "PAPER"         # Simulated / paper trading
    RETIREMENT = "RETIREMENT"
    SAVINGS = "SAVINGS"
    CUSTOM = "CUSTOM"

    CHOICES = [MAIN, PAPER, RETIREMENT, SAVINGS, CUSTOM]


class Portfolios(db.Model):
    __tablename__ = 'portfolios'

    portfolio_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    portfolio_name = db.Column(db.String(200), nullable=False)
    portfolio_type = db.Column(db.String(20), default=PortfolioType.MAIN)
    description = db.Column(db.String(500), nullable=True)

    # Value metrics (updated on each trade / price update)
    total_invested = db.Column(db.Numeric(15, 2), default=0.00)     # Total cost basis
    current_value = db.Column(db.Numeric(15, 2), default=0.00)      # Current market value
    total_return = db.Column(db.Numeric(15, 2), default=0.00)       # Unrealized + realized P&L
    total_return_percent = db.Column(db.Numeric(8, 4), default=0.00)
    realized_pnl = db.Column(db.Numeric(15, 2), default=0.00)
    unrealized_pnl = db.Column(db.Numeric(15, 2), default=0.00)
    day_change = db.Column(db.Numeric(15, 2), default=0.00)
    day_change_percent = db.Column(db.Numeric(8, 4), default=0.00)

    # Diversification
    total_holdings_count = db.Column(db.Integer, default=0)
    sectors = db.Column(db.JSON, nullable=True)   # {"Technology": 40.5, "Healthcare": 20.3, ...}

    is_default = db.Column(db.Boolean, default=False)  # User's primary portfolio
    is_active = db.Column(db.Boolean, default=True)
    is_public = db.Column(db.Boolean, default=False)   # Allow public viewing (future feature)

    last_updated = db.Column(db.DateTime, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='portfolios')
    holdings = db.relationship('PortfolioHoldings', back_populates='portfolio', lazy='dynamic')
    performance_history = db.relationship('PortfolioPerformanceHistory', back_populates='portfolio', lazy='dynamic')

    def __repr__(self):
        return f"<Portfolio portfolio_id={self.portfolio_id} name={self.portfolio_name}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
