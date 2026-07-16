"""
portal/helpers/portfolio_snapshot.py
====================================
Writes `portfolio_performance_history` rows — the data behind every portfolio
performance chart (user dashboard and the admin user-detail page).

Nothing used to write this table, so it was always empty and every chart rendered
"No performance data yet". Snapshots are now recorded from two places:

* `record_portfolio_snapshot()` — called by the order engine after each fill, so a
  portfolio gets a same-day data point the moment a user trades.
* `snapshot_all_portfolios()`   — called by the background scheduler every 5 minutes
  so charts keep advancing on days with price movement but no trading.

One row per (portfolio, date, interval): re-running is an upsert, never a duplicate.
`total_value` is the holdings' market value — matching `portfolios.current_value`,
which is what the UI shows as the headline figure. Cash sits in `cash_balance`.
"""
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from portal import db
from portal.models.portfolios import Portfolios
from portal.models.portfolio_holdings import PortfolioHoldings
from portal.models.portfolio_performance_history import (
    PortfolioPerformanceHistory, SnapshotInterval,
)
from portal.models.portfolio_value_ticks import PortfolioValueTicks
from portal.models.stocks import Stocks
from portal.models.wallets import Wallets

logger = logging.getLogger('stockmarket')

_IST = timezone(timedelta(hours=5, minutes=30))

# Intraday ticks exist to give the chart shape on short timeframes; the daily
# snapshots are the long-term record, so ticks are pruned aggressively.
TICK_RETENTION_DAYS = 30


def _d(v):
    return Decimal(str(v if v is not None else 0))


def _today_ist():
    """Snapshots are keyed to the Indian trading day, not UTC."""
    return datetime.now(timezone.utc).astimezone(_IST).date()


def _sector_allocation(portfolio_id, port_value: Decimal) -> dict:
    """{'IT Services': 69.1, ...} — percent of market value per sector."""
    if port_value <= 0:
        return {}
    buckets = {}
    holdings = PortfolioHoldings.query.filter_by(portfolio_id=portfolio_id, is_active=True).all()
    for h in holdings:
        stock = Stocks.query.get(h.stock_id)
        sector = (stock.sector if stock and stock.sector else 'Other')
        buckets[sector] = buckets.get(sector, Decimal('0')) + _d(h.current_value)
    return {k: float(round(v / port_value * 100, 2)) for k, v in buckets.items()}


def record_portfolio_snapshot(portfolio: Portfolios,
                              interval: str = SnapshotInterval.DAILY,
                              snapshot_date=None,
                              commit: bool = True) -> PortfolioPerformanceHistory:
    """
    Upsert today's performance snapshot for one portfolio.

    Assumes `portfolio` already carries fresh valuation figures (the order engine
    calls `revalue_portfolio()` immediately before this). Returns the row.
    """
    snapshot_date = snapshot_date or _today_ist()

    total_value    = _d(portfolio.current_value)
    total_invested = _d(portfolio.total_invested)

    wallet = Wallets.query.filter_by(user_id=portfolio.user_id).first()
    cash   = _d(wallet.balance) if wallet else Decimal('0')

    # Both reads happen before anything is added to the session: a pending row with
    # NULL columns would be autoflushed by the next query and rejected by the
    # NOT NULL constraint on total_value.
    row = PortfolioPerformanceHistory.query.filter_by(
        portfolio_id=portfolio.portfolio_id, snapshot_date=snapshot_date, interval=interval,
    ).first()

    # Previous snapshot drives the daily delta. Excluding today's own row keeps the
    # comparison stable when this runs repeatedly through the day.
    prev = (PortfolioPerformanceHistory.query
            .filter(PortfolioPerformanceHistory.portfolio_id == portfolio.portfolio_id,
                    PortfolioPerformanceHistory.interval == interval,
                    PortfolioPerformanceHistory.snapshot_date < snapshot_date)
            .order_by(PortfolioPerformanceHistory.snapshot_date.desc())
            .first())

    is_new = row is None
    if is_new:
        row = PortfolioPerformanceHistory()
        row.portfolio_id  = portfolio.portfolio_id
        row.user_id       = portfolio.user_id
        row.snapshot_date = snapshot_date
        row.interval      = interval

    row.total_value    = total_value
    row.total_invested = total_invested
    row.cash_balance   = cash

    if prev:
        prev_val = _d(prev.total_value)
        row.daily_return         = total_value - prev_val
        row.daily_return_percent = ((total_value - prev_val) / prev_val * 100) if prev_val > 0 else Decimal('0')
    else:
        row.daily_return         = Decimal('0')
        row.daily_return_percent = Decimal('0')

    # All-time return, same definition the UI uses: market value vs cost basis.
    row.cumulative_return         = total_value - total_invested
    row.cumulative_return_percent = ((total_value - total_invested) / total_invested * 100) if total_invested > 0 else Decimal('0')

    row.realized_pnl      = _d(portfolio.realized_pnl)
    row.unrealized_pnl    = _d(portfolio.unrealized_pnl)
    row.holdings_count    = portfolio.total_holdings_count or 0
    # Runs a query of its own, so it must land before the row joins the session.
    row.sector_allocation = _sector_allocation(portfolio.portfolio_id, total_value)

    if is_new:
        db.session.add(row)
    if commit:
        db.session.commit()
    return row


def record_value_tick(portfolio: Portfolios, commit: bool = True) -> PortfolioValueTicks:
    """
    Append an intraday value sample for one portfolio. Unlike the daily snapshot
    this always inserts, so repeated calls build the intraday curve.
    """
    tick                = PortfolioValueTicks()
    tick.portfolio_id   = portfolio.portfolio_id
    tick.user_id        = portfolio.user_id
    tick.captured_at    = datetime.now(timezone.utc)
    tick.total_value    = _d(portfolio.current_value)
    tick.total_invested = _d(portfolio.total_invested)
    db.session.add(tick)
    if commit:
        db.session.commit()
    return tick


def prune_value_ticks() -> int:
    """Drop ticks older than the retention window. Returns rows deleted."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=TICK_RETENTION_DAYS)
    try:
        deleted = (PortfolioValueTicks.query
                   .filter(PortfolioValueTicks.captured_at < cutoff)
                   .delete(synchronize_session=False))
        db.session.commit()
        if deleted:
            logger.info(f"[snapshot] pruned {deleted} stale value tick(s)")
        return deleted
    except Exception as e:
        db.session.rollback()
        logger.error(f"[snapshot] tick prune failed: {e}")
        return 0


def snapshot_all_portfolios(interval: str = SnapshotInterval.DAILY) -> dict:
    """
    Revalue every active portfolio from live prices, then record both its daily
    snapshot (long-term history) and an intraday value tick (chart shape today).
    Each portfolio is handled independently so one bad row can't stall the run.
    """
    from portal.helpers.order_engine import revalue_portfolio

    portfolios = Portfolios.query.filter_by(is_active=True).all()
    written = errors = 0
    for p in portfolios:
        try:
            revalue_portfolio(p)
            record_portfolio_snapshot(p, interval=interval)
            record_value_tick(p)
            written += 1
        except Exception as e:
            db.session.rollback()
            errors += 1
            logger.error(f"[snapshot] portfolio {p.portfolio_id} failed: {e}")

    prune_value_ticks()
    logger.info(f"[snapshot] {written} written, {errors} errors ({interval})")
    return {'portfolios': len(portfolios), 'written': written, 'errors': errors}
