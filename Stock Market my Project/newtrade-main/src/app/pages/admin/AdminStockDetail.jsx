import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft, TrendingUp, TrendingDown, Lock, Edit2, ShieldAlert,
} from "lucide-react";
import { StockChart } from "../../components/StockChart";
import { StockTabs } from "../../components/StockTabs";
import { useLiveQuotes, liveStock } from "../../context/LiveQuotesContext";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

const inr = (v, d = 2) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

/**
 * Admin read-only stock view. Shows the same live chart + market data (Stats,
 * Depth) a user sees, but with NO buy/sell — admins manage stocks, they don't trade.
 */
export function AdminStockDetail() {
  const { symbol } = useParams();
  const navigate   = useNavigate();

  const [stockRaw, setStock]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Price comes from the shared quote poll, so this page shows exactly what the
  // user portal shows for the same stock at the same moment.
  const { quotes } = useLiveQuotes();
  const stock = useMemo(() => liveStock(stockRaw, quotes), [stockRaw, quotes]);

  const fetchStock = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${API_BASE}/stocks/ticker/${symbol}`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool && data.response) setStock(data.response);
      else setError("Stock not found.");
    } catch { setError("Failed to load stock data."); }
    finally { setLoading(false); }
  }, [symbol]);

  useEffect(() => { fetchStock(); }, [fetchStock]);

  if (loading) return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
    </div>
  );
  if (error || !stock) return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <button onClick={() => navigate("/admin/stocks")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to stocks
      </button>
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center text-red-400">
        {error || "Stock not found."}
      </div>
    </div>
  );

  const up = (stock.price_change_percent || 0) >= 0;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <button onClick={() => navigate("/admin/stocks")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to stocks
      </button>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: header + chart + tabs */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/15 flex items-center justify-center overflow-hidden">
                  {stock.logo_url
                    ? <img src={stock.logo_url} alt={stock.ticker_symbol} className="w-full h-full object-contain p-0.5" onError={(e) => { e.target.style.display = "none"; }} />
                    : <span className="text-sm font-bold text-violet-300">{stock.ticker_symbol?.slice(0, 2)}</span>}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">{stock.ticker_symbol}</span>
                    <span className="px-2 py-0.5 bg-white/5 rounded text-xs text-gray-500">{stock.sector || "General"}</span>
                    <span className="px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded text-xs text-violet-300 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> Admin view
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">{stock.company_name}</div>
                  <div className="flex items-end gap-3 mt-2">
                    <div className="text-3xl font-bold text-white">{inr(stock.current_price)}</div>
                    <div className={`flex items-center gap-1.5 pb-1 ${up ? "text-emerald-400" : "text-red-400"}`}>
                      {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span className="text-base font-medium">{up ? "+" : ""}{parseFloat(stock.price_change || 0).toFixed(2)}</span>
                      <span className="text-sm">({up ? "+" : ""}{parseFloat(stock.price_change_percent || 0).toFixed(2)}%)</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{stock.exchange || "NSE"} · Real-time</div>
                </div>
              </div>
              <button onClick={() => navigate("/admin/stocks")}
                title="Manage this stock in All Stocks"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 hover:bg-cyan-500/20 transition-all">
                <Edit2 className="w-3.5 h-3.5" /> Manage
              </button>
            </div>

            <StockChart
              stockId={stock.stock_id}
              symbol={stock.ticker_symbol}
              currentPrice={stock.current_price}
              currency="₹"
              accent="violet"
              height={260}
            />
          </div>

          {/* Stats · Depth (no personal Orders/Positions for admin) */}
          <StockTabs
            stock={stock}
            myHolding={null}
            symbol={stock.ticker_symbol}
            stockId={stock.stock_id}
            tabs={["Stats", "Depth"]}
            accent="violet"
          />
        </div>

        {/* Right: read-only info (no trading) */}
        <div className="space-y-5 self-start lg:sticky lg:top-6">
          {/* Trading disabled notice */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-white">Trading disabled</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Admins can view live prices, charts and market data but cannot place buy or sell
              orders. Use <span className="text-cyan-400">All Stocks → Update</span> to manage
              pricing and listing details.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button disabled title="Admins cannot trade"
                className="py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-[#141C30] border border-white/5 cursor-not-allowed flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Buy
              </button>
              <button disabled title="Admins cannot trade"
                className="py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-[#141C30] border border-white/5 cursor-not-allowed flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Sell
              </button>
            </div>
          </div>

          {/* Reference details (only fields we actually have) */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
            <div className="text-sm font-medium text-white mb-4">Details</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Exchange",  stock.exchange || "—"],
                ["Currency",  stock.currency || "INR"],
                ["Sector",    stock.sector || "—"],
                ["ISIN",      stock.isin || "—"],
                ["52W High",  stock.week_52_high != null ? inr(stock.week_52_high) : "—"],
                ["52W Low",   stock.week_52_low  != null ? inr(stock.week_52_low)  : "—"],
              ].map(([l, v]) => (
                <div key={l} className="bg-[#141C30] rounded-xl p-3">
                  <div className="text-xs text-gray-600 mb-1">{l}</div>
                  <div className="text-sm font-medium text-white truncate">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
