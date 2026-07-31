"""Short selling, end to end: open → mark to market → cover → square off.

The arithmetic is pinned in test_short_selling.py. This file checks the WIRING —
that a fill actually creates a SHORT-sided holding, that the wallet's
`available = balance − locked` invariant survives every step, that covering
releases exactly the collateral it locked, and that the close-of-day sweep buys
back what the user left open.

It runs against its own throwaway SQLite file, never the project database. That
is not just tidiness: the first version of this file ran against MySQL and hit a
50-second InnoDB lock timeout, because the running dev server's scheduler was
concurrently sweeping the very short position the test had just opened. A test
of money movement cannot share a database with a live background worker.

Run:  pytest tests/test_short_selling_lifecycle.py -q
"""

import os
import tempfile
from decimal import Decimal

import pytest
from flask import Flask

import app as _app  # noqa: F401  — registers every model with SQLAlchemy
from portal import db
from portal.helpers import market_calendar as mc
from portal.helpers.order_engine import (
    execute_order, square_off_open_shorts, open_position, COMMISSION_RATE,
)
from portal.models.users import Users
from portal.models.roles import Roles
from portal.models.stocks import Stocks, StockStatus
from portal.models.wallets import Wallets, WalletStatus
from portal.models.portfolios import Portfolios
from portal.models.portfolio_holdings import PortfolioHoldings, PositionSide
from portal.models.trade_orders import (
    TradeOrders, OrderType, OrderSide, OrderStatus, OrderDuration,
    TradeMode, PositionEffect,
)

TICKER  = '__SHORTTEST__'
EMAIL   = '__shorttest__@example.invalid'
OPENING = Decimal('100000.00')


def D(v):
    return Decimal(str(v))


@pytest.fixture(scope='module')
def flask_app():
    """A minimal app bound to a private SQLite file, with the real schema."""
    fd, path = tempfile.mkstemp(suffix='.sqlite', prefix='shorttest-')
    os.close(fd)

    test_app = Flask(__name__)
    test_app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{path}'
    test_app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    test_app.config['SQLALCHEMY_ECHO'] = False
    test_app.config['TESTING'] = True
    db.init_app(test_app)

    # ONE application context for the whole module, pushed manually rather than
    # entered per test. Flask-SQLAlchemy scopes its session to the app context,
    # so a nested `with app.app_context()` inside a test opens a *second* session
    # on a second connection — and two writers on one SQLite file is an instant
    # "database is locked".
    app_ctx = test_app.app_context()
    app_ctx.push()
    db.create_all()

    yield test_app

    db.session.remove()
    db.engine.dispose()
    app_ctx.pop()
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture(scope='module')
def ctx(flask_app):
    """Scratch user + wallet + portfolio + stock in the throwaway database."""
    role = Roles()
    role.role_name = 'TESTER'
    role.save()

    user = Users()
    user.role_id       = role.role_id
    user.email         = EMAIL
    user.username      = '__shorttest__'
    user.password_hash = 'x'
    user.save()

    stock = Stocks()
    stock.ticker_symbol  = TICKER
    stock.company_name   = 'Short Test Co'
    stock.current_price  = D(1000)
    stock.previous_close = D(1000)
    stock.status         = StockStatus.ACTIVE
    stock.is_tradable    = True
    stock.save()

    wallet = Wallets()
    wallet.user_id           = user.user_id
    wallet.balance           = OPENING
    wallet.available_balance = OPENING
    wallet.locked_balance    = D(0)
    wallet.status            = WalletStatus.ACTIVE
    wallet.save()

    portfolio = Portfolios()
    portfolio.user_id        = user.user_id
    portfolio.portfolio_name = 'Short Test'
    portfolio.is_default     = True
    portfolio.is_active      = True
    portfolio.save()

    # No teardown needed — the whole database file is thrown away.
    yield {'user': user, 'stock': stock, 'wallet': wallet, 'portfolio': portfolio}


def _order(ctx, side, quantity, effect):
    o = TradeOrders()
    o.user_id            = ctx['user'].user_id
    o.stock_id           = ctx['stock'].stock_id
    o.portfolio_id       = ctx['portfolio'].portfolio_id
    o.order_type         = OrderType.MARKET
    o.order_side         = side
    o.trade_mode         = TradeMode.INTRADAY
    o.position_effect    = effect
    o.order_status       = OrderStatus.PENDING
    o.order_duration     = OrderDuration.DAY
    o.quantity           = D(quantity)
    o.filled_quantity    = D(0)
    o.remaining_quantity = D(quantity)
    o.order_source       = 'TEST'
    o.save()
    return o


def _wallet(ctx):
    db.session.expire_all()
    return Wallets.query.filter_by(user_id=ctx['user'].user_id).first()


def _position(ctx):
    db.session.expire_all()
    return open_position(ctx['portfolio'].portfolio_id, ctx['stock'].stock_id,
                         TradeMode.INTRADAY)


def _set_price(ctx, price):
    ctx['stock'].current_price = D(price)
    ctx['stock'].update()


def _assert_invariant(w):
    """available = balance − locked, always. Everything else can be recomputed;
    if this drifts, the user's spendable money is simply wrong."""
    assert D(w.available_balance) == D(w.balance) - D(w.locked_balance)


# ── The lifecycle ───────────────────────────────────────────────────────────

def test_short_lifecycle(flask_app, ctx):
    # 1) Sell 10 short at 1,000 ------------------------------------------
    _set_price(ctx, 1000)
    sell = _order(ctx, OrderSide.SELL, 10, PositionEffect.OPEN)
    assert execute_order(sell, D(1000), funds_locked=False) is not None

    notional  = D(10) * D(1000)                 # 10,000
    open_fee  = notional * COMMISSION_RATE      # 10.00

    w = _wallet(ctx)
    # Proceeds are NOT credited — they become collateral.
    assert D(w.balance) == OPENING - open_fee
    assert D(w.locked_balance) == notional
    assert D(w.available_balance) == OPENING - open_fee - notional
    _assert_invariant(w)

    pos = _position(ctx)
    assert pos is not None
    assert pos.position_side == PositionSide.SHORT
    assert D(pos.quantity) == 10
    assert D(pos.average_buy_price) == 1000      # the price it was SOLD at

    # 2) Price falls to 900 — the short is up --------------------------
    _set_price(ctx, 900)
    from portal.helpers.order_engine import revalue_portfolio
    revalue_portfolio(ctx['portfolio'])
    db.session.commit()

    pos = _position(ctx)
    assert D(pos.unrealized_pnl) == D(1000)      # (1000 − 900) × 10
    assert D(pos.current_value) == D(9000)       # cost to buy back

    # 3) Cover 4 at 900 — partial ---------------------------------------
    cover = _order(ctx, OrderSide.BUY, 4, PositionEffect.CLOSE)
    assert execute_order(cover, D(900), funds_locked=False) is not None

    w = _wallet(ctx)
    # Four-tenths of the collateral comes back; six-tenths stays locked.
    assert D(w.locked_balance) == D(6000)
    _assert_invariant(w)

    pos = _position(ctx)
    assert D(pos.quantity) == 6
    assert pos.is_active is True
    assert D(pos.realized_pnl) == D(400)         # (1000 − 900) × 4

    # 4) Price rises to 1,050 — now the rest is losing ------------------
    _set_price(ctx, 1050)
    cover2 = _order(ctx, OrderSide.BUY, 6, PositionEffect.CLOSE)
    assert execute_order(cover2, D(1050), funds_locked=False) is not None

    w = _wallet(ctx)
    assert D(w.locked_balance) == 0, 'all collateral must be released'
    _assert_invariant(w)

    pos = _position(ctx)
    assert pos is None, 'a fully covered short must close'

    closed = PortfolioHoldings.query.filter_by(
        portfolio_id=ctx['portfolio'].portfolio_id,
        stock_id=ctx['stock'].stock_id).first()
    assert closed.is_active is False
    # +400 on the first leg, −300 on the second ((1000 − 1050) × 6).
    assert D(closed.realized_pnl) == D(100)

    # 5) The wallet tells the same story ---------------------------------
    fees = (open_fee
            + D(4) * D(900) * COMMISSION_RATE
            + D(6) * D(1050) * COMMISSION_RATE)
    assert D(w.balance) == OPENING + D(100) - fees


def test_a_losing_short_actually_costs_money(flask_app, ctx):
    """The direction that matters most: sell short, price rises, wallet falls."""
    _set_price(ctx, 500)
    before = D(_wallet(ctx).balance)

    sell = _order(ctx, OrderSide.SELL, 2, PositionEffect.OPEN)
    execute_order(sell, D(500), funds_locked=False)

    _set_price(ctx, 600)
    cover = _order(ctx, OrderSide.BUY, 2, PositionEffect.CLOSE)
    execute_order(cover, D(600), funds_locked=False)

    w = _wallet(ctx)
    _assert_invariant(w)
    assert D(w.locked_balance) == 0
    # Lost 100 on the position, plus both commissions.
    fees = D(1000) * COMMISSION_RATE + D(1200) * COMMISSION_RATE
    assert D(w.balance) == before - D(200) - fees
    assert D(w.balance) < before


def test_delivery_cannot_be_sold_short(flask_app, ctx):
    """Short selling is intraday-only; a delivery sell with nothing held must be
    rejected rather than quietly opening a position."""
    _set_price(ctx, 1000)
    o = _order(ctx, OrderSide.SELL, 1, PositionEffect.OPEN)
    o.trade_mode = TradeMode.DELIVERY
    o.update()

    assert execute_order(o, D(1000), funds_locked=False) is None
    db.session.expire_all()
    rejected = TradeOrders.query.get(o.order_id)
    assert rejected.order_status == OrderStatus.REJECTED
    assert 'intraday only' in rejected.rejection_reason.lower()


def test_cannot_buy_more_than_the_open_short(flask_app, ctx):
    _set_price(ctx, 1000)
    sell = _order(ctx, OrderSide.SELL, 2, PositionEffect.OPEN)
    execute_order(sell, D(1000), funds_locked=False)

    too_big = _order(ctx, OrderSide.BUY, 5, PositionEffect.CLOSE)
    assert execute_order(too_big, D(1000), funds_locked=False) is None
    db.session.expire_all()
    assert TradeOrders.query.get(too_big.order_id).order_status == OrderStatus.REJECTED
    # The short is untouched.
    assert D(_position(ctx).quantity) == 2

    # Tidy up so the next test starts flat.
    execute_order(_order(ctx, OrderSide.BUY, 2, PositionEffect.CLOSE),
                  D(1000), funds_locked=False)


# ── Close of day ────────────────────────────────────────────────────────────

def test_open_shorts_are_bought_back_at_the_close(flask_app, ctx, monkeypatch):
    """The obligation cannot be carried overnight: with the market shut the user
    could not cover it themselves, and their collateral would stay locked."""
    _set_price(ctx, 1000)
    execute_order(_order(ctx, OrderSide.SELL, 3, PositionEffect.OPEN),
                  D(1000), funds_locked=False)
    assert _position(ctx) is not None

    _set_price(ctx, 940)

    # While the market is open the sweep must do nothing at all.
    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: True)
    assert square_off_open_shorts()['covered'] == 0
    assert _position(ctx) is not None

    # After the bell it buys the shares back at the last traded price.
    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: False)
    assert square_off_open_shorts()['covered'] == 1

    assert _position(ctx) is None
    w = _wallet(ctx)
    assert D(w.locked_balance) == 0
    _assert_invariant(w)

    # Running again is a no-op — nothing is left short.
    assert square_off_open_shorts()['covered'] == 0


def test_long_intraday_positions_are_left_alone_at_the_close(flask_app, ctx, monkeypatch):
    """Only shorts are force-closed. A long is owned outright and the user
    decides when to sell it."""
    _set_price(ctx, 1000)
    execute_order(_order(ctx, OrderSide.BUY, 2, PositionEffect.OPEN),
                  D(1000), funds_locked=False)
    pos = _position(ctx)
    assert pos.position_side == PositionSide.LONG

    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: False)
    square_off_open_shorts()

    still_there = _position(ctx)
    assert still_there is not None and still_there.position_side == PositionSide.LONG
