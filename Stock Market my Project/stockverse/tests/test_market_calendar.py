"""NSE trading calendar tests.

Every case pins a fixed datetime rather than using the wall clock, so the suite
gives the same answer at 3 AM as it does mid-session.

Run:  pytest tests/test_market_calendar.py -q
"""

from datetime import datetime, date, timedelta, timezone

import pytest

from portal.helpers import market_calendar as mc
from portal.helpers.market_calendar import (
    IST, OPEN, CLOSED, PRE_OPEN, WEEKEND, HOLIDAY,
)


def ist(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=IST)


# 2026-07-17 is a Friday; 2026-07-18/19 the weekend; 2026-07-20 a Monday.
FRI = (2026, 7, 17)
SAT = (2026, 7, 18)
SUN = (2026, 7, 19)
MON = (2026, 7, 20)


# ── Session boundaries ──────────────────────────────────────────────────────

@pytest.mark.parametrize('hh,mm,expected', [
    (8, 59, CLOSED),     # before pre-open
    (9, 0,  PRE_OPEN),   # pre-open starts
    (9, 14, PRE_OPEN),   # last pre-open minute
    (9, 15, OPEN),       # bell
    (12, 0, OPEN),
    (15, 29, OPEN),
    (19, 59, OPEN),
    (20, 0,  OPEN),      # close is inclusive
    (20, 1,  CLOSED),
    (23, 59, CLOSED),
])
def test_weekday_session_states(hh, mm, expected):
    assert mc.market_state(ist(*FRI, hh, mm)) == expected


def test_is_market_open_only_during_continuous_trading():
    assert mc.is_market_open(ist(*FRI, 10, 0)) is True
    # Pre-open collects orders but is not continuous trading -- prices must not
    # be presented as live.
    assert mc.is_market_open(ist(*FRI, 9, 5)) is False
    assert mc.is_market_open(ist(*FRI, 21, 0)) is False


# ── Weekends ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('day', [SAT, SUN])
def test_weekend_is_closed_even_during_trading_hours(day):
    assert mc.market_state(ist(*day, 11, 0)) == WEEKEND
    assert mc.is_market_open(ist(*day, 11, 0)) is False


# ── Holidays ────────────────────────────────────────────────────────────────

def test_holiday_is_closed_during_trading_hours():
    # Republic Day 2026 falls on a Monday -- a weekday check alone would call
    # this a trading day, which is exactly the old scheduler's bug.
    republic_day = ist(2026, 1, 26, 11, 0)
    assert republic_day.weekday() < 5, 'fixture must be a weekday to be meaningful'
    assert mc.market_state(republic_day) == HOLIDAY
    assert mc.is_market_open(republic_day) is False


def test_is_holiday_returns_name():
    assert mc.is_holiday(date(2026, 1, 26)) == 'Republic Day'
    assert mc.is_holiday(date(2026, 7, 17)) is None


def test_is_trading_day():
    assert mc.is_trading_day(date(*FRI)) is True
    assert mc.is_trading_day(date(*SAT)) is False
    assert mc.is_trading_day(date(2026, 1, 26)) is False


# ── next_open / next_close ──────────────────────────────────────────────────

def test_next_open_same_day_before_bell():
    assert mc.next_open(ist(*FRI, 7, 0)) == ist(*FRI, 9, 15)


def test_next_open_skips_the_weekend():
    # Friday after close -> Monday's bell, not Saturday.
    assert mc.next_open(ist(*FRI, 21, 0)) == ist(*MON, 9, 15)


def test_next_open_skips_a_holiday():
    # 2026-01-26 (Mon) is Republic Day, so Friday evening rolls to Tuesday.
    friday_before = ist(2026, 1, 23, 21, 0)
    assert mc.next_open(friday_before) == ist(2026, 1, 27, 9, 15)


def test_next_close_only_when_session_live():
    assert mc.next_close(ist(*FRI, 10, 0)) == ist(*FRI, 20, 0)
    assert mc.next_close(ist(*FRI, 9, 5)) == ist(*FRI, 20, 0)    # pre-open
    assert mc.next_close(ist(*FRI, 21, 0)) is None
    assert mc.next_close(ist(*SAT, 11, 0)) is None


def test_next_open_is_bounded_when_calendar_is_absurd(monkeypatch):
    """A stale/garbage holiday table must not spin next_open() forever."""
    every_day = {d: 'x' for d in
                 (date(2026, 7, 17) + timedelta(days=i) for i in range(400))}
    monkeypatch.setitem(mc.TRADING_HOLIDAYS, 2026, every_day)
    monkeypatch.setitem(mc.TRADING_HOLIDAYS, 2027, every_day)
    assert mc.next_open(ist(*FRI, 21, 0)) is None    # gives up rather than hangs


# ── Timezone correctness ────────────────────────────────────────────────────

def test_utc_input_is_converted_to_ist():
    # 06:00 UTC == 11:30 IST -> open. A naive UTC comparison would call it closed.
    utc_morning = datetime(2026, 7, 17, 6, 0, tzinfo=timezone.utc)
    assert mc.market_state(utc_morning) == OPEN


def test_naive_datetime_is_treated_as_ist():
    assert mc.market_state(datetime(2026, 7, 17, 11, 0)) == OPEN


# ── Calendar health ─────────────────────────────────────────────────────────

def test_calendar_health_ok_for_covered_year():
    h = mc.holiday_calendar_health(ist(*FRI, 11, 0))
    assert h['ok'] is True
    assert h['message'] is None


def test_calendar_health_flags_uncovered_year():
    """The table must announce when it has aged out rather than silently
    treating every holiday as a trading day."""
    h = mc.holiday_calendar_health(datetime(2099, 1, 1, tzinfo=IST))
    assert h['ok'] is False
    assert '2099' in h['message']


# ── describe() — the API/UI payload ─────────────────────────────────────────

def test_describe_open_session():
    d = mc.describe(ist(*FRI, 11, 0))
    assert d['state'] == OPEN
    assert d['is_open'] is True
    assert d['holiday_name'] is None
    assert d['next_close'] == ist(*FRI, 20, 0).isoformat()


def test_describe_holiday_names_the_holiday():
    d = mc.describe(ist(2026, 1, 26, 11, 0))
    assert d['state'] == HOLIDAY
    assert d['is_open'] is False
    assert d['holiday_name'] == 'Republic Day'


def test_describe_weekend_points_at_next_open():
    d = mc.describe(ist(*SAT, 11, 0))
    assert d['is_open'] is False
    assert d['next_open'] == ist(*MON, 9, 15).isoformat()


# ── trading_blocked_reason() — the order-placement gate ─────────────────────

@pytest.mark.parametrize('mode', ['DELIVERY', 'INTRADAY'])
def test_trading_allowed_during_continuous_session(mode):
    assert mc.trading_blocked_reason(mode, ist(*FRI, 9, 15)) is None
    assert mc.trading_blocked_reason(mode, ist(*FRI, 12, 0)) is None
    assert mc.trading_blocked_reason(mode, ist(*FRI, 20, 0)) is None


@pytest.mark.parametrize('when', [
    ist(*FRI, 8, 59),    # before pre-open
    ist(*FRI, 9, 5),     # pre-open: orders collected by the exchange, not by us
    ist(*FRI, 20, 1),    # one minute after the bell
    ist(*FRI, 23, 30),   # late evening
    ist(*SAT, 11, 0),    # weekend
    ist(2026, 1, 26, 11, 0),   # Republic Day
])
def test_intraday_is_blocked_outside_the_session(when):
    reason = mc.trading_blocked_reason('INTRADAY', when)
    assert reason == mc.INTRADAY_CLOSED_MESSAGE
    # The wording the product asked for, verbatim.
    assert reason.startswith('Market is currently closed.')
    assert 'Intraday trading is available only during official market hours' in reason
    # Quoted from the constants, so this follows a change to the trading window.
    assert mc.OPEN_LABEL in reason and mc.CLOSE_LABEL in reason
    assert 'IST' in reason
    assert 'Monday to Friday' in reason


def test_delivery_is_blocked_outside_the_session_with_its_own_wording():
    """Delivery fills instantly at stock.current_price, so accepting one after
    hours would execute against a price the market has stopped quoting."""
    reason = mc.trading_blocked_reason('DELIVERY', ist(*FRI, 21, 0))
    assert reason == mc.TRADING_CLOSED_MESSAGE
    assert 'Intraday' not in reason


def test_unknown_mode_falls_back_to_the_general_message():
    assert mc.trading_blocked_reason(None, ist(*SAT, 11, 0)) == mc.TRADING_CLOSED_MESSAGE
    assert mc.trading_blocked_reason('intraday', ist(*SAT, 11, 0)) == mc.INTRADAY_CLOSED_MESSAGE


def test_describe_carries_the_trading_gate_for_the_ui():
    live = mc.describe(ist(*FRI, 11, 0))
    assert live['trading_allowed'] is True
    assert live['trading_blocked_reason'] is None
    assert live['intraday_blocked_reason'] is None

    shut = mc.describe(ist(*FRI, 21, 0))
    assert shut['trading_allowed'] is False
    assert shut['trading_blocked_reason'] == mc.TRADING_CLOSED_MESSAGE
    assert shut['intraday_blocked_reason'] == mc.INTRADAY_CLOSED_MESSAGE
