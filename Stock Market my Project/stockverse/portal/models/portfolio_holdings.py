from datetime import datetime
from portal import db


class PositionSide:
    """Which way a position is facing.

    LONG  — bought first, sold later. `average_buy_price` is the average price paid.
    SHORT — sold first, bought back later (intraday only). `average_buy_price` is
            the average price the shares were SOLD at, and P&L runs the other way:
            the position gains when the price falls.
    """

    LONG  = "LONG"
    SHORT = "SHORT"

    CHOICES = [LONG, SHORT]


class PortfolioHoldings(db.Model):
    __tablename__ = 'portfolio_holdings'

    holding_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    portfolio_id = db.Column(db.Integer, db.ForeignKey('portfolios.portfolio_id'), nullable=False, index=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    # DELIVERY holdings stay in the portfolio until sold; INTRADAY holdings are
    # separate positions (OPEN while is_active, CLOSED when fully sold).
    trade_mode = db.Column(db.String(10), default='DELIVERY', index=True)  # DELIVERY, INTRADAY

    # LONG (bought first) or SHORT (sold first, bought back to close). SHORT is
    # INTRADAY-only. Quantity stays POSITIVE either way — the side is what tells
    # you which direction the position profits in, not the sign of the quantity.
    # Storing shorts as negative quantities would silently corrupt every existing
    # sum over `quantity` and `current_value` in the app.
    position_side = db.Column(db.String(6), default=PositionSide.LONG, index=True)

    # Position details
    quantity = db.Column(db.Numeric(15, 6), nullable=False)            # Supports fractional shares
    # Average ENTRY price: the price paid for a LONG, the price sold at for a SHORT.
    average_buy_price = db.Column(db.Numeric(15, 4), nullable=False)
    # LONG: capital actually invested. SHORT: notional value sold (the collateral
    # itself is held in the wallet's locked_balance, not here).
    total_invested = db.Column(db.Numeric(15, 2), nullable=False)

    # Current value (updated on price refresh)
    current_price = db.Column(db.Numeric(15, 4), nullable=True)
    current_value = db.Column(db.Numeric(15, 2), nullable=True)        # quantity * current_price
    unrealized_pnl = db.Column(db.Numeric(15, 2), nullable=True)
    unrealized_pnl_percent = db.Column(db.Numeric(8, 4), nullable=True)
    day_change = db.Column(db.Numeric(15, 2), nullable=True)
    day_change_percent = db.Column(db.Numeric(8, 4), nullable=True)

    # Realized gains/losses from partial sells
    realized_pnl = db.Column(db.Numeric(15, 2), default=0.00)

    # Allocation within portfolio
    allocation_percent = db.Column(db.Numeric(8, 4), nullable=True)

    # First purchase and last trade dates
    first_bought_at = db.Column(db.DateTime, nullable=True)
    last_traded_at = db.Column(db.DateTime, nullable=True)

    is_active = db.Column(db.Boolean, default=True)  # False when fully sold

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # NOTE: intentionally NOT unique on (portfolio_id, stock_id). A stock can be
    # held simultaneously as a DELIVERY holding and an INTRADAY position, and an
    # intraday position can be opened → closed → re-opened (leaving several CLOSED
    # rows). The order engine guarantees at most one ACTIVE row per
    # (portfolio, stock, trade_mode) via its is_active lookup, so a plain
    # non-unique index is enough here.
    __table_args__ = (
        db.Index('ix_portfolio_stock_mode', 'portfolio_id', 'stock_id', 'trade_mode'),
    )

    # Relationships
    portfolio = db.relationship('Portfolios', back_populates='holdings')
    stock = db.relationship('Stocks', back_populates='portfolio_holdings')

    def __repr__(self):
        return f"<PortfolioHolding holding_id={self.holding_id} stock_id={self.stock_id} qty={self.quantity}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
