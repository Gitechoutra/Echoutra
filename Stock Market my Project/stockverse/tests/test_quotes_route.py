"""/stocks/quotes — the single poll every price on screen is driven from.

The whole front end reads prices through this one endpoint, so its contract
matters more than its size: every active stock in one response, price fields
that survive being exactly zero, and market state attached to the same payload
so a price and its freshness badge can never come from different moments.

Run:  pytest tests/test_quotes_route.py -q
"""

import json
from datetime import datetime
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from portal.helpers import market_calendar as mc
from portal.helpers import market_data as md


OPEN_NOW   = datetime(2026, 7, 17, 11, 0, tzinfo=mc.IST)   # Friday, mid-session
CLOSED_NOW = datetime(2026, 7, 17, 21, 0, tzinfo=mc.IST)   # Friday, after the close


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


def get_quotes(client, app, query=''):
    res = client.get(f'/v1/stocks/quotes{query}', headers=auth(app))
    return json.loads(res.data)['response']


def _healthy():
    return {'token_state': md.TOKEN_OK, 'healthy': True, 'rate_limited': False,
            'last_success_at': None, 'last_failure_at': None, 'last_error': None,
            'consecutive_failures': 0, 'rate_limited_until': None}


def _dead_feed():
    return {**_healthy(), 'token_state': md.TOKEN_EXPIRED, 'healthy': False}


def test_requires_auth(client):
    assert client.get('/v1/stocks/quotes').status_code == 401


def test_returns_every_active_stock_with_its_price(client, app):
    r = get_quotes(client, app)
    assert r['count'] == len(r['quotes'])
    assert r['count'] > 0, 'seed data should provide active stocks'

    q = r['quotes'][0]
    for field in ('stock_id', 'ticker_symbol', 'current_price', 'previous_close',
                  'price_change', 'price_change_percent', 'day_high', 'day_low',
                  'volume', 'last_price_update'):
        assert field in q, f'{field} missing — a consumer of this field would render blank'


def test_can_be_narrowed_by_symbol_and_by_id(client, app):
    everything = get_quotes(client, app)['quotes']
    first = everything[0]

    by_symbol = get_quotes(client, app, f"?symbols={first['ticker_symbol']}")
    assert by_symbol['count'] == 1
    assert by_symbol['quotes'][0]['ticker_symbol'] == first['ticker_symbol']

    by_id = get_quotes(client, app, f"?ids={first['stock_id']}")
    assert by_id['count'] == 1
    assert by_id['quotes'][0]['stock_id'] == first['stock_id']


def test_unknown_filters_return_nothing_rather_than_everything(client, app):
    """A typo'd symbol must not silently fall back to the full list."""
    assert get_quotes(client, app, '?symbols=NOSUCHTICKER')['count'] == 0
    assert get_quotes(client, app, '?ids=999999999')['count'] == 0


def test_a_flat_stock_reports_zero_change_not_null(client, app):
    """`float(v) if v else None` turns a genuine 0 into null, which the UI then
    renders as a blank cell instead of '0.00'. The endpoint uses an explicit
    None check instead."""
    from portal.routes.stocks.routes import _f
    assert _f(0) == 0.0
    assert _f(None) is None


def test_market_state_travels_with_the_prices(client, app):
    with patch.object(mc, 'now_ist', return_value=OPEN_NOW), \
         patch.object(md, 'health', return_value=_healthy()):
        r = get_quotes(client, app)

    assert r['market_state'] == 'OPEN'
    assert r['is_open'] is True
    assert r['prices_are_live'] is True
    assert r['poll_interval_ms'] == 10_000


def test_closed_market_tells_the_client_to_back_off(client, app):
    with patch.object(mc, 'now_ist', return_value=CLOSED_NOW), \
         patch.object(md, 'health', return_value=_healthy()):
        r = get_quotes(client, app)

    assert r['is_open'] is False
    assert r['prices_are_live'] is False
    # Nothing can move until the next session — don't hammer the API for it.
    assert r['poll_interval_ms'] == 60_000


def test_open_market_with_a_dead_feed_is_not_live(client, app):
    """Same rule /stocks/market_status enforces: an open market plus a broken
    feed is NOT live, and the stored price is a stale one."""
    with patch.object(mc, 'now_ist', return_value=OPEN_NOW), \
         patch.object(md, 'health', return_value=_dead_feed()):
        r = get_quotes(client, app)

    assert r['is_open'] is True
    assert r['prices_are_live'] is False


def test_quotes_and_market_status_agree(client, app):
    """Both endpoints are polled by the same client; if they disagreed the UI
    would show a live badge over stale prices, or vice versa."""
    with patch.object(mc, 'now_ist', return_value=OPEN_NOW), \
         patch.object(md, 'health', return_value=_dead_feed()):
        q = get_quotes(client, app)
        s = json.loads(client.get('/v1/stocks/market_status', headers=auth(app)).data)['response']

    assert q['market_state']    == s['state']
    assert q['is_open']         == s['is_open']
    assert q['prices_are_live'] == s['prices_are_live']
    assert q['poll_interval_ms'] == s['poll_interval_ms']
