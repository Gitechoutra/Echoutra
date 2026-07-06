from datetime import datetime
from portal import db


class OrderType:
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP = "STOP"
    STOP_LIMIT = "STOP_LIMIT"

    CHOICES = [MARKET, LIMIT, STOP, STOP_LIMIT]


class OrderSide:
    BUY = "BUY"
    SELL = "SELL"

    CHOICES = [BUY, SELL]


class OrderStatus:
    PENDING = "PENDING"
    OPEN = "OPEN"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"

    CHOICES = [PENDING, OPEN, PARTIALLY_FILLED, FILLED, CANCELLED, REJECTED, EXPIRED]


class OrderDuration:
    DAY = "DAY"           # Good for day
    GTC = "GTC"           # Good till cancelled
    IOC = "IOC"           # Immediate or cancel
    FOK = "FOK"           # Fill or kill

    CHOICES = [DAY, GTC, IOC, FOK]


class TradeOrders(db.Model):
    __tablename__ = 'trade_orders'

    order_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)
    portfolio_id = db.Column(db.Integer, db.ForeignKey('portfolios.portfolio_id'), nullable=True)

    order_type = db.Column(db.String(20), nullable=False)         # MARKET, LIMIT, STOP, STOP_LIMIT
    order_side = db.Column(db.String(10), nullable=False)         # BUY, SELL
    order_status = db.Column(db.String(25), default=OrderStatus.PENDING)
    order_duration = db.Column(db.String(5), default=OrderDuration.DAY)

    # Quantity
    quantity = db.Column(db.Numeric(15, 6), nullable=False)
    filled_quantity = db.Column(db.Numeric(15, 6), default=0.000000)
    remaining_quantity = db.Column(db.Numeric(15, 6), nullable=True)

    # Prices
    limit_price = db.Column(db.Numeric(15, 4), nullable=True)     # For LIMIT orders
    stop_price = db.Column(db.Numeric(15, 4), nullable=True)      # For STOP orders
    avg_fill_price = db.Column(db.Numeric(15, 4), nullable=True)  # Actual execution average price
    estimated_amount = db.Column(db.Numeric(15, 2), nullable=True)
    filled_amount = db.Column(db.Numeric(15, 2), nullable=True)

    # Fees
    commission = db.Column(db.Numeric(10, 4), default=0.0000)
    sec_fee = db.Column(db.Numeric(10, 4), default=0.0000)
    total_fee = db.Column(db.Numeric(10, 4), default=0.0000)

    # Rejection / Cancellation
    rejection_reason = db.Column(db.String(500), nullable=True)
    cancelled_by = db.Column(db.String(20), nullable=True)        # USER, SYSTEM, ADMIN

    # Timing
    submitted_at = db.Column(db.DateTime, default=datetime.now)
    filled_at = db.Column(db.DateTime, nullable=True)
    cancelled_at = db.Column(db.DateTime, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=True)

    # Session / Device context
    order_source = db.Column(db.String(30), nullable=True)         # WEB, MOBILE, API

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='trade_orders')
    stock = db.relationship('Stocks', back_populates='trade_orders')
    executions = db.relationship('TradeExecutions', back_populates='order', lazy='dynamic')

    def __repr__(self):
        return f"<TradeOrder order_id={self.order_id} side={self.order_side} status={self.order_status}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
