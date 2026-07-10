"""
portal/helpers/market_data.py
=============================
Live market-data client backed by the **Upstox** API (https://upstox.com).

Architecture
------------
The user side never calls Upstox directly. The admin triggers a refresh which
pulls live quotes into the `stocks` table, and every user page reads those
cached prices from our own DB — so users see live prices in real time.

Upstox specifics
----------------
* Auth: `Authorization: Bearer <access_token>` (token expires daily ~3:30 AM IST).
* Instruments are addressed by *instrument key* `NSE_EQ|<ISIN>` / `BSE_EQ|<ISIN>`,
  built from each stock's `isin` + `exchange`.
* `GET /market-quote/quotes?instrument_key=k1,k2,...` returns a batch of full
  quotes keyed by `SEGMENT:SYMBOL`; each quote carries `instrument_token`
  (== the key we sent) which we use to map results back to our stocks.

Public API (unchanged from before, so routes need no edits)
----------
* `is_configured()`        -> bool
* `refresh_stock(stock)`   -> {'ok', 'symbol', 'error', 'code'}   (mutates stock)
* `refresh_stocks(stocks)` -> {'updated','failed','total','rate_limited','errors'}
"""

import os
import logging
import traceback
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

_TIMEOUT   = 15
_BATCH_MAX = 450   # Upstox allows up to 500 instrument keys per call


def _base_url():
    return os.environ.get('UPSTOX_BASE_URL', 'https://api.upstox.com/v2').rstrip('/')


def get_access_token():
    return (os.environ.get('UPSTOX_ACCESS_TOKEN') or '').strip() or None


def is_configured():
    return bool(get_access_token())


def instrument_key(stock):
    """Build the Upstox instrument key `SEGMENT|ISIN` for a stock, or None."""
    isin = (stock.isin or '').strip()
    if not isin:
        return None
    seg = 'BSE_EQ' if (stock.exchange or '').strip().upper() == 'BSE' else 'NSE_EQ'
    return f"{seg}|{isin}"


def _f(v):
    try:
        return float(v) if v not in (None, '', 'null') else None
    except (TypeError, ValueError):
        return None


def _to_int(v):
    f = _f(v)
    return int(f) if f is not None else None


def _headers():
    return {'Authorization': f'Bearer {get_access_token()}', 'Accept': 'application/json'}


def _fetch_quotes(keys):
    """
    Fetch a batch of quotes. Returns:
        {'ok': True,  'data': {instrument_token: quote, ...}}
        {'ok': False, 'error': '<msg>', 'code': <http_status|None>}
    """
    if not get_access_token():
        return {'ok': False, 'error': 'Upstox access token not configured.', 'code': None}
    try:
        resp = requests.get(
            f"{_base_url()}/market-quote/quotes",
            params={'instrument_key': ','.join(keys)},
            headers=_headers(),
            timeout=_TIMEOUT,
        )
        payload = resp.json()
    except requests.RequestException as e:
        logger.error(f"[market_data] Upstox network error: {e}")
        return {'ok': False, 'error': f'Network error: {e}', 'code': None}
    except ValueError:
        return {'ok': False, 'error': 'Invalid response from Upstox.', 'code': None}

    if payload.get('status') != 'success':
        # Common case: 401 → token expired/invalid.
        errs = payload.get('errors') or []
        msg  = (errs[0].get('message') if errs and isinstance(errs[0], dict)
                else payload.get('message') or 'Upstox request failed.')
        if resp.status_code == 401:
            msg = 'Upstox access token expired or invalid — please regenerate it.'
        return {'ok': False, 'error': msg, 'code': resp.status_code}

    # Index by instrument_token so we can map back to our stocks by their key.
    by_token = {}
    for q in (payload.get('data') or {}).values():
        tok = q.get('instrument_token')
        if tok:
            by_token[tok] = q
    return {'ok': True, 'data': by_token}


def _apply_quote(stock, q):
    """Write live Upstox quote fields onto a Stocks row (no commit)."""
    lp   = _f(q.get('last_price'))
    nc   = _f(q.get('net_change'))
    ohlc = q.get('ohlc') or {}

    if lp is not None:
        stock.current_price = lp
    if lp is not None and nc is not None:
        prev = lp - nc
        stock.previous_close       = prev
        stock.price_change         = nc
        stock.price_change_percent = (nc / prev * 100) if prev else 0
    if _f(ohlc.get('open')) is not None:
        stock.open_price = _f(ohlc.get('open'))
    if _f(ohlc.get('high')) is not None:
        stock.day_high = _f(ohlc.get('high'))
    if _f(ohlc.get('low')) is not None:
        stock.day_low = _f(ohlc.get('low'))
    if _to_int(q.get('volume')) is not None:
        stock.volume = _to_int(q.get('volume'))
    stock.last_price_update = datetime.now(timezone.utc)


def fetch_52week(stock):
    """
    Compute the 52-week high/low from Upstox daily historical candles.
    Returns (high, low) or None. (52-week range isn't part of the live quote.)
    """
    key = instrument_key(stock)
    if not key:
        return None
    from datetime import date, timedelta
    to_d  = date.today().isoformat()
    from_d = (date.today() - timedelta(days=365)).isoformat()
    try:
        resp = requests.get(
            f"{_base_url()}/historical-candle/{key}/day/{to_d}/{from_d}",
            headers=_headers(), timeout=_TIMEOUT,
        )
        payload = resp.json()
    except (requests.RequestException, ValueError):
        return None
    if payload.get('status') != 'success':
        return None
    candles = (payload.get('data') or {}).get('candles') or []
    if not candles:
        return None
    highs = [_f(c[2]) for c in candles if _f(c[2]) is not None]
    lows  = [_f(c[3]) for c in candles if _f(c[3]) is not None]
    if not highs or not lows:
        return None
    return (max(highs), min(lows))


def refresh_stock(stock):
    """Fetch a live quote for one stock and write it (caller commits)."""
    key = instrument_key(stock)
    if not key:
        return {'ok': False, 'symbol': stock.ticker_symbol,
                'error': 'Stock has no ISIN — cannot build an Upstox instrument key.', 'code': None}
    res = _fetch_quotes([key])
    if not res['ok']:
        return {'ok': False, 'symbol': stock.ticker_symbol, 'error': res['error'], 'code': res.get('code')}
    quote = res['data'].get(key)
    if not quote:
        return {'ok': False, 'symbol': stock.ticker_symbol, 'error': 'No live quote returned for this instrument.', 'code': None}
    _apply_quote(stock, quote)
    return {'ok': True, 'symbol': stock.ticker_symbol, 'error': None, 'code': None}


def refresh_stocks(stocks):
    """
    Refresh many stocks in batched Upstox calls (does NOT commit).
    Returns a summary dict.
    """
    key_to_stock = {}
    errors = []
    for s in stocks:
        k = instrument_key(s)
        if k:
            key_to_stock[k] = s
        else:
            errors.append({'symbol': s.ticker_symbol, 'error': 'No ISIN on record.', 'code': None})

    keys = list(key_to_stock.keys())
    if not keys:
        return {'updated': 0, 'failed': len(errors), 'total': len(stocks),
                'rate_limited': False, 'errors': errors}

    updated = 0
    token_expired = False
    for i in range(0, len(keys), _BATCH_MAX):
        chunk = keys[i:i + _BATCH_MAX]
        res = _fetch_quotes(chunk)
        if not res['ok']:
            token_expired = token_expired or (res.get('code') == 401)
            for k in chunk:
                errors.append({'symbol': key_to_stock[k].ticker_symbol, 'error': res['error'], 'code': res.get('code')})
            continue
        for k in chunk:
            q = res['data'].get(k)
            if q:
                try:
                    stock = key_to_stock[k]
                    _apply_quote(stock, q)
                    # Fill the 52-week range once (it isn't in the live quote and
                    # changes slowly). Only when missing, so routine price refreshes
                    # stay fast — new stocks self-heal on their first refresh.
                    if stock.week_52_high is None or stock.week_52_low is None:
                        hl = fetch_52week(stock)
                        if hl:
                            stock.week_52_high, stock.week_52_low = hl
                    updated += 1
                except Exception as e:
                    traceback.print_exc()
                    errors.append({'symbol': key_to_stock[k].ticker_symbol, 'error': str(e), 'code': None})
            else:
                errors.append({'symbol': key_to_stock[k].ticker_symbol, 'error': 'No quote returned.', 'code': None})

    return {
        'updated':       updated,
        'failed':        len(errors),
        'total':         len(stocks),
        'rate_limited':  token_expired,   # surfaced so the route can hint a retry/regenerate
        'errors':        errors,
    }
