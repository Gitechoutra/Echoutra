/**
 * Holdings and Open Positions — the two pages behind the dashboard cards.
 *
 * They are the same table over two different slices of the same data, which is
 * why they live in one file:
 *
 *   Holdings        DELIVERY — bought outright, held until the user sells.
 *   Open Positions  INTRADAY opened during the CURRENT trading day and still
 *                   open. Not delivery, and not yesterday's intraday: that was
 *                   squared off at the close, so it is history. The server
 *                   decides this (`is_open_position`) rather than the browser,
 *                   which would have to guess the trading day from its own clock.
 *
 * Both stay live off the shared quote poll, so price, value and P&L move with
 * the market rather than with page loads.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  ArrowLeft, TrendingUp, TrendingDown, RefreshCw, AlertCircle, Briefcase, PieChart,
} from "lucide-react";
import { useLiveQuotes, liveHoldings } from "../../context/LiveQuotesContext";
import { StockLogo } from "../../components/StockLogo";
import { inr } from "../../utils/currency";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

const COLUMNS = [
  "#", "Stock Name", "Symbol", "Quantity", "Buy Price", "Current Price",
  "Invested Value", "Current Value", "Profit/Loss", "Trade Type", "Date & Time", "Status",
];

/** "04 Aug 2026, 02:15 PM" from an API timestamp. */
function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function HoldingsTable({ rows, emptyText, onRowClick }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Briefcase className="w-12 h-12 text-gray-700" />
        <div className="text-gray-500 text-sm">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5">
            {COLUMNS.map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => {
            const short   = h.position_side === "SHORT" || h.is_short === true;
            const closed  = h.is_active === false;
            // `quantity` is what is still open — 0 once closed. A closed row
            // shows the size it was traded at instead of a bare 0.
            const qty     = closed ? Number(h.quantity_traded ?? 0) : Number(h.quantity || 0);
            const entry   = Number(h.average_buy_price || 0);
            const px      = Number(h.current_price || 0) || entry;
            const invested= Number(h.total_invested || qty * entry);
            // A closed position holds nothing, so it has no current value.
            const value   = closed ? 0 : (Number(h.current_value || 0) || qty * px);
            const pnl     = closed
              ? Number(h.realized_pnl || 0)
              : (short ? (entry - px) * qty : value - invested);
            const pct     = invested > 0 ? (pnl / invested) * 100 : 0;
            const up      = pnl >= 0;

            return (
              <motion.tr key={h.holding_id || i}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                onClick={() => onRowClick?.(h)}
                className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                  h.ticker_symbol ? "cursor-pointer" : ""} ${closed ? "opacity-70" : ""}`}>
                <td className="px-4 py-3.5 text-sm text-gray-500 tabular-nums">{i + 1}</td>

                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <StockLogo symbol={h.ticker_symbol} name={h.company_name} size="sm" />
                    <div>
                      <div className="text-sm text-white">{h.company_name || "—"}</div>
                      <div className="text-xs text-gray-600">{h.sector || "—"}</div>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white">{h.ticker_symbol || "—"}</span>
                    {short && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-[9px] font-bold text-amber-400">
                        SHORT
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3.5 text-sm text-gray-300 tabular-nums">{qty.toFixed(4)}</td>
                <td className="px-4 py-3.5 text-sm text-gray-300 tabular-nums">{inr(entry)}</td>
                <td className="px-4 py-3.5 text-sm text-white tabular-nums">{inr(px)}</td>
                <td className="px-4 py-3.5 text-sm text-gray-300 tabular-nums">{inr(invested)}</td>
                <td className="px-4 py-3.5 text-sm text-white tabular-nums">{inr(value)}</td>

                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className={`text-sm tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
                    {inr(pnl, { signed: true })}
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${up ? "text-emerald-400" : "text-red-400"}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? "+" : ""}{pct.toFixed(2)}%
                  </div>
                </td>

                <td className="px-4 py-3.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    (h.trade_mode || "DELIVERY") === "INTRADAY"
                      ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                      : "text-cyan-400 bg-cyan-500/10 border-cyan-500/20"}`}>
                    {(h.trade_mode || "DELIVERY") === "INTRADAY" ? "Intraday" : "Delivery"}
                  </span>
                </td>

                <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                  {fmtDateTime(h.first_bought_at)}
                </td>

                <td className="px-4 py-3.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    closed
                      ? "text-gray-400 bg-gray-500/10 border-gray-500/20"
                      : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"}`}>
                    {closed ? "CLOSED" : "OPEN"}
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Shared shell — the two pages differ only by which rows they keep. */
function HoldingsPage({ title, subtitle, filter, emptyText, Icon }) {
  const navigate = useNavigate();
  const { quotes, updatedAt: quotesUpdatedAt } = useLiveQuotes();

  const [rowsRaw, setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(""); }
    try {
      const listRes  = await fetch(`${API_BASE}/portfolios/my`, { headers: authHdr() });
      const listData = await listRes.json();
      const ports    = listData.bool ? (listData.response?.portfolios || []) : [];
      if (ports.length === 0) { setRows([]); return; }

      const p   = ports.find(x => x.is_default) || ports[0];
      const res = await fetch(`${API_BASE}/portfolios/${p.portfolio_id}?include_closed=1`, { headers: authHdr() });
      const d   = await res.json();
      if (d.bool) setRows(d.response?.holdings || []);
    } catch {
      if (!silent) setError("Could not load your positions. Please try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Same reasoning as the portfolio page: positions change on trades, which can
  // happen anywhere — including the server's own stop-loss and square-off fills.
  useEffect(() => {
    if (!quotesUpdatedAt) return;
    load({ silent: true });
  }, [quotesUpdatedAt, load]);

  // Live price laid over the top, then the page's own slice, then ranked by
  // what each row is currently worth.
  const rows = useMemo(() => {
    const live = liveHoldings(rowsRaw, quotes) || [];
    return live.filter(filter).sort((a, b) => {
      const v = (h) => Number(h.current_value || 0) || Number(h.quantity || 0) * Number(h.current_price || 0);
      return v(b) - v(a);
    });
  }, [rowsRaw, quotes, filter]);

  const invested = rows.reduce((s, h) => s + Number(h.total_invested || 0), 0);
  const value    = rows.reduce((s, h) => s + (h.is_active === false ? 0 : Number(h.current_value || 0)), 0);
  const pnl      = rows.reduce((s, h) => s + Number(
    h.is_active === false ? (h.realized_pnl || 0) : (h.unrealized_pnl || 0)), 0);
  const up       = pnl >= 0;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <button onClick={() => navigate("/user")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Icon className="w-5 h-5 text-cyan-400" /> {title}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <button onClick={() => load()}
          className="p-2 rounded-xl bg-[#0C1220] border border-white/8 text-gray-400 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Totals for whatever this page is showing */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Positions",     value: String(rows.length) },
          { label: "Invested",      value: inr(invested) },
          { label: "Current Value", value: inr(value) },
          { label: "Profit / Loss", value: inr(pnl, { signed: true }), tone: up ? "text-emerald-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-500">{c.label}</div>
            <div className={`text-lg font-bold mt-1 tabular-nums ${c.tone || "text-white"}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
        {error && (
          <div className="flex items-center gap-2 mx-5 my-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : (
          <HoldingsTable
            rows={rows}
            emptyText={emptyText}
            onRowClick={(h) => h.ticker_symbol && navigate(`/user/stock/${h.ticker_symbol}`)}
          />
        )}
      </div>
    </div>
  );
}

/* Delivery is owned outright, so it stays here whatever the market is doing. */
const isDelivery = (h) => (h.trade_mode || "DELIVERY") === "DELIVERY" && h.is_active !== false;

/* The server flags this — see _is_open_position_today. The browser must not
   re-derive "today" from its own clock, which may be in another timezone. */
const isOpenToday = (h) => h.is_open_position === true;

export function UserHoldings() {
  return (
    <HoldingsPage
      title="Holdings"
      subtitle="Delivery shares held in your portfolio until you sell them"
      Icon={Briefcase}
      filter={isDelivery}
      emptyText="No delivery holdings yet."
    />
  );
}

export function UserPositions() {
  return (
    <HoldingsPage
      title="Open Positions"
      subtitle="Intraday positions opened today and still open — squared off automatically at market close"
      Icon={PieChart}
      filter={isOpenToday}
      emptyText="No open positions today."
    />
  );
}

export default UserHoldings;
