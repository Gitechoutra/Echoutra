import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Star,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Activity,
  Bell,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

const timeframes = ["1D", "1W", "1M", "3M", "6M", "1Y"];

export function StockDetailPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();

  const [stock, setStock] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [news, setNews] = useState([]);
  const [watchlistId, setWatchlistId] = useState(null);
  const [watchlistItemId, setWatchlistItemId] = useState(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [wallet, setWallet] = useState(null);

  const [timeframe, setTimeframe] = useState("3M");
  const [tradeType, setTradeType] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [quantity, setQuantity] = useState("10");
  const [limitPrice, setLimitPrice] = useState("");
  const [showOrderConfirm, setShowOrderConfirm] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderError, setOrderError] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [stockRes, historyRes, newsRes, watchlistRes, walletRes] = await Promise.all([
        fetch(`${API_BASE}/stocks/ticker/${symbol}`, { headers }),
        fetch(`${API_BASE}/stocks/ticker/${symbol}`, { headers }).then(() =>
          fetch(`${API_BASE}/stocks/list`, { headers })
        ),
        fetch(`${API_BASE}/news/list`, { headers }),
        fetch(`${API_BASE}/watchlists/my`, { headers }),
        fetch(`${API_BASE}/wallets/me`, { headers }),
      ]);

      // Fetch stock by ticker
      const stockData = await stockRes.json();
      if (stockData.bool) {
        const s = stockData.response;
        setStock({
          id: s.stock_id || s.id,
          symbol: s.symbol || s.ticker || symbol,
          name: s.name || s.company_name,
          price: s.price || s.current_price || 0,
          change: s.change || s.price_change || 0,
          changePct: s.change_pct || s.price_change_pct || 0,
          marketCap: s.market_cap_formatted || s.market_cap || "N/A",
          pe: s.pe_ratio || s.pe || 0,
          volume: s.volume_formatted || s.volume || "N/A",
          sector: s.sector || "N/A",
          high52: s.high_52w || s.week_52_high || 0,
          low52: s.low_52w || s.week_52_low || 0,
          description: s.description || "",
        });

        // Fetch price history using stock_id
        const stockId = s.stock_id || s.id;
        if (stockId) {
          const histRes = await fetch(`${API_BASE}/stocks/${stockId}/price_history`, { headers });
          const histData = await histRes.json();
          if (histData.bool) {
            const raw = histData.response?.history || histData.response || [];
            setPriceHistory(raw.map((p) => ({ date: p.date, close: p.close || p.price, volume: p.volume || 0 })));
          }

          // Fetch news for this stock
          const stockNewsRes = await fetch(`${API_BASE}/news/stock/${stockId}`, { headers });
          const stockNewsData = await stockNewsRes.json();
          if (stockNewsData.bool) {
            setNews(stockNewsData.response?.news || stockNewsData.response || []);
          }
        }
      } else {
        setError(`Stock "${symbol}" not found.`);
      }

      // Wallet
      const walletData = await walletRes.json();
      if (walletData.bool) setWallet(walletData.response);

      // Watchlist
      const wlData = await watchlistRes.json();
      if (wlData.bool) {
        const lists = wlData.response?.watchlists || wlData.response || [];
        if (lists.length > 0) {
          const wl = lists[0];
          const wid = wl.watchlist_id || wl.id;
          setWatchlistId(wid);
          const items = wl.items || [];
          const item = items.find((i) => (i.symbol || i.stock_symbol) === symbol);
          if (item) {
            setInWatchlist(true);
            setWatchlistItemId(item.item_id || item.id);
          }
        }
      }
    } catch {
      setError("Network error. Could not load stock data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [symbol]);

  const toggleWatchlist = async () => {
    if (!watchlistId) return;
    if (inWatchlist && watchlistItemId) {
      try {
        await fetch(`${API_BASE}/watchlists/${watchlistId}/items/${watchlistItemId}/remove`, { method: "DELETE", headers });
        setInWatchlist(false);
        setWatchlistItemId(null);
      } catch {}
    } else {
      try {
        const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/items/add`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ symbol }),
        });
        const data = await res.json();
        if (data.bool) {
          setInWatchlist(true);
          setWatchlistItemId(data.response?.item_id || data.response?.id);
        }
      } catch {}
    }
  };

  const placeOrder = async () => {
    if (!stock?.id) return;
    setOrderLoading(true);
    setOrderError("");
    try {
      const execPrice = orderType === "limit" && limitPrice ? parseFloat(limitPrice) : stock.price;
      const body = {
        stock_id: stock.id,
        order_type: orderType.toUpperCase(),
        trade_type: tradeType.toUpperCase(),
        quantity: parseFloat(quantity),
        price: execPrice,
      };
      if (orderType === "limit") body.limit_price = execPrice;
      const res = await fetch(`${API_BASE}/trade_orders/place`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.bool) {
        setOrderError(data.response?.message || "Order failed.");
        setOrderLoading(false);
        return;
      }
      setShowOrderConfirm(false);
      setOrderSuccess(true);
      setTimeout(() => setOrderSuccess(false), 4000);
    } catch {
      setOrderError("Network error placing order.");
    } finally {
      setOrderLoading(false);
    }
  };

  const sliceMap = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 };
  const chartSlice = sliceMap[timeframe] || 90;
  const chartData = priceHistory.slice(-chartSlice);
  const volumeData = chartData.slice(-30).map((d) => ({ date: d.date, volume: d.volume }));

  const execPrice = orderType === "limit" && limitPrice ? parseFloat(limitPrice) : (stock?.price || 0);
  const totalCost = parseFloat(quantity || "0") * execPrice;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading stock data...</p>
      </div>
    );
  }

  if (error || !stock) {
    return (
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors mb-5">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error || "Stock not found."}
        </div>
      </div>
    );
  }

  const up = stock.changePct >= 0;
  const metrics = [
    { label: "52W High", value: stock.high52 ? `$${stock.high52.toFixed(2)}` : "N/A" },
    { label: "52W Low", value: stock.low52 ? `$${stock.low52.toFixed(2)}` : "N/A" },
    { label: "Market Cap", value: stock.marketCap },
    { label: "P/E Ratio", value: stock.pe ? stock.pe.toFixed(1) : "N/A" },
    { label: "Volume", value: stock.volume },
    { label: "Sector", value: stock.sector },
    { label: "Avg Volume", value: "34.2M" },
    { label: "Dividend", value: "0.96%" },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Success toast */}
      {orderSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed top-24 right-6 z-50 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl shadow-xl"
        >
          <Activity className="w-5 h-5" />
          <div>
            <div className="text-sm font-medium">Order Placed Successfully!</div>
            <div className="text-xs text-emerald-500/70">
              {tradeType === "buy" ? "Buy" : "Sell"} {quantity} {stock.symbol}
            </div>
          </div>
        </motion.div>
      )}

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Markets
      </button>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Header */}
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-cyan-400">{stock.symbol.slice(0, 2)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white">{stock.symbol}</span>
                      <span className="px-2 py-0.5 bg-[#1A2235] rounded text-xs text-gray-500">{stock.sector}</span>
                    </div>
                    <div className="text-sm text-gray-500">{stock.name}</div>
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="text-3xl font-bold text-white">${stock.price.toFixed(2)}</div>
                  <div className={`flex items-center gap-1.5 pb-1 ${up ? "text-emerald-400" : "text-red-400"}`}>
                    {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span className="text-base font-medium">{up ? "+" : ""}{stock.change.toFixed(2)}</span>
                    <span className="text-sm">({up ? "+" : ""}{stock.changePct.toFixed(2)}%)</span>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · NASDAQ
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleWatchlist}
                  className={`p-2 rounded-lg border transition-all ${
                    inWatchlist
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                      : "bg-[#1A2235] border-[#1E2D4A] text-gray-500 hover:text-white"
                  }`}
                >
                  <Star className={`w-4 h-4 ${inWatchlist ? "fill-amber-400" : ""}`} />
                </button>
                <button className="p-2 rounded-lg border bg-[#1A2235] border-[#1E2D4A] text-gray-500 hover:text-white transition-all">
                  <Bell className="w-4 h-4" />
                </button>
                <button onClick={fetchData} className="p-2 rounded-lg border bg-[#1A2235] border-[#1E2D4A] text-gray-500 hover:text-white transition-all">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chart timeframes */}
            <div className="flex gap-1 mb-4">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                    timeframe === tf
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      : "text-gray-600 hover:text-gray-400"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Price Chart */}
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={up ? "#10B981" : "#EF4444"} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={up ? "#10B981" : "#EF4444"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "#0F1629", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11 }}
                    formatter={(v) => [`$${v?.toFixed(2)}`, "Price"]}
                  />
                  <Area type="monotone" dataKey="close" stroke={up ? "#10B981" : "#EF4444"} strokeWidth={2} fill="url(#stockGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
            <div className="text-sm font-medium text-white mb-4">Key Metrics</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {metrics.map((m, i) => (
                <div key={i}>
                  <div className="text-xs text-gray-600 mb-1">{m.label}</div>
                  <div className="text-sm font-medium text-white">{m.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Volume Chart */}
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-white">Volume (30 days)</span>
            </div>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData} barSize={8}>
                  <XAxis dataKey="date" tick={{ fill: "#6B7280", fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <Bar dataKey="volume" radius={[2, 2, 0, 0]}>
                    {volumeData.map((_, i) => (
                      <Cell key={i} fill={i === volumeData.length - 1 ? "#06B6D4" : "#1E2D4A"} />
                    ))}
                  </Bar>
                  <Tooltip
                    contentStyle={{ background: "#0F1629", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11 }}
                    formatter={(v) => [v?.toLocaleString(), "Volume"]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* About */}
          {stock.description && (
            <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
              <div className="text-sm font-medium text-white mb-3">About {stock.name}</div>
              <p className="text-sm text-gray-500 leading-relaxed">{stock.description}</p>
            </div>
          )}

          {/* Related News */}
          {news.length > 0 && (
            <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D4A]">
                <div className="text-sm font-medium text-white">Related News</div>
                <button
                  onClick={() => navigate("/app/news")}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  View All <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="divide-y divide-[#1E2D4A]/50">
                {news.slice(0, 3).map((n, i) => (
                  <div key={i} className="px-5 py-3 hover:bg-white/5 transition-colors cursor-pointer">
                    <div className="text-sm text-white leading-snug mb-1">{n.title || n.headline}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>{n.source}</span>
                      <span>·</span>
                      <span>{n.published_at ? new Date(n.published_at).toLocaleDateString() : n.time || ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analyst ratings */}
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
            <div className="text-sm font-medium text-white mb-4">Analyst Ratings</div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full border-4 border-emerald-500 flex items-center justify-center">
                <span className="text-lg font-bold text-emerald-400">82</span>
              </div>
              <div>
                <div className="text-sm font-medium text-emerald-400">Strong Buy</div>
                <div className="text-xs text-gray-500">Based on 28 analysts</div>
              </div>
            </div>
            {[
              { label: "Strong Buy", count: 18, pct: 64 },
              { label: "Buy", count: 7, pct: 25 },
              { label: "Hold", count: 3, pct: 11 },
              { label: "Sell", count: 0, pct: 0 },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-500 w-20">{r.label}</span>
                <div className="flex-1 h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.label.includes("Buy") ? "bg-emerald-500" : r.label === "Hold" ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600">{r.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar — Trade panel */}
        <div className="space-y-5">
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
            {/* Buy/Sell toggle */}
            <div className="grid grid-cols-2">
              <button
                onClick={() => setTradeType("buy")}
                className={`py-3.5 text-sm font-medium transition-all ${
                  tradeType === "buy"
                    ? "bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500"
                    : "text-gray-500 hover:text-gray-300 border-b border-[#1E2D4A]"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setTradeType("sell")}
                className={`py-3.5 text-sm font-medium transition-all ${
                  tradeType === "sell"
                    ? "bg-red-500/10 text-red-400 border-b-2 border-red-500"
                    : "text-gray-500 hover:text-gray-300 border-b border-[#1E2D4A]"
                }`}
              >
                Sell
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Order type */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Order Type</label>
                <div className="flex gap-2">
                  {["market", "limit", "stop"].map((ot) => (
                    <button
                      key={ot}
                      onClick={() => setOrderType(ot)}
                      className={`flex-1 py-2 text-xs rounded-lg border capitalize transition-all ${
                        orderType === ot
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                          : "border-[#1E2D4A] bg-[#1A2235] text-gray-500 hover:text-white"
                      }`}
                    >
                      {ot}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Quantity (Shares)</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                  className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Limit price */}
              {orderType !== "market" && (
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">
                    {orderType === "limit" ? "Limit Price" : "Stop Price"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      placeholder={stock.price.toFixed(2)}
                      className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg pl-6 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="bg-[#1A2235] rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Market Price</span>
                  <span className="text-white">${stock.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Quantity</span>
                  <span className="text-white">{quantity || 0} shares</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Commission</span>
                  <span className="text-emerald-400">$0.00</span>
                </div>
                <div className="pt-2 border-t border-[#1E2D4A] flex justify-between text-sm">
                  <span className="text-gray-400">Est. Total</span>
                  <span className="text-white font-medium">
                    ${totalCost.toLocaleString("en", { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Buying Power</span>
                <span className="text-white">
                  ${(wallet?.balance || wallet?.available_balance || 0).toLocaleString("en", { maximumFractionDigits: 2 })}
                </span>
              </div>

              <button
                onClick={() => setShowOrderConfirm(true)}
                className={`w-full py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90 ${
                  tradeType === "buy"
                    ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
                    : "bg-gradient-to-r from-red-500 to-red-600 text-white"
                }`}
              >
                Review {tradeType === "buy" ? "Buy" : "Sell"} Order
              </button>
            </div>
          </div>

          {/* Analyst ratings mini */}
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
            <div className="text-sm font-medium text-white mb-4">Analyst Ratings</div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full border-4 border-emerald-500 flex items-center justify-center">
                <span className="text-lg font-bold text-emerald-400">82</span>
              </div>
              <div>
                <div className="text-sm font-medium text-emerald-400">Strong Buy</div>
                <div className="text-xs text-gray-500">Based on 28 analysts</div>
              </div>
            </div>
            {[
              { label: "Strong Buy", count: 18, pct: 64 },
              { label: "Buy", count: 7, pct: 25 },
              { label: "Hold", count: 3, pct: 11 },
              { label: "Sell", count: 0, pct: 0 },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-500 w-20">{r.label}</span>
                <div className="flex-1 h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.label.includes("Buy") ? "bg-emerald-500" : r.label === "Hold" ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Order Confirm Modal */}
      {showOrderConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#0F1629] border border-[#1E2D4A] rounded-2xl p-6 w-full max-w-sm"
          >
            <div className="text-center mb-6">
              <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${tradeType === "buy" ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                <Activity className={`w-6 h-6 ${tradeType === "buy" ? "text-emerald-400" : "text-red-400"}`} />
              </div>
              <div className="text-lg font-bold text-white mb-1">Confirm Order</div>
              <div className="text-sm text-gray-500">Review your order details below</div>
            </div>

            <div className="bg-[#1A2235] rounded-xl p-4 space-y-3 mb-5">
              {[
                { label: "Action", value: tradeType === "buy" ? "Buy" : "Sell", highlight: true },
                { label: "Symbol", value: `${stock.symbol} - ${stock.name}` },
                { label: "Quantity", value: `${quantity} shares` },
                { label: "Order Type", value: orderType.charAt(0).toUpperCase() + orderType.slice(1) },
                { label: "Price", value: `$${stock.price.toFixed(2)}` },
                { label: "Est. Total", value: `$${totalCost.toLocaleString("en", { maximumFractionDigits: 2 })}` },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{item.label}</span>
                  <span className={item.highlight ? (tradeType === "buy" ? "text-emerald-400 font-medium" : "text-red-400 font-medium") : "text-white"}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            {orderError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 mb-4">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {orderError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowOrderConfirm(false); setOrderError(""); }}
                className="py-2.5 bg-[#1A2235] border border-[#1E2D4A] rounded-xl text-sm text-gray-400 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={placeOrder}
                disabled={orderLoading}
                className={`py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 ${tradeType === "buy" ? "bg-emerald-500" : "bg-red-500"}`}
              >
                {orderLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : `Confirm ${tradeType === "buy" ? "Buy" : "Sell"}`}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
















