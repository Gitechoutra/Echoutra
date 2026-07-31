"""Trading-window enforcement: no order may be placed outside NSE hours.

The market calendar has always known when the market is shut; until now nothing
in the order path asked it, so an order placed at 9 PM on a Sunday was accepted
and — for a MARKET order — filled on the spot against a last traded price from
the previous session.

These tests pin the two halves of the fix:
  1. /trade_orders/place refuses outside continuous trading, in the exact words
     the product specified.
  2. A queued INTRADAY order is expired at the close instead of surviving into
     a session it was never meant to trade in.

Run:  pytest tests/test_trading_window.py -q
"""

import json
from datetime import datetime
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from portal.helpers import market_calendar as mc
from portal.helpers import order_engine
from portal.models.trade_orders import TradeOrders, OrderType, OrderSide, TradeMode


OPEN_NOW    = datetime(2026, 7, 17, 11, 0, tzinfo=mc.IST)   # Friday, mid-session
AFTER_CLOSE = datetime(2026, 7, 17, 20, 1,  tzinfo=mc.IST)  # one minute past the bell
PRE_OPEN    = datetime(2026, 7, 17, 9, 5,  tzinfo=mc.IST)   # pre-open session
WEEKEND     = datetime(2026, 7, 18, 11, 0, tzinfo=mc.IST)   # Saturday
HOLIDAY     = datetime(2026, 1, 26, 11, 0, tzinfo=mc.IST)   # Republic Day


@pytest.fixture(scope='module')
def app():
    from app import app as flask_app
    flask_app.config['TESTING'] = True
    return flask_app


@pytest.fixture
def client(app):
    with app.test_client() as c:
        yield c


def auth(app):
    with app.app_context():
        tok = create_access_token(identity='1', additional_claims={'role': 'USER'})
    return {'Authorization': f'Bearer {tok}'}


def place(client, app, **overrides):
    """POST a well-formed order. `stock_id` is deliberately one that does not
    exist: the market gate runs before any lookup, so a blocked response proves
    the gate fired rather than some later validation."""
    body = {
        'stock_id':   999_999_999,
        'order_side': OrderSide.BUY,
        'order_type': OrderType.MARKET,
        'quantity':   1,
        'trade_mode': TradeMode.DELIVERY,
        **overrides,
    }
    res = client.post('/v1/trade_orders/place', json=body, headers=auth(app))
    return json.loads(res.data)


# ── The gate ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('when,label', [
    (AFTER_CLOSE, 'after the close'),
    (PRE_OPEN,    'during pre-open'),
    (WEEKEND,     'on a Saturday'),
    (HOLIDAY,     'on a trading holiday'),
])
def test_intraday_order_is_refused_outside_market_hours(client, app, when, label):
    with patch.object(mc, 'now_ist', return_value=when):
        data = place(client, app, trade_mode=TradeMode.INTRADAY)

    assert data['bool'] is False, f'intraday order was accepted {label}'
    assert data['status'] == 403
    assert data['response']['message'] == mc.INTRADAY_CLOSED_MESSAGE


def test_the_refusal_uses_the_specified_wording(client, app):
    with patch.object(mc, 'now_ist', return_value=AFTER_CLOSE):
        msg = place(client, app, trade_mode=TradeMode.INTRADAY)['response']['message']

    assert msg == (
        'Market is currently closed. Intraday trading is available only during '
        f'official market hours ({mc.SESSION_WINDOW}).'
    )
    # Spelt out once, so a typo in the template is still caught.
    assert msg.endswith(f'({mc.OPEN_LABEL} – {mc.CLOSE_LABEL} IST, Monday to Friday).')


def test_delivery_order_is_refused_too(client, app):
    """A DELIVERY order is MARKET-only and fills immediately, so accepting one
    after hours books a real wallet debit at a stale price."""
    with patch.object(mc, 'now_ist', return_value=AFTER_CLOSE):
        data = place(client, app, trade_mode=TradeMode.DELIVERY)

    assert data['bool'] is False
    assert data['response']['message'] == mc.TRADING_CLOSED_MESSAGE


def test_refusal_tells_the_user_when_to_come_back(client, app):
    with patch.object(mc, 'now_ist', return_value=WEEKEND):
        r = place(client, app, trade_mode=TradeMode.INTRADAY)['response']

    assert r['market_state'] == mc.WEEKEND
    # Saturday -> Monday's bell, not "tomorrow".
    assert r['next_open'].startswith('2026-07-20T09:15')


def test_holiday_refusal_names_the_holiday(client, app):
    with patch.object(mc, 'now_ist', return_value=HOLIDAY):
        r = place(client, app, trade_mode=TradeMode.INTRADAY)['response']

    assert r['market_state'] == mc.HOLIDAY
    assert r['holiday_name'] == 'Republic Day'


def test_orders_pass_the_gate_during_the_session(client, app):
    """The gate must not be a blanket block: mid-session the request gets through
    to the normal order path (and fails on the bogus stock_id, not on hours)."""
    with patch.object(mc, 'now_ist', return_value=OPEN_NOW):
        data = place(client, app, trade_mode=TradeMode.INTRADAY)

    assert data['status'] == 404
    assert data['response']['message'] == 'Stock not found.'


# ── Queued intraday orders at the close ─────────────────────────────────────

def _order(trade_mode):
    o = TradeOrders()
    o.order_type = OrderType.LIMIT
    o.order_side = OrderSide.BUY
    o.trade_mode = trade_mode
    return o


def test_queued_intraday_order_dies_when_the_market_shuts():
    assert order_engine._expires_at_close(_order(TradeMode.INTRADAY), market_open=False) is True


def test_queued_intraday_order_survives_while_the_market_is_open():
    assert order_engine._expires_at_close(_order(TradeMode.INTRADAY), market_open=True) is False


def test_delivery_orders_are_not_touched_by_the_close_rule():
    """Delivery is a cash-and-carry position with no same-day obligation; only
    the DAY/GTC duration rules apply to it."""
    assert order_engine._expires_at_close(_order(TradeMode.DELIVERY), market_open=False) is False


def test_legacy_rows_without_a_trade_mode_are_treated_as_delivery():
    """trade_mode was added later; pre-existing rows have NULL and must not be
    silently cancelled at the next close."""
    assert order_engine._expires_at_close(_order(None), market_open=False) is False
