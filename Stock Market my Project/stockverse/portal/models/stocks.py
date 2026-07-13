from datetime import datetime
from portal import db


class StockStatus:
    ACTIVE    = "ACTIVE"
    HALTED    = "HALTED"
    DELISTED  = "DELISTED"
    SUSPENDED = "SUSPENDED"

    CHOICES = [ACTIVE, HALTED, DELISTED, SUSPENDED]


class AssetType:
    STOCK       = "STOCK"
    ETF         = "ETF"
    MUTUAL_FUND = "MUTUAL_FUND"
    CRYPTO      = "CRYPTO"
    FOREX       = "FOREX"
    INDEX       = "INDEX"

    CHOICES = [STOCK, ETF, MUTUAL_FUND, CRYPTO, FOREX, INDEX]


class Stocks(db.Model):
    __tablename__ = 'stocks'

    stock_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    ticker_symbol = db.Column(db.String(20), unique=True, nullable=False, index=True)
    company_name  = db.Column(db.String(255), nullable=False)
    short_name    = db.Column(db.String(100), nullable=True)
    description   = db.Column(db.Text, nullable=True)

    asset_type = db.Column(db.String(20), default=AssetType.STOCK)
    sector     = db.Column(db.String(100), nullable=True)   # Technology, Healthcare, Finance, etc.
    industry   = db.Column(db.String(150), nullable=True)
    exchange   = db.Column(db.String(50),  nullable=True)   # NSE, BSE, NYSE, NASDAQ, etc.
    country    = db.Column(db.String(100), nullable=True)
    # FIX: Default changed from 'USD' to 'INR' — Indian market stocks trade in Indian Rupees.
    # USD-listed stocks (e.g. NYSE/NASDAQ) can override this per-record.
    currency   = db.Column(db.String(5), default='INR')
    isin       = db.Column(db.String(20), nullable=True, unique=True)   # International Securities ID

    # Current Price Data
    current_price         = db.Column(db.Numeric(15, 4), nullable=True)
    previous_close        = db.Column(db.Numeric(15, 4), nullable=True)
    open_price            = db.Column(db.Numeric(15, 4), nullable=True)
    day_high              = db.Column(db.Numeric(15, 4), nullable=True)
    day_low               = db.Column(db.Numeric(15, 4), nullable=True)
    price_change          = db.Column(db.Numeric(10, 4), nullable=True)
    price_change_percent  = db.Column(db.Numeric(8, 4),  nullable=True)
    volume                = db.Column(db.BigInteger, nullable=True)
    avg_volume            = db.Column(db.BigInteger, nullable=True)

    # 52-week range (from Upstox daily historical candles)
    week_52_high   = db.Column(db.Numeric(15, 4), nullable=True)
    week_52_low    = db.Column(db.Numeric(15, 4), nullable=True)
    # NOTE: fundamentals (market_cap, pe_ratio, eps, dividend_yield, beta) were
    # removed — the Upstox market-quote API does not supply them, so we never
    # show placeholder/dummy values for data we can't source live.

    # Logo / Branding
    logo_url    = db.Column(db.String(500), nullable=True)
    website_url = db.Column(db.String(500), nullable=True)

    status      = db.Column(db.String(20), default=StockStatus.ACTIVE)
    is_tradable = db.Column(db.Boolean, default=True)
    is_featured = db.Column(db.Boolean, default=False)

    last_price_update = db.Column(db.DateTime, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    price_history      = db.relationship('StockPriceHistory',  back_populates='stock', lazy='dynamic')
    analytics          = db.relationship('StockAnalytics',      back_populates='stock', uselist=False)
    ratings            = db.relationship('StockRatings',        back_populates='stock', lazy='dynamic')
    news_mappings      = db.relationship('StockNewsMapping',    back_populates='stock', lazy='dynamic')
    portfolio_holdings = db.relationship('PortfolioHoldings',   back_populates='stock', lazy='dynamic')
    watchlist_items    = db.relationship('WatchlistItems',       back_populates='stock', lazy='dynamic')
    trade_orders       = db.relationship('TradeOrders',          back_populates='stock', lazy='dynamic')
    price_alerts       = db.relationship('PriceAlerts',          back_populates='stock', lazy='dynamic')
    market_movers      = db.relationship('MarketMovers',         back_populates='stock', lazy='dynamic')

    def __repr__(self):
        return f"<Stock {self.ticker_symbol} - {self.company_name}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()


















# from datetime import datetime
# from portal import db


# class StockStatus:
#     ACTIVE = "ACTIVE"
#     HALTED = "HALTED"
#     DELISTED = "DELISTED"
#     SUSPENDED = "SUSPENDED"

#     CHOICES = [ACTIVE, HALTED, DELISTED, SUSPENDED]


# class AssetType:
#     STOCK = "STOCK"
#     ETF = "ETF"
#     MUTUAL_FUND = "MUTUAL_FUND"
#     CRYPTO = "CRYPTO"
#     FOREX = "FOREX"
#     INDEX = "INDEX"

#     CHOICES = [STOCK, ETF, MUTUAL_FUND, CRYPTO, FOREX, INDEX]


# class Stocks(db.Model):
#     __tablename__ = 'stocks'

#     stock_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

#     ticker_symbol = db.Column(db.String(20), unique=True, nullable=False, index=True)
#     company_name = db.Column(db.String(255), nullable=False)
#     short_name = db.Column(db.String(100), nullable=True)
#     description = db.Column(db.Text, nullable=True)

#     asset_type = db.Column(db.String(20), default=AssetType.STOCK)
#     sector = db.Column(db.String(100), nullable=True)      # Technology, Healthcare, Finance, etc.
#     industry = db.Column(db.String(150), nullable=True)
#     exchange = db.Column(db.String(50), nullable=True)     # NYSE, NASDAQ, BSE, NSE, etc.
#     country = db.Column(db.String(100), nullable=True)
#     currency = db.Column(db.String(5), default='USD')
#     isin = db.Column(db.String(20), nullable=True, unique=True)   # International Securities ID

#     # Current Price Data
#     current_price = db.Column(db.Numeric(15, 4), nullable=True)
#     previous_close = db.Column(db.Numeric(15, 4), nullable=True)
#     open_price = db.Column(db.Numeric(15, 4), nullable=True)
#     day_high = db.Column(db.Numeric(15, 4), nullable=True)
#     day_low = db.Column(db.Numeric(15, 4), nullable=True)
#     price_change = db.Column(db.Numeric(10, 4), nullable=True)
#     price_change_percent = db.Column(db.Numeric(8, 4), nullable=True)
#     volume = db.Column(db.BigInteger, nullable=True)
#     avg_volume = db.Column(db.BigInteger, nullable=True)

#     # Fundamentals
#     market_cap = db.Column(db.Numeric(20, 2), nullable=True)
#     pe_ratio = db.Column(db.Numeric(10, 4), nullable=True)
#     eps = db.Column(db.Numeric(10, 4), nullable=True)
#     dividend_yield = db.Column(db.Numeric(8, 4), nullable=True)
#     beta = db.Column(db.Numeric(8, 4), nullable=True)
#     week_52_high = db.Column(db.Numeric(15, 4), nullable=True)
#     week_52_low = db.Column(db.Numeric(15, 4), nullable=True)

#     # Logo / Branding
#     logo_url = db.Column(db.String(500), nullable=True)
#     website_url = db.Column(db.String(500), nullable=True)

#     status = db.Column(db.String(20), default=StockStatus.ACTIVE)
#     is_tradable = db.Column(db.Boolean, default=True)
#     is_featured = db.Column(db.Boolean, default=False)

#     last_price_update = db.Column(db.DateTime, nullable=True)

#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     # Relationships
#     price_history = db.relationship('StockPriceHistory', back_populates='stock', lazy='dynamic')
#     analytics = db.relationship('StockAnalytics', back_populates='stock', uselist=False)
#     ratings = db.relationship('StockRatings', back_populates='stock', lazy='dynamic')
#     news_mappings = db.relationship('StockNewsMapping', back_populates='stock', lazy='dynamic')
#     portfolio_holdings = db.relationship('PortfolioHoldings', back_populates='stock', lazy='dynamic')
#     watchlist_items = db.relationship('WatchlistItems', back_populates='stock', lazy='dynamic')
#     trade_orders = db.relationship('TradeOrders', back_populates='stock', lazy='dynamic')
#     price_alerts = db.relationship('PriceAlerts', back_populates='stock', lazy='dynamic')
#     market_movers = db.relationship('MarketMovers', back_populates='stock', lazy='dynamic')

#     def __repr__(self):
#         return f"<Stock {self.ticker_symbol} - {self.company_name}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
