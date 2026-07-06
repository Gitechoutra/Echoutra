import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Star, Plus, X, TrendingUp, TrendingDown, Bell, Search, AlertCircle, RefreshCw } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

export function WatchlistPage() {
  const navigate = useNavigate();
  const [watchlistId, setWatchlistId] = useState(null);
  const [watchedStocks, setWatchedStocks] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState(null);
  const [alertPrice, setAlertPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [wlRes, stocksRes] = await Promise.all([
        fetch(`${API_BASE}/watchlists/my`, { headers }),
        fetch(`${API_BASE}/stocks/list`, { headers }),
      ]);
      const [wlData, stocksData] = await Promise.all([wlRes.json(), stocksRes.json()]);

      if (stocksData.bool) {
        const raw = stocksData.response?.stocks || stocksData.response || [];
        setAllStocks(raw.map((s) => ({
          ...s,
          symbol: s.symbol || s.ticker,
          name: s.name || s.company_name,
          price: s.price || s.current_price || 0,
          change: s.change || s.price_change || 0,
          changePct: s.change_pct || s.price_change_pct || 0,
        })));
      }

      if (wlData.bool) {
        const lists = wlData.response?.watchlists || wlData.response || [];
        if (lists.length > 0) {
          const wl = lists[0];
          const wid = wl.watchlist_id || wl.id;
          setWatchlistId(wid);
          const items = wl.items || [];
          const symbols = items.map((item) => ({
            itemId: item.item_id || item.id,
            symbol: item.symbol || item.stock_symbol,
            name: item.name || item.stock_name || item.symbol,
            price: item.price || item.current_price || 0,
            change: item.change || 0,
            changePct: item.change_pct || 0,
          }));
          setWatchedStocks(symbols);
        } else {
          // Create default watchlist if none
          const createRes = await fetch(`${API_BASE}/watchlists/create`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ name: "My Watchlist" }),
          });
          const createData = await createRes.json();
          if (createData.bool) {
            const wid = createData.response?.watchlist_id || createData.response?.id;
            setWatchlistId(wid);
          }
        }
      }
    } catch {
      setError("Network error. Could not load watchlist.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const addToWatchlist = async (symbol) => {
    if (!watchlistId) return;
    const stock = allStocks.find((s) => s.symbol === symbol);
    if (!stock) return;
    try {
      const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/items/add`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json();
      if (data.bool) {
        setWatchedStocks((prev) => [
          ...prev,
          {
            itemId: data.response?.item_id || Date.now(),
            symbol: stock.symbol,
            name: stock.name,
            price: stock.price,
            change: stock.change,
            changePct: stock.changePct,
          },
        ]);
        setShowAdd(false);
        setSearch("");
      }
    } catch {}
  };

  const removeFromWatchlist = async (symbol) => {
    const item = watchedStocks.find((s) => s.symbol === symbol);
    if (!item?.itemId) {
      setWatchedStocks((prev) => prev.filter((s) => s.symbol !== symbol));
      return;
    }
    try {
      await fetch(`${API_BASE}/watchlists/${watchlistId}/items/${item.itemId}/remove`, {
        method: "DELETE",
        headers,
      });
      setWatchedStocks((prev) => prev.filter((s) => s.symbol !== symbol));
    } catch {
      setWatchedStocks((prev) => prev.filter((s) => s.symbol !== symbol));
    }
  };

  const setAlert = async (symbol) => {
    if (!alertPrice) return;
    const item = watchedStocks.find((s) => s.symbol === symbol);
    if (!item?.itemId) { setAlertSymbol(null); setAlertPrice(""); return; }
    try {
      await fetch(`${API_BASE}/watchlists/items/${item.itemId}/alerts/add`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ target_price: parseFloat(alertPrice), condition: "above" }),
      });
    } catch {}
    setAlertSymbol(null);
    setAlertPrice("");
  };

  const watchedSymbols = watchedStocks.map((s) => s.symbol);
  const availableToAdd = allStocks.filter(
    (s) =>
      !watchedSymbols.includes(s.symbol) &&
      (s.symbol.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase()))
  );

  // Generate mini chart data (simple up/down simulation)
  const getMiniChart = (stock) => {
    const base = stock.price || 100;
    return Array.from({ length: 14 }, (_, i) => ({
      v: base * (0.95 + Math.random() * 0.1),
    }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading watchlist...</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Watchlist</h1>
          <p className="text-sm text-gray-500 mt-0.5">{watchedStocks.length} stocks being tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 rounded-lg bg-[#1A2235] border border-[#1E2D4A] text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Add Stock
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium text-white">Search Stocks to Add</div>
                <button onClick={() => setShowAdd(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol or company..."
                  className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
                  autoFocus
                />
              </div>
              <div className="divide-y divide-[#1E2D4A]/50 max-h-60 overflow-y-auto">
                {availableToAdd.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-600">
                    {search ? "No stocks found" : "Start typing to search stocks"}
                  </div>
                ) : (
                  availableToAdd.map((stock) => (
                    <div
                      key={stock.symbol}
                      onClick={() => addToWatchlist(stock.symbol)}
                      className="flex items-center justify-between py-3 px-2 hover:bg-white/5 cursor-pointer rounded-lg transition-colors"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{stock.symbol}</div>
                        <div className="text-xs text-gray-600">{stock.name}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm text-white">${stock.price.toFixed(2)}</div>
                          <div className={`text-xs ${stock.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {stock.changePct >= 0 ? "+" : ""}{stock.changePct.toFixed(2)}%
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

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {watchedStocks.map((stock, i) => {
            const up = stock.changePct >= 0;
            const chartData = getMiniChart(stock);
            return (
              <motion.div
                key={stock.symbol}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.05 }}
                className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-4 hover:border-cyan-500/20 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 cursor-pointer" onClick={() => navigate(`/app/stock/${stock.symbol}`)}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-cyan-400">{stock.symbol.slice(0, 2)}</span>
                      </div>
                      <span className="text-sm font-bold text-white">{stock.symbol}</span>
                    </div>
                    <div className="text-xs text-gray-600 ml-9">{stock.name}</div>
                  </div>

                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setAlertSymbol(alertSymbol === stock.symbol ? null : stock.symbol)}
                      className="p-1.5 rounded-lg bg-[#1A2235] text-gray-500 hover:text-amber-400 transition-colors"
                    >
                      <Bell className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeFromWatchlist(stock.symbol)}
                      className="p-1.5 rounded-lg bg-[#1A2235] text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0 opacity-100 group-hover:opacity-0 transition-opacity" />
                </div>

                <div className="h-16 mb-3 cursor-pointer" onClick={() => navigate(`/app/stock/${stock.symbol}`)}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={`miniGrad-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={up ? "#10B981" : "#EF4444"} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={up ? "#10B981" : "#EF4444"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke={up ? "#10B981" : "#EF4444"} strokeWidth={1.5} fill={`url(#miniGrad-${stock.symbol})`} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-white">${stock.price.toFixed(2)}</div>
                    <div className={`flex items-center gap-1 text-xs ${up ? "text-emerald-400" : "text-red-400"}`}>
                      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {up ? "+" : ""}{stock.change.toFixed(2)} ({up ? "+" : ""}{stock.changePct.toFixed(2)}%)
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/app/stock/${stock.symbol}`)}
                    className="px-3 py-1.5 bg-[#1A2235] rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                  >
                    Trade
                  </button>
                </div>

                <AnimatePresence>
                  {alertSymbol === stock.symbol && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 pt-3 border-t border-[#1E2D4A]"
                    >
                      <div className="text-xs text-gray-500 mb-2">Set Price Alert</div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-xs">$</span>
                          <input
                            type="number"
                            value={alertPrice}
                            onChange={(e) => setAlertPrice(e.target.value)}
                            placeholder={stock.price.toFixed(2)}
                            className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg pl-6 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                          />
                        </div>
                        <button
                          onClick={() => setAlert(stock.symbol)}
                          className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-xs text-cyan-400 hover:bg-cyan-500/30 transition-colors"
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

      {watchedStocks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Star className="w-12 h-12 text-gray-700 mb-3" />
          <div className="text-lg font-medium text-gray-500 mb-2">Your watchlist is empty</div>
          <div className="text-sm text-gray-700 mb-5">Add stocks to track their performance</div>
          <button
            onClick={() => setShowAdd(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-sm font-medium"
          >
            Add Your First Stock
          </button>
        </div>
      )}
    </div>
  );
}













