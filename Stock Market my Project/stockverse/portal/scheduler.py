"""
StockMarket Background Scheduler
================================
A dependency-free background worker (plain `threading`) that drives the live
order engine. It runs two periodic tasks inside the Flask app context:

  - Every 10 seconds : Refresh live prices for stocks with queued orders, then
                       auto-execute any LIMIT/STOP order whose trigger price is met
                       and fire any triggered user price alerts.
  - Every 5 minutes  : Refresh every portfolio's current_value and P&L, and record
                       its performance snapshot (one row per portfolio per day).

A plain daemon thread is used (instead of APScheduler) so the monitor has no
external dependencies and always runs wherever the app runs.
"""
import logging
import threading
from datetime import datetime, timedelta, timezone

logger = logging.getLogger('stockmarket')

MONITOR_INTERVAL_SECONDS = 10
PNL_REFRESH_EVERY_TICKS  = 30          # 30 * 10s = every 5 minutes

# Market hours come from portal.helpers.market_calendar so the scheduler and the
# /stocks/market_status endpoint can never disagree. The old local check here
# knew only weekday + clock time, so on an NSE holiday it refreshed all day and
# the UI presented a flat, unchanging price as live.
from portal.helpers.market_calendar import IST, is_market_open as _market_is_open  # noqa: E402

_worker  = None
_started = False


def init_scheduler(app):
    """Start the background monitor thread once. Safe to call repeatedly."""
    global _worker, _started
    if _started:
        return _worker

    _started = True
    _worker  = threading.Thread(
        target=_run_loop, args=(app,), name='order-monitor', daemon=True
    )
    _worker.start()
    logger.info(f'Order monitor thread started (every {MONITOR_INTERVAL_SECONDS}s).')
    return _worker


def _run_loop(app):
    """Tick forever: monitor orders every interval, refresh P&L every 5 minutes,
    and roll 'today's P&L' over at each new IST day."""
    tick = 0
    stop = threading.Event()
    while not stop.wait(MONITOR_INTERVAL_SECONDS):
        tick += 1
        _run_in_context(app, _monitor_orders)
        if tick % PNL_REFRESH_EVERY_TICKS == 0:
            _run_in_context(app, _refresh_portfolio_pnl)


def _run_in_context(app, func):
    """Run a job inside a fresh Flask app context, isolating failures."""
    with app.app_context():
        try:
            func()
        except Exception as e:
            logger.error(f'Scheduler job error in {func.__name__}: {e}', exc_info=True)
        finally:
            from portal import db
            db.session.remove()   # release the thread-local session each tick


def _monitor_orders():
    """
    The live-order engine tick:
      1. Refresh live prices:
           • During market hours  → ALL active stocks, so the whole market stays
             live in near-real-time (one batched Upstox call per tick).
           • Outside market hours → only stocks with live queued orders, so we
             don't waste API calls while the market is closed.
      2. Run the matching engine, which fills any order whose trigger price is met
         and updates the wallet, holdings, ledgers and portfolio.
    """
    from portal import db
    from portal.models.trade_orders import TradeOrders
    from portal.models.stocks import Stocks, StockStatus
    from portal.helpers.order_engine import process_pending_orders, _OPEN_STATUSES, _QUEUED_TYPES

    # 1) Pull fresh live prices.
    try:
        from portal.helpers.market_data import is_configured, refresh_stocks
        if is_configured():
            if _market_is_open():
                # Full-market refresh — keep every active stock live.
                stocks = Stocks.query.filter_by(status=StockStatus.ACTIVE).all()
            else:
                # Market closed: refresh only the stocks with live queued orders.
                rows = (db.session.query(TradeOrders.stock_id)
                        .filter(TradeOrders.order_status.in_(_OPEN_STATUSES),
                                TradeOrders.order_type.in_(_QUEUED_TYPES))
                        .distinct().all())
                stock_ids = [r[0] for r in rows]
                stocks = (Stocks.query.filter(Stocks.stock_id.in_(stock_ids)).all()
                          if stock_ids else [])

            if stocks:
                summary = refresh_stocks(stocks)
                db.session.commit()
                if summary.get('updated'):
                    logger.debug(f'[scheduler] refreshed {summary["updated"]} live price(s)')
                if summary.get('token_expired'):
                    logger.warning(
                        '[scheduler] Upstox token expired/invalid — live prices are STALE. '
                        'Run generate_upstox_token.py and restart to resume live data.')
                elif summary.get('rate_limited'):
                    logger.warning(
                        '[scheduler] Upstox rate limit hit — backing off; prices are briefly stale.')
    except Exception as e:
        db.session.rollback()
        logger.warning(f'[scheduler] live price refresh failed (non-fatal): {e}')

    # 2) Match + execute against the latest prices.
    process_pending_orders()

    # 3) Once the bell has rung, close every intraday position still open —
    #    longs sold, shorts bought back, at the last traded price. Runs on every
    #    tick and is a no-op while the market is open or when nothing is left
    #    open, so it needs no "have we done this today?" bookkeeping and no
    #    separate cron. This is the automatic settlement at market close.
    try:
        from portal.helpers.order_engine import square_off_intraday_positions
        square_off_intraday_positions()
    except Exception as e:
        db.session.rollback()
        logger.error(f'[scheduler] intraday square-off failed: {e}', exc_info=True)

    # 4) Fire any user price alerts the new prices have triggered.
    try:
        from portal.helpers.price_alert_engine import process_price_alerts
        process_price_alerts()
    except Exception as e:
        db.session.rollback()
        logger.error(f'[scheduler] price alert scan failed: {e}')


def _refresh_portfolio_pnl():
    """
    Recompute current_value and P&L for every active portfolio from the latest
    stock prices, then write each one's performance snapshot.

    The snapshot is an upsert keyed on (portfolio, date, DAILY), so running this
    every 5 minutes keeps today's data point current and leaves one row per day
    behind as history — which is what the performance charts read.
    """
    from portal.helpers.portfolio_snapshot import snapshot_all_portfolios

    summary = snapshot_all_portfolios()
    logger.debug(f'[scheduler] portfolio P&L + snapshot: '
                 f'{summary["written"]} written, {summary["errors"]} error(s).')

    # Rebuild per-stock popularity metrics (holders, platform AUM, rank) from the
    # freshly-revalued holdings, so the admin Dashboard "Top Stocks by Platform AUM"
    # and All-Stocks "Most Held / Total Positions" cards stay current.
    try:
        from portal.helpers.stock_analytics_engine import recompute_stock_analytics
        stats = recompute_stock_analytics()
        logger.debug(f'[scheduler] stock analytics: {stats}')
    except Exception as e:
        from portal import db
        db.session.rollback()
        logger.error(f'[scheduler] stock analytics recompute failed: {e}')
