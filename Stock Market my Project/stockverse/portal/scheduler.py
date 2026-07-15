"""
StockMarket Background Scheduler
================================
A dependency-free background worker (plain `threading`) that drives the live
order engine. It runs two periodic tasks inside the Flask app context:

  - Every 10 seconds : Refresh live prices for stocks with queued orders, then
                       auto-execute any LIMIT/STOP order whose trigger price is met.
  - Every 5 minutes  : Refresh every portfolio's current_value and P&L.

A plain daemon thread is used (instead of APScheduler) so the monitor has no
external dependencies and always runs wherever the app runs.
"""
import logging
import threading
from datetime import datetime, timedelta, timezone

logger = logging.getLogger('stockmarket')

MONITOR_INTERVAL_SECONDS = 10
PNL_REFRESH_EVERY_TICKS  = 30          # 30 * 10s = every 5 minutes

# NSE trading session, in IST (UTC+5:30). The full-market live refresh only runs
# inside these hours so we don't burn Upstox calls while the market is closed.
IST                = timezone(timedelta(hours=5, minutes=30))
MARKET_OPEN_HHMM   = (9, 15)
MARKET_CLOSE_HHMM  = (15, 30)

_worker  = None
_started = False


def _market_is_open(now=None):
    """True during NSE regular trading hours (Mon–Fri, 09:15–15:30 IST)."""
    now = now or datetime.now(IST)
    if now.weekday() >= 5:                      # 5 = Sat, 6 = Sun
        return False
    open_t  = now.replace(hour=MARKET_OPEN_HHMM[0],  minute=MARKET_OPEN_HHMM[1],  second=0, microsecond=0)
    close_t = now.replace(hour=MARKET_CLOSE_HHMM[0], minute=MARKET_CLOSE_HHMM[1], second=0, microsecond=0)
    return open_t <= now <= close_t


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
                if summary.get('rate_limited'):
                    logger.warning('[scheduler] Upstox token expired/invalid — live prices are stale. Regenerate UPSTOX_ACCESS_TOKEN.')
    except Exception as e:
        db.session.rollback()
        logger.warning(f'[scheduler] live price refresh failed (non-fatal): {e}')

    # 2) Match + execute against the latest prices.
    process_pending_orders()


def _refresh_portfolio_pnl():
    """Recompute current_value and P&L for every active portfolio from the
    latest stock prices, via the shared engine revalue routine."""
    from portal.models.portfolios import Portfolios
    from portal.helpers.order_engine import revalue_portfolio

    portfolios = Portfolios.query.filter_by(is_active=True).all()
    for p in portfolios:
        try:
            revalue_portfolio(p)
        except Exception as e:
            logger.error(f'[scheduler] revalue failed for portfolio {p.portfolio_id}: {e}')
    logger.debug(f'[scheduler] portfolio P&L refresh: {len(portfolios)} portfolio(s).')
