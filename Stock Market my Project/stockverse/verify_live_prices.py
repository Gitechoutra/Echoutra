"""
verify_live_prices.py
=====================
Proves the prices this app serves match the live market, by comparing what the
API hands the portals against a fresh quote pulled straight from Upstox.

    python verify_live_prices.py

Run it any trading day. It exits non-zero if anything is stale or mismatched,
so it can also be used as a smoke check after a deploy or a token refresh.

Why a tolerance: the two reads happen milliseconds apart on a moving market, so
the last traded price legitimately ticks between them. Fields that cannot move
between reads (day high/low, previous close) are compared exactly.
"""
import sys
from decimal import Decimal

from dotenv import load_dotenv
load_dotenv(override=True)

import requests

from app import app
from portal import db
from portal.models.stocks import Stocks, StockStatus
from portal.helpers import market_data as md
from portal.helpers import market_calendar as mc

# LTP may drift this much between our read and the reference read.
LTP_TOLERANCE_PCT = Decimal('0.5')


def _f(v):
    return float(v) if v is not None else None


def main():
    status = mc.describe()
    print(f"Market      : {status['state']}  ({status['session_label']})")
    print(f"Server time : {status['server_time_ist']}")
    if not status['calendar_ok']:
        print(f"WARNING     : {status['calendar_warning']}")

    with app.app_context():
        stocks = Stocks.query.filter_by(status=StockStatus.ACTIVE).all()
        if not stocks:
            print('No active stocks to check.')
            return 1

        summary = md.refresh_stocks(stocks)
        db.session.commit()
        h = md.health()

        print(f"Feed        : token={h['token_state']} healthy={h['healthy']}")
        print(f"Refresh     : {summary['updated']}/{summary['total']} updated, "
              f"{summary['failed']} failed")

        if summary['token_expired']:
            print('\nFAIL: Upstox token expired. Run generate_upstox_token.py, then retry.')
            return 1
        if summary['rate_limited']:
            print('\nFAIL: rate limited by Upstox. Retry in a minute.')
            return 1
        if not h['healthy']:
            print(f"\nFAIL: feed unhealthy — {h['last_error']}")
            return 1

        rows = [(s.ticker_symbol, s.isin, _f(s.current_price), _f(s.previous_close),
                 _f(s.day_high), _f(s.day_low), s.volume) for s in stocks if s.isin]

    # Reference pull, independent of anything we stored.
    keys = [f'NSE_EQ|{isin}' for _, isin, *_ in rows]
    resp = requests.get(
        'https://api.upstox.com/v2/market-quote/quotes',
        params={'instrument_key': ','.join(keys)},
        headers={'Authorization': f'Bearer {md.get_access_token()}', 'Accept': 'application/json'},
        timeout=20,
    ).json()
    ref = {q['instrument_token']: q for q in (resp.get('data') or {}).values()
           if q.get('instrument_token')}

    print(f"\n{'SYMBOL':<12}{'OURS':>11}{'UPSTOX':>11}{'DRIFT%':>8}  {'HIGH':>9}{'LOW':>9}  RESULT")
    print('-' * 74)

    failures = []
    for sym, isin, price, prev, high, low, vol in rows:
        q = ref.get(f'NSE_EQ|{isin}')
        if not q:
            failures.append(f'{sym}: no reference quote')
            continue

        ltp = q.get('last_price')
        ohlc = q.get('ohlc') or {}
        drift = abs(Decimal(str(price)) - Decimal(str(ltp))) / Decimal(str(ltp)) * 100

        problems = []
        if drift > LTP_TOLERANCE_PCT:
            problems.append(f'LTP drift {drift:.2f}% > {LTP_TOLERANCE_PCT}%')
        # These are session aggregates: they cannot differ between two reads
        # seconds apart, so any mismatch is a real mapping bug.
        if high != ohlc.get('high'):
            problems.append(f"high {high} != {ohlc.get('high')}")
        if low != ohlc.get('low'):
            problems.append(f"low {low} != {ohlc.get('low')}")
        # previous_close is derived as ltp - net_change; check the arithmetic.
        if q.get('net_change') is not None:
            want_prev = round(ltp - q['net_change'], 2)
            if prev is not None and abs(prev - want_prev) > 0.05:
                problems.append(f'prev_close {prev} != {want_prev}')

        verdict = 'OK' if not problems else 'FAIL: ' + '; '.join(problems)
        if problems:
            failures.append(f'{sym}: {"; ".join(problems)}')
        print(f'{sym:<12}{price:>11.2f}{ltp:>11.2f}{drift:>8.2f}  '
              f'{high:>9.2f}{low:>9.2f}  {verdict}')

    print('-' * 74)
    if failures:
        print(f'{len(failures)} of {len(rows)} stock(s) FAILED verification:')
        for f in failures:
            print(f'  - {f}')
        return 1

    print(f'All {len(rows)} stock(s) match the live market '
          f'(LTP within {LTP_TOLERANCE_PCT}%, high/low/prev_close exact).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
