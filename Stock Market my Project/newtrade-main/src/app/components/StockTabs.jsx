import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { BarChart2, Layers, ClipboardList, Briefcase, ArrowRight } from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

const inr = (v, d = 2) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const fmtVol = (v) => {
  const n = Number(v || 0);
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return n.toLocaleString("en-IN");
  return `${n}`;
};

const ALL_TABS = [
  { key: "Stats",     icon: BarChart2 },
  { key: "Depth",     icon: Layers },
  { key: "Orders",    icon: ClipboardList },
  { key: "Positions", icon: Briefcase },
];

// Deterministic-ish 5-level order book synthesised around the live price.
function buildDepth(ltp) {
  const p = Number(ltp) || 100;
  const tick = Math.max(0.05, +(p * 0.0004).toFixed(2));
  const q = (base) => Math.round(base * (0.6 + Math.random() * 1.8));
  const bids = [], asks = [];
  for (let i = 0; i < 5; i++) {
    bids.push({ price: +(p - tick * (i + 1)).toFixed(2), qty: q(2500 - i * 200) });
    asks.push({ price: +(p + tick * (i + 1)).toFixed(2), qty: q(2500 - i * 200) });
  }
  const totalBuy  = bids.reduce((a, b) => a + b.qty, 0);
  const totalSell = asks.reduce((a, b) => a + b.qty, 0);
  return { bids, asks, totalBuy, totalSell };
}

const statusColor = (s) => ({
  FILLED:   "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  PENDING:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
  OPEN:     "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  PARTIAL:  "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  CANCELLED:"text-gray-400 bg-gray-500/10 border-gray-500/20",
  REJECTED: "text-red-400 bg-red-500/10 border-red-500/20",
}[String(s || "").toUpperCase()] || "text-gray-400 bg-gray-500/10 border-gray-500/20");

/**
 * Tabbed panel shown below the chart: Stats · Depth · Orders · Positions.
 * Stats/Depth come from the loaded `stock` (depth is a synthesised order book,
 * since the platform has no live L2 feed). Orders are fetched per-stock;
 * Positions come from the user's holding in this stock.
 */
export function StockTabs({ stock, myHolding, symbol, stockId, tabs, accent = "cyan" }) {
  const navigate = useNavigate();
  const shown = tabs?.length ? ALL_TABS.filter((t) => tabs.includes(t.key)) : ALL_TABS;
  const [tab, setTab] = useState(shown[0]?.key || "Stats");
  const activeCls = accent === "violet"
    ? "text-violet-300 border-violet-500 bg-violet-500/5"
    : "text-cyan-400 border-cyan-500 bg-cyan-500/5";
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const num = (v) => (v === null || v === undefined || v === "" ? null : parseFloat(v));
  const ltp       = num(stock?.current_price);
  const prevClose = num(stock?.previous_close);

  const depth = useMemo(() => buildDepth(ltp), [ltp]);

  const [cancellingId, setCancellingId] = useState(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!stockId) return;
    if (!silent) setOrdersLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/trade_orders/my?stock_id=${stockId}&per_page=25`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) setOrders(data.response?.orders || []);
    } catch { /* silent */ }
    finally { if (!silent) setOrdersLoading(false); }
  }, [stockId]);

  // Cancel a pending/open order and optimistically refresh the list.
  const cancelOrder = useCallback(async (orderId) => {
    setCancellingId(orderId);
    try {
      const res  = await fetch(`${API_BASE}/trade_orders/${orderId}/cancel`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelled by user" }),
      });
      const data = await res.json();
      if (data.bool) await fetchOrders(true);
    } catch { /* silent */ }
    finally { setCancellingId(null); }
  }, [fetchOrders]);

  // Load when the Orders tab opens, then poll every 10s (matching the engine's
  // cadence) so a PENDING order visibly flips to FILLED as soon as it triggers.
  useEffect(() => {
    if (tab !== "Orders") return;
    fetchOrders();
    const id = setInterval(() => fetchOrders(true), 10000);
    return () => clearInterval(id);
  }, [tab, fetchOrders]);

  // ── Stats rows ──────────────────────────────────────────────────────────────
  const statRows = [
    ["Open",        stock?.open_price      != null ? inr(stock.open_price) : "—"],
    ["High",        stock?.day_high        != null ? inr(stock.day_high)   : "—"],
    ["Low",         stock?.day_low         != null ? inr(stock.day_low)    : "—"],
    ["Prev. close", prevClose              != null ? inr(prevClose)        : "—"],
    ["LTP",         ltp                    != null ? inr(ltp)              : "—"],
    ["Ch. in LTP %", `${num(stock?.price_change_percent) >= 0 ? "+" : ""}${num(stock?.price_change_percent)?.toFixed(2) ?? "0.00"}%`],
    ["Volume",      stock?.volume          != null ? fmtVol(stock.volume) : "—"],
    ["Avg. traded", (num(stock?.day_high) && num(stock?.day_low)) ? inr((num(stock.day_high) + num(stock.day_low)) / 2) : "—"],
    ["52W High",    stock?.week_52_high    != null ? inr(stock.week_52_high) : "—"],
    ["52W Low",     stock?.week_52_low     != null ? inr(stock.week_52_low)  : "—"],
    ["Upper circuit", prevClose != null ? inr(prevClose * 1.2) : "—"],
    ["Lower circuit", prevClose != null ? inr(prevClose * 0.8) : "—"],
  ];

  const buyPct = depth.totalBuy + depth.totalSell > 0
    ? (depth.totalBuy / (depth.totalBuy + depth.totalSell)) * 100 : 50;

  return (
    <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-white/5">
        {shown.map(({ key, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all border-b-2 ${
              tab === key ? activeCls : "text-gray-500 hover:text-gray-300 border-transparent"}`}>
            <Icon className="w-4 h-4" /> {key}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* ── STATS ── */}
        {tab === "Stats" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {statRows.map(([l, v]) => (
              <div key={l} className="bg-[#141C30] rounded-xl p-3">
                <div className="text-xs text-gray-600 mb-1">{l}</div>
                <div className={`text-sm font-medium ${
                  l === "Ch. in LTP %"
                    ? (num(stock?.price_change_percent) >= 0 ? "text-emerald-400" : "text-red-400")
                    : "text-white"}`}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── DEPTH ── */}
        {tab === "Depth" && (
          <div>
            <div className="grid grid-cols-2 gap-x-6">
              {/* Bids */}
              <div>
                <div className="flex justify-between text-[11px] text-gray-600 mb-1.5 px-1">
                  <span>Qty.</span><span>Bid</span>
                </div>
                {depth.bids.map((b, i) => (
                  <div key={i} className="relative flex justify-between text-xs py-1.5 px-1 rounded">
                    <div className="absolute inset-0 bg-emerald-500/8 rounded"
                         style={{ width: `${(b.qty / Math.max(...depth.bids.map(x => x.qty))) * 100}%` }} />
                    <span className="relative text-gray-300">{b.qty.toLocaleString("en-IN")}</span>
                    <span className="relative text-emerald-400 font-medium">{b.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {/* Asks */}
              <div>
                <div className="flex justify-between text-[11px] text-gray-600 mb-1.5 px-1">
                  <span>Ask</span><span>Qty.</span>
                </div>
                {depth.asks.map((a, i) => (
                  <div key={i} className="relative flex justify-between text-xs py-1.5 px-1 rounded">
                    <div className="absolute inset-y-0 right-0 bg-red-500/8 rounded"
                         style={{ width: `${(a.qty / Math.max(...depth.asks.map(x => x.qty))) * 100}%` }} />
                    <span className="relative text-red-400 font-medium">{a.price.toFixed(2)}</span>
                    <span className="relative text-gray-300">{a.qty.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals + ratio */}
            <div className="mt-4 pt-3 border-t border-white/5">
              <div className="flex justify-between text-xs mb-2">
                <span className="text-gray-500">Total buy qty. <span className="text-emerald-400 font-medium">{depth.totalBuy.toLocaleString("en-IN")}</span></span>
                <span className="text-gray-500"><span className="text-red-400 font-medium">{depth.totalSell.toLocaleString("en-IN")}</span> Total sell qty.</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                <div className="bg-emerald-500" style={{ width: `${buyPct}%` }} />
                <div className="bg-red-500" style={{ width: `${100 - buyPct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>{buyPct.toFixed(0)}%</span><span>{(100 - buyPct).toFixed(0)}%</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-700 mt-3">Simulated market depth — no live L2 feed configured.</p>
          </div>
        )}

        {/* ── ORDERS ── */}
        {tab === "Orders" && (
          <div>
            {ordersLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ClipboardList className="w-8 h-8 text-gray-700 mb-2" />
                <p className="text-sm text-gray-400">No orders placed for {symbol}</p>
                <button onClick={() => navigate("/user/transactions")}
                  className="mt-3 flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl bg-[#141C30] border border-white/8 text-gray-300 hover:text-white hover:border-cyan-500/30 transition-all">
                  View all orders <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.order_id} className="flex items-center justify-between bg-[#141C30] rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${o.order_side === "BUY" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
                        {o.order_side}
                      </span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${(o.trade_mode || "DELIVERY") === "INTRADAY" ? "text-violet-300 bg-violet-500/10 border-violet-500/20" : "text-cyan-300 bg-cyan-500/10 border-cyan-500/20"}`}>
                        {(o.trade_mode || "DELIVERY") === "INTRADAY" ? "INTRADAY" : "DELIVERY"}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm text-white">{o.quantity} qty · {o.order_type}</div>
                        <div className="text-[11px] text-gray-600">
                          {o.avg_fill_price
                            ? `@ ${inr(o.avg_fill_price)}`
                            : o.stop_price
                              ? `Stop ${inr(o.stop_price)}`
                              : o.limit_price
                                ? `Limit ${inr(o.limit_price)}`
                                : "Market"} · {new Date(o.submitted_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusColor(o.order_status)}`}>
                        {o.order_status}
                      </span>
                      {["PENDING", "OPEN", "PARTIALLY_FILLED"].includes(String(o.order_status).toUpperCase()) && (
                        <button
                          onClick={() => cancelOrder(o.order_id)}
                          disabled={cancellingId === o.order_id}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-all">
                          {cancellingId === o.order_id ? "…" : "Cancel"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button onClick={() => navigate("/user/transactions")}
                  className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-xl bg-[#141C30] border border-white/8 text-gray-300 hover:text-white hover:border-cyan-500/30 transition-all">
                  View all orders <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── POSITIONS ── */}
        {tab === "Positions" && (
          <div>
            {myHolding ? (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ["Qty.",      parseFloat(myHolding.quantity || 0).toFixed(2)],
                    ["Avg. cost", inr(myHolding.average_buy_price)],
                    ["LTP",       inr(ltp)],
                    ["Cur. value",inr(myHolding.current_value)],
                  ].map(([l, v]) => (
                    <div key={l} className="bg-[#141C30] rounded-xl p-3">
                      <div className="text-xs text-gray-600 mb-1">{l}</div>
                      <div className="text-sm font-medium text-white">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between bg-[#141C30] rounded-xl px-4 py-3">
                  <span className="text-sm text-gray-400">Unrealised P&amp;L</span>
                  <span className={`text-base font-bold ${parseFloat(myHolding.unrealized_pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {parseFloat(myHolding.unrealized_pnl || 0) >= 0 ? "+" : "-"}{inr(Math.abs(parseFloat(myHolding.unrealized_pnl || 0)))}
                  </span>
                </div>
                <button onClick={() => navigate("/user/portfolio")}
                  className="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-xl bg-[#141C30] border border-white/8 text-gray-300 hover:text-white hover:border-cyan-500/30 transition-all">
                  View all positions <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Briefcase className="w-8 h-8 text-gray-700 mb-2" />
                <p className="text-sm text-gray-400">No position in {symbol}</p>
                <button onClick={() => navigate("/user/portfolio")}
                  className="mt-3 flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl bg-[#141C30] border border-white/8 text-gray-300 hover:text-white hover:border-cyan-500/30 transition-all">
                  View all positions <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
