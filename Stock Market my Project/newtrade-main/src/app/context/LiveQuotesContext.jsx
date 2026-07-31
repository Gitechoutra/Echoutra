/**
 * LiveQuotesContext — one price poll for the entire app.
 *
 * Every screen that shows a price (stock cards, watchlist, portfolio, market
 * table, stock detail, order forms, dashboards, the header ticker) reads from
 * this one store, so they cannot disagree. Before this, each page fetched its
 * own copy at its own time — or, on most pages, fetched once at mount and never
 * again — which is why a stock detail page could sit at ₹14,222 while the chart
 * beside it showed a different number.
 *
 * Design rules:
 *  • ONE request per tick (`/stocks/quotes`) for all stocks, not one per widget.
 *  • The server sets the cadence (`poll_interval_ms`: ~10s trading, 60s closed)
 *    and rides along in the same response, so a price and its freshness badge
 *    always come from the same instant.
 *  • Polling stops when the market is closed — the last traded price cannot
 *    change until the next session, so more requests would return the same rows.
 *  • Pages keep owning their own domain data (holdings, watchlist rows, order
 *    history). This layer only overlays the price fields on top, so adopting it
 *    never means rewriting a page's fetch logic.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

/** Cadence used before the first response tells us the real one. */
const DEFAULT_POLL_MS = 15_000;

const LiveQuotesContext = createContext(null);

/** Shape returned when no provider is mounted (e.g. a page rendered standalone). */
const EMPTY = { quotes: {}, market: null, updatedAt: null, loading: false, refresh: async () => {} };

export function LiveQuotesProvider({ children }) {
  const [quotes,    setQuotes]    = useState({});
  const [market,    setMarket]    = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!getToken()) return null;
    try {
      const res  = await fetch(`${API_BASE}/stocks/quotes`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!data.bool) return null;

      const r = data.response;
      // Index by stock_id AND by ticker so callers can look up with whichever
      // identifier their row happens to carry — holdings use stock_id, watchlist
      // rows and route params use the symbol.
      const next = {};
      for (const q of r.quotes || []) {
        if (q.stock_id != null) next[`id:${q.stock_id}`] = q;
        if (q.ticker_symbol)    next[`sym:${q.ticker_symbol.toUpperCase()}`] = q;
      }
      setQuotes(next);
      setMarket({
        state:            r.market_state,
        is_open:          r.is_open,
        prices_are_live:  r.prices_are_live,
        session_label:    r.session_label,
        server_time_ist:  r.server_time_ist,
        poll_interval_ms: r.poll_interval_ms,
      });
      setUpdatedAt(Date.now());
      return r;
    } catch {
      // Keep the last known prices on screen. Staleness is communicated by the
      // market badge, not by blanking the numbers out.
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Self-rearming rather than a fixed setInterval: the cadence changes when
    // the market opens or closes, and a fixed interval would keep the old one
    // until a remount. Also avoids stacking requests if one runs long.
    const tick = async () => {
      const r = await refresh();
      if (cancelled) return;
      timerRef.current = setTimeout(tick, r?.poll_interval_ms || DEFAULT_POLL_MS);
    };
    tick();

    // A tab in the background gets throttled by the browser; refresh the moment
    // the user comes back so they never read a price frozen from minutes ago.
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ quotes, market, updatedAt, loading, refresh }),
    [quotes, market, updatedAt, loading, refresh]
  );

  return <LiveQuotesContext.Provider value={value}>{children}</LiveQuotesContext.Provider>;
}

/** The whole store: `{ quotes, market, updatedAt, loading, refresh }`. */
export function useLiveQuotes() {
  return useContext(LiveQuotesContext) || EMPTY;
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/** Look up one quote by stock_id, ticker, or any row carrying either. */
export function quoteFor(quotes, key) {
  if (!quotes || key == null) return null;
  if (typeof key === "object") {
    return (
      (key.stock_id != null && quotes[`id:${key.stock_id}`]) ||
      (key.ticker_symbol && quotes[`sym:${String(key.ticker_symbol).toUpperCase()}`]) ||
      (key.symbol && quotes[`sym:${String(key.symbol).toUpperCase()}`]) ||
      null
    );
  }
  if (typeof key === "number" || /^\d+$/.test(key)) return quotes[`id:${key}`] || null;
  return quotes[`sym:${String(key).toUpperCase()}`] || null;
}

/** One stock's live quote, by id / symbol / row. Re-renders as prices arrive. */
export function useLiveQuote(key) {
  const { quotes } = useLiveQuotes();
  return useMemo(() => quoteFor(quotes, key), [quotes, key]);
}

// ── Overlays ──────────────────────────────────────────────────────────────────

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * Overlay live price fields onto a stock-shaped row, leaving everything else
 * (name, sector, logo, holdings info) exactly as the page fetched it.
 * Returns the SAME object when there is no quote, so React can skip re-renders.
 */
export function liveStock(row, quotes) {
  const q = quoteFor(quotes, row);
  if (!row || !q || q.current_price == null) return row;
  return {
    ...row,
    current_price:        q.current_price,
    previous_close:       q.previous_close        ?? row.previous_close,
    open_price:           q.open_price            ?? row.open_price,
    price_change:         q.price_change          ?? row.price_change,
    price_change_percent: q.price_change_percent  ?? row.price_change_percent,
    day_high:             q.day_high              ?? row.day_high,
    day_low:              q.day_low               ?? row.day_low,
    volume:               q.volume                ?? row.volume,
    last_price_update:    q.last_price_update     ?? row.last_price_update,
  };
}

/**
 * P&L from closing `quantity` at `exitPx`.
 *
 * Mirrors `position_pnl()` in portal/helpers/order_engine.py: a LONG earns
 * (exit − entry), a SHORT earns (entry − exit). Both ends of the app must agree
 * on this sign or a user watches a profit that the server books as a loss.
 */
export function positionPnl(side, entryPx, exitPx, quantity) {
  const diff = side === "SHORT" ? entryPx - exitPx : exitPx - entryPx;
  return diff * quantity;
}

/**
 * Same overlay for a portfolio holding, plus the money that depends on price:
 * market value, unrealized P&L and today's change.
 *
 * The server recomputes these on its own 5-minute cycle. Deriving them here as
 * well is what makes a portfolio move with the market instead of lurching every
 * five minutes — and it keeps the P&L consistent with the price shown on the
 * same row, which is the part users actually notice.
 *
 * Short positions invert: they gain as the price falls, and `current_value` is
 * what it would cost to buy the shares back rather than what they are worth.
 */
export function liveHolding(row, quotes) {
  const q = quoteFor(quotes, row);
  const px = q ? num(q.current_price) : null;
  if (!row || px == null || !(px > 0)) return row;

  const short    = row.position_side === "SHORT" || row.is_short === true;
  const qty      = num(row.quantity) || 0;
  const entry    = num(row.average_buy_price) || 0;
  const invested = num(row.total_invested) ?? entry * qty;
  const prev     = num(q.previous_close) ?? px;
  const value    = qty * px;

  const pnl = short
    ? positionPnl("SHORT", entry, px, qty)
    : value - invested;
  const dayPnl = short
    ? positionPnl("SHORT", prev, px, qty)
    : (px - prev) * qty;
  // A short's return is measured against the price it was sold at, not against
  // capital invested — there is none; the collateral sits in the wallet.
  const pnlPct = short
    ? (entry > 0 ? ((entry - px) / entry) * 100 : 0)
    : (invested > 0 ? (pnl / invested) * 100 : 0);

  return {
    ...liveStock(row, quotes),
    current_price:           px,
    current_value:           value,
    unrealized_pnl:          pnl,
    unrealized_pnl_percent:  pnlPct,
    day_change:              dayPnl,
    day_change_percent:      prev > 0 ? ((short ? prev - px : px - prev) / prev) * 100 : 0,
  };
}

/**
 * Roll live holdings back up into the portfolio summary tiles.
 *
 * Deliberately mirrors `revalue_portfolio()` in portal/helpers/order_engine.py —
 * same inputs, same arithmetic — so the tiles a user watches between server
 * revaluations agree with what the server writes when it next runs. Pass the
 * ALREADY-overlaid holdings (the output of `liveHoldings`).
 */
export function livePortfolio(portfolio, liveRows) {
  if (!portfolio || !Array.isArray(liveRows) || !liveRows.length) return portfolio;

  const active = liveRows.filter((h) => h.is_active !== false);
  if (!active.length) return portfolio;

  let value = 0, invested = 0, dayPnl = 0, prevValue = 0;
  for (const h of active) {
    const qty   = num(h.quantity) || 0;
    const val   = num(h.current_value) || 0;
    const prev  = num(h.previous_close);
    const short = h.position_side === "SHORT" || h.is_short === true;
    // A short's collateral is held in the wallet, so counting its notional here
    // would double-count it — only the P&L belongs to portfolio worth. Mirrors
    // revalue_portfolio() on the server.
    value     += short ? (num(h.unrealized_pnl) || 0) : val;
    invested  += short ? 0 : (num(h.total_invested) || 0);
    dayPnl    += num(h.day_change) || 0;
    prevValue += prev != null ? qty * prev : val;
  }

  return {
    ...portfolio,
    current_value:        value,
    total_invested:       invested,
    unrealized_pnl:       value - invested,
    total_return:         value - invested,
    total_return_percent: invested > 0 ? ((value - invested) / invested) * 100 : 0,
    day_change:           dayPnl,
    day_change_percent:   prevValue > 0 ? (dayPnl / prevValue) * 100 : 0,
    total_holdings_count: active.length,
  };
}

/** Map `liveStock` over a list. Memoise at the call site with useMemo. */
export function liveStocks(rows, quotes) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  return rows.map((r) => liveStock(r, quotes));
}

/** Map `liveHolding` over a list. */
export function liveHoldings(rows, quotes) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  return rows.map((r) => liveHolding(r, quotes));
}
