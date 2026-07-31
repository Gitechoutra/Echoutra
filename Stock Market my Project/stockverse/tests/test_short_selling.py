"""Short selling — the money model.

Selling first and buying back later inverts every sign in the P&L, and it moves
cash in a way no other order does: the proceeds are never credited, they become
locked collateral. Getting a sign wrong here pays a user for a loss, so the
arithmetic is pinned directly rather than inferred from a browser session.

The end-to-end wallet story for one short, at 0.1% commission:

    open  1 @ 14,252   fee 14.252   balance -14.25   locked +14,252
    cover 1 @ 14,000   fee 14.000   balance +252 - 14.00 = +238
    net                                       +223.75  (= 252 - 14.25 - 14.00)

Run:  pytest tests/test_short_selling.py -q
"""

from decimal import Decimal

import pytest

# Importing the app registers every model, so SQLAlchemy can configure its
# mappers. Without it, merely constructing a TradeOrders() raises — and this file
# would only pass when some other test happened to import the app first.
import app as _app  # noqa: F401

from portal.helpers import order_engine as oe
from portal.helpers.order_engine import (
    COMMISSION_RATE, position_pnl, settlement, short_margin, _reserved_at_placement,
)
from portal.models.portfolio_holdings import PositionSide
from portal.models.trade_orders import (
    TradeOrders, OrderType, OrderSide, PositionEffect,
)


D = lambda v: Decimal(str(v))   # noqa: E731


# ── Sign convention ─────────────────────────────────────────────────────────

def test_long_earns_when_the_price_rises():
    assert position_pnl(PositionSide.LONG, 100, 120, 10) == D(200)
    assert position_pnl(PositionSide.LONG, 100, 80, 10) == D(-200)


def test_short_earns_when_the_price_falls():
    """The whole point of the feature — and the inverse of the long case."""
    assert position_pnl(PositionSide.SHORT, 100, 80, 10) == D(200)
    assert position_pnl(PositionSide.SHORT, 100, 120, 10) == D(-200)


def test_long_and_short_are_exact_mirrors():
    for exit_px in (50, 99, 100, 101, 250):
        long_pnl  = position_pnl(PositionSide.LONG, 100, exit_px, 3)
        short_pnl = position_pnl(PositionSide.SHORT, 100, exit_px, 3)
        assert long_pnl == -short_pnl


def test_a_flat_position_earns_nothing_either_way():
    assert position_pnl(PositionSide.LONG, 100, 100, 7) == 0
    assert position_pnl(PositionSide.SHORT, 100, 100, 7) == 0


# ── Collateral ──────────────────────────────────────────────────────────────

def test_short_margin_is_the_full_notional():
    """100% collateral is what makes the buy-back funded however far the price
    runs against the user."""
    assert short_margin(1, 14252) == D(14252)
    assert short_margin(3, 100.5) == D('301.5')


# ── Cash movement, per action ───────────────────────────────────────────────

def test_opening_a_short_credits_nothing_and_locks_the_proceeds():
    bal, locked, fee = settlement('OPEN_SHORT', 1, 14252)
    assert fee == D(14252) * COMMISSION_RATE
    # Only the fee leaves the wallet; the proceeds are collateral, not cash.
    assert bal == -fee
    assert locked == D(14252)


def test_covering_a_profitable_short_releases_the_margin_and_pays_the_profit():
    bal, locked, fee = settlement('COVER_SHORT', 1, 14000, entry_price=14252)
    assert locked == D(-14252)            # exactly what the open locked
    assert bal == D(252) - fee            # profit less the buy-back fee


def test_covering_a_losing_short_debits_the_wallet():
    bal, locked, fee = settlement('COVER_SHORT', 1, 14500, entry_price=14252)
    assert locked == D(-14252)
    assert bal == D(-248) - fee
    assert bal < 0, 'a losing short must actually cost the user money'


def test_a_full_round_trip_nets_out_to_pnl_minus_both_fees():
    open_bal,  open_lock,  open_fee  = settlement('OPEN_SHORT', 1, 14252)
    close_bal, close_lock, close_fee = settlement('COVER_SHORT', 1, 14000, entry_price=14252)

    # Collateral is fully returned — nothing stays locked after a full cover.
    assert open_lock + close_lock == 0
    # Cash effect is the gross P&L less both commissions, and nothing else.
    assert open_bal + close_bal == D(252) - open_fee - close_fee


def test_long_actions_are_unchanged_by_the_short_work():
    """Regression guard: the existing buy/sell money path must be untouched."""
    bal, locked, fee = settlement('OPEN_LONG', 2, 100)
    assert bal == -(D(200) + fee) and locked == 0

    bal, locked, fee = settlement('CLOSE_LONG', 2, 100)
    assert bal == D(200) - fee and locked == 0


def test_partial_cover_releases_only_that_quantity_of_margin():
    """Short 10, cover 4: six-tenths of the collateral must stay locked."""
    _, opened, _ = settlement('OPEN_SHORT', 10, 100)
    _, freed,  _ = settlement('COVER_SHORT', 4, 90, entry_price=100)
    assert opened == D(1000)
    assert freed == D(-400)
    assert opened + freed == D(600)


def test_an_unknown_action_is_refused_rather_than_silently_moving_zero():
    with pytest.raises(ValueError):
        settlement('SOMETHING_ELSE', 1, 100)


# ── Which orders reserve funds ──────────────────────────────────────────────

def _order(side, otype, effect):
    o = TradeOrders()
    o.order_side      = side
    o.order_type      = otype
    o.position_effect = effect
    return o


def test_queued_orders_that_open_a_position_reserve_funds():
    assert _reserved_at_placement(_order(OrderSide.BUY,  OrderType.LIMIT, PositionEffect.OPEN))
    # A queued short entry reserves too — the margin can't be spent elsewhere
    # while the order waits.
    assert _reserved_at_placement(_order(OrderSide.SELL, OrderType.LIMIT, PositionEffect.OPEN))


def test_queued_orders_that_close_a_position_reserve_nothing():
    assert not _reserved_at_placement(_order(OrderSide.SELL, OrderType.STOP, PositionEffect.CLOSE))
    assert not _reserved_at_placement(_order(OrderSide.BUY,  OrderType.STOP, PositionEffect.CLOSE))


def test_market_orders_never_reserve():
    assert not _reserved_at_placement(_order(OrderSide.BUY,  OrderType.MARKET, PositionEffect.OPEN))
    assert not _reserved_at_placement(_order(OrderSide.SELL, OrderType.MARKET, PositionEffect.OPEN))


def test_legacy_rows_keep_the_old_buy_only_behaviour():
    """position_effect was added with this feature; rows written before it have
    NULL, and for those a queued BUY is the only thing that ever reserved."""
    assert _reserved_at_placement(_order(OrderSide.BUY, OrderType.LIMIT, None))
    assert not _reserved_at_placement(_order(OrderSide.SELL, OrderType.LIMIT, None))


# ── Position side helper ────────────────────────────────────────────────────

class _Holding:
    def __init__(self, side):
        self.position_side = side


def test_is_short_only_for_short_positions():
    assert oe.is_short(_Holding(PositionSide.SHORT)) is True
    assert oe.is_short(_Holding(PositionSide.LONG)) is False
    assert oe.is_short(_Holding(None)) is False      # legacy rows are long
    assert oe.is_short(None) is False                # no position at all
