"""What counts as an "Open Position" on the dashboard.

Deliberately narrower than "an active holding", and the narrowing is what makes
the card self-resetting: only INTRADAY, only still open, only opened during the
CURRENT IST trading day. Get any one of those wrong and the card either counts
shares the user owns outright, or carries yesterday's positions forward forever.

Run:  pytest tests/test_open_positions.py -q
"""

from datetime import datetime, timedelta, timezone

import pytest

import app as _app  # noqa: F401  — registers the models
from portal.helpers import market_calendar as mc
from portal.models.portfolio_holdings import PortfolioHoldings, PositionSide
from portal.routes.portfolios.routes import _is_open_position_today, _traded_quantity


NOW_IST = datetime(2026, 8, 4, 14, 30, tzinfo=mc.IST)   # Tuesday afternoon


def holding(**kw):
    h = PortfolioHoldings()
    h.trade_mode      = kw.get('trade_mode', 'INTRADAY')
    h.is_active       = kw.get('is_active', True)
    h.first_bought_at = kw.get('first_bought_at', NOW_IST.astimezone(timezone.utc))
    h.position_side   = kw.get('position_side', PositionSide.LONG)
    h.quantity        = kw.get('quantity', 1)
    h.average_buy_price = kw.get('average_buy_price', 100)
    h.total_invested  = kw.get('total_invested', 100)
    return h


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    monkeypatch.setattr(mc, 'now_ist', lambda *a, **k: NOW_IST)


def test_an_intraday_position_opened_today_counts():
    assert _is_open_position_today(holding()) is True


def test_delivery_never_counts():
    """Shares owned outright are Holdings, not an open position — this is the
    bug the card had: it counted every active holding."""
    assert _is_open_position_today(holding(trade_mode='DELIVERY')) is False


def test_a_closed_position_does_not_count():
    assert _is_open_position_today(holding(is_active=False)) is False


def test_yesterdays_intraday_does_not_count():
    """Squared off at the close, so it is history. Without this the card would
    keep growing and never reset."""
    yesterday = (NOW_IST - timedelta(days=1)).astimezone(timezone.utc)
    assert _is_open_position_today(holding(first_bought_at=yesterday)) is False


def test_the_count_resets_on_its_own_at_the_next_session(monkeypatch):
    """Same row, next trading day: it stops counting with nothing cleared down."""
    h = holding()
    assert _is_open_position_today(h) is True

    monkeypatch.setattr(mc, 'now_ist', lambda *a, **k: NOW_IST + timedelta(days=1))
    assert _is_open_position_today(h) is False


def test_a_position_opened_earlier_today_still_counts():
    """Opened at the bell, checked in the afternoon — same trading day."""
    morning = NOW_IST.replace(hour=9, minute=20).astimezone(timezone.utc)
    assert _is_open_position_today(holding(first_bought_at=morning)) is True


def test_a_short_opened_today_counts_too():
    assert _is_open_position_today(holding(position_side=PositionSide.SHORT)) is True


def test_a_naive_timestamp_is_read_as_utc_not_local():
    """The DB stores naive UTC. Reading it as local time would shift the day
    boundary by 5½ hours and mis-bucket anything traded near the open."""
    # 20:00 UTC on the 3rd is 01:30 IST on the 4th — today in IST.
    naive = datetime(2026, 8, 3, 20, 0)
    assert _is_open_position_today(holding(first_bought_at=naive)) is True

    # 18:00 UTC on the 2nd is 23:30 IST on the 2nd — not today.
    assert _is_open_position_today(holding(first_bought_at=datetime(2026, 8, 2, 18, 0))) is False


def test_a_row_with_no_open_timestamp_is_not_guessed_at():
    assert _is_open_position_today(holding(first_bought_at=None)) is False


# ── Traded quantity ─────────────────────────────────────────────────────────

def test_open_positions_report_their_live_quantity():
    assert _traded_quantity(holding(quantity=7)) == 7


def test_closed_positions_report_the_size_they_traded():
    """`quantity` is 0 once closed, which renders as "0 shares" against a trade
    that plainly happened. Cost ÷ entry recovers it."""
    h = holding(is_active=False, quantity=0, average_buy_price=1307, total_invested=3921)
    assert _traded_quantity(h) == 3


def test_a_closed_position_with_no_cost_basis_reports_zero_not_a_crash():
    h = holding(is_active=False, quantity=0, average_buy_price=0, total_invested=0)
    assert _traded_quantity(h) == 0.0
