"""Live-feed health tests.

The bug these exist to prevent: a token that has expired overnight leaves the
app reporting live_data_enabled=true while every quote 401s, so users see
yesterday's close presented as the live market price. Health must reflect what
the API actually did, not merely that a token string is present.

Run:  pytest tests/test_market_data_health.py -q
"""

from unittest.mock import MagicMock, patch

import pytest

from portal.helpers import market_data as md


@pytest.fixture(autouse=True)
def reset_health():
    """Health is module-level state; isolate every test from the last one."""
    md._set_health(
        token_state=md.TOKEN_MISSING, last_success_at=None, last_failure_at=None,
        last_error=None, consecutive_failures=0, rate_limited_until=None,
    )
    yield


def _resp(status_code, payload):
    r = MagicMock()
    r.status_code = status_code
    r.json.return_value = payload
    return r


SUCCESS_PAYLOAD = {
    'status': 'success',
    'data': {'NSE_EQ:RELIANCE': {
        'instrument_token': 'NSE_EQ|INE002A01018',
        'last_price': 1234.5,
        'net_change': 10.0,
        'ohlc': {'open': 1220.0, 'high': 1240.0, 'low': 1210.0},
        'volume': 5000,
    }},
}

ERR_401 = {'status': 'error', 'errors': [{'message': 'Invalid token used to access API'}]}
ERR_429 = {'status': 'error', 'errors': [{'message': 'Too many requests'}]}


# ── Token presence is not token health ──────────────────────────────────────

def test_configured_does_not_mean_healthy():
    """The exact production failure: a token exists, so is_configured() is True,
    but it 401s and the feed is dead."""
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 'expired-token'}), \
         patch.object(md.requests, 'get', return_value=_resp(401, ERR_401)):
        assert md.is_configured() is True          # a token string is present
        res = md._fetch_quotes(['NSE_EQ|INE002A01018'])
        assert res['ok'] is False

        # health() re-reads the env each call, so it must be asserted while the
        # token is still configured -- outside this block there is no token at
        # all, which is a different state (MISSING, not EXPIRED).
        h = md.health()
        assert h['token_state'] == md.TOKEN_EXPIRED
        assert h['healthy'] is False               # ...and health says so


def test_missing_token_reports_missing():
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': ''}):
        res = md._fetch_quotes(['k'])
        assert res['ok'] is False
        assert md.health()['token_state'] == md.TOKEN_MISSING
        assert md.health()['healthy'] is False


# ── Success path ────────────────────────────────────────────────────────────

def test_success_marks_feed_healthy():
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 'good'}), \
         patch.object(md.requests, 'get', return_value=_resp(200, SUCCESS_PAYLOAD)):
        res = md._fetch_quotes(['NSE_EQ|INE002A01018'])
        assert res['ok'] is True
        h = md.health()
        assert h['token_state'] == md.TOKEN_OK
        assert h['healthy'] is True
        assert h['consecutive_failures'] == 0
        assert h['last_success_at'] is not None
        assert md.seconds_since_last_success() < 5


def test_health_reports_missing_once_the_token_is_removed():
    """Health tracks the env live: pulling the token turns a previously OK feed
    into MISSING without needing another API call."""
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 'good'}), \
         patch.object(md.requests, 'get', return_value=_resp(200, SUCCESS_PAYLOAD)):
        md._fetch_quotes(['NSE_EQ|INE002A01018'])
        assert md.health()['token_state'] == md.TOKEN_OK
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': ''}):
        assert md.health()['token_state'] == md.TOKEN_MISSING
        assert md.health()['healthy'] is False


def test_recovery_clears_the_expired_flag():
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 't'}):
        with patch.object(md.requests, 'get', return_value=_resp(401, ERR_401)):
            md._fetch_quotes(['k'])
        assert md.health()['token_state'] == md.TOKEN_EXPIRED

        # A regenerated token must flip health back without a restart.
        with patch.object(md.requests, 'get', return_value=_resp(200, SUCCESS_PAYLOAD)):
            md._fetch_quotes(['NSE_EQ|INE002A01018'])
        assert md.health()['token_state'] == md.TOKEN_OK
        assert md.health()['healthy'] is True


# ── Rate limiting ───────────────────────────────────────────────────────────

def test_429_sets_backoff_and_short_circuits_next_call():
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 't'}):
        with patch.object(md.requests, 'get', return_value=_resp(429, ERR_429)) as g:
            md._fetch_quotes(['k'])
            assert g.call_count == 1
        assert md.is_rate_limited() is True
        assert md.health()['rate_limited'] is True
        assert md.health()['healthy'] is False

        # Inside the backoff window we must not hit the API again.
        with patch.object(md.requests, 'get') as g2:
            res = md._fetch_quotes(['k'])
            assert g2.call_count == 0
        assert res['ok'] is False
        assert res['code'] == 429


def test_backoff_expires():
    from datetime import datetime, timedelta, timezone
    md._set_health(rate_limited_until=datetime.now(timezone.utc) - timedelta(seconds=1))
    assert md.is_rate_limited() is False


# ── Network / malformed responses ───────────────────────────────────────────

def test_network_error_is_recorded_not_raised():
    import requests as rq
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 't'}), \
         patch.object(md.requests, 'get', side_effect=rq.RequestException('boom')):
        res = md._fetch_quotes(['k'])
    assert res['ok'] is False
    assert md.health()['healthy'] is False
    assert md.health()['consecutive_failures'] == 1


def test_non_json_response_is_handled():
    r = MagicMock()
    r.status_code = 502
    r.json.side_effect = ValueError('not json')
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 't'}), \
         patch.object(md.requests, 'get', return_value=r):
        res = md._fetch_quotes(['k'])
    assert res['ok'] is False
    assert md.health()['healthy'] is False


def test_consecutive_failures_accumulate():
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 't'}), \
         patch.object(md.requests, 'get', return_value=_resp(500, {'status': 'error'})):
        md._fetch_quotes(['k'])
        md._fetch_quotes(['k'])
    assert md.health()['consecutive_failures'] == 2


# ── refresh_stocks summary ──────────────────────────────────────────────────

def _stock(symbol='RELIANCE', isin='INE002A01018', exchange='NSE'):
    s = MagicMock()
    s.ticker_symbol = symbol
    s.isin = isin
    s.exchange = exchange
    s.week_52_high = 1
    s.week_52_low = 1
    return s


def test_refresh_stocks_separates_token_expiry_from_rate_limit():
    """These were one flag, so a 401 was reported to admins as a rate limit and
    the real remedy (regenerate the token) was never surfaced."""
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 't'}), \
         patch.object(md.requests, 'get', return_value=_resp(401, ERR_401)):
        summary = md.refresh_stocks([_stock()])
    assert summary['token_expired'] is True
    assert summary['rate_limited'] is False
    assert summary['updated'] == 0


def test_refresh_stocks_reports_rate_limit():
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 't'}), \
         patch.object(md.requests, 'get', return_value=_resp(429, ERR_429)):
        summary = md.refresh_stocks([_stock()])
    assert summary['rate_limited'] is True
    assert summary['token_expired'] is False


def test_refresh_stocks_stops_batching_after_401():
    """A dead token fails every batch identically; marching through them all
    just burns calls and delays the tick."""
    stocks = [_stock(f'S{i}', f'INE{i:09d}') for i in range(1000)]  # 3 batches
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 't'}), \
         patch.object(md.requests, 'get', return_value=_resp(401, ERR_401)) as g:
        summary = md.refresh_stocks(stocks)
    assert g.call_count == 1                     # bailed after the first 401
    assert summary['failed'] == len(stocks)      # ...but every stock is reported


def test_refresh_stocks_applies_live_quote():
    s = _stock()
    with patch.dict('os.environ', {'UPSTOX_ACCESS_TOKEN': 't'}), \
         patch.object(md.requests, 'get', return_value=_resp(200, SUCCESS_PAYLOAD)):
        summary = md.refresh_stocks([s])
    assert summary['updated'] == 1
    assert s.current_price == 1234.5
    assert s.day_high == 1240.0
    assert s.day_low == 1210.0
    assert s.volume == 5000
    assert s.previous_close == pytest.approx(1224.5)
    assert s.price_change == 10.0
    assert s.price_change_percent == pytest.approx(10.0 / 1224.5 * 100)


def test_refresh_stocks_flags_missing_isin():
    summary = md.refresh_stocks([_stock(isin=None)])
    assert summary['updated'] == 0
    assert 'ISIN' in summary['errors'][0]['error']
