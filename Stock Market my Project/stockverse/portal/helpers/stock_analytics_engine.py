"""
portal/helpers/stock_analytics_engine.py
=========================================
Rebuilds the `stock_analytics` popularity metrics (holders, platform AUM, AUM %,
popularity rank, watchers, trade count) from the *live* platform tables.

Why this exists
---------------
`StockAnalytics.total_holders` / `platform_aum` are a denormalised snapshot. They
were only ever seeded to 0 and nothing recomputed them, so the admin Dashboard's
"Top Stocks by Platform AUM" table and the All-Stocks "Most Held / Total Positions"
cards showed 0 forever even while users held stock. This engine derives those
numbers from `portfolio_holdings` (the source of truth) and upserts them.

It runs from the background scheduler right after the 5-minute portfolio revalue
(so holdings' `current_value` is fresh), and can be triggered on demand from the
admin "Refresh Live Prices" action.
"""
import logging

from sqlalchemy import func

from portal import db
from portal.models.portfolio_holdings import PortfolioHoldings
from portal.models.watchlist_items import WatchlistItems
from portal.models.trade_orders import TradeOrders, OrderStatus
from portal.models.stock_analytics import StockAnalytics
from portal.models.stocks import Stocks

logger = logging.getLogger('stockmarket')


def recompute_stock_analytics() -> dict:
    """
    Recompute per-stock popularity metrics from active holdings and upsert them
    into `stock_analytics`. Stocks with no holdings are reset to 0 so stale
    figures never linger. Returns a small summary dict.
    """
    # Holders + platform AUM per stock, from ACTIVE holdings only. A user holding
    # the same stock as both a DELIVERY and an INTRADAY position counts once
    # (COUNT DISTINCT user_id); their AUM sums across positions.
    #
    # AUM is valued at the live stock price (quantity * Stocks.current_price) rather
    # than the cached holdings.current_value, so it is correct the instant prices
    # refresh — it does not wait for the 5-minute portfolio revalue pass.
    hold_rows = (db.session.query(
                    PortfolioHoldings.stock_id.label('stock_id'),
                    func.count(func.distinct(PortfolioHoldings.user_id)).label('holders'),
                    func.coalesce(
                        func.sum(PortfolioHoldings.quantity * Stocks.current_price), 0
                    ).label('aum'),
                 )
                 .join(Stocks, Stocks.stock_id == PortfolioHoldings.stock_id)
                 .filter(PortfolioHoldings.is_active.is_(True))
                 .group_by(PortfolioHoldings.stock_id)
                 .all())

    holders_by_stock = {r.stock_id: int(r.holders or 0) for r in hold_rows}
    aum_by_stock     = {r.stock_id: float(r.aum or 0.0) for r in hold_rows}
    total_aum        = sum(aum_by_stock.values())

    # Distinct watchers per stock.
    watch_rows = (db.session.query(
                     WatchlistItems.stock_id.label('stock_id'),
                     func.count(func.distinct(WatchlistItems.user_id)).label('watchers'),
                  )
                  .group_by(WatchlistItems.stock_id)
                  .all())
    watchers_by_stock = {r.stock_id: int(r.watchers or 0) for r in watch_rows}

    # Total FILLED trades per stock (all-time), for the "trades" column.
    trade_rows = (db.session.query(
                     TradeOrders.stock_id.label('stock_id'),
                     func.count(TradeOrders.order_id).label('trades'),
                  )
                  .filter(TradeOrders.order_status == OrderStatus.FILLED)
                  .group_by(TradeOrders.stock_id)
                  .all())
    trades_by_stock = {r.stock_id: int(r.trades or 0) for r in trade_rows}

    # Popularity rank: highest platform AUM = rank 1. Only stocks actually held
    # get a rank; the rest stay NULL (shown as "—" in the UI).
    ranked = sorted(
        (sid for sid, aum in aum_by_stock.items() if aum > 0),
        key=lambda sid: aum_by_stock[sid], reverse=True,
    )
    rank_by_stock = {sid: i + 1 for i, sid in enumerate(ranked)}

    # Upsert one analytics row per stock so every stock stays consistent (and the
    # cards reset cleanly when a position is fully sold).
    existing = {a.stock_id: a for a in StockAnalytics.query.all()}
    updated = 0
    for s in Stocks.query.all():
        a = existing.get(s.stock_id)
        if a is None:
            a = StockAnalytics()
            a.stock_id = s.stock_id
            db.session.add(a)

        aum = aum_by_stock.get(s.stock_id, 0.0)
        a.total_holders        = holders_by_stock.get(s.stock_id, 0)
        a.total_watchers       = watchers_by_stock.get(s.stock_id, 0)
        a.total_trades_count   = trades_by_stock.get(s.stock_id, 0)
        a.platform_aum         = round(aum, 2)
        a.platform_aum_percent = round(aum / total_aum * 100, 4) if total_aum > 0 else 0
        a.popularity_rank      = rank_by_stock.get(s.stock_id)
        updated += 1

    db.session.commit()

    summary = {
        'stocks_updated': updated,
        'stocks_held':    len(aum_by_stock),
        'total_aum':      round(total_aum, 2),
    }
    logger.debug(f"[analytics] stock_analytics recomputed: {summary}")
    return summary
