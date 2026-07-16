import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Star, Plus, X, TrendingUp, TrendingDown, Bell, Search, AlertCircle } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

export function UserWatchlist() {
  const navigate = useNavigate();

  const [watchlistId,    setWatchlistId]    = useState(null);
  const [watchlistItems, setWatchlistItems] = useState([]); // [{ item_id, stock_id, ticker_symbol, ... }]
  const [stocksData,     setStocksData]     = useState({}); // { ticker_symbol: stockObj }
  const [allStocks,      setAllStocks]      = useState([]); // full stocks list for "add" dropdown
  const [priceHistory,   setPriceHistory]   = useState({}); // { ticker: chartData[] }
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");

  const [search,   setSearch]   = useState("");
  const [addOpen,  setAddOpen]  = useState(false);
  const [alertSym, setAlertSym] = useState(null);
  const [alertPx,  setAlertPx]  = useState("");

  // ── Fetch or create default watchlist ─────────────────────────────────────
  const fetchWatchlist = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/watchlists/my`, { headers: authHdr() });
      const data = await res.json();

      if (data.bool && data.response?.watchlists?.length > 0) {
        const wl = data.response.watchlists[0];
        setWatchlistId(wl.watchlist_id);

        // Load full watchlist with items
        const detailRes  = await fetch(`${API_BASE}/watchlists/${wl.watchlist_id}`, { headers: authHdr() });
        const detailData = await detailRes.json();
        if (detailData.bool) {
          const items = detailData.response?.items || [];
          setWatchlistItems(items);

          // Build stocksData map from the items already returned
          const map = { ...stocksData };
          items.forEach((item) => {
            if (item.ticker_symbol) {
              map[item.ticker_symbol] = {
                stock_id:            item.stock_id,
                ticker_symbol:       item.ticker_symbol,
                company_name:        item.company_name,
                logo_url:            item.logo_url,
                sector:              item.sector,
                current_price:       item.current_price,
                price_change_percent:item.price_change_percent,
              };
            }
          });
          setStocksData(map);

          // Build mini chart data per item
          const history = { ...priceHistory };
          items.forEach((item) => {
            if (!history[item.ticker_symbol] && item.current_price) {
              const base = parseFloat(item.current_price || 0);
              history[item.ticker_symbol] = Array.from({ length: 15 }, (_, i) => ({
                close: base * (1 + (Math.random() - 0.5) * 0.04),
              }));
            }
          });
          setPriceHistory(history);
        }
        return wl;
      } else {
        // Create a default watchlist if none exists
        const createRes  = await fetch(`${API_BASE}/watchlists/create`, {
          method:  "POST",
          headers: { ...authHdr(), "Content-Type": "application/json" },
          body:    JSON.stringify({ watchlist_name: "My Watchlist" }),
        });
        const createData = await createRes.json();
        if (createData.bool) {
          setWatchlistId(createData.response?.watchlist_id);
          setWatchlistItems([]);
        }
        return null;
      }
    } catch (err) {
      console.error("Failed to fetch watchlist:", err);
      setError("Failed to load watchlist.");
      return null;
    }
  }, []); // eslint-disable-line

  // ── Fetch all stocks for the "Add Stock" dropdown ─────────────────────────
  const fetchAllStocks = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/stocks/list?per_page=100`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) {
        setAllStocks(data.response?.stocks || data.response?.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch stocks:", err);
    }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.allSettled([fetchWatchlist(), fetchAllStocks()]);
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line

  // ── Add stock to watchlist ─────────────────────────────────────────────────
  // FIX: Backend add_item_parser expects { stock_id: int }  NOT { ticker_symbol }
  const addToWatchlist = async (stockObj) => {
    if (!watchlistId) return;
    try {
      const res  = await fetch(`${API_BASE}/watchlists/${watchlistId}/items/add`, {
        method:  "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body:    JSON.stringify({ stock_id: stockObj.stock_id }),  // ← FIXED: stock_id not ticker_symbol
      });
      const data = await res.json();

      if (data.bool) {
        // Refresh watchlist from server
        await fetchWatchlist();
        setAddOpen(false);
        setSearch("");
      } else {
        setError(data.response?.message || "Failed to add to watchlist.");
        setTimeout(() => setError(""), 4000);
      }
    } catch (err) {
      console.error("Failed to add to watchlist:", err);
      setError("Network error. Please try again.");
      setTimeout(() => setError(""), 4000);
    }
  };

  // ── Remove stock from watchlist ────────────────────────────────────────────
  const removeFromWatchlist = async (itemId) => {
    if (!watchlistId) return;
    try {
      await fetch(`${API_BASE}/watchlists/${watchlistId}/items/${itemId}/remove`, {
        method:  "DELETE",
        headers: authHdr(),
      });
      setWatchlistItems((prev) => prev.filter((i) => i.item_id !== itemId));
    } catch (err) {
      console.error("Failed to remove:", err);
    }
  };

  // ── Create price alert ────────────────────────────────────────────────────
  // FIX: Backend price_alerts/create expects { stock_id, condition, target_value }
  const createPriceAlert = async (sym, price) => {
    if (!price || isNaN(parseFloat(price))) {
      setError("Please enter a valid price.");
      setTimeout(() => setError(""), 3000);
      return;
    }
    const stockObj = stocksData[sym];
    if (!stockObj?.stock_id) {
      setError("Stock data not loaded yet.");
      setTimeout(() => setError(""), 3000);
      return;
    }
    try {
      const res  = await fetch(`${API_BASE}/price_alerts/create`, {
        method:  "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body:    JSON.stringify({
          stock_id:    stockObj.stock_id,
          condition:   parseFloat(price) > parseFloat(stockObj.current_price || 0) ? "PRICE_ABOVE" : "PRICE_BELOW",
          target_value:parseFloat(price),
          notify_push: true,
          notify_email:true,
        }),
      });
      const data = await res.json();
      if (data.bool) {
        setAlertSym(null);
        setAlertPx("");
        setError("");
      } else {
        setError(data.response?.message || "Failed to set alert.");
        setTimeout(() => setError(""), 4000);
      }
    } catch (err) {
      console.error("Failed to create alert:", err);
      setError("Network error.");
      setTimeout(() => setError(""), 4000);
    }
  };

  // ── Derived lists ──────────────────────────────────────────────────────────
  // watchedStocks: items that have stock data
  const watchedStocks = watchlistItems
    .map((item) => ({
      ...item,
      ...(stocksData[item.ticker_symbol] || {}),
    }))
    .filter((s) => s.ticker_symbol);

  // Stocks available to add (not already in watchlist)
  const watchedTickers = new Set(watchlistItems.map((i) => i.ticker_symbol));
  const availableForAdd = allStocks.filter(
    (s) =>
      !watchedTickers.has(s.ticker_symbol) &&
      (s.ticker_symbol?.toLowerCase().includes(search.toLowerCase()) ||
       s.company_name?.toLowerCase().includes(search.toLowerCase()))
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">My Watchlist</h1>
          <p className="text-sm text-gray-500 mt-0.5">{watchedStocks.length} stocks being tracked</p>
        </div>
        <button
          onClick={() => setAddOpen(!addOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add Stock
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Add Stock Panel */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-white">Add to Watchlist</div>
                <button onClick={() => setAddOpen(false)} className="text-gray-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  autoFocus
                  className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/30"
                />
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-white/5">
                {availableForAdd.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-600">
                    {search ? "No stocks found" : "All available stocks are already in your watchlist"}
                  </div>
                ) : (
                  availableForAdd.map((s) => (
                    <div
                      key={s.stock_id || s.ticker_symbol}
                      onClick={() => addToWatchlist(s)}  // ← passes full stockObj with stock_id
                      className="flex items-center justify-between py-3 px-2 hover:bg-white/5 cursor-pointer rounded-xl transition-colors"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{s.ticker_symbol}</div>
                        <div className="text-xs text-gray-600">{s.company_name}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm text-white">₹{parseFloat(s.current_price || 0).toFixed(2)}</div>
                          <div className={`text-xs ${(s.price_change_percent || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {(s.price_change_percent || 0) >= 0 ? "+" : ""}{parseFloat(s.price_change_percent || 0).toFixed(2)}%
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-cyan-400" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        </div>
      ) : watchedStocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Star className="w-12 h-12 text-gray-700 mb-3" />
          <div className="text-lg font-medium text-gray-500 mb-2">Your watchlist is empty</div>
          <div className="text-sm text-gray-700 mb-5">Add stocks to track their performance</div>
          <button
            onClick={() => setAddOpen(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium"
          >
            Add Your First Stock
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {watchedStocks.map((s, i) => {
              const up = (s.price_change_percent || 0) >= 0;
              const cd = priceHistory[s.ticker_symbol] || [];
              const price       = parseFloat(s.current_price || 0);
              const changePct   = parseFloat(s.price_change_percent || 0);
              const changeAbs   = price * Math.abs(changePct) / 100;

              return (
                <motion.div
                  key={s.item_id || s.ticker_symbol}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-[#0C1220] border border-white/5 rounded-2xl p-4 hover:border-cyan-500/15 transition-colors group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 cursor-pointer" onClick={() => navigate(`/user/stock/${s.ticker_symbol}`)}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-cyan-400">{(s.ticker_symbol || "").slice(0, 2)}</span>
                        </div>
                        <span className="text-sm font-bold text-white">{s.ticker_symbol}</span>
                      </div>
                      <div className="text-xs text-gray-600 ml-9">{s.company_name}</div>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setAlertSym(alertSym === s.ticker_symbol ? null : s.ticker_symbol)}
                        className="p-1.5 rounded-lg bg-[#141C30] text-gray-500 hover:text-amber-400 transition-colors"
                      >
                        <Bell className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => s.item_id && removeFromWatchlist(s.item_id)}
                        className="p-1.5 rounded-lg bg-[#141C30] text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0 group-hover:hidden" />
                  </div>

                  {/* Mini chart */}
                  <div className="h-16 mb-3 cursor-pointer" onClick={() => navigate(`/user/stock/${s.ticker_symbol}`)}>
                    {cd.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cd}>
                          <defs>
                            <linearGradient id={`wg-${s.ticker_symbol}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={up ? "#10B981" : "#EF4444"} stopOpacity={0.2} />
                              <stop offset="95%" stopColor={up ? "#10B981" : "#EF4444"} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area
                            type="monotone"
                            dataKey="close"
                            stroke={up ? "#10B981" : "#EF4444"}
                            strokeWidth={1.5}
                            fill={`url(#wg-${s.ticker_symbol})`}
                            dot={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-700 text-xs">No chart</div>
                    )}
                  </div>

                  {/* Price + actions */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-white">₹{price.toFixed(2)}</div>
                      <div className={`flex items-center gap-1 text-xs ${up ? "text-emerald-400" : "text-red-400"}`}>
                        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {up ? "+" : "-"}{changeAbs.toFixed(2)} ({up ? "+" : ""}{changePct.toFixed(2)}%)
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/user/stock/${s.ticker_symbol}`)}
                      className="px-3 py-1.5 bg-[#141C30] rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                      Trade
                    </button>
                  </div>

                  {/* Price alert inline panel */}
                  <AnimatePresence>
                    {alertSym === s.ticker_symbol && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 pt-3 border-t border-white/5"
                      >
                        <div className="text-xs text-gray-500 mb-2">Set Price Alert</div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₹</span>
                            <input
                              type="number"
                              value={alertPx}
                              onChange={(e) => setAlertPx(e.target.value)}
                              placeholder={price.toFixed(2)}
                              className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-6 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/30"
                            />
                          </div>
                          <button
                            onClick={() => createPriceAlert(s.ticker_symbol, alertPx)}
                            className="px-3 py-1.5 bg-cyan-500/15 border border-cyan-500/25 rounded-xl text-xs text-cyan-400 hover:bg-cyan-500/25"
                          >
                            Set
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}



















