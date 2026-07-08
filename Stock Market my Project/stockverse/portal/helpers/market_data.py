"""
portal/helpers/market_data.py
=============================
Live market-data client backed by Twelve Data (https://twelvedata.com).

Architecture
------------
The user side never calls Twelve Data directly (the free tier is rate-limited to
a handful of requests per minute). Instead the admin triggers a refresh which
pulls live quotes into the `stocks` table, and every user page reads those
cached prices from our own DB — so users see live-ish prices in real time
without ever touching (or exhausting) the upstream API quota.

Public API
----------
* `is_configured()`                  → bool, True when an API key is available
* `fetch_quote(symbol)`              → normalized quote dict for one symbol
* `refresh_stock(stock)`             → fetch + write live data onto one Stocks row (no commit)
* `refresh_stocks(stocks)`           → refresh many; returns a summary dict
"""

import os
import re
import logging
import traceback
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

_TIMEOUT = 10  # seconds per HTTP call


def _base_url():
    return os.environ.get('TWELVE_DATA_BASE_URL', 'https://api.twelvedata.com').rstrip('/')


def get_api_key():
    """
    Resolve the Twelve Data API key. Prefers the dedicated TWELVE_DATA_API_KEY
    env var, but falls back to parsing it out of APP_SECRET_KEY for backward
    compatibility (the key was originally pasted there as a full URL).
    """
    key = (os.environ.get('TWELVE_DATA_API_KEY') or '').strip()
    if key:
        return key
    legacy = os.environ.get('APP_SECRET_KEY', '') or ''
    m = re.search(r'apikey=([A-Za-z0-9]+)', legacy)
    return m.group(1) if m else None


def is_configured():
    return bool(get_api_key())


def td_symbol(stock):
    """
    Build the Twelve Data symbol for a Stocks row.

    Twelve Data disambiguates listings with `TICKER:EXCHANGE` (e.g. `INFY:NSE`).
    When no exchange is stored we fall back to the bare ticker.
    """
    ticker = (stock.ticker_symbol or '').strip().upper()
    exch   = (stock.exchange or '').strip().upper()
    return f"{ticker}:{exch}" if exch else ticker


def _to_float(v):
    try:
        if v in (None, '', 'null'):
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _to_int(v):
    f = _to_float(v)
    return int(f) if f is not None else None


def fetch_quote(symbol):
    """
    Fetch a single live quote from Twelve Data's /quote endpoint.

    Returns a dict:
        {'ok': True,  'data': {open, high, low, close, previous_close,
                               change, percent_change, volume, currency,
                               fifty_two_week_high, fifty_two_week_low,
                               is_market_open, name, exchange}}
        {'ok': False, 'error': '<message>', 'code': <int|None>}
    """
    key = get_api_key()
    if not key:
        return {'ok': False, 'error': 'Twelve Data API key not configured.', 'code': None}

    try:
        resp = requests.get(
            f"{_base_url()}/quote",
            params={'symbol': symbol, 'apikey': key},
            timeout=_TIMEOUT,
        )
        payload = resp.json()
    except requests.RequestException as e:
        logger.error(f"[market_data] network error for {symbol}: {e}")
        return {'ok': False, 'error': f'Network error: {e}', 'code': None}
    except ValueError:
        return {'ok': False, 'error': 'Invalid response from market data provider.', 'code': None}

    # Twelve Data signals errors with {"status":"error","code":...,"message":...}
    if isinstance(payload, dict) and payload.get('status') == 'error':
        return {'ok': False, 'error': payload.get('message', 'Provider error.'),
                'code': payload.get('code')}

    fw = payload.get('fifty_two_week') or {}
    return {'ok': True, 'data': {
        'open':                _to_float(payload.get('open')),
        'high':                _to_float(payload.get('high')),
        'low':                 _to_float(payload.get('low')),
        'close':               _to_float(payload.get('close')),
        'previous_close':      _to_float(payload.get('previous_close')),
        'change':              _to_float(payload.get('change')),
        'percent_change':      _to_float(payload.get('percent_change')),
        'volume':              _to_int(payload.get('volume')),
        'currency':            payload.get('currency'),
        'fifty_two_week_high': _to_float(fw.get('high')),
        'fifty_two_week_low':  _to_float(fw.get('low')),
        'is_market_open':      payload.get('is_market_open'),
        'name':                payload.get('name'),
        'exchange':            payload.get('exchange'),
    }}


def refresh_stock(stock):
    """
    Fetch a live quote for `stock` and write the price fields onto the model
    instance (caller is responsible for committing the session).

    Returns {'ok': bool, 'symbol': str, 'error': str|None, 'code': int|None}.
    """
    symbol = td_symbol(stock)
    result = fetch_quote(symbol)
    if not result['ok']:
        return {'ok': False, 'symbol': symbol, 'error': result['error'], 'code': result.get('code')}

    d = result['data']
    close = d['close']
    prev  = d['previous_close']

    if close is not None:
        stock.current_price = close
    if prev is not None:
        stock.previous_close = prev
    if d['open'] is not None:
        stock.open_price = d['open']
    if d['high'] is not None:
        stock.day_high = d['high']
    if d['low'] is not None:
        stock.day_low = d['low']
    if d['volume'] is not None:
        stock.volume = d['volume']
    if d['fifty_two_week_high'] is not None:
        stock.week_52_high = d['fifty_two_week_high']
    if d['fifty_two_week_low'] is not None:
        stock.week_52_low = d['fifty_two_week_low']

    # Prefer the provider's change values; otherwise derive from close/prev.
    if d['change'] is not None:
        stock.price_change = d['change']
    elif close is not None and prev is not None:
        stock.price_change = close - prev
    if d['percent_change'] is not None:
        stock.price_change_percent = d['percent_change']
    elif close is not None and prev not in (None, 0):
        stock.price_change_percent = ((close - prev) / prev) * 100

    stock.last_price_update = datetime.now(timezone.utc)
    return {'ok': True, 'symbol': symbol, 'error': None, 'code': None}


def refresh_stocks(stocks):
    """
    Refresh a collection of Stocks rows (does NOT commit — caller commits once).

    Returns a summary:
        {'updated': int, 'failed': int, 'total': int,
         'errors': [{'symbol':..., 'error':..., 'code':...}, ...]}
    Stops early and flags rate-limiting if the provider returns code 429.
    """
    updated, errors, rate_limited = 0, [], False
    for stock in stocks:
        try:
            r = refresh_stock(stock)
            if r['ok']:
                updated += 1
            else:
                errors.append({'symbol': r['symbol'], 'error': r['error'], 'code': r.get('code')})
                if r.get('code') == 429:
                    rate_limited = True
                    break  # respect the quota — admin can retry shortly
        except Exception as e:
            traceback.print_exc()
            errors.append({'symbol': td_symbol(stock), 'error': str(e), 'code': None})

    return {
        'updated':      updated,
        'failed':       len(errors),
        'total':        len(stocks),
        'rate_limited': rate_limited,
        'errors':       errors,
    }
