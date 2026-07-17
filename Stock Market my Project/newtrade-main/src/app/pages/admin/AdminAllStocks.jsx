import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  TrendingUp, TrendingDown, Search, AlertCircle,
  RefreshCw, Plus, X, Check, Upload,
  IndianRupee, Globe, BarChart2,
} from "lucide-react";
import { StockChart } from "../../components/StockChart";
import { useMarketStatus, useLivePrices } from "../../hooks/useMarketStatus";
import { MarketStatusBadge, StaleDataNotice } from "../../components/MarketStatusBadge";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({
  Authorization:  `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

/* ── Currency helpers ──────────────────────────────────────────────────────
   Stocks model has `currency` column — default 'INR' for NSE/BSE,
   'USD' for NYSE/NASDAQ etc. We show the correct symbol per stock.
──────────────────────────────────────────────────────────────────────────── */
// All stock prices are displayed in Indian Rupees (INR) across the platform.
const currSym = () => "₹";
const fmtPrice = (price, currency = "INR") => {
  if (!price && price !== 0) return "—";
  return `${currSym(currency)}${Number(price).toLocaleString("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
};

/* ── Static options (match Stocks model choices) ── */
const ASSET_TYPES = ["STOCK","ETF","MUTUAL_FUND","CRYPTO","FOREX","INDEX"];
const EXCHANGES   = ["NSE","BSE","NYSE","NASDAQ","LSE","TSX","ASX","OTHER"];
const CURRENCIES  = ["INR"];   // Platform trades exclusively in Indian Rupees (₹)
const SECTORS     = [
  "Technology","Financials","Healthcare","Consumer Discretionary",
  "Consumer Staples","Energy","Industrials","Materials","Real Estate",
  "Utilities","Communication Services","Entertainment","Automobile",
  "IT Services","AI","Other",
];

/* Exchange → default currency mapping — everything trades in INR on this platform */
const EXCHANGE_CURRENCY = {
  NSE: "INR", BSE: "INR",
  NYSE: "INR", NASDAQ: "INR",
  LSE: "INR", TSX: "INR", ASX: "INR", OTHER: "INR",
};

const EMPTY_FORM = {
  ticker_symbol: "", company_name: "", short_name: "", asset_type: "STOCK",
  sector: "", industry: "", exchange: "NSE", country: "India",
  currency: "INR",               /* Default INR — changes with exchange */
  isin: "",                      /* from Stocks model: isin VARCHAR(20) */
  current_price: "", previous_close: "",
  week_52_high: "", week_52_low: "",
  logo_url: "", website_url: "", description: "",
  is_tradable: true, is_featured: false,
};

/* ── Field input wrapper ── */
function Field({ label, required, error, hint, children }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="text-gray-700 ml-1.5">({hint})</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

/* ── Currency badge ── */
function CurrBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-bold bg-orange-500/15 text-orange-400">
      <IndianRupee className="w-2.5 h-2.5" />
      INR
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export function AdminAllStocks() {
  const navigate = useNavigate();

  const [stocks,      setStocks]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [summary,     setSummary]     = useState({
    mostHeld: "—", mostHeldUsers: 0, totalStocks: 0,
    totalPositions: 0, largestValue: 0,
  });
  const [totalPlatformValue, setTotalPlatformValue] = useState(0);

  /* ── Filters ── */
  const [search,        setSearch]       = useState("");
  const [sectorFilter,  setSector]       = useState("All");
  const [exchangeFilter,setExchange]     = useState("All");
  const [currencyFilter,setCurrency]     = useState("All");

  /* ── Add Stock modal ── */
  const [showAddModal, setShowAddModal] = useState(false);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [formErrors,   setFormErrors]   = useState({});
  const [addLoading,   setAddLoading]   = useState(false);
  const [addError,     setAddError]     = useState("");
  const [addSuccess,   setAddSuccess]   = useState(false);

  /* ── Live market data (Twelve Data) ── */
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [liveMsg,        setLiveMsg]        = useState("");

  /* ── Interactive chart modal ── */
  const [chartTarget, setChartTarget] = useState(null);   // selected stock row

  /* ── Fetch ──
     `silent` skips the spinner so background price polls refresh the numbers
     in place instead of flashing the whole table every few seconds. */
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      /* Primary: admin overview gives holder counts + AUM per stock */
      const [overviewRes, stocksRes] = await Promise.allSettled([
        fetch(`${API_BASE}/admin/stocks/overview?per_page=100`, { headers: authHdr() }),
        fetch(`${API_BASE}/stocks/list?per_page=100&sort_by=current_price&order=desc`, { headers: authHdr() }),
      ]);

      let overviewStocks = [];
      if (overviewRes.status === "fulfilled" && overviewRes.value.ok) {
        const data = await overviewRes.value.json();
        if (data.bool) overviewStocks = data.response?.stocks || [];
      }

      let stocksList = [];
      if (stocksRes.status === "fulfilled" && stocksRes.value.ok) {
        const data = await stocksRes.value.json();
        if (data.bool) stocksList = data.response?.stocks || [];
      }

      /* Build lookup by stock_id and ticker for merging */
      const listById     = {};
      const listByTicker = {};
      stocksList.forEach(s => {
        listById[s.stock_id]          = s;
        listByTicker[s.ticker_symbol] = s;
      });

      /* Merge overview (holder counts, AUM) with list (full price + all fields) */
      const baseList = overviewStocks.length > 0
        ? overviewStocks.map(ov => {
            const listS = listById[ov.stock_id] || listByTicker[ov.ticker_symbol] || {};
            return mergeStock(ov, listS);
          })
        : stocksList.map(s => mergeStock({}, s));

      setStocks(baseList);

      const totalVal     = baseList.reduce((a, s) => a + s.totalValue, 0);
      const sortedByUser = [...baseList].sort((a, b) => b.users - a.users);
      const sortedByVal  = [...baseList].sort((a, b) => b.totalValue - a.totalValue);
      const mostHeld     = sortedByUser[0];

      setTotalPlatformValue(totalVal);
      setSummary({
        mostHeld:      mostHeld?.symbol      || "—",
        mostHeldUsers: mostHeld?.users        || 0,
        totalStocks:   baseList.length,
        totalPositions:baseList.reduce((a, s) => a + s.users, 0),
        largestValue:  sortedByVal[0]?.totalValue || 0,
      });
    } catch {
      setError("Network error. Could not load stocks.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* Live price polling, on the same cadence and the same market-status source
     the User portal uses. Admin previously had NO auto-refresh at all -- prices
     only moved when someone clicked "Refresh Live", so the two portals routinely
     showed different prices for the same stock at the same moment. */
  const { status: marketStatus } = useMarketStatus();
  const refreshPrices = useCallback(() => fetchData(true), [fetchData]);
  useLivePrices(refreshPrices, { status: marketStatus });

  /* Merge admin overview row with stocks/list row */
  function mergeStock(ov, listS) {
    const currency = ov.currency || listS.currency || "INR";
    return {
      stock_id:      ov.stock_id      || listS.stock_id,
      symbol:        ov.ticker_symbol || listS.ticker_symbol,
      name:          ov.company_name  || listS.company_name,
      logo_url:      ov.logo_url      || listS.logo_url,
      sector:        ov.sector        || listS.sector || "Other",
      exchange:      listS.exchange   || "—",
      currency,
      isin:          listS.isin       || null,
      /* Prices */
      price:         parseFloat(ov.current_price  || listS.current_price  || 0),
      prevClose:     parseFloat(listS.previous_close || 0),
      dayHigh:       parseFloat(listS.day_high      || 0),
      dayLow:        parseFloat(listS.day_low       || 0),
      changePct:     parseFloat(ov.price_change_pct || listS.price_change_percent || 0),
      volume:        listS.volume     || 0,
      avgVolume:     listS.avg_volume || 0,
      /* 52-week range (from Upstox historical candles) */
      week52High:    parseFloat(listS.week_52_high  || 0),
      week52Low:     parseFloat(listS.week_52_low   || 0),
      /* Platform stats — only used for the summary cards, not per-row columns */
      users:         ov.total_holders || ov.users    || 0,
      watchers:      ov.total_watchers|| 0,
      totalShares:   ov.total_trades  || 0,
      totalValue:    parseFloat(ov.platform_aum || 0),
      popularityRank:ov.popularity_rank || null,
      consensusRating:ov.consensus_rating || listS.analytics?.consensus_rating || null,
      /* Flags */
      isTradable:    ov.is_tradable   ?? listS.is_tradable  ?? true,
      isFeatured:    listS.is_featured ?? false,
      status:        listS.status     || "ACTIVE",
    };
  }

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Add Stock ── */
  const updateForm = (field, value) => {
    setForm(p => {
      const next = { ...p, [field]: value };
      /* Auto-set currency when exchange changes */
      if (field === "exchange" && EXCHANGE_CURRENCY[value]) {
        next.currency = EXCHANGE_CURRENCY[value];
      }
      return next;
    });
    if (formErrors[field]) setFormErrors(p => ({ ...p, [field]: "" }));
  };

  const validateForm = () => {
    const errs = {};
    if (!form.ticker_symbol.trim())  errs.ticker_symbol  = "Required.";
    if (!form.company_name.trim())   errs.company_name   = "Required.";
    if (!form.current_price || isNaN(parseFloat(form.current_price)))
      errs.current_price = "Valid price required.";
    if (form.week_52_high  && isNaN(parseFloat(form.week_52_high)))
      errs.week_52_high  = "Must be a number.";
    if (form.week_52_low   && isNaN(parseFloat(form.week_52_low)))
      errs.week_52_low   = "Must be a number.";
    return errs;
  };

  const handleAddStock = async () => {
    setAddError("");
    const errs = validateForm();
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
    setAddLoading(true);
    try {
      /* Build payload matching Stocks model fields exactly */
      const payload = {
        ticker_symbol: form.ticker_symbol.trim().toUpperCase(),
        company_name:  form.company_name.trim(),
        asset_type:    form.asset_type,
        currency:      form.currency || "INR",
        current_price: parseFloat(form.current_price),
        is_tradable:   form.is_tradable,
        is_featured:   form.is_featured,
        /* Optional fields — only include if non-empty */
        ...(form.short_name    && { short_name:    form.short_name.trim()   }),
        ...(form.sector        && { sector:        form.sector              }),
        ...(form.industry      && { industry:      form.industry.trim()     }),
        ...(form.exchange      && { exchange:      form.exchange            }),
        ...(form.country       && { country:       form.country.trim()      }),
        ...(form.isin          && { isin:          form.isin.trim()         }),
        ...(form.previous_close&& { previous_close:parseFloat(form.previous_close)}),
        ...(form.week_52_high  && { week_52_high:  parseFloat(form.week_52_high)  }),
        ...(form.week_52_low   && { week_52_low:   parseFloat(form.week_52_low)   }),
        ...(form.logo_url      && { logo_url:      form.logo_url.trim()     }),
        ...(form.website_url   && { website_url:   form.website_url.trim()  }),
        ...(form.description   && { description:   form.description.trim()  }),
      };

      const res  = await fetch(`${API_BASE}/stocks/create`, {
        method: "POST", headers: authHdr(), body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.bool) { setAddError(data.response?.message || "Failed to create stock."); return; }
      setAddSuccess(true);
      setTimeout(() => {
        setAddSuccess(false); setShowAddModal(false);
        setForm(EMPTY_FORM); setFormErrors({}); fetchData();
      }, 1800);
    } catch { setAddError("Network error."); }
    finally { setAddLoading(false); }
  };

  const closeAdd = () => {
    setShowAddModal(false); setForm(EMPTY_FORM);
    setFormErrors({}); setAddError(""); setAddSuccess(false);
  };

  /* ── Live: refresh ALL stock prices from Twelve Data ── */
  const handleRefreshLive = async () => {
    setLiveRefreshing(true); setLiveMsg(""); setError("");
    try {
      const res  = await fetch(`${API_BASE}/stocks/refresh_live`, { method: "POST", headers: authHdr() });
      const data = await res.json();
      if (!data.bool) { setError(data.response?.message || "Live refresh failed."); return; }
      setLiveMsg(data.response?.message || "Live prices updated.");
      await fetchData();
      setTimeout(() => setLiveMsg(""), 6000);
    } catch { setError("Network error while refreshing live prices."); }
    finally { setLiveRefreshing(false); }
  };

  /* ── Derived ── */
  const allSectors   = ["All", ...Array.from(new Set(stocks.map(s => s.sector).filter(Boolean))).sort()];
  const allExchanges = ["All", ...Array.from(new Set(stocks.map(s => s.exchange).filter(s => s !== "—"))).sort()];
  const allCurrencies= ["All", ...Array.from(new Set(stocks.map(s => s.currency).filter(Boolean))).sort()];

  const filtered = stocks
    .filter(s =>
      ((s.symbol || "").toLowerCase().includes(search.toLowerCase()) ||
       (s.name   || "").toLowerCase().includes(search.toLowerCase()) ||
       (s.isin   || "").toLowerCase().includes(search.toLowerCase())) &&
      (sectorFilter   === "All" || s.sector   === sectorFilter) &&
      (exchangeFilter === "All" || s.exchange === exchangeFilter) &&
      (currencyFilter === "All" || s.currency === currencyFilter)
    )
    .sort((a, b) => b.totalValue - a.totalValue || b.price - a.price);

  const summaryCards = [
    { label: "Most Held",        value: summary.mostHeld,       sub: `${summary.mostHeldUsers} users` },
    { label: "Platform Stocks",  value: summary.totalStocks,    sub: "unique symbols" },
    { label: "Total Positions",  value: summary.totalPositions, sub: "across all users" },
  ];

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-white">All Stocks — Platform View</h1>
            <MarketStatusBadge status={marketStatus} compact />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Every stock listed on the platform with live holdings data.
            All prices are shown in Indian Rupees (₹ INR).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Arrow fn, not `onClick={fetchData}`: the handler would pass a
              MouseEvent as `silent`, and a truthy event kills the spinner. */}
          <button onClick={() => fetchData()}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={handleRefreshLive} disabled={liveRefreshing}
            title="Pull the latest live prices from the market data provider"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/15 border border-emerald-500/30 rounded-xl text-sm font-medium text-emerald-400 hover:bg-emerald-600/25 transition-colors disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${liveRefreshing ? "animate-spin" : ""}`} />
            {liveRefreshing ? "Fetching live…" : "Refresh Live Prices"}
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-700 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/20">
            <Plus className="w-4 h-4" /> Add Stock
          </button>
        </div>
      </div>

      <StaleDataNotice status={marketStatus} />

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
      {liveMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-400">
          <Check className="w-4 h-4 flex-shrink-0" />{liveMsg}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {summaryCards.map((s, i) => (
          <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className="text-lg font-bold text-white">{s.value}</div>
            <div className="text-xs text-gray-600 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Symbol, name or ISIN…"
            className="w-full bg-[#0C1220] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500/30 transition-colors" />
        </div>
        {/* Sector filter */}
        <select value={sectorFilter} onChange={e => setSector(e.target.value)}
          className="bg-[#0C1220] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-400 focus:outline-none focus:border-violet-500/30">
          {allSectors.map(s => <option key={s} value={s}>{s === "All" ? "All Sectors" : s}</option>)}
        </select>
        {/* Exchange filter */}
        <select value={exchangeFilter} onChange={e => setExchange(e.target.value)}
          className="bg-[#0C1220] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-400 focus:outline-none focus:border-violet-500/30">
          {allExchanges.map(x => <option key={x} value={x}>{x === "All" ? "All Exchanges" : x}</option>)}
        </select>
        {/* Currency filter */}
        <select value={currencyFilter} onChange={e => setCurrency(e.target.value)}
          className="bg-[#0C1220] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-400 focus:outline-none focus:border-violet-500/30">
          {allCurrencies.map(c => <option key={c} value={c}>{c === "All" ? "All Currencies" : c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {[
                    "#","Symbol / ISIN","Exchange","Currency",
                    "Price","52W Range","Change","Actions",
                  ].map(h => (
                    <th key={h} className="px-4 py-3.5 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const up  = s.changePct >= 0;
                  const sym = currSym(s.currency);
                  return (
                    <motion.tr key={s.symbol || i}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }}
                      onClick={() => navigate(`/admin/stock/${s.symbol}`)}
                      title={`View ${s.symbol} details`}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-pointer">

                      {/* Rank */}
                      <td className="px-4 py-3.5">
                        <span className={`text-sm font-bold ${i < 3 ? "text-amber-400" : "text-gray-600"}`}>
                          #{i + 1}
                        </span>
                      </td>

                      {/* Symbol / ISIN */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/15 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {s.logo_url ? (
                              <img src={s.logo_url} alt={s.symbol}
                                className="w-full h-full object-contain p-0.5"
                                onError={e => { e.target.style.display = "none"; }} />
                            ) : (
                              <span className="text-xs font-bold text-violet-300">{(s.symbol || "??").slice(0, 2)}</span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-white">{s.symbol}</span>
                              {s.isFeatured && (
                                <span className="text-[9px] px-1 py-0.5 bg-amber-500/15 text-amber-400 rounded">Featured</span>
                              )}
                              {!s.isTradable && (
                                <span className="text-[9px] px-1 py-0.5 bg-red-500/15 text-red-400 rounded">Halted</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 truncate max-w-[100px]">{s.name}</div>
                            {s.isin && (
                              <div className="text-[10px] text-gray-700 font-mono">{s.isin}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Exchange */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs px-2 py-0.5 bg-white/5 rounded text-gray-400">{s.exchange}</span>
                      </td>

                      {/* Currency — INR or USD */}
                      <td className="px-4 py-3.5">
                        <CurrBadge currency={s.currency} />
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3.5 text-sm font-semibold text-white whitespace-nowrap">
                        {fmtPrice(s.price, s.currency)}
                      </td>

                      {/* 52-Week Range */}
                      <td className="px-4 py-3.5">
                        {s.week52Low > 0 || s.week52High > 0 ? (
                          <div className="text-xs text-gray-500 whitespace-nowrap">
                            <span className="text-red-400">{sym}{s.week52Low.toFixed(2)}</span>
                            <span className="text-gray-700 mx-1">–</span>
                            <span className="text-emerald-400">{sym}{s.week52High.toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-700">—</span>
                        )}
                      </td>

                      {/* Change % */}
                      <td className="px-4 py-3.5">
                        <div className={`flex items-center gap-1 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
                          {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {up ? "+" : ""}{s.changePct.toFixed(2)}%
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center">
                          <button
                            onClick={e => { e.stopPropagation(); setChartTarget(s); }}
                            title="View interactive chart"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs text-violet-300 hover:bg-violet-500/20 transition-all whitespace-nowrap">
                            <BarChart2 className="w-3 h-3" /> Chart
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-gray-600 text-sm">
                      No stocks match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════ INTERACTIVE CHART MODAL ═════════════════ */}
      <AnimatePresence>
        {chartTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setChartTarget(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ duration: 0.18 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#0C1220] border border-violet-500/20 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center overflow-hidden">
                    {chartTarget.logo_url
                      ? <img src={chartTarget.logo_url} alt={chartTarget.symbol} className="w-full h-full object-contain p-0.5" onError={e => { e.target.style.display = "none"; }} />
                      : <span className="text-xs font-bold text-violet-300">{(chartTarget.symbol || "??").slice(0, 2)}</span>}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white">{chartTarget.symbol}</span>
                      <span className="text-sm font-semibold text-white">{fmtPrice(chartTarget.price, chartTarget.currency)}</span>
                      <span className={`text-xs font-medium ${chartTarget.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {chartTarget.changePct >= 0 ? "+" : ""}{chartTarget.changePct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">{chartTarget.name}</div>
                  </div>
                </div>
                <button onClick={() => setChartTarget(null)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chart */}
              <div className="p-5">
                <StockChart
                  stockId={chartTarget.stock_id}
                  symbol={chartTarget.symbol}
                  currentPrice={chartTarget.price}
                  currency="₹"
                  accent="violet"
                  height={300}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════ ADD STOCK MODAL ══════════════════════════ */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.2 }}
              className="bg-[#0C1220] border border-violet-500/20 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl shadow-violet-500/10 overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/20 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-base font-bold text-white">Add New Stock</div>
                    <div className="text-xs text-gray-500">
                      All stocks are priced in Indian Rupees (₹ INR)
                    </div>
                  </div>
                </div>
                <button onClick={closeAdd}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {addSuccess ? (
                <div className="flex-1 flex flex-col items-center justify-center py-16">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-emerald-400" />
                  </motion.div>
                  <div className="text-lg font-bold text-white mb-1">Stock Added!</div>
                  <div className="text-sm text-gray-500 text-center">
                    <span className="text-violet-300 font-medium">{form.ticker_symbol}</span> is now listed
                    in <CurrBadge currency={form.currency} />.
                  </div>
                </div>
              ) : (
                <>
                  {/* Scrollable body */}
                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                    {addError && (
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{addError}
                      </div>
                    )}

                    {/* ── Core Identity ── */}
                    <section>
                      <SectionTitle>Core Identity</SectionTitle>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Ticker Symbol" required error={formErrors.ticker_symbol}>
                          <input type="text" value={form.ticker_symbol}
                            onChange={e => updateForm("ticker_symbol", e.target.value.toUpperCase())}
                            placeholder="e.g. RELIANCE" maxLength={20}
                            className={inputCls(formErrors.ticker_symbol)} />
                        </Field>
                        <Field label="Company Name" required error={formErrors.company_name}>
                          <input type="text" value={form.company_name}
                            onChange={e => updateForm("company_name", e.target.value)}
                            placeholder="e.g. Reliance Industries Ltd."
                            className={inputCls(formErrors.company_name)} />
                        </Field>
                        <Field label="Short Name">
                          <input type="text" value={form.short_name}
                            onChange={e => updateForm("short_name", e.target.value)}
                            placeholder="e.g. Reliance"
                            className={inputCls()} />
                        </Field>
                        <Field label="Asset Type" required>
                          <select value={form.asset_type} onChange={e => updateForm("asset_type", e.target.value)}
                            className={inputCls()}>
                            {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </Field>
                        <Field label="ISIN" hint="Optional — unique securities ID">
                          <input type="text" value={form.isin}
                            onChange={e => updateForm("isin", e.target.value.toUpperCase())}
                            placeholder="e.g. INE002A01018" maxLength={20}
                            className={inputCls()} />
                        </Field>
                        <Field label="Country">
                          <input type="text" value={form.country}
                            onChange={e => updateForm("country", e.target.value)}
                            placeholder="e.g. India"
                            className={inputCls()} />
                        </Field>
                      </div>
                    </section>

                    {/* ── Exchange & Currency ── */}
                    <section>
                      <SectionTitle>Exchange &amp; Currency</SectionTitle>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Exchange" hint="Auto-sets currency">
                          <select value={form.exchange} onChange={e => updateForm("exchange", e.target.value)}
                            className={inputCls()}>
                            {EXCHANGES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                          </select>
                        </Field>
                        <Field label="Currency" hint="₹ INR only">
                          <div className="flex items-center gap-2">
                            <select value="INR" disabled
                              className={`flex-1 ${inputCls()} opacity-70 cursor-not-allowed`}>
                              <option value="INR">INR</option>
                            </select>
                            <CurrBadge />
                          </div>
                        </Field>
                      </div>
                      {/* Currency note */}
                      <div className="mt-2 px-3 py-2 rounded-xl text-xs bg-orange-500/8 border border-orange-500/15 text-orange-300">
                        ₹ INR — Indian Rupee. All stock prices, P/E and market cap are displayed in ₹.
                      </div>
                    </section>

                    {/* ── Pricing ── */}
                    <section>
                      <SectionTitle>Pricing ({form.currency})</SectionTitle>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Current Price" required error={formErrors.current_price}>
                          <PriceInput currency={form.currency} value={form.current_price}
                            onChange={v => updateForm("current_price", v)}
                            error={formErrors.current_price} placeholder="0.00" />
                        </Field>
                        <Field label="Previous Close">
                          <PriceInput currency={form.currency} value={form.previous_close}
                            onChange={v => updateForm("previous_close", v)} placeholder="0.00" />
                        </Field>
                        <Field label="52W High" error={formErrors.week_52_high}>
                          <PriceInput currency={form.currency} value={form.week_52_high}
                            onChange={v => updateForm("week_52_high", v)}
                            error={formErrors.week_52_high} placeholder="0.00" />
                        </Field>
                        <Field label="52W Low" error={formErrors.week_52_low}>
                          <PriceInput currency={form.currency} value={form.week_52_low}
                            onChange={v => updateForm("week_52_low", v)}
                            error={formErrors.week_52_low} placeholder="0.00" />
                        </Field>
                      </div>
                    </section>

                    {/* ── Classification ── */}
                    <section>
                      <SectionTitle>Classification</SectionTitle>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Sector">
                          <select value={form.sector} onChange={e => updateForm("sector", e.target.value)}
                            className={inputCls()}>
                            <option value="">Select sector…</option>
                            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </Field>
                        <Field label="Industry">
                          <input type="text" value={form.industry}
                            onChange={e => updateForm("industry", e.target.value)}
                            placeholder="e.g. Oil & Gas"
                            className={inputCls()} />
                        </Field>
                      </div>
                    </section>

                    {/* ── Flags ── */}
                    <section>
                      <SectionTitle>Flags</SectionTitle>
                      <div className="flex gap-6">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={form.is_tradable}
                            onChange={e => updateForm("is_tradable", e.target.checked)}
                            className="accent-cyan-500 w-4 h-4" />
                          <div>
                            <div className="text-sm text-white">Is Tradable</div>
                            <div className="text-xs text-gray-600">Users can place buy/sell orders</div>
                          </div>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={form.is_featured}
                            onChange={e => updateForm("is_featured", e.target.checked)}
                            className="accent-amber-500 w-4 h-4" />
                          <div>
                            <div className="text-sm text-white">Featured</div>
                            <div className="text-xs text-gray-600">Highlighted in market browse</div>
                          </div>
                        </label>
                      </div>
                    </section>

                    {/* ── Media ── */}
                    <section>
                      <SectionTitle>Media &amp; Links</SectionTitle>
                      <div className="space-y-3">
                        <Field label="Logo URL">
                          <div className="flex gap-2 items-center">
                            <input type="url" value={form.logo_url}
                              onChange={e => updateForm("logo_url", e.target.value)}
                              placeholder="https://…"
                              className={`flex-1 ${inputCls()}`} />
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {form.logo_url
                                ? <img src={form.logo_url} alt="logo"
                                    className="w-full h-full object-contain p-0.5"
                                    onError={e => { e.target.style.display = "none"; }} />
                                : <BarChart2 className="w-4 h-4 text-gray-700" />}
                            </div>
                          </div>
                        </Field>
                        <Field label="Website URL">
                          <input type="url" value={form.website_url}
                            onChange={e => updateForm("website_url", e.target.value)}
                            placeholder="https://www.company.com"
                            className={inputCls()} />
                        </Field>
                        <Field label="Description">
                          <textarea value={form.description}
                            onChange={e => updateForm("description", e.target.value)}
                            placeholder="Brief description of the company…" rows={3}
                            className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors resize-none" />
                        </Field>
                      </div>
                    </section>

                    {/* ── Preview ── */}
                    {(form.ticker_symbol || form.company_name) && (
                      <section>
                        <SectionTitle>Preview</SectionTitle>
                        <div className="bg-[#0A0C1E] border border-violet-500/15 rounded-xl p-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {form.logo_url
                              ? <img src={form.logo_url} alt="" className="w-full h-full object-contain p-0.5" onError={e => { e.target.style.display="none"; }} />
                              : <span className="text-xs font-bold text-violet-300">{(form.ticker_symbol || "??").slice(0,2)}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white">{form.ticker_symbol || "—"}</span>
                              <CurrBadge currency={form.currency} />
                              {form.asset_type && <span className="text-xs px-1.5 py-0.5 bg-violet-500/10 text-violet-300 rounded">{form.asset_type}</span>}
                              {form.exchange && <span className="text-xs px-1.5 py-0.5 bg-white/5 text-gray-500 rounded">{form.exchange}</span>}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{form.company_name || "—"}</div>
                            {form.sector && <div className="text-xs text-gray-700 mt-0.5">{form.sector}</div>}
                          </div>
                          {form.current_price && (
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-bold text-white">
                                {fmtPrice(parseFloat(form.current_price || 0), form.currency)}
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 flex-shrink-0 bg-[#0A0C1E]">
                    <p className="text-xs text-gray-600">
                      Fields marked <span className="text-red-400">*</span> are required
                    </p>
                    <div className="flex items-center gap-3">
                      <button onClick={closeAdd}
                        className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
                        Cancel
                      </button>
                      <button onClick={handleAddStock} disabled={addLoading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-all disabled:opacity-60 shadow-lg shadow-violet-500/20">
                        {addLoading
                          ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</>
                          : <><Upload className="w-4 h-4" />Create Stock</>}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Small reusable sub-components ── */
function SectionTitle({ children }) {
  return (
    <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className="w-4 h-px bg-violet-500/40" />
      {children}
      <span className="flex-1 h-px bg-violet-500/10" />
    </p>
  );
}

function inputCls(error) {
  return `w-full bg-[#141C30] border rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors ${
    error ? "border-red-500/50" : "border-white/8 focus:border-violet-500/40"
  }`;
}

function PriceInput({ currency, value, onChange, error, placeholder }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
        {currSym(currency)}
      </span>
      <input type="number" min="0" step="0.01" value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || "0.00"}
        className={`${inputCls(error)} pl-6`} />
    </div>
  );
}
























// import { useState, useEffect, useCallback } from "react";
// import { useNavigate } from "react-router";
// import { motion, AnimatePresence } from "motion/react";
// import {
//   TrendingUp, TrendingDown, Users, Search, AlertCircle,
//   RefreshCw, Plus, X, Check, Upload, Edit2, DollarSign,
// } from "lucide-react";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken = () => localStorage.getItem("access_token");
// const authHdr  = () => ({
//   Authorization:  `Bearer ${getToken()}`,
//   "Content-Type": "application/json",
// });

// const ASSET_TYPES = ["STOCK","ETF","CRYPTO","FOREX","COMMODITY","INDEX"];
// const EXCHANGES   = ["NYSE","NASDAQ","NSE","BSE","LSE","TSX","ASX","OTHER"];
// const SECTORS = [
//   "Technology","Financials","Healthcare","Consumer Disc.","Consumer Staples",
//   "Energy","Industrials","Materials","Real Estate","Utilities",
//   "Communication Services","Entertainment","Auto","IT","AI","Other",
// ];

// const EMPTY_FORM = {
//   ticker_symbol:"", company_name:"", short_name:"", asset_type:"STOCK",
//   sector:"", industry:"", exchange:"NASDAQ", country:"", currency:"USD",
//   current_price:"", market_cap:"", logo_url:"", website_url:"", description:"",
// };

// // ── Field input helper ────────────────────────────────────────────────────────
// function Field({ label, required, error, children }) {
//   return (
//     <div>
//       <label className="text-xs text-gray-500 mb-1.5 block">
//         {label}{required && <span className="text-red-400 ml-0.5">*</span>}
//       </label>
//       {children}
//       {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
//     </div>
//   );
// }

// export function AdminAllStocks() {
//   const navigate = useNavigate();

//   // ── Data ──────────────────────────────────────────────────────────────────
//   const [stocks,      setStocks]      = useState([]);
//   const [loading,     setLoading]     = useState(true);
//   const [error,       setError]       = useState("");
//   const [summary,     setSummary]     = useState({
//     mostHeld: "—", mostHeldUsers: 0, totalStocks: 0,
//     totalPositions: 0, largestValue: 0,
//   });
//   const [totalPlatformValue, setTotalPlatformValue] = useState(0);

//   // ── Filters ───────────────────────────────────────────────────────────────
//   const [search,       setSearch]      = useState("");
//   const [sectorFilter, setSector]      = useState("All");

//   // ── Add Stock modal ───────────────────────────────────────────────────────
//   const [showAddModal, setShowAddModal] = useState(false);
//   const [form,         setForm]         = useState(EMPTY_FORM);
//   const [formErrors,   setFormErrors]   = useState({});
//   const [addLoading,   setAddLoading]   = useState(false);
//   const [addError,     setAddError]     = useState("");
//   const [addSuccess,   setAddSuccess]   = useState(false);

//   // ── Update Price modal ────────────────────────────────────────────────────
//   const [showUpdateModal, setShowUpdateModal] = useState(false);
//   const [updateTarget,    setUpdateTarget]    = useState(null); // stock object
//   const [updatePrice,     setUpdatePrice]     = useState("");
//   const [updatePrevClose, setUpdatePrevClose] = useState("");
//   const [updateHigh,      setUpdateHigh]      = useState("");
//   const [updateLow,       setUpdateLow]       = useState("");
//   const [updateVolume,    setUpdateVolume]     = useState("");
//   const [updateLoading,   setUpdateLoading]   = useState(false);
//   const [updateError,     setUpdateError]     = useState("");
//   const [updateSuccess,   setUpdateSuccess]   = useState(false);

//   // ─────────────────────────────────────────────────────────────────────────
//   // Fetch
//   // ─────────────────────────────────────────────────────────────────────────
//   const fetchData = useCallback(async () => {
//     setLoading(true);
//     setError("");
//     try {
//       // Primary: admin overview endpoint
//       // Falls back to stocks/list if overview doesn't return holdings data
//       const [overviewRes, stocksRes] = await Promise.allSettled([
//         fetch(`${API_BASE}/admin/stocks/overview`, { headers: authHdr() }),
//         fetch(`${API_BASE}/stocks/list?per_page=100&sort_by=current_price&order=desc`, { headers: authHdr() }),
//       ]);

//       let overviewStocks = [];
//       let overviewSummary = {};

//       if (overviewRes.status === "fulfilled") {
//         const data = await overviewRes.value.json();
//         if (data.bool) {
//           overviewStocks  = data.response?.stocks || data.response || [];
//           overviewSummary = data.response?.summary || {};
//         }
//       }

//       // Stocks list gives us current price + price_change_percent
//       let stocksList = [];
//       if (stocksRes.status === "fulfilled") {
//         const data = await stocksRes.value.json();
//         if (data.bool) {
//           stocksList = data.response?.stocks || data.response?.data || [];
//         }
//       }

//       // Build a map by ticker for quick lookup
//       const listMap = {};
//       stocksList.forEach((s) => { listMap[s.ticker_symbol] = s; });

//       // Also fetch portfolio holdings to get platform holdings data
//       // GET /portfolios/admin/all gives us ALL portfolios
//       let allHoldings = [];
//       try {
//         const portRes  = await fetch(`${API_BASE}/portfolios/admin/all?per_page=200`, { headers: authHdr() });
//         const portData = await portRes.json();
//         if (portData.bool) {
//           const portfolios = portData.response?.portfolios || [];
//           // Get holdings for each portfolio (use first 10 to avoid too many requests)
//           const holdingFetches = portfolios.slice(0, 20).map(async (p) => {
//             try {
//               const hRes  = await fetch(`${API_BASE}/portfolios/${p.portfolio_id}`, { headers: authHdr() });
//               const hData = await hRes.json();
//               return hData.bool ? (hData.response?.holdings || []) : [];
//             } catch { return []; }
//           });
//           const results = await Promise.allSettled(holdingFetches);
//           results.forEach((r) => { if (r.status === "fulfilled") allHoldings.push(...r.value); });
//         }
//       } catch { /* silent */ }

//       // Aggregate holdings by stock ticker
//       const holdingsAgg = {}; // { ticker: { users: Set, totalShares: 0, totalValue: 0 } }
//       allHoldings.forEach((h) => {
//         const t = h.ticker_symbol;
//         if (!t) return;
//         if (!holdingsAgg[t]) holdingsAgg[t] = { users: new Set(), totalShares: 0, totalValue: 0 };
//         holdingsAgg[t].users.add(h.user_id || h.portfolio_id);
//         holdingsAgg[t].totalShares += parseFloat(h.quantity || 0);
//         holdingsAgg[t].totalValue  += parseFloat(h.current_value || 0);
//       });

//       // Decide which source is richer: overview or stocks/list
//       // Prefer overview if it has stocks, merge with list price data; otherwise use stocksList
//       const baseList = overviewStocks.length > 0
//         ? overviewStocks.map((s) => {
//             const ticker = s.ticker_symbol || s.symbol || s.ticker;
//             const listS  = listMap[ticker] || {};
//             const hagg   = holdingsAgg[ticker] || {};
//             return {
//               stock_id:    s.stock_id    || listS.stock_id,
//               symbol:      ticker,
//               name:        s.company_name|| s.name || listS.company_name,
//               logo_url:    s.logo_url    || listS.logo_url,
//               sector:      s.sector      || listS.sector || "Other",
//               price:       parseFloat(s.current_price || listS.current_price || 0),
//               // price_change_percent: prefer listS (more up-to-date) → s → fallback
//               changePct:   parseFloat(listS.price_change_percent ?? s.price_change_percent ?? s.change_pct ?? s.changePct ?? 0),
//               users:       hagg.users ? hagg.users.size : (s.total_holders || s.users || 0),
//               totalShares: hagg.totalShares || s.total_shares || s.totalShares || 0,
//               totalValue:  hagg.totalValue  || parseFloat(s.platform_aum || s.totalValue || 0),
//               is_tradable: s.is_tradable ?? listS.is_tradable ?? true,
//             };
//           })
//         : stocksList.map((s) => {
//             const hagg = holdingsAgg[s.ticker_symbol] || {};
//             return {
//               stock_id:   s.stock_id,
//               symbol:     s.ticker_symbol,
//               name:       s.company_name,
//               logo_url:   s.logo_url,
//               sector:     s.sector || "Other",
//               price:      parseFloat(s.current_price || 0),
//               changePct:  parseFloat(s.price_change_percent || 0),
//               users:      hagg.users ? hagg.users.size : 0,
//               totalShares:hagg.totalShares || 0,
//               totalValue: hagg.totalValue  || 0,
//               is_tradable:s.is_tradable ?? true,
//             };
//           });

//       setStocks(baseList);

//       // Compute summary
//       const totalVal     = baseList.reduce((a, s) => a + s.totalValue, 0);
//       const sortedByVal  = [...baseList].sort((a, b) => b.totalValue - a.totalValue);
//       const sortedByUser = [...baseList].sort((a, b) => b.users - a.users);
//       const mostHeld     = sortedByUser[0];

//       setTotalPlatformValue(totalVal);
//       setSummary({
//         mostHeld:      mostHeld?.symbol || overviewSummary.most_held_symbol || "—",
//         mostHeldUsers: mostHeld?.users  || 0,
//         totalStocks:   overviewSummary.total_stocks   || baseList.length,
//         totalPositions:overviewSummary.total_positions|| allHoldings.length,
//         largestValue:  sortedByVal[0]?.totalValue || 0,
//       });
//     } catch (e) {
//       setError("Network error. Could not load stocks.");
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => { fetchData(); }, [fetchData]);

//   // ─────────────────────────────────────────────────────────────────────────
//   // Add Stock
//   // ─────────────────────────────────────────────────────────────────────────
//   const updateForm = (field, value) => {
//     setForm(p => ({ ...p, [field]: value }));
//     if (formErrors[field]) setFormErrors(p => ({ ...p, [field]: "" }));
//   };

//   const validateForm = () => {
//     const errs = {};
//     if (!form.ticker_symbol.trim()) errs.ticker_symbol = "Required.";
//     if (!form.company_name.trim())  errs.company_name  = "Required.";
//     if (!form.current_price || isNaN(parseFloat(form.current_price))) errs.current_price = "Valid price required.";
//     if (form.market_cap && isNaN(parseFloat(form.market_cap)))        errs.market_cap    = "Must be a number.";
//     return errs;
//   };

//   const handleAddStock = async () => {
//     setAddError("");
//     const errs = validateForm();
//     if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
//     setAddLoading(true);
//     try {
//       const payload = {
//         ticker_symbol: form.ticker_symbol.trim().toUpperCase(),
//         company_name:  form.company_name.trim(),
//         asset_type:    form.asset_type,
//         currency:      form.currency || "USD",
//         current_price: parseFloat(form.current_price),
//         ...(form.short_name   && { short_name:   form.short_name.trim()  }),
//         ...(form.sector       && { sector:       form.sector             }),
//         ...(form.industry     && { industry:     form.industry.trim()    }),
//         ...(form.exchange     && { exchange:     form.exchange           }),
//         ...(form.country      && { country:      form.country.trim()     }),
//         ...(form.market_cap   && { market_cap:   parseFloat(form.market_cap) }),
//         ...(form.logo_url     && { logo_url:     form.logo_url.trim()   }),
//         ...(form.website_url  && { website_url:  form.website_url.trim()}),
//         ...(form.description  && { description:  form.description.trim()}),
//       };
//       const res  = await fetch(`${API_BASE}/stocks/create`, {
//         method: "POST", headers: authHdr(), body: JSON.stringify(payload),
//       });
//       const data = await res.json();
//       if (!data.bool) { setAddError(data.response?.message || "Failed to create stock."); return; }
//       setAddSuccess(true);
//       setTimeout(() => { setAddSuccess(false); setShowAddModal(false); setForm(EMPTY_FORM); setFormErrors({}); fetchData(); }, 1800);
//     } catch { setAddError("Network error."); }
//     finally { setAddLoading(false); }
//   };

//   const closeAdd = () => { setShowAddModal(false); setForm(EMPTY_FORM); setFormErrors({}); setAddError(""); setAddSuccess(false); };

//   // ─────────────────────────────────────────────────────────────────────────
//   // Update Price
//   // ─────────────────────────────────────────────────────────────────────────
//   const openUpdateModal = (stock, e) => {
//     e.stopPropagation();
//     setUpdateTarget(stock);
//     setUpdatePrice(stock.price?.toFixed(2) || "");
//     setUpdatePrevClose("");
//     setUpdateHigh("");
//     setUpdateLow("");
//     setUpdateVolume("");
//     setUpdateError("");
//     setUpdateSuccess(false);
//     setShowUpdateModal(true);
//   };

//   const handleUpdatePrice = async () => {
//     if (!updateTarget?.stock_id) { setUpdateError("Stock ID missing."); return; }
//     if (!updatePrice || isNaN(parseFloat(updatePrice))) { setUpdateError("Valid price required."); return; }
//     setUpdateLoading(true);
//     setUpdateError("");
//     try {
//       const payload = {
//         current_price: parseFloat(updatePrice),
//         ...(updatePrevClose && { previous_close: parseFloat(updatePrevClose) }),
//         ...(updateHigh      && { day_high:        parseFloat(updateHigh)      }),
//         ...(updateLow       && { day_low:         parseFloat(updateLow)       }),
//         ...(updateVolume    && { volume:          parseInt(updateVolume, 10)  }),
//       };
//       const res  = await fetch(`${API_BASE}/stocks/${updateTarget.stock_id}/update_price`, {
//         method: "PUT", headers: authHdr(), body: JSON.stringify(payload),
//       });
//       const data = await res.json();
//       if (!data.bool) { setUpdateError(data.response?.message || "Failed to update price."); return; }
//       setUpdateSuccess(true);
//       setTimeout(() => { setShowUpdateModal(false); setUpdateTarget(null); setUpdateSuccess(false); fetchData(); }, 1500);
//     } catch { setUpdateError("Network error."); }
//     finally { setUpdateLoading(false); }
//   };

//   // ─────────────────────────────────────────────────────────────────────────
//   // Derived
//   // ─────────────────────────────────────────────────────────────────────────
//   const allSectors = ["All", ...Array.from(new Set(stocks.map(s => s.sector).filter(Boolean))).sort()];

//   const filtered = stocks
//     .filter(s =>
//       ((s.symbol || "").toLowerCase().includes(search.toLowerCase()) ||
//        (s.name   || "").toLowerCase().includes(search.toLowerCase())) &&
//       (sectorFilter === "All" || s.sector === sectorFilter)
//     )
//     .sort((a, b) => b.totalValue - a.totalValue || b.price - a.price);

//   const summaryCards = [
//     { label:"Most Held",        value: summary.mostHeld,      sub:`${summary.mostHeldUsers} users` },
//     { label:"Platform Stocks",  value: summary.totalStocks,   sub:"unique symbols" },
//     { label:"Total Positions",  value: summary.totalPositions,sub:"across all users" },
//     { label:"Largest Position", value:`$${Math.max(0, summary.largestValue).toLocaleString("en",{maximumFractionDigits:0})}`, sub:"single stock" },
//   ];

//   // ─────────────────────────────────────────────────────────────────────────
//   // Render
//   // ─────────────────────────────────────────────────────────────────────────
//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">

//       {/* Header */}
//       <div className="flex items-center justify-between flex-wrap gap-3">
//         <div>
//           <h1 className="text-xl font-bold text-white">All Stocks — Platform View</h1>
//           <p className="text-sm text-gray-500 mt-0.5">Every stock on the platform with live holdings data</p>
//         </div>
//         <div className="flex items-center gap-2">
//           <button onClick={fetchData} className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
//             <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
//           </button>
//           <div className="text-xs text-gray-500 bg-[#0C1220] border border-white/5 px-3 py-2 rounded-xl">
//             Platform total: <span className="text-white font-medium">${(totalPlatformValue / 1000).toFixed(1)}K</span>
//           </div>
//           <button onClick={() => setShowAddModal(true)}
//             className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-700 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/20">
//             <Plus className="w-4 h-4" /> Add Stock
//           </button>
//         </div>
//       </div>

//       {error && (
//         <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
//           <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
//         </div>
//       )}

//       {/* Summary cards */}
//       <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
//         {summaryCards.map((s, i) => (
//           <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
//             <div className="text-xs text-gray-500 mb-1">{s.label}</div>
//             <div className="text-lg font-bold text-white">{s.value}</div>
//             <div className="text-xs text-gray-600 mt-0.5">{s.sub}</div>
//           </div>
//         ))}
//       </div>

//       {/* Filters */}
//       <div className="flex flex-col sm:flex-row gap-3">
//         <div className="relative flex-1 max-w-xs">
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
//           <input type="text" value={search} onChange={e => setSearch(e.target.value)}
//             placeholder="Search symbol…"
//             className="w-full bg-[#0C1220] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500/30 transition-colors" />
//         </div>
//         <div className="flex gap-2 flex-wrap">
//           {allSectors.map(s => (
//             <button key={s} onClick={() => setSector(s)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${sectorFilter === s ? "border-violet-500/50 bg-violet-500/10 text-violet-300" : "border-white/8 text-gray-600 hover:text-white"}`}>
//               {s}
//             </button>
//           ))}
//         </div>
//       </div>

//       {/* Table */}
//       <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//         {loading ? (
//           <div className="flex items-center justify-center py-16">
//             <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//           </div>
//         ) : (
//           <div className="overflow-x-auto">
//             <table className="w-full">
//               <thead>
//                 <tr className="border-b border-white/5">
//                   {["Rank","Symbol","Sector","Price","Change","Users Holding","Total Shares","Platform Value","% of AUM","Update"].map(h => (
//                     <th key={h} className="px-4 py-3.5 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                   ))}
//                 </tr>
//               </thead>
//               <tbody>
//                 {filtered.map((s, i) => {
//                   const up  = s.changePct >= 0;
//                   const pct = totalPlatformValue > 0 ? (s.totalValue / totalPlatformValue) * 100 : 0;
//                   return (
//                     <motion.tr key={s.symbol || i}
//                       initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
//                       className="border-b border-white/5 hover:bg-white/5 transition-colors group">
//                       {/* Rank */}
//                       <td className="px-4 py-3.5">
//                         <span className={`text-sm font-bold ${i < 3 ? "text-amber-400" : "text-gray-600"}`}>#{i + 1}</span>
//                       </td>
//                       {/* Symbol */}
//                       <td className="px-4 py-3.5">
//                         <div className="flex items-center gap-2.5">
//                           <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/15 flex items-center justify-center overflow-hidden flex-shrink-0">
//                             {s.logo_url ? (
//                               <img src={s.logo_url} alt={s.symbol} className="w-full h-full object-contain p-0.5" onError={e => { e.target.style.display="none"; }} />
//                             ) : (
//                               <span className="text-xs font-bold text-violet-300">{(s.symbol || "??").slice(0, 2)}</span>
//                             )}
//                           </div>
//                           <div>
//                             <div className="text-sm font-bold text-white">{s.symbol}</div>
//                             <div className="text-xs text-gray-600 truncate max-w-[100px]">{s.name}</div>
//                           </div>
//                         </div>
//                       </td>
//                       {/* Sector */}
//                       <td className="px-4 py-3.5">
//                         <span className="px-2 py-0.5 bg-white/5 rounded text-xs text-gray-500">{s.sector || "—"}</span>
//                       </td>
//                       {/* Price */}
//                       <td className="px-4 py-3.5 text-sm font-medium text-white">
//                         ${s.price.toFixed(2)}
//                       </td>
//                       {/* Change */}
//                       <td className="px-4 py-3.5">
//                         <div className={`flex items-center gap-1 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
//                           {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
//                           {up ? "+" : ""}{s.changePct.toFixed(2)}%
//                         </div>
//                       </td>
//                       {/* Users Holding */}
//                       <td className="px-4 py-3.5">
//                         {s.users > 0 ? (
//                           <div className="flex items-center gap-1.5">
//                             <Users className="w-3.5 h-3.5 text-violet-400" />
//                             <span className="text-sm text-white">{s.users}</span>
//                             <span className="text-xs text-gray-600">users</span>
//                           </div>
//                         ) : (
//                           <span className="text-xs text-gray-700">Not held</span>
//                         )}
//                       </td>
//                       {/* Total Shares */}
//                       <td className="px-4 py-3.5 text-sm text-gray-400">
//                         {s.totalShares > 0 ? parseFloat(s.totalShares).toLocaleString("en", { maximumFractionDigits: 2 }) : "—"}
//                       </td>
//                       {/* Platform Value */}
//                       <td className="px-4 py-3.5 text-sm text-white">
//                         {s.totalValue > 0
//                           ? `$${s.totalValue.toLocaleString("en", { maximumFractionDigits: 0 })}`
//                           : "—"}
//                       </td>
//                       {/* % of AUM */}
//                       <td className="px-4 py-3.5">
//                         {pct > 0 ? (
//                           <div className="flex items-center gap-2">
//                             <div className="w-14 h-1.5 bg-white/5 rounded-full overflow-hidden">
//                               <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, pct * 5)}%` }} />
//                             </div>
//                             <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
//                           </div>
//                         ) : (
//                           <span className="text-xs text-gray-700">—</span>
//                         )}
//                       </td>
//                       {/* Update button */}
//                       <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
//                         <button
//                           onClick={e => openUpdateModal(s, e)}
//                           className="flex items-center gap-1.5 px-2.5 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs text-cyan-300 hover:bg-cyan-500/20 transition-all opacity-0 group-hover:opacity-100 whitespace-nowrap"
//                         >
//                           <Edit2 className="w-3 h-3" /> Update Price
//                         </button>
//                       </td>
//                     </motion.tr>
//                   );
//                 })}
//                 {filtered.length === 0 && !loading && (
//                   <tr>
//                     <td colSpan={10} className="px-5 py-12 text-center text-gray-600 text-sm">
//                       No stocks match your filters
//                     </td>
//                   </tr>
//                 )}
//               </tbody>
//             </table>
//           </div>
//         )}
//       </div>

//       {/* ══════════════════════════ UPDATE PRICE MODAL ══════════════════════════ */}
//       <AnimatePresence>
//         {showUpdateModal && updateTarget && (
//           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
//             <motion.div
//               initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
//               className="bg-[#0C1220] border border-cyan-500/20 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

//               {/* Header */}
//               <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
//                 <div className="flex items-center gap-3">
//                   <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center">
//                     <DollarSign className="w-4 h-4 text-cyan-400" />
//                   </div>
//                   <div>
//                     <div className="text-base font-bold text-white">Update Price — {updateTarget.symbol}</div>
//                     <div className="text-xs text-gray-500">{updateTarget.name}</div>
//                   </div>
//                 </div>
//                 <button onClick={() => setShowUpdateModal(false)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all">
//                   <X className="w-4 h-4" />
//                 </button>
//               </div>

//               {updateSuccess ? (
//                 <div className="flex flex-col items-center justify-center py-12 px-6">
//                   <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
//                     className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
//                     <Check className="w-7 h-7 text-emerald-400" />
//                   </motion.div>
//                   <div className="text-base font-bold text-white mb-1">Price Updated!</div>
//                   <div className="text-xs text-gray-500">{updateTarget.symbol} now at ${parseFloat(updatePrice).toFixed(2)}</div>
//                 </div>
//               ) : (
//                 <div className="p-6 space-y-4">
//                   {/* Current price indicator */}
//                   <div className="bg-[#141C30] border border-white/5 rounded-xl p-3 flex items-center justify-between">
//                     <span className="text-xs text-gray-500">Current Price</span>
//                     <span className="text-sm font-bold text-white">${updateTarget.price.toFixed(2)}</span>
//                   </div>

//                   {updateError && (
//                     <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
//                       <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{updateError}
//                     </div>
//                   )}

//                   <div className="grid grid-cols-2 gap-3">
//                     {/* New price (required) */}
//                     <div className="col-span-2">
//                       <label className="text-xs text-gray-500 mb-1.5 block">
//                         New Price <span className="text-red-400">*</span>
//                       </label>
//                       <div className="relative">
//                         <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
//                         <input type="number" min="0" step="0.01" value={updatePrice}
//                           onChange={e => setUpdatePrice(e.target.value)}
//                           placeholder={updateTarget.price.toFixed(2)}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white font-bold placeholder-gray-700 focus:outline-none focus:border-cyan-500/40 transition-colors" />
//                       </div>
//                     </div>
//                     {/* Previous close */}
//                     <div>
//                       <label className="text-xs text-gray-500 mb-1.5 block">Previous Close</label>
//                       <div className="relative">
//                         <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
//                         <input type="number" min="0" step="0.01" value={updatePrevClose}
//                           onChange={e => setUpdatePrevClose(e.target.value)}
//                           placeholder="Optional"
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-6 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/40 transition-colors" />
//                       </div>
//                     </div>
//                     {/* Volume */}
//                     <div>
//                       <label className="text-xs text-gray-500 mb-1.5 block">Volume</label>
//                       <input type="number" min="0" value={updateVolume}
//                         onChange={e => setUpdateVolume(e.target.value)}
//                         placeholder="Optional"
//                         className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/40 transition-colors" />
//                     </div>
//                     {/* Day High */}
//                     <div>
//                       <label className="text-xs text-gray-500 mb-1.5 block">Day High</label>
//                       <div className="relative">
//                         <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
//                         <input type="number" min="0" step="0.01" value={updateHigh}
//                           onChange={e => setUpdateHigh(e.target.value)}
//                           placeholder="Optional"
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-6 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/40 transition-colors" />
//                       </div>
//                     </div>
//                     {/* Day Low */}
//                     <div>
//                       <label className="text-xs text-gray-500 mb-1.5 block">Day Low</label>
//                       <div className="relative">
//                         <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
//                         <input type="number" min="0" step="0.01" value={updateLow}
//                           onChange={e => setUpdateLow(e.target.value)}
//                           placeholder="Optional"
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-6 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/40 transition-colors" />
//                       </div>
//                     </div>
//                   </div>

//                   {/* Preview */}
//                   {updatePrice && updatePrevClose && (
//                     <div className="bg-[#141C30] border border-white/5 rounded-xl p-3 flex items-center justify-between">
//                       <span className="text-xs text-gray-500">Implied Change</span>
//                       <span className={`text-sm font-bold ${parseFloat(updatePrice) >= parseFloat(updatePrevClose) ? "text-emerald-400" : "text-red-400"}`}>
//                         {parseFloat(updatePrice) >= parseFloat(updatePrevClose) ? "+" : ""}
//                         {(((parseFloat(updatePrice) - parseFloat(updatePrevClose)) / parseFloat(updatePrevClose)) * 100).toFixed(2)}%
//                       </span>
//                     </div>
//                   )}

//                   <div className="flex gap-3 pt-1">
//                     <button onClick={() => setShowUpdateModal(false)}
//                       className="flex-1 py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
//                       Cancel
//                     </button>
//                     <button onClick={handleUpdatePrice} disabled={updateLoading}
//                       className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all disabled:opacity-60">
//                       {updateLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Updating…</> : <><DollarSign className="w-4 h-4" />Update Price</>}
//                     </button>
//                   </div>
//                 </div>
//               )}
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>

//       {/* ══════════════════════════ ADD STOCK MODAL ══════════════════════════ */}
//       <AnimatePresence>
//         {showAddModal && (
//           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
//             <motion.div
//               initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
//               exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.2 }}
//               className="bg-[#0C1220] border border-violet-500/20 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-violet-500/10 overflow-hidden">

//               {/* Header */}
//               <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
//                 <div className="flex items-center gap-3">
//                   <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600/30 to-purple-700/30 border border-violet-500/20 flex items-center justify-center">
//                     <Plus className="w-4 h-4 text-violet-400" />
//                   </div>
//                   <div>
//                     <div className="text-base font-bold text-white">Add New Stock</div>
//                     <div className="text-xs text-gray-500">Create a new stock listing on the platform</div>
//                   </div>
//                 </div>
//                 <button onClick={closeAdd} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all">
//                   <X className="w-4 h-4" />
//                 </button>
//               </div>

//               {addSuccess ? (
//                 <div className="flex-1 flex flex-col items-center justify-center py-16 px-6">
//                   <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
//                     className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
//                     <Check className="w-8 h-8 text-emerald-400" />
//                   </motion.div>
//                   <div className="text-lg font-bold text-white mb-1">Stock Added!</div>
//                   <div className="text-sm text-gray-500 text-center">
//                     <span className="text-violet-300 font-medium">{form.ticker_symbol}</span> is now listed.
//                   </div>
//                 </div>
//               ) : (
//                 <>
//                   {/* Scrollable body */}
//                   <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
//                     {addError && (
//                       <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
//                         <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{addError}
//                       </div>
//                     )}

//                     {/* Core Identity */}
//                     <div>
//                       <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
//                         <span className="w-4 h-px bg-violet-500/40" />Core Identity<span className="flex-1 h-px bg-violet-500/10" />
//                       </p>
//                       <div className="grid grid-cols-2 gap-3">
//                         <Field label="Ticker Symbol" required error={formErrors.ticker_symbol}>
//                           <input type="text" value={form.ticker_symbol}
//                             onChange={e => updateForm("ticker_symbol", e.target.value.toUpperCase())}
//                             placeholder="e.g. AAPL" maxLength={10}
//                             className={`w-full bg-[#141C30] border rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-white placeholder-gray-700 focus:outline-none transition-colors ${formErrors.ticker_symbol ? "border-red-500/50" : "border-white/8 focus:border-violet-500/40"}`} />
//                         </Field>
//                         <Field label="Company Name" required error={formErrors.company_name}>
//                           <input type="text" value={form.company_name}
//                             onChange={e => updateForm("company_name", e.target.value)}
//                             placeholder="e.g. Apple Inc."
//                             className={`w-full bg-[#141C30] border rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors ${formErrors.company_name ? "border-red-500/50" : "border-white/8 focus:border-violet-500/40"}`} />
//                         </Field>
//                         <Field label="Short Name">
//                           <input type="text" value={form.short_name}
//                             onChange={e => updateForm("short_name", e.target.value)}
//                             placeholder="e.g. Apple"
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
//                         </Field>
//                         <Field label="Asset Type" required>
//                           <select value={form.asset_type} onChange={e => updateForm("asset_type", e.target.value)}
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/40 transition-colors">
//                             {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
//                           </select>
//                         </Field>
//                       </div>
//                     </div>

//                     {/* Market Info */}
//                     <div>
//                       <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
//                         <span className="w-4 h-px bg-violet-500/40" />Market Info<span className="flex-1 h-px bg-violet-500/10" />
//                       </p>
//                       <div className="grid grid-cols-2 gap-3">
//                         <Field label="Current Price" required error={formErrors.current_price}>
//                           <div className="relative">
//                             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
//                             <input type="number" min="0" step="0.01" value={form.current_price}
//                               onChange={e => updateForm("current_price", e.target.value)} placeholder="0.00"
//                               className={`w-full bg-[#141C30] border rounded-xl pl-6 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors ${formErrors.current_price ? "border-red-500/50" : "border-white/8 focus:border-violet-500/40"}`} />
//                           </div>
//                         </Field>
//                         <Field label="Market Cap" error={formErrors.market_cap}>
//                           <div className="relative">
//                             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
//                             <input type="number" min="0" value={form.market_cap}
//                               onChange={e => updateForm("market_cap", e.target.value)} placeholder="e.g. 3000000000000"
//                               className={`w-full bg-[#141C30] border rounded-xl pl-6 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors ${formErrors.market_cap ? "border-red-500/50" : "border-white/8 focus:border-violet-500/40"}`} />
//                           </div>
//                         </Field>
//                         <Field label="Exchange">
//                           <select value={form.exchange} onChange={e => updateForm("exchange", e.target.value)}
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/40 transition-colors">
//                             {EXCHANGES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
//                           </select>
//                         </Field>
//                         <Field label="Currency">
//                           <input type="text" value={form.currency}
//                             onChange={e => updateForm("currency", e.target.value.toUpperCase())}
//                             placeholder="USD" maxLength={5}
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
//                         </Field>
//                       </div>
//                     </div>

//                     {/* Classification */}
//                     <div>
//                       <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
//                         <span className="w-4 h-px bg-violet-500/40" />Classification<span className="flex-1 h-px bg-violet-500/10" />
//                       </p>
//                       <div className="grid grid-cols-2 gap-3">
//                         <Field label="Sector">
//                           <select value={form.sector} onChange={e => updateForm("sector", e.target.value)}
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/40 transition-colors">
//                             <option value="">Select sector…</option>
//                             {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
//                           </select>
//                         </Field>
//                         <Field label="Industry">
//                           <input type="text" value={form.industry}
//                             onChange={e => updateForm("industry", e.target.value)} placeholder="e.g. Consumer Electronics"
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
//                         </Field>
//                         <Field label="Country">
//                           <input type="text" value={form.country}
//                             onChange={e => updateForm("country", e.target.value)} placeholder="e.g. United States"
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
//                         </Field>
//                       </div>
//                     </div>

//                     {/* Media */}
//                     <div>
//                       <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
//                         <span className="w-4 h-px bg-violet-500/40" />Media &amp; Links<span className="flex-1 h-px bg-violet-500/10" />
//                       </p>
//                       <div className="space-y-3">
//                         <Field label="Logo URL">
//                           <div className="flex gap-2 items-center">
//                             <input type="url" value={form.logo_url}
//                               onChange={e => updateForm("logo_url", e.target.value)} placeholder="https://…"
//                               className="flex-1 bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
//                             <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
//                               {form.logo_url ? (
//                                 <img src={form.logo_url} alt="logo" className="w-full h-full object-contain p-0.5" onError={e => { e.target.style.display="none"; }} />
//                               ) : <span className="text-xs text-gray-700">IMG</span>}
//                             </div>
//                           </div>
//                         </Field>
//                         <Field label="Website URL">
//                           <input type="url" value={form.website_url}
//                             onChange={e => updateForm("website_url", e.target.value)} placeholder="https://www.company.com"
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
//                         </Field>
//                       </div>
//                     </div>

//                     {/* Description */}
//                     <div>
//                       <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
//                         <span className="w-4 h-px bg-violet-500/40" />Description<span className="flex-1 h-px bg-violet-500/10" />
//                       </p>
//                       <textarea value={form.description} onChange={e => updateForm("description", e.target.value)}
//                         placeholder="Brief description…" rows={3}
//                         className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-violet-500/40 transition-colors resize-none" />
//                     </div>

//                     {/* Preview */}
//                     {(form.ticker_symbol || form.company_name) && (
//                       <div>
//                         <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
//                           <span className="w-4 h-px bg-violet-500/40" />Preview<span className="flex-1 h-px bg-violet-500/10" />
//                         </p>
//                         <div className="bg-[#0A0C1E] border border-violet-500/15 rounded-xl p-4 flex items-center gap-3">
//                           <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/15 flex items-center justify-center overflow-hidden flex-shrink-0">
//                             {form.logo_url ? (
//                               <img src={form.logo_url} alt="" className="w-full h-full object-contain p-0.5" onError={e => { e.target.style.display="none"; }} />
//                             ) : <span className="text-xs font-bold text-violet-300">{(form.ticker_symbol || "??").slice(0,2)}</span>}
//                           </div>
//                           <div className="flex-1 min-w-0">
//                             <div className="flex items-center gap-2 flex-wrap">
//                               <span className="text-sm font-bold text-white">{form.ticker_symbol || "—"}</span>
//                               {form.asset_type && <span className="text-xs px-1.5 py-0.5 bg-violet-500/10 text-violet-300 rounded">{form.asset_type}</span>}
//                               {form.exchange && <span className="text-xs px-1.5 py-0.5 bg-white/5 text-gray-500 rounded">{form.exchange}</span>}
//                             </div>
//                             <div className="text-xs text-gray-500 truncate">{form.company_name || "—"}</div>
//                             {form.sector && <div className="text-xs text-gray-700 mt-0.5">{form.sector}</div>}
//                           </div>
//                           {form.current_price && (
//                             <div className="text-right flex-shrink-0">
//                               <div className="text-sm font-bold text-white">{form.currency || "USD"} {parseFloat(form.current_price || 0).toFixed(2)}</div>
//                               {form.market_cap && <div className="text-xs text-gray-600">MCap ${(parseFloat(form.market_cap)/1e9).toFixed(1)}B</div>}
//                             </div>
//                           )}
//                         </div>
//                       </div>
//                     )}
//                   </div>

//                   {/* Footer */}
//                   <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 flex-shrink-0 bg-[#0A0C1E]">
//                     <p className="text-xs text-gray-600">Fields marked <span className="text-red-400">*</span> are required</p>
//                     <div className="flex items-center gap-3">
//                       <button onClick={closeAdd} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-400 hover:text-white transition-all">Cancel</button>
//                       <button onClick={handleAddStock} disabled={addLoading}
//                         className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-all disabled:opacity-60 shadow-lg shadow-violet-500/20">
//                         {addLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</> : <><Upload className="w-4 h-4" />Create Stock</>}
//                       </button>
//                     </div>
//                   </div>
//                 </>
//               )}
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }





















