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
    execute_order, square_off_intraday_positions, open_position, COMMISSION_RATE,
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
    assert square_off_intraday_positions()['squared_off'] == 0
    assert _position(ctx) is not None

    # After the bell it buys the shares back at the last traded price.
    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: False)
    assert square_off_intraday_positions()['squared_off'] == 1

    assert _position(ctx) is None
    w = _wallet(ctx)
    assert D(w.locked_balance) == 0
    _assert_invariant(w)

    # Running again is a no-op — nothing is left open.
    assert square_off_intraday_positions()['squared_off'] == 0


def test_long_intraday_positions_are_squared_off_too(flask_app, ctx, monkeypatch):
    """Intraday means settled the same session. A long left open would sit there
    overnight with no way for the user to close it — the order gate refuses
    trades outside hours."""
    _set_price(ctx, 1000)
    execute_order(_order(ctx, OrderSide.BUY, 2, PositionEffect.OPEN),
                  D(1000), funds_locked=False)
    pos = _position(ctx)
    assert pos is not None and pos.position_side == PositionSide.LONG

    before = D(_wallet(ctx).balance)
    _set_price(ctx, 1100)

    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: True)
    assert square_off_intraday_positions()['squared_off'] == 0   # still trading

    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: False)
    assert square_off_intraday_positions()['squared_off'] == 1

    # Position closed, profit booked, proceeds in the wallet.
    assert _position(ctx) is None
    closed = PortfolioHoldings.query.filter_by(
        portfolio_id=ctx['portfolio'].portfolio_id,
        stock_id=ctx['stock'].stock_id,
        trade_mode=TradeMode.INTRADAY).order_by(
            PortfolioHoldings.holding_id.desc()).first()
    assert closed.is_active is False
    assert D(closed.realized_pnl) == D(200)      # (1100 - 1000) x 2

    w = _wallet(ctx)
    _assert_invariant(w)
    fee = D(2) * D(1100) * COMMISSION_RATE
    assert D(w.balance) == before + D(2200) - fee


def test_delivery_holdings_survive_the_close(flask_app, ctx, monkeypatch):
    """Delivery is owned outright with no same-day obligation — the sweep must
    not touch it."""
    _set_price(ctx, 1000)
    o = _order(ctx, OrderSide.BUY, 1, PositionEffect.OPEN)
    o.trade_mode = TradeMode.DELIVERY
    o.update()
    execute_order(o, D(1000), funds_locked=False)

    held = open_position(ctx['portfolio'].portfolio_id, ctx['stock'].stock_id,
                         TradeMode.DELIVERY)
    assert held is not None

    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: False)
    square_off_intraday_positions()

    db.session.expire_all()
    still = open_position(ctx['portfolio'].portfolio_id, ctx['stock'].stock_id,
                          TradeMode.DELIVERY)
    assert still is not None and still.is_active is True


def test_square_off_records_the_trade_in_history(flask_app, ctx, monkeypatch):
    """The settlement must be a real trade, not a silent balance adjustment: the
    user has to be able to see what closed their position and at what price."""
    from portal.models.transactions import Transactions
    from portal.models.trade_executions import TradeExecutions

    _set_price(ctx, 1000)
    execute_order(_order(ctx, OrderSide.BUY, 1, PositionEffect.OPEN),
                  D(1000), funds_locked=False)
    _set_price(ctx, 1050)

    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: False)
    square_off_intraday_positions()
    db.session.expire_all()

    closing = (TradeOrders.query
               .filter_by(user_id=ctx['user'].user_id, order_source='SYSTEM')
               .order_by(TradeOrders.order_id.desc()).first())
    assert closing is not None
    assert closing.order_status == OrderStatus.FILLED
    assert closing.order_side == OrderSide.SELL
    assert D(closing.avg_fill_price) == D(1050)

    # ...and it reached the ledgers a manual trade writes to.
    assert TradeExecutions.query.filter_by(order_id=closing.order_id).count() == 1
    assert Transactions.query.filter_by(order_id=closing.order_id).count() == 1


# ── Attached stop-loss ──────────────────────────────────────────────────────
# A stop-loss can sell a user's shares without them touching anything, so the
# rules about when it exists and when it fires are pinned here.

def _entry(ctx, side, quantity, stop_loss=None, effect=PositionEffect.OPEN):
    o = _order(ctx, side, quantity, effect)
    if stop_loss is not None:
        o.stop_loss_price = D(stop_loss)
        o.update()
    return o


def _child_of(order):
    db.session.expire_all()
    return TradeOrders.query.filter_by(parent_order_id=order.order_id).first()


def _flatten(ctx):
    """Close whatever is open so the next test starts from nothing."""
    pos = _position(ctx)
    if pos:
        side = OrderSide.BUY if pos.position_side == PositionSide.SHORT else OrderSide.SELL
        execute_order(_order(ctx, side, float(pos.quantity), PositionEffect.CLOSE),
                      D(ctx['stock'].current_price), funds_locked=False)
    for o in TradeOrders.query.filter(
            TradeOrders.order_status.in_([OrderStatus.PENDING, OrderStatus.OPEN])).all():
        o.order_status = OrderStatus.CANCELLED
        o.update()


def test_a_long_entry_arms_a_sell_stop_below_it(flask_app, ctx):
    _flatten(ctx)
    _set_price(ctx, 1000)
    entry = _entry(ctx, OrderSide.BUY, 5, stop_loss=950)
    assert execute_order(entry, D(1000), funds_locked=False) is not None

    sl = _child_of(entry)
    assert sl is not None, 'filling an entry with a stop loss must arm a real order'
    assert sl.order_side == OrderSide.SELL          # long exits by selling
    assert sl.order_type == OrderType.STOP
    assert D(sl.stop_price) == D(950)
    assert D(sl.quantity) == 5                       # the quantity actually filled
    assert sl.position_effect == PositionEffect.CLOSE
    assert sl.order_status == OrderStatus.PENDING
    assert sl.order_source == 'SYSTEM'


def test_a_short_entry_arms_a_buy_stop_above_it(flask_app, ctx):
    _flatten(ctx)
    _set_price(ctx, 1000)
    entry = _entry(ctx, OrderSide.SELL, 2, stop_loss=1060)
    assert execute_order(entry, D(1000), funds_locked=False) is not None

    sl = _child_of(entry)
    assert sl is not None
    assert sl.order_side == OrderSide.BUY            # a short exits by buying back
    assert D(sl.stop_price) == D(1060)


def test_no_stop_loss_means_no_child_order(flask_app, ctx):
    _flatten(ctx)
    _set_price(ctx, 1000)
    entry = _entry(ctx, OrderSide.BUY, 1)            # none attached
    execute_order(entry, D(1000), funds_locked=False)
    assert _child_of(entry) is None


def test_arming_is_idempotent(flask_app, ctx):
    """A retried fill must not leave two stops on one position — that would sell
    the shares twice."""
    from portal.helpers.order_engine import arm_stop_loss
    _flatten(ctx)
    _set_price(ctx, 1000)
    entry = _entry(ctx, OrderSide.BUY, 3, stop_loss=970)
    execute_order(entry, D(1000), funds_locked=False)

    assert arm_stop_loss(entry, D(3), 'OPEN_LONG') is None
    assert TradeOrders.query.filter_by(parent_order_id=entry.order_id).count() == 1


def test_the_stop_fires_and_closes_the_position(flask_app, ctx, monkeypatch):
    """The whole point: the user sets it once at entry and the engine does the
    rest, with no further action from them."""
    from portal.helpers.order_engine import process_pending_orders
    _flatten(ctx)
    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: True)

    _set_price(ctx, 1000)
    entry = _entry(ctx, OrderSide.BUY, 4, stop_loss=950)
    execute_order(entry, D(1000), funds_locked=False)
    assert _position(ctx) is not None

    # Above the stop — nothing happens.
    _set_price(ctx, 975)
    process_pending_orders()
    assert _position(ctx) is not None

    # Price hits the stop.
    _set_price(ctx, 950)
    process_pending_orders()

    assert _position(ctx) is None, 'the stop should have sold the position'
    sl = _child_of(entry)
    assert sl.order_status == OrderStatus.FILLED
    closed = PortfolioHoldings.query.filter_by(
        portfolio_id=ctx['portfolio'].portfolio_id, stock_id=ctx['stock'].stock_id,
        trade_mode=TradeMode.INTRADAY).order_by(PortfolioHoldings.holding_id.desc()).first()
    assert D(closed.realized_pnl) == D(-200)         # (950 - 1000) x 4


def test_a_stale_stop_cannot_open_a_short(flask_app, ctx, monkeypatch):
    """The dangerous case: the user sells out by hand, leaving the stop armed.
    On trigger it must be refused, not sail through the SELL path and open a
    brand-new short position in a stock they just exited."""
    from portal.helpers.order_engine import process_pending_orders
    _flatten(ctx)
    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: True)

    _set_price(ctx, 1000)
    entry = _entry(ctx, OrderSide.BUY, 2, stop_loss=900)
    execute_order(entry, D(1000), funds_locked=False)
    sl = _child_of(entry)
    assert sl is not None

    # User exits manually at a profit; the stop is still sitting there.
    execute_order(_order(ctx, OrderSide.SELL, 2, PositionEffect.CLOSE),
                  D(1100), funds_locked=False)
    assert _position(ctx) is None

    _set_price(ctx, 900)
    process_pending_orders()

    db.session.expire_all()
    sl = TradeOrders.query.get(sl.order_id)
    assert sl.order_status == OrderStatus.REJECTED
    assert 'already closed' in sl.rejection_reason.lower()
    assert _position(ctx) is None, 'a stale stop must never open a new position'


# ── Order validity: IOC ─────────────────────────────────────────────────────
# IOC never rests. It takes what can trade this instant and cancels the rest, so
# the thing to pin is exactly how much "what can trade" is — and that the
# remainder never survives as a pending order.

def _ioc(ctx, side, quantity, order_type=OrderType.MARKET, limit=None):
    from portal.models.trade_orders import OrderDuration
    o = _order(ctx, side, quantity, PositionEffect.OPEN)
    o.order_type     = order_type
    o.order_duration = OrderDuration.IOC
    if limit is not None:
        o.limit_price = D(limit)
    o.update()
    return o


def _set_wallet(ctx, balance):
    w = _wallet(ctx)
    w.balance           = D(balance)
    w.locked_balance    = D(0)
    w.available_balance = D(balance)
    w.update()


def test_ioc_fills_completely_when_the_money_is_there(flask_app, ctx):
    from portal.helpers.order_engine import execute_ioc
    _flatten(ctx); _set_wallet(ctx, 100000); _set_price(ctx, 1000)

    r = execute_ioc(_ioc(ctx, OrderSide.BUY, 5), D(1000))
    assert r['filled'] == 5
    assert r['cancelled'] == 0
    assert r['status'] == OrderStatus.FILLED
    assert D(_position(ctx).quantity) == 5


def test_ioc_fills_what_the_wallet_covers_and_cancels_the_rest(flask_app, ctx):
    """The partial case: 10 shares wanted at 1,000 with only ~3,000 to spend."""
    from portal.helpers.order_engine import execute_ioc
    _flatten(ctx); _set_wallet(ctx, 3100); _set_price(ctx, 1000)

    order = _ioc(ctx, OrderSide.BUY, 10)
    r = execute_ioc(order, D(1000))

    assert r['filled'] == 3, 'should buy the three it can afford'
    assert r['cancelled'] == 7
    assert r['status'] == OrderStatus.PARTIALLY_FILLED
    assert D(_position(ctx).quantity) == 3

    db.session.expire_all()
    o = TradeOrders.query.get(order.order_id)
    # Nothing left resting — that is the whole point of IOC.
    assert D(o.remaining_quantity) == 0
    assert o.order_status not in (OrderStatus.PENDING, OrderStatus.OPEN)
    assert D(o.quantity) == 10, 'the order still records what was asked for'
    assert D(o.filled_quantity) == 3
    assert '3' in o.rejection_reason and '7' in o.rejection_reason


def test_ioc_cancels_outright_when_nothing_is_affordable(flask_app, ctx):
    from portal.helpers.order_engine import execute_ioc
    _flatten(ctx); _set_wallet(ctx, 10); _set_price(ctx, 1000)

    r = execute_ioc(_ioc(ctx, OrderSide.BUY, 5), D(1000))
    assert r['filled'] == 0
    assert r['cancelled'] == 5
    assert r['status'] == OrderStatus.CANCELLED
    assert _position(ctx) is None


def test_ioc_sell_is_capped_by_the_shares_actually_held(flask_app, ctx):
    from portal.helpers.order_engine import execute_ioc
    _flatten(ctx); _set_wallet(ctx, 100000); _set_price(ctx, 1000)

    # Own 4, try to sell 9 as a CLOSE — only 4 can trade.
    execute_order(_order(ctx, OrderSide.BUY, 4, PositionEffect.OPEN), D(1000), funds_locked=False)
    o = _ioc(ctx, OrderSide.SELL, 9)
    o.position_effect = PositionEffect.CLOSE
    o.update()

    r = execute_ioc(o, D(1000))
    assert r['filled'] == 4
    assert r['cancelled'] == 5
    assert r['status'] == OrderStatus.PARTIALLY_FILLED
    assert _position(ctx) is None, 'selling everything held closes the position'


def test_ioc_limit_cancels_when_the_market_is_not_at_the_price(flask_app, ctx):
    """An IOC never waits for the price to come to it."""
    from portal.helpers.order_engine import execute_ioc
    _flatten(ctx); _set_wallet(ctx, 100000); _set_price(ctx, 1000)

    # Bid 900 while the market is 1,000 — unfillable right now.
    r = execute_ioc(_ioc(ctx, OrderSide.BUY, 2, OrderType.LIMIT, limit=900), D(1000))
    assert r['filled'] == 0
    assert r['status'] == OrderStatus.CANCELLED
    assert _position(ctx) is None


def test_ioc_limit_fills_when_the_market_is_already_through_the_price(flask_app, ctx):
    from portal.helpers.order_engine import execute_ioc
    _flatten(ctx); _set_wallet(ctx, 100000); _set_price(ctx, 950)

    r = execute_ioc(_ioc(ctx, OrderSide.BUY, 2, OrderType.LIMIT, limit=1000), D(950))
    assert r['filled'] == 2
    assert r['status'] == OrderStatus.FILLED


def test_an_ioc_order_is_never_re_filled_later(flask_app, ctx, monkeypatch):
    """The one that matters. A partially filled IOC stays PARTIALLY_FILLED — the
    user asked for that state to be visible — but PARTIALLY_FILLED is in
    _OPEN_STATUSES, so without a guard the engine would come back later and fill
    the remainder it had already told the user was cancelled."""
    from portal.helpers.order_engine import execute_ioc, process_pending_orders
    monkeypatch.setattr(mc, 'is_market_open', lambda *a, **k: True)
    _flatten(ctx); _set_wallet(ctx, 3100); _set_price(ctx, 1000)

    # A LIMIT IOC, because those are the types the engine actually scans.
    order = _ioc(ctx, OrderSide.BUY, 10, OrderType.LIMIT, limit=1000)
    r = execute_ioc(order, D(1000))
    assert r['status'] == OrderStatus.PARTIALLY_FILLED
    filled_then = D(_position(ctx).quantity)

    # Give it every chance: money back in the wallet, price still at the limit.
    _set_wallet(ctx, 100000)
    process_pending_orders()

    db.session.expire_all()
    assert D(_position(ctx).quantity) == filled_then, 'the cancelled remainder must never fill'
    assert D(TradeOrders.query.get(order.order_id).filled_quantity) == filled_then


def test_no_ioc_order_is_left_resting_with_quantity_outstanding(flask_app, ctx):
    """Whatever the outcome, an IOC leaves nothing for the engine to act on."""
    from portal.helpers.order_engine import execute_ioc, _OPEN_STATUSES
    _flatten(ctx); _set_wallet(ctx, 3100); _set_price(ctx, 1000)

    for qty in (2, 10, 500):
        execute_ioc(_ioc(ctx, OrderSide.BUY, qty), D(1000))

    db.session.expire_all()
    actionable = TradeOrders.query.filter(
        TradeOrders.order_status.in_(_OPEN_STATUSES),
        TradeOrders.remaining_quantity > 0,
        TradeOrders.order_duration == 'IOC').count()
    assert actionable == 0


def test_fok_refuses_a_partial_rather_than_taking_it(flask_app, ctx):
    """FOK is accepted by the API, so it needs real behaviour — otherwise it
    validates as legal and quietly acts like a DAY order."""
    from portal.helpers.order_engine import execute_ioc
    _flatten(ctx); _set_wallet(ctx, 3100); _set_price(ctx, 1000)

    r = execute_ioc(_ioc(ctx, OrderSide.BUY, 10), D(1000), all_or_none=True)
    assert r['filled'] == 0, 'FOK must not part-fill'
    assert r['cancelled'] == 10
    assert r['status'] == OrderStatus.CANCELLED
    assert _position(ctx) is None


def test_fok_fills_when_the_whole_quantity_is_affordable(flask_app, ctx):
    from portal.helpers.order_engine import execute_ioc
    _flatten(ctx); _set_wallet(ctx, 100000); _set_price(ctx, 1000)

    r = execute_ioc(_ioc(ctx, OrderSide.BUY, 3), D(1000), all_or_none=True)
    assert r['filled'] == 3
    assert r['status'] == OrderStatus.FILLED
