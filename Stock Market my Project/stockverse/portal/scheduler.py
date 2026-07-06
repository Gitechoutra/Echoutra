"""
StockMarket Background Scheduler
Uses APScheduler to run periodic tasks:
  - Every 5 minutes  : Refresh portfolio current_value and profit_loss for all holdings
  - Every 15 minutes : (Hook) Fetch latest stock prices from external feed (stub)
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger('stockmarket')

_scheduler = None


def init_scheduler(app):
    """Initialize and start the APScheduler with the Flask app context."""
    global _scheduler

    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = BackgroundScheduler(
        job_defaults={'coalesce': True, 'max_instances': 1},
        timezone='UTC'
    )

    # ── Job 1: Refresh portfolio P&L (every 5 minutes) ───────────────────────
    _scheduler.add_job(
        func=lambda: _run_in_context(app, _refresh_portfolio_pnl),
        trigger=IntervalTrigger(minutes=5),
        id='refresh_portfolio_pnl',
        name='Refresh portfolio current value and P&L',
        replace_existing=True,
    )

    # ── Job 2: Stock price feed hook (every 15 minutes) ──────────────────────
    _scheduler.add_job(
        func=lambda: _run_in_context(app, _refresh_stock_prices),
        trigger=IntervalTrigger(minutes=15),
        id='refresh_stock_prices',
        name='Refresh stock current prices from external feed',
        replace_existing=True,
    )

    _scheduler.start()
    logger.info('APScheduler started with jobs: refresh_portfolio_pnl, refresh_stock_prices')
    return _scheduler


def _run_in_context(app, func):
    """Run a job function inside the Flask app context."""
    with app.app_context():
        try:
            func()
        except Exception as e:
            logger.error(f'Scheduler job error in {func.__name__}: {e}', exc_info=True)


def _refresh_portfolio_pnl():
    """
    Recalculate current_value and profit_loss for every portfolio holding
    using the stock's latest current_price.
    Runs every 5 minutes to keep P&L fresh during market hours.
    """
    from portal.models.portfolio import Portfolio
    from portal.models import db

    holdings = Portfolio.query.all()
    updated  = 0

    for p in holdings:
        stock = p.stock
        if not stock or not stock.current_price:
            continue

        new_current_value = round(stock.current_price * p.quantity, 2)
        new_profit_loss   = round(new_current_value - (p.average_buy_price * p.quantity), 2)

        if p.current_value != new_current_value or p.profit_loss != new_profit_loss:
            p.current_value = new_current_value
            p.profit_loss   = new_profit_loss
            updated += 1

    if updated:
        db.session.commit()
        logger.info(f'Portfolio P&L refresh: updated {updated} holding(s).')
    else:
        logger.debug('Portfolio P&L refresh: no changes detected.')


def _refresh_stock_prices():
    """
    Stub for fetching live stock prices from an external market data API
    (e.g. Alpha Vantage, Yahoo Finance, NSE/BSE API).
    Replace the body of this function with your actual price-feed integration.
    """
    # TODO: Integrate with a real market data provider.
    # Example flow:
    #   1. Fetch latest prices for all ACTIVE stocks
    #   2. Update Stocks.current_price
    #   3. Insert a StockPriceHistory record for today's OHLCV
    logger.debug('Stock price refresh: stub — no external feed configured yet.')















