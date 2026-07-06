import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Star,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

const sectors = [
  "All",
  "Technology",
  "Financials",
  "Consumer Disc.",
  "Healthcare",
  "Energy",
  "Consumer Staples",
  "Entertainment",
  "Auto",
];

export function MarketPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedSector, setSelectedSector] = useState("All");
  const [sortBy, setSortBy] = useState("marketCap");
  const [sortDir, setSortDir] = useState("desc");
  const [watchlist, setWatchlist] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [stocks, setStocks] = useState([]);
  const [indices, setIndices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError("");
    const headers = { Authorization: `Bearer ${getToken()}` };
    try {
      const [stocksRes, marketRes, watchlistRes] = await Promise.all([
        fetch(`${API_BASE}/stocks/list`, { headers }),
        fetch(`${API_BASE}/dashboard/user/market_overview`, { headers }),
        fetch(`${API_BASE}/watchlists/my`, { headers }),
      ]);
      const [stocksData, marketData, watchlistData] = await Promise.all([
        stocksRes.json(),
        marketRes.json(),
        watchlistRes.json(),
      ]);
      if (stocksData.bool) {
        const raw = stocksData.response?.stocks || stocksData.response || [];
        setStocks(raw.map((s) => ({
          ...s,
          symbol: s.symbol || s.ticker,
          name: s.name || s.company_name,
          price: s.price || s.current_price || 0,
          change: s.change || s.price_change || 0,
          changePct: s.change_pct || s.price_change_pct || 0,
          marketCap: s.market_cap || s.marketCap || "N/A",
          volume: s.volume || "N/A",
          sector: s.sector || "Other",
          high52: s.high_52w || s.high52 || 0,
          low52: s.low_52w || s.low52 || 0,
        })));
      }
      if (marketData.bool) setIndices(marketData.response || []);
      if (watchlistData.bool) {
        const lists = watchlistData.response?.watchlists || watchlistData.response || [];
        const symbols = lists.flatMap((wl) =>
          (wl.items || []).map((item) => item.symbol || item.stock_symbol)
        );
        setWatchlist([...new Set(symbols)]);
      }
    } catch {
      setError("Network error. Could not load market data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleWatchlist = async (symbol) => {
    // Optimistic update
    setWatchlist((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  };

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const filtered = stocks
    .filter((s) => {
      const matchSearch =
        (s.symbol || "").toLowerCase().includes(search.toLowerCase()) ||
        (s.name || "").toLowerCase().includes(search.toLowerCase());
      const matchSector = selectedSector === "All" || s.sector === selectedSector;
      const matchTab =
        activeTab === "all" ||
        (activeTab === "gainers" && s.changePct > 0) ||
        (activeTab === "losers" && s.changePct < 0) ||
        (activeTab === "watchlist" && watchlist.includes(s.symbol));
      return matchSearch && matchSector && matchTab;
    })
    .sort((a, b) => {
      let av, bv;
      if (sortBy === "price") { av = a.price; bv = b.price; }
      else if (sortBy === "change") { av = a.changePct; bv = b.changePct; }
      else {
        av = typeof a.marketCap === "number" ? a.marketCap : parseFloat((a.marketCap || "0").replace(/[^0-9.]/g, ""));
        bv = typeof b.marketCap === "number" ? b.marketCap : parseFloat((b.marketCap || "0").replace(/[^0-9.]/g, ""));
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

  const SortIcon = ({ col }) =>
    sortBy === col ? (
      sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-cyan-400" /> : <ChevronDown className="w-3 h-3 text-cyan-400" />
    ) : (
      <ArrowUpDown className="w-3 h-3 text-gray-600" />
    );

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white mb-0.5">Market Overview</h1>
          <p className="text-sm text-gray-500">Track and discover stocks across all sectors</p>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg bg-[#1A2235] border border-[#1E2D4A] text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {indices.slice(0, 4).map((idx, i) => {
          const change = idx.change || idx.change_pct || 0;
          const up = typeof change === "string" ? !change.startsWith("-") : change >= 0;
          return (
            <div key={i} className={`bg-[#0A0E1A] border ${up ? "border-emerald-500/10" : "border-red-500/10"} rounded-xl p-4`}>
              <div className="text-xs text-gray-500 mb-1">{idx.name || idx.index_name}</div>
              <div className="text-lg font-bold text-white">{idx.value || idx.current_value}</div>
              <div className={`text-sm mt-0.5 flex items-center gap-1 ${up ? "text-emerald-400" : "text-red-400"}`}>
                {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {typeof change === "number" ? `${up ? "+" : ""}${change.toFixed(2)}%` : change}
              </div>
            </div>
          );
        })}
        {indices.length === 0 && [
          { label: "S&P 500", value: "5,248.49", change: "+0.87%", up: true },
          { label: "NASDAQ", value: "16,428.82", change: "+1.15%", up: true },
          { label: "DOW JONES", value: "39,127.14", change: "+0.32%", up: true },
          { label: "VIX", value: "13.47", change: "-2.34%", up: false },
        ].map((idx, i) => (
          <div key={i} className={`bg-[#0A0E1A] border ${idx.up ? "border-emerald-500/10" : "border-red-500/10"} rounded-xl p-4`}>
            <div className="text-xs text-gray-500 mb-1">{idx.label}</div>
            <div className="text-lg font-bold text-white">{idx.value}</div>
            <div className={`text-sm mt-0.5 flex items-center gap-1 ${idx.up ? "text-emerald-400" : "text-red-400"}`}>
              {idx.up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {idx.change}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 p-1 bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl w-fit">
        {[
          { id: "all", label: "All Stocks" },
          { id: "gainers", label: "Top Gainers" },
          { id: "losers", label: "Top Losers" },
          { id: "watchlist", label: "Watchlist" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm rounded-lg transition-all ${
              activeTab === tab.id ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or company..."
            className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sectors.map((sector) => (
            <button
              key={sector}
              onClick={() => setSelectedSector(sector)}
              className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap border transition-all ${
                selectedSector === sector
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                  : "border-[#1E2D4A] bg-[#0A0E1A] text-gray-500 hover:text-white"
              }`}
            >
              {sector}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1E2D4A]">
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium">Symbol</th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium cursor-pointer hover:text-gray-400 transition-colors" onClick={() => handleSort("price")}>
                    <div className="flex items-center gap-1">Price <SortIcon col="price" /></div>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium cursor-pointer hover:text-gray-400 transition-colors" onClick={() => handleSort("change")}>
                    <div className="flex items-center gap-1">Change <SortIcon col="change" /></div>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium hidden sm:table-cell">Volume</th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium cursor-pointer hover:text-gray-400 hidden md:table-cell" onClick={() => handleSort("marketCap")}>
                    <div className="flex items-center gap-1">Mkt Cap <SortIcon col="marketCap" /></div>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium hidden lg:table-cell">Sector</th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium hidden lg:table-cell">52W Range</th>
                  <th className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium">Watch</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((stock, i) => {
                  const inWatchlist = watchlist.includes(stock.symbol);
                  const up = stock.changePct >= 0;
                  const rangeWidth = stock.high52 && stock.low52 && stock.high52 !== stock.low52
                    ? ((stock.price - stock.low52) / (stock.high52 - stock.low52)) * 100
                    : 50;
                  return (
                    <motion.tr
                      key={stock.symbol || i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => navigate(`/app/stock/${stock.symbol}`)}
                      className="border-b border-[#1E2D4A]/50 hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="text-sm font-bold text-white">{stock.symbol}</div>
                        <div className="text-xs text-gray-600 max-w-[120px] truncate">{stock.name}</div>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-white">${stock.price.toFixed(2)}</td>
                      <td className="px-5 py-3.5">
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {up ? "+" : ""}{stock.changePct.toFixed(2)}%
                        </div>
                        <div className={`text-xs mt-0.5 ${up ? "text-emerald-400" : "text-red-400"}`}>
                          {up ? "+" : ""}{stock.change.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-400 hidden sm:table-cell">{stock.volume}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-400 hidden md:table-cell">
                        {typeof stock.marketCap === "number"
                          ? `$${(stock.marketCap / 1e9).toFixed(1)}B`
                          : stock.marketCap}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <span className="px-2 py-0.5 bg-[#1A2235] rounded text-xs text-gray-400">{stock.sector}</span>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                        {stock.high52 && stock.low52 ? (
                          <div className="flex flex-col gap-1 min-w-[100px]">
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>${stock.low52.toFixed(0)}</span>
                              <span>${stock.high52.toFixed(0)}</span>
                            </div>
                            <div className="h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full"
                                style={{ width: `${Math.max(5, Math.min(95, rangeWidth))}%` }}
                              />
                            </div>
                          </div>
                        ) : <span className="text-xs text-gray-600">—</span>}
                      </td>
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleWatchlist(stock.symbol)}
                          className={`transition-colors ${inWatchlist ? "text-amber-400" : "text-gray-600 hover:text-gray-400"}`}
                        >
                          <Star className={`w-4 h-4 ${inWatchlist ? "fill-amber-400" : ""}`} />
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
    </div>
  );
}

















