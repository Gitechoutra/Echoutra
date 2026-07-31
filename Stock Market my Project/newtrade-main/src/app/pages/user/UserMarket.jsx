import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  Search, TrendingUp, TrendingDown, Star,
  ChevronUp, ChevronDown, ArrowUpDown, RefreshCw, AlertCircle,
} from "lucide-react";
import { useMarketStatus } from "../../hooks/useMarketStatus";
import { MarketStatusBadge } from "../../components/MarketStatusBadge";
import { useLiveQuotes, liveStocks, liveHoldings } from "../../context/LiveQuotesContext";
import { StockLogo } from "../../components/StockLogo";
import { filterSearch, LIMITS } from "../../utils/validation";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

export function UserMarket() {
  const navigate = useNavigate();
  const [search,    setSearch]    = useState("");
  const [sector,    setSector]    = useState("All");
  const [tab,       setTab]       = useState("all");
  const [sortBy,    setSortBy]    = useState("current_price");
  const [sortDir,   setSortDir]   = useState("desc");
  const [stocks,    setStocks]    = useState([]);
  const [sectors,   setSectors]   = useState(["All"]);
  const [starred,   setStarred]   = useState([]);
  const [myHoldings,setMyHoldings]= useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [page,      setPage]      = useState(1);
  const [totalPages,setTotalPages]= useState(1);
  const [movers,    setMovers]    = useState({ gainers: [], losers: [] });

  // `silent` = background refresh (no spinner / no error flash) — used by the
  // real-time polling loop so prices update live without a visible reload.
  const fetchStocks = useCallback(async (pg = 1, silent = false) => {
    if (!silent) { setLoading(true); setError(""); }
    try {
      const params = new URLSearchParams({ page: pg, per_page: 30 });
      if (search)                params.set("search", search);
      if (sector !== "All")      params.set("sector", sector);
      if (sortBy)                params.set("sort_by", sortBy);
      if (sortDir)               params.set("order",   sortDir);

      const res  = await fetch(`${API_BASE}/stocks/list?${params}`, { headers: authHdr() });
      const data = await res.json();

      if (!data.bool) { if (!silent) setError(data.response?.message || "Failed to load stocks."); return; }

      const raw = data.response?.stocks || data.response?.data || [];
      setStocks(raw);
      setTotalPages(data.response?.total_pages || 1);

      // Extract unique sectors
      const uniq = ["All", ...new Set(raw.map((s) => s.sector).filter(Boolean))];
      setSectors(uniq);
    } catch {
      if (!silent) setError("Network error loading stocks.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [search, sector, sortBy, sortDir]);

  // Load movers + my holdings on mount
  useEffect(() => {
    const fetchSupport = async () => {
      try {
        const [gainersRes, losersRes, portRes] = await Promise.allSettled([
          fetch(`${API_BASE}/stocks/movers/TOP_GAINER?limit=20`, { headers: authHdr() }),
          fetch(`${API_BASE}/stocks/movers/TOP_LOSER?limit=20`,  { headers: authHdr() }),
          fetch(`${API_BASE}/portfolios/my`,                     { headers: authHdr() }),
        ]);
        if (gainersRes.status === "fulfilled") {
          const d = await gainersRes.value.json();
          if (d.bool) setMovers((p) => ({ ...p, gainers: (d.response?.stocks || d.response?.data || []).map((s) => s.ticker_symbol) }));
        }
        if (losersRes.status === "fulfilled") {
          const d = await losersRes.value.json();
          if (d.bool) setMovers((p) => ({ ...p, losers: (d.response?.stocks || d.response?.data || []).map((s) => s.ticker_symbol) }));
        }
        if (portRes.status === "fulfilled") {
          const d = await portRes.value.json();
          if (d.bool) {
            const ports = d.response?.portfolios || [];
            if (ports.length > 0) {
              const hRes = await fetch(`${API_BASE}/portfolios/${ports[0].portfolio_id}`, { headers: authHdr() });
              const hData = await hRes.json();
              if (hData.bool) setMyHoldings(hData.response?.holdings || []);
            }
          }
        }
      } catch { /* silent */ }
    };
    fetchSupport();
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchStocks(1); }, 400);
    return () => clearTimeout(t);
  }, [search, sector, sortBy, sortDir]); // eslint-disable-line

  // Prices come from the shared quote poll rather than re-fetching this page's
  // whole (paginated, sorted, filtered) list every 10 seconds. That kept the
  // rows live but re-ran the search query each tick, and it was a second clock
  // that could disagree with the header ticker.
  const { status: marketStatus } = useMarketStatus();
  const { quotes } = useLiveQuotes();

  const livePriced = useMemo(() => liveStocks(stocks, quotes), [stocks, quotes]);
  const liveHeld   = useMemo(() => liveHoldings(myHoldings, quotes), [myHoldings, quotes]);

  const handleSort = (c) => {
    if (sortBy === c) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(c); setSortDir("desc"); }
  };

  // Filter client-side for tab (gainers/losers/watchlist)
  const filtered = livePriced.filter((s) => {
    const sym = s.ticker_symbol;
    if (tab === "gainers")   return movers.gainers.includes(sym) || (s.price_change_percent || 0) > 0;
    if (tab === "losers")    return movers.losers.includes(sym)  || (s.price_change_percent || 0) < 0;
    if (tab === "watchlist") return starred.includes(sym);
    return true;
  });

  // Re-sort on the LIVE values, not the order the server returned. The API sorts
  // once at fetch time; five seconds later a stock that has jumped is still
  // sitting where it was, and the row numbers beside it would be wrong. Sorting
  // here means the ranking — and therefore the S.No — follows every tick.
  const sorted = useMemo(() => {
    const key = sortBy || "current_price";
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = Number(a[key] ?? 0);
      const bv = Number(b[key] ?? 0);
      if (av === bv) return (a.ticker_symbol || "").localeCompare(b.ticker_symbol || "");
      return (av - bv) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortBy, sortDir]);

  const SortIcon = ({ col }) =>
    sortBy === col
      ? sortDir === "asc"
        ? <ChevronUp className="w-3 h-3 text-cyan-400" />
        : <ChevronDown className="w-3 h-3 text-cyan-400" />
      : <ArrowUpDown className="w-3 h-3 text-gray-600" />;

  const myHoldingMap = {};
  liveHeld.forEach((h) => { myHoldingMap[h.ticker_symbol] = h; });

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-white">Market</h1>
            <MarketStatusBadge status={marketStatus} compact />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Browse stocks and discover new opportunities</p>
        </div>
        <button onClick={() => fetchStocks(page)} className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[#0C1220] border border-white/5 rounded-2xl w-fit">
        {[{ id: "all", l: "All Stocks" }, { id: "gainers", l: "Gainers" }, { id: "losers", l: "Losers" }, { id: "watchlist", l: "Watchlist" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm rounded-xl transition-all ${tab === t.id ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or company…"
            className="w-full bg-[#0C1220] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 transition-colors" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sectors.map((s) => (
            <button key={s} onClick={() => setSector(s)}
              className={`px-3 py-2 text-xs rounded-xl whitespace-nowrap border transition-all ${sector === s ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400" : "border-white/8 text-gray-600 hover:text-white"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium w-12">#</th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium">Symbol</th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium cursor-pointer hover:text-gray-400" onClick={() => handleSort("current_price")}>
                    <div className="flex items-center gap-1">Price <SortIcon col="current_price" /></div>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium cursor-pointer hover:text-gray-400" onClick={() => handleSort("price_change_percent")}>
                    <div className="flex items-center gap-1">Change <SortIcon col="price_change_percent" /></div>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium hidden sm:table-cell">Volume</th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium hidden lg:table-cell">Sector</th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium">My Holdings</th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium">Watch</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => {
                  const changePct = parseFloat(s.price_change_percent || 0);
                  const up = changePct >= 0;
                  const myH = myHoldingMap[s.ticker_symbol];
                  const vol = s.volume ? (s.volume >= 1e6 ? `${(s.volume / 1e6).toFixed(1)}M` : `${s.volume}`) : "—";
                  return (
                    <motion.tr key={s.stock_id || s.ticker_symbol} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      onClick={() => navigate(`/user/stock/${s.ticker_symbol}`)}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">
                      <td className="px-5 py-3.5 text-sm text-gray-500 tabular-nums">{i + 1}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <StockLogo symbol={s.ticker_symbol} name={s.company_name} size="md" />
                          <div>
                            <div className="text-sm font-bold text-white">{s.ticker_symbol}</div>
                            <div className="text-xs text-gray-600 truncate max-w-[100px]">{s.company_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-white">₹{parseFloat(s.current_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-5 py-3.5">
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {up ? "+" : ""}{changePct.toFixed(2)}%
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 hidden sm:table-cell">{vol}</td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <span className="px-2 py-0.5 bg-white/5 rounded text-xs text-gray-500">{s.sector || "—"}</span>
                      </td>
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        {myH ? (
                          <div className="text-xs">
                            <div className="text-white">{parseFloat(myH.quantity || 0).toFixed(2)} shares</div>
                            <div className={parseFloat(myH.unrealized_pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {parseFloat(myH.unrealized_pnl || 0) >= 0 ? "+" : "-"}₹{Math.abs(parseFloat(myH.unrealized_pnl || 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-700">Not held</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setStarred((p) => p.includes(s.ticker_symbol) ? p.filter((x) => x !== s.ticker_symbol) : [...p, s.ticker_symbol])}
                          className={`transition-colors ${starred.includes(s.ticker_symbol) ? "text-amber-400" : "text-gray-700 hover:text-gray-400"}`}>
                          <Star className={`w-4 h-4 ${starred.includes(s.ticker_symbol) ? "fill-amber-400" : ""}`} />
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && !loading && (
              <div className="py-12 text-center text-gray-600 text-sm">No stocks match your filters</div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchStocks(p); }}
            disabled={page === 1} className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40">Previous</button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchStocks(p); }}
            disabled={page === totalPages} className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}














