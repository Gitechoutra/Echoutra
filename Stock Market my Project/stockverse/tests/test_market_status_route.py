"""End-to-end tests for /stocks/market_status.

This is the contract both portals depend on to decide whether to show a price
as live. The rule it must never break: prices_are_live requires an open market
AND a working feed.

Run:  pytest tests/test_market_status_route.py -q
"""

import json
from datetime import datetime
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from portal.helpers import market_calendar as mc
from portal.helpers import market_data as md


@pytest.fixture(scope='module')
def app():
    from app import app as flask_app
    flask_app.config['TESTING'] = True
    return flask_app


@pytest.fixture
def client(app):
    with app.test_client() as c:
        yield c


def auth(app, role='USER'):
    with app.app_context():
        tok = create_access_token(identity='1', additional_claims={'role': role})
    return {'Authorization': f'Bearer {tok}'}


def get_status(client, app, role='USER'):
    res = client.get('/v1/stocks/market_status', headers=auth(app, role))
    return json.loads(res.data)['response']


OPEN_NOW = datetime(2026, 7, 17, 11, 0, tzinfo=mc.IST)     # Friday, mid-session
CLOSED_NOW = datetime(2026, 7, 17, 21, 0, tzinfo=mc.IST)   # Friday, after the close
HOLIDAY_NOW = datetime(2026, 1, 26, 11, 0, tzinfo=mc.IST)  # Republic Day


def _healthy():
    return {'token_state': md.TOKEN_OK, 'healthy': True, 'rate_limited': False,
            'last_success_at': None, 'last_failure_at': None, 'last_error': None,
            'consecutive_failures': 0, 'rate_limited_until': None}


def _expired():
    return {**_healthy(), 'token_state': md.TOKEN_EXPIRED, 'healthy': False}


def _rate_limited():
    return {**_healthy(), 'rate_limited': True, 'healthy': False}


def test_requires_auth(client):
    res = client.get('/v1/stocks/market_status')
    assert res.status_code == 401


def test_open_market_with_healthy_feed_is_live(client, app):
    with patch.object(mc, 'now_ist', return_value=OPEN_NOW), \
         patch.object(md, 'health', return_value=_healthy()):
        s = get_status(client, app)
    assert s['state'] == 'OPEN'
    assert s['is_open'] is True
    assert s['prices_are_live'] is True
    assert s['stale_reason'] is None
    assert s['poll_interval_ms'] == 10_000


def test_open_market_with_expired_token_is_not_live(client, app):
    """The regression that matters: the market is moving, our feed is dead, and
    the app must NOT present the last stored price as the live market."""
    with patch.object(mc, 'now_ist', return_value=OPEN_NOW), \
         patch.object(md, 'health', return_value=_expired()):
        s = get_status(client, app)
    assert s['is_open'] is True            # market genuinely open...
    assert s['prices_are_live'] is False   # ...but we are not live
    assert 'token expired' in s['stale_reason'].lower()
    assert 'last traded price' in s['stale_reason'].lower()


def test_open_market_rate_limited_is_not_live(client, app):
    with patch.object(mc, 'now_ist', return_value=OPEN_NOW), \
         patch.object(md, 'health', return_value=_rate_limited()):
        s = get_status(client, app)
    assert s['prices_are_live'] is False
    assert 'rate limited' in s['stale_reason'].lower()


def test_closed_market_shows_last_traded_price(client, app):
    with patch.object(mc, 'now_ist', return_value=CLOSED_NOW), \
         patch.object(md, 'health', return_value=_healthy()):
        s = get_status(client, app)
    assert s['state'] == 'CLOSED'
    assert s['prices_are_live'] is False
    assert s['stale_reason'] == 'Market closed'
    # Poll slowly when nothing can change.
    assert s['poll_interval_ms'] == 60_000
    assert s['next_open'] is not None


def test_holiday_is_reported_with_its_name(client, app):
    with patch.object(mc, 'now_ist', return_value=HOLIDAY_NOW), \
         patch.object(md, 'health', return_value=_healthy()):
        s = get_status(client, app)
    assert s['state'] == 'HOLIDAY'
    assert s['prices_are_live'] is False
    assert s['holiday_name'] == 'Republic Day'


def test_user_and_admin_see_the_same_market_truth(client, app):
    """Both portals must agree on live-ness; only the ops detail differs."""
    with patch.object(mc, 'now_ist', return_value=OPEN_NOW), \
         patch.object(md, 'health', return_value=_expired()):
        u = get_status(client, app, role='USER')
        a = get_status(client, app, role='ADMIN')

    for key in ('state', 'is_open', 'prices_are_live', 'stale_reason',
                'poll_interval_ms', 'next_open'):
        assert u[key] == a[key], f'{key} differs between portals'

    # Admins additionally get the remedy detail; users don't need it.
    assert 'feed' in a and a['feed']['token_state'] == md.TOKEN_EXPIRED
    assert 'feed' not in u


def test_calendar_gap_is_surfaced(client, app):
    with patch.object(mc, 'now_ist', return_value=datetime(2099, 7, 17, 11, 0, tzinfo=mc.IST)), \
         patch.object(md, 'health', return_value=_healthy()):
        s = get_status(client, app)
    assert s['calendar_ok'] is False
    assert '2099' in s['calendar_warning']
