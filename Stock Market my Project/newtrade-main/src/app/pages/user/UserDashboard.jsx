import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  TrendingUp, TrendingDown, ArrowUpRight, Plus,
  ChevronRight, IndianRupee, Wallet, PieChart as PieIcon,
  RefreshCw, AlertCircle, Briefcase,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip,
  XAxis, YAxis, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { useAuth } from "../../context/AuthContext";
import { valueDomain, fmtAxisINR, showDots } from "../../utils/chart";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

const secColors = ["#06B6D4", "#8B5CF6", "#F59E0B", "#10B981"];


// All prices display in Indian Rupees (₹) across the platform.
const currSym = () => "₹";

const fmtMoney = (value, currency = "INR", { compact = false, decimals = 0 } = {}) => {
  const sym = currSym(currency);
  const num = Number(value) || 0;
  if (compact) {
    const abs = Math.abs(num);
    if ((currency || "INR").toUpperCase() === "INR") {
      if (abs >= 1e7) return `${sym}${(num / 1e7).toFixed(2)}Cr`;
      if (abs >= 1e5) return `${sym}${(num / 1e5).toFixed(2)}L`;
      if (abs >= 1e3) return `${sym}${(num / 1e3).toFixed(1)}K`;
      return `${sym}${num.toFixed(decimals)}`;
    }
    if (abs >= 1e9) return `${sym}${(num / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sym}${(num / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sym}${(num / 1e3).toFixed(1)}K`;
    return `${sym}${num.toFixed(decimals)}`;
  }
  return `${sym}${num.toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`;
};

export function UserDashboard() {
  const navigate = useNavigate();
  const { user }  = useAuth();
  const [tf, setTf] = useState("3M");
  const tfs = ["1W", "1M", "3M", "6M", "ALL"];

  const [summary,       setSummary]       = useState(null);
  const [portfolio,     setPortfolio]     = useState(null);
  const [holdings,      setHoldings]      = useState([]);
  const [perfHistory,   setPerfHistory]   = useState([]);
  // True when the chart is showing today's value ticks rather than daily history.
  const [isIntraday,    setIsIntraday]    = useState(false);
  const [myStocksToday, setMyStocksToday] = useState([]);
  const [marketIndices, setMarketIndices] = useState([]);
  const [dailyPnl,      setDailyPnl]      = useState([]);
  const [wallet,        setWallet]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, moversRes, portfolioRes, walletRes, monthlyRes, stocksTodayRes] =
        await Promise.allSettled([
          fetch(`${API_BASE}/dashboard/user/summary`,          { headers: authHdr() }),
          fetch(`${API_BASE}/dashboard/market_movers?limit=4`, { headers: authHdr() }),
          fetch(`${API_BASE}/portfolios/my`,                   { headers: authHdr() }),
          fetch(`${API_BASE}/wallets/me`,                      { headers: authHdr() }),
          fetch(`${API_BASE}/dashboard/user/monthly_returns`,  { headers: authHdr() }),
          fetch(`${API_BASE}/dashboard/user/my_stocks_today`,  { headers: authHdr() }),
        ]);

      if (summaryRes.status === "fulfilled") {
        const d = await summaryRes.value.json();
        if (d.bool) setSummary(d.response);
      }

      if (moversRes.status === "fulfilled") {
        const d = await moversRes.value.json();
        if (d.bool) {
          const obj = d.response?.market_movers || {};
          const flat = [
            ...(obj.TOP_GAINER  || []),
            ...(obj.TRENDING    || []),
            ...(obj.MOST_ACTIVE || []),
            ...(obj.TOP_LOSER   || []),
          ];
          const seen = new Set();
          const unique = flat.filter(m => {
            const key = m.ticker_symbol || m.stock_id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setMarketIndices(unique.slice(0, 4));
        }
      }

      if (walletRes.status === "fulfilled") {
        const d = await walletRes.value.json();
        if (d.bool) setWallet(d.response);
      }

      if (monthlyRes.status === "fulfilled") {
        const d = await monthlyRes.value.json();
        if (d.bool) {
          const raw = d.response?.monthly_returns || [];
          setDailyPnl(raw.slice(-14).map((r) => ({
            v: parseFloat(r.daily_return || r.cumulative_return || 0),
          })));
        }
      }

      if (stocksTodayRes.status === "fulfilled") {
        const d = await stocksTodayRes.value.json();
        if (d.bool) setMyStocksToday(d.response?.my_stocks || []);
      }

      if (portfolioRes.status === "fulfilled") {
        const pData = await portfolioRes.value.json();
        if (pData.bool) {
          const ports = pData.response?.portfolios || [];
          if (ports.length > 0) {
            const p = ports.find(x => x.is_default) || ports[0];
            setPortfolio(p);

            const [holdRes, perfRes] = await Promise.allSettled([
              fetch(`${API_BASE}/portfolios/${p.portfolio_id}`, { headers: authHdr() }),
              fetch(`${API_BASE}/portfolios/${p.portfolio_id}/performance?interval=DAILY&limit=90`, { headers: authHdr() }),
            ]);

            let loadedHoldings = [];
            if (holdRes.status === "fulfilled") {
              const hd = await holdRes.value.json();
              if (hd.bool) {
                loadedHoldings = hd.response?.holdings || [];
                setHoldings(loadedHoldings);
              }
            }

            if (perfRes.status === "fulfilled") {
              const pd = await perfRes.value.json();
              // Only ever plot real data. This used to fall back to a fabricated
              // two-point line (invested → current value, dated yesterday → today)
              // whenever no snapshots existed — a trend the portfolio never followed.
              const records = (pd.bool && pd.response?.data) || [];

              // One snapshot per day means no line to draw early on. The intraday
              // value ticks are real samples of the portfolio as prices moved.
              if (records.length < 2) {
                const tRes = await fetch(
                  `${API_BASE}/portfolios/${p.portfolio_id}/performance?interval=INTRADAY&limit=300`,
                  { headers: authHdr() }
                );
                const tData = await tRes.json();
                const ticks = (tData.bool && tData.response?.data) || [];
                if (ticks.length > records.length) {
                  setPerfHistory(ticks.map((t) => ({
                    date:  new Date(t.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    close: parseFloat(t.total_value || 0),
                  })));
                  setIsIntraday(true);
                  return;
                }
              }
              setIsIntraday(false);
              setPerfHistory(records.map((pt) => ({
                date:  (pt.date || "").slice(5),
                close: parseFloat(pt.total_value || 0),
              })));
            }
          }
        }
      }
    } catch (e) {
      setError("Network error loading dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalValue  = parseFloat(portfolio?.current_value           || summary?.portfolio?.current_value           || 0);
  const totalReturn = parseFloat(portfolio?.total_return            || summary?.portfolio?.total_return            || 0);
  const totalRetPct = parseFloat(portfolio?.total_return_percent    || summary?.portfolio?.total_return_percent    || 0);
  const cashBalance = parseFloat(wallet?.available_balance          || summary?.wallet?.available_balance          || 0);
  // Today's P&L = Σ (current_price − previous_close) × qty across holdings.
  // This is live (moves with prices) and resets every IST day when the backend
  // rolls previous_close forward. Falls back to the stored portfolio.day_change.
  let dayPnlCalc = 0, prevDayValue = 0;
  holdings.forEach((h) => {
    const cp = parseFloat(h.current_price || 0);
    const pc = parseFloat(h.previous_close || 0);
    const q  = parseFloat(h.quantity || 0);
    if (q > 0 && cp > 0 && pc > 0) { dayPnlCalc += (cp - pc) * q; prevDayValue += pc * q; }
  });
  const backendDay = parseFloat(portfolio?.day_change ?? summary?.portfolio?.day_change ?? 0);
  const todayPnl    = (holdings.length && prevDayValue > 0) ? dayPnlCalc : backendDay;
  const todayPnlPct = prevDayValue > 0 ? (dayPnlCalc / prevDayValue) * 100
                    : parseFloat(portfolio?.day_change_percent ?? summary?.portfolio?.day_change_percent ?? 0);
  const openPositions = holdings.length;
  const profitCount   = holdings.filter((h) => parseFloat(h.unrealized_pnl || 0) >= 0).length;
  const up            = totalReturn >= 0;

  const portfolioCurrency = portfolio?.currency || summary?.portfolio?.currency || "INR";
  const walletCurrency    = wallet?.currency    || summary?.wallet?.currency    || "INR";

  const sectorMap = {};
  holdings.forEach((h) => {
    const s   = h.sector || "Other";
    const val = parseFloat(h.current_value || 0) > 0
      ? parseFloat(h.current_value)
      : parseFloat(h.total_invested || 0);
    sectorMap[s] = (sectorMap[s] || 0) + val;
  });
  const sectorTotal = Object.values(sectorMap).reduce((a, b) => a + b, 0);
  const secData = Object.entries(sectorMap).map(([n, v], i) => ({
    name:  n,
    value: sectorTotal > 0 ? parseFloat(((v / sectorTotal) * 100).toFixed(1)) : 0,
    color: secColors[i % secColors.length],
  })).filter(s => s.value > 0);

  const sliceMap = { "1W": 7, "1M": 30, "3M": 90, "6M": 90, ALL: 90 };
  const chartData = perfHistory.slice(-(sliceMap[tf] || 90));

  const getIST = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const greeting = () => {
    const h = getIST().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  };
  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata",
  }).format(new Date());

  const displayName = user?.full_name || user?.name || user?.username || "Investor";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 flex-col gap-3">
        <div className="w-9 h-9 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            {greeting()}, {displayName.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{formattedDate} · Your portfolio overview</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate("/user/trade")}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/15"
          >
            <Plus className="w-4 h-4" /> New Trade
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: "Portfolio Value",
            value: fmtMoney(totalValue, portfolioCurrency, { compact: true }),
            sub:   `${up ? "+" : "-"}${fmtMoney(Math.abs(totalReturn), portfolioCurrency, { compact: true })} all time`,
            icon:  Wallet, up,
            color: "from-cyan-500/15 to-cyan-500/5", border: "border-cyan-500/15", ic: "text-cyan-400",
          },
          {
            label: "Today's P&L",
            value: `${todayPnl >= 0 ? "+" : "-"}${fmtMoney(Math.abs(todayPnl), portfolioCurrency, { compact: true })}`,
            sub:   `${todayPnlPct >= 0 ? "+" : ""}${todayPnlPct.toFixed(2)}% today`,
            icon:  TrendingUp, up: todayPnl >= 0,
            color: "from-emerald-500/15 to-emerald-500/5", border: "border-emerald-500/15", ic: "text-emerald-400",
          },
          {
            label: "Cash Balance",
            value: fmtMoney(cashBalance, walletCurrency, { compact: true }),
            sub:   "Available to invest",
            icon:  IndianRupee, up: null,
            color: "from-blue-500/15 to-blue-500/5", border: "border-blue-500/15", ic: "text-blue-400",
          },
          {
            label: "Open Positions",
            value: openPositions.toString(),
            sub:   `${profitCount} in profit`,
            icon:  PieIcon, up: null,
            color: "from-violet-500/15 to-violet-500/5", border: "border-violet-500/15", ic: "text-violet-400",
          },
          {
            label: "Holdings",
            value: openPositions.toString(),
            sub:   "View all →",
            icon:  Briefcase, up: null,
            color: "from-amber-500/15 to-amber-500/5", border: "border-amber-500/15", ic: "text-amber-400",
            onClick: () => navigate("/user/portfolio"),
          },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            onClick={s.onClick}
            className={`bg-gradient-to-br ${s.color} border ${s.border} rounded-2xl p-4 ${s.onClick ? "cursor-pointer hover:brightness-125 transition-all" : ""}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.ic}`} />
            </div>
            <div className="text-xl font-bold text-white mb-1">{s.value}</div>
            <div className={`text-xs flex items-center gap-1 ${
              s.up === true ? "text-emerald-400" : s.up === false ? "text-red-400" : "text-gray-500"
            }`}>
              {s.up !== null && <ArrowUpRight className="w-3 h-3" />}
              {s.sub}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">My Portfolio Performance</div>
              <div className="text-2xl font-bold text-white">
                {fmtMoney(totalValue, portfolioCurrency, { compact: true })}
              </div>
              <div className={`flex items-center gap-1 mt-0.5 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
                {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {up ? "+" : ""}{Number(totalRetPct).toFixed(1)}% all time
              </div>
            </div>
            <div className="flex gap-1">
              {tfs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                    tf === t
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/25"
                      : "text-gray-600 hover:text-gray-400"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="h-52">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="udashGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#06B6D4" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#4B5563", fontSize: 10 }}
                    tickLine={false} axisLine={false}
                    interval="preserveStartEnd"
                  />
                  {/* Without an explicit domain Recharts anchors the axis at 0, which
                      pins a ₹30k line flat against the top of an empty chart. */}
                  <YAxis
                    tick={{ fill: "#4B5563", fontSize: 10 }}
                    tickLine={false} axisLine={false} width={52}
                    domain={valueDomain}
                    tickFormatter={fmtAxisINR}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
                    formatter={(v) => [fmtMoney(v, portfolioCurrency, { decimals: 2 }), "Value"]}
                  />
                  {/* A single snapshot has no line to draw — show the point itself. */}
                  <Area type="monotone" dataKey="close" stroke="#06B6D4" strokeWidth={2}
                    fill="url(#udashGrad)" dot={showDots(chartData)} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <p className="text-sm text-gray-600">No performance history yet</p>
                <p className="text-xs text-gray-700">Make your first trade to start tracking</p>
              </div>
            )}
          </div>
          {isIntraday && chartData.length > 1 && (
            <p className="text-[11px] text-gray-600 mt-2">
              Showing today's value as prices moved. Daily history builds up from here.
            </p>
          )}
          {chartData.length === 1 && (
            <p className="text-[11px] text-gray-600 mt-2">
              Your first data point — the chart fills out as your portfolio is tracked.
            </p>
          )}
        </div>

        <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="text-sm font-medium text-white mb-4">My Allocation</div>
          {secData.length > 0 ? (
            <>
              <div className="h-36 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={secData} cx="50%" cy="50%" innerRadius={38} outerRadius={64} dataKey="value" paddingAngle={3}>
                      {secData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v) => [`${v}%`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {secData.map((s, i) => (
                <div key={i} className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span className="text-xs text-gray-400">{s.name}</span>
                  </div>
                  <span className="text-xs text-white">{s.value}%</span>
                </div>
              ))}
            </>
          ) : (
            <div className="text-xs text-gray-600 text-center py-8">No holdings yet</div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="text-sm font-medium text-white">My Holdings</div>
            <button
              onClick={() => navigate("/user/portfolio")}
              className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              View Portfolio <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {holdings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Symbol", "Shares", "Avg Cost", "Current", "P&L", "Return"].map((h) => (
                      <th key={h} className="px-5 py-2.5 text-left text-xs text-gray-600 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.slice(0, 6).map((h) => {
                    const qty     = parseFloat(h.quantity             || 0);
                    const avgCost = parseFloat(h.average_buy_price    || 0);
                    const currPx  = parseFloat(h.current_price        || 0) > 0
                      ? parseFloat(h.current_price)
                      : avgCost;
                    const mktVal  = parseFloat(h.current_value        || 0) > 0
                      ? parseFloat(h.current_value)
                      : qty * currPx;
                    const invested= parseFloat(h.total_invested       || qty * avgCost);
                    const pnl     = parseFloat(h.unrealized_pnl       || 0) !== 0
                      ? parseFloat(h.unrealized_pnl)
                      : mktVal - invested;
                    const pct     = parseFloat(h.unrealized_pnl_percent || 0) !== 0
                      ? parseFloat(h.unrealized_pnl_percent)
                      : (avgCost > 0 ? ((currPx - avgCost) / avgCost) * 100 : 0);
                    const hUp     = pnl >= 0;
                    const hCurrency = h.currency || portfolioCurrency;
                    return (
                      <tr
                        key={h.holding_id || h.stock_id}
                        onClick={() => navigate(`/user/stock/${h.ticker_symbol}`)}
                        className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {h.logo_url ? (
                              <img src={h.logo_url} alt={h.ticker_symbol} className="w-6 h-6 rounded-lg object-contain bg-white/5" />
                            ) : (
                              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
                                <span className="text-xs font-bold text-cyan-400">{(h.ticker_symbol || "?").slice(0, 2)}</span>
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-bold text-white">{h.ticker_symbol}</div>
                              <div className="text-xs text-gray-600">{h.sector || "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-400">{qty.toFixed(2)}</td>
                        <td className="px-5 py-3 text-sm text-gray-400">{fmtMoney(avgCost, hCurrency, { decimals: 2 })}</td>
                        <td className="px-5 py-3 text-sm text-white">{fmtMoney(currPx, hCurrency, { decimals: 2 })}</td>
                        <td className={`px-5 py-3 text-sm ${hUp ? "text-emerald-400" : "text-red-400"}`}>
                          {hUp ? "+" : "-"}{fmtMoney(Math.abs(pnl), hCurrency, { compact: true })}
                        </td>
                        <td className={`px-5 py-3 text-sm ${hUp ? "text-emerald-400" : "text-red-400"}`}>
                          {hUp ? "+" : ""}{pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-600 text-sm">
              No holdings yet.{" "}
              <button onClick={() => navigate("/user/trade")} className="text-cyan-400 hover:underline">
                Start trading
              </button>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
            <div className="text-xs text-gray-500 mb-3">Daily P&L (14 days)</div>
            <div className="h-28">
              {dailyPnl.length > 0 && dailyPnl.some(d => d.v !== 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyPnl}>
                    <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                      {dailyPnl.map((d, i) => <Cell key={i} fill={d.v >= 0 ? "#10B981" : "#EF4444"} />)}
                    </Bar>
                    <Tooltip
                      contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v) => [fmtMoney(v, portfolioCurrency, { decimals: 0 }), "P&L"]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-gray-600">No data yet</div>
              )}
            </div>
          </div>

          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-500 mb-3">
              {myStocksToday.length > 0 ? "My Stocks Today" : "Market Movers"}
            </div>
            <div className="space-y-2.5">
              {(myStocksToday.length > 0 ? myStocksToday : marketIndices).slice(0, 4).map((m, i) => {
                const ticker    = m.ticker_symbol || m.symbol || m.name || "—";
                const price     = parseFloat(m.current_price || m.price || 0);
                const changePct = parseFloat(m.price_change_percent || m.change_percent || m.change || 0);
                const isUp      = changePct >= 0;
                const mCurrency = m.currency || "INR";
                return (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{ticker}</span>
                    <div className="text-right">
                      <div className="text-xs text-white">{fmtMoney(price, mCurrency, { decimals: 2 })}</div>
                      <div className={`text-xs ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                        {isUp ? "+" : ""}{changePct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
              {myStocksToday.length === 0 && marketIndices.length === 0 && (
                <div className="text-xs text-gray-600 text-center py-2">No data</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
























// import { useState, useEffect, useCallback } from "react";
// import { useNavigate } from "react-router";
// import { motion } from "motion/react";
// import {
//   TrendingUp, TrendingDown, ArrowUpRight, Plus,
//   ChevronRight, DollarSign, Wallet, PieChart as PieIcon,
//   RefreshCw, AlertCircle,
// } from "lucide-react";
// import {
//   AreaChart, Area, ResponsiveContainer, Tooltip,
//   XAxis, YAxis, PieChart, Pie, Cell, BarChart, Bar,
// } from "recharts";
// import { useAuth } from "../../context/AuthContext";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken = () => localStorage.getItem("access_token");
// const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

// const secColors = ["#06B6D4", "#8B5CF6", "#F59E0B", "#10B981"];

// export function UserDashboard() {
//   const navigate = useNavigate();
//   const { user }  = useAuth();
//   const [tf, setTf] = useState("3M");
//   const tfs = ["1W", "1M", "3M", "6M", "ALL"];

//   const [summary,       setSummary]       = useState(null);
//   const [portfolio,     setPortfolio]     = useState(null);
//   const [holdings,      setHoldings]      = useState([]);
//   const [perfHistory,   setPerfHistory]   = useState([]);
//   const [myStocksToday, setMyStocksToday] = useState([]);
//   const [marketIndices, setMarketIndices] = useState([]);
//   const [dailyPnl,      setDailyPnl]      = useState([]);
//   const [wallet,        setWallet]        = useState(null);
//   const [loading,       setLoading]       = useState(true);
//   const [error,         setError]         = useState("");

//   const fetchAll = useCallback(async () => {
//     setLoading(true);
//     setError("");
//     try {
//       const [summaryRes, moversRes, portfolioRes, walletRes, monthlyRes, stocksTodayRes] =
//         await Promise.allSettled([
//           fetch(`${API_BASE}/dashboard/user/summary`,          { headers: authHdr() }),
//           fetch(`${API_BASE}/dashboard/market_movers?limit=4`, { headers: authHdr() }),
//           fetch(`${API_BASE}/portfolios/my`,                   { headers: authHdr() }),
//           fetch(`${API_BASE}/wallets/me`,                      { headers: authHdr() }),
//           fetch(`${API_BASE}/dashboard/user/monthly_returns`,  { headers: authHdr() }),
//           fetch(`${API_BASE}/dashboard/user/my_stocks_today`,  { headers: authHdr() }),
//         ]);

//       // ── Summary ──────────────────────────────────────────────────────────
//       if (summaryRes.status === "fulfilled") {
//         const d = await summaryRes.value.json();
//         if (d.bool) setSummary(d.response);
//       }

//       // ── Market Movers ────────────────────────────────────────────────────
//       // Response shape: { market_movers: { TOP_GAINER:[...], TOP_LOSER:[...], ... } }
//       if (moversRes.status === "fulfilled") {
//         const d = await moversRes.value.json();
//         if (d.bool) {
//           const obj = d.response?.market_movers || {};
//           const flat = [
//             ...(obj.TOP_GAINER  || []),
//             ...(obj.TRENDING    || []),
//             ...(obj.MOST_ACTIVE || []),
//             ...(obj.TOP_LOSER   || []),
//           ];
//           const seen = new Set();
//           const unique = flat.filter(m => {
//             const key = m.ticker_symbol || m.stock_id;
//             if (seen.has(key)) return false;
//             seen.add(key);
//             return true;
//           });
//           setMarketIndices(unique.slice(0, 4));
//         }
//       }

//       // ── Wallet ───────────────────────────────────────────────────────────
//       if (walletRes.status === "fulfilled") {
//         const d = await walletRes.value.json();
//         if (d.bool) setWallet(d.response);
//       }

//       // ── Monthly Returns → Daily P&L bars ────────────────────────────────
//       // Response shape: { monthly_returns: [{ month, daily_return, daily_return_percent,
//       //                                       cumulative_return, cumulative_return_pct, total_value }] }
//       if (monthlyRes.status === "fulfilled") {
//         const d = await monthlyRes.value.json();
//         if (d.bool) {
//           const raw = d.response?.monthly_returns || [];
//           setDailyPnl(raw.slice(-14).map((r) => ({
//             v: parseFloat(r.daily_return || r.cumulative_return || 0),
//           })));
//         }
//       }

//       // ── My Stocks Today ──────────────────────────────────────────────────
//       // Response shape: { my_stocks: [...], total: N }
//       if (stocksTodayRes.status === "fulfilled") {
//         const d = await stocksTodayRes.value.json();
//         if (d.bool) setMyStocksToday(d.response?.my_stocks || []);
//       }

//       // ── Portfolio + Holdings ─────────────────────────────────────────────
//       if (portfolioRes.status === "fulfilled") {
//         const pData = await portfolioRes.value.json();
//         if (pData.bool) {
//           const ports = pData.response?.portfolios || [];
//           if (ports.length > 0) {
//             const p = ports.find(x => x.is_default) || ports[0];
//             setPortfolio(p);

//             // Fetch full portfolio detail (has accurate holdings with current prices)
//             // + performance history
//             const [holdRes, perfRes] = await Promise.allSettled([
//               fetch(`${API_BASE}/portfolios/${p.portfolio_id}`, { headers: authHdr() }),
//               fetch(`${API_BASE}/portfolios/${p.portfolio_id}/performance?interval=DAILY&limit=90`, { headers: authHdr() }),
//             ]);

//             let loadedHoldings = [];
//             if (holdRes.status === "fulfilled") {
//               const hd = await holdRes.value.json();
//               if (hd.bool) {
//                 loadedHoldings = hd.response?.holdings || [];
//                 setHoldings(loadedHoldings);
//               }
//             }

//             if (perfRes.status === "fulfilled") {
//               const pd = await perfRes.value.json();
//               if (pd.bool && pd.response?.data?.length > 0) {
//                 // Real performance history exists
//                 setPerfHistory(pd.response.data.map((pt) => ({
//                   date:  (pt.date || "").slice(5),
//                   close: parseFloat(pt.total_value || 0),
//                 })));
//               } else if (loadedHoldings.length > 0) {
//                 // No history yet — build a synthetic 2-point chart from invested value
//                 // so the chart shows something meaningful instead of being blank
//                 const invested = loadedHoldings.reduce(
//                   (acc, h) => acc + parseFloat(h.total_invested || 0), 0
//                 );
//                 const current = loadedHoldings.reduce(
//                   (acc, h) => acc + parseFloat(h.current_value || h.total_invested || 0), 0
//                 );
//                 const today = new Date();
//                 const fmt = (d) => `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
//                 const past = new Date(today); past.setDate(past.getDate() - 1);
//                 setPerfHistory([
//                   { date: fmt(past),  close: invested },
//                   { date: fmt(today), close: current  },
//                 ]);
//               }
//             }
//           }
//         }
//       }
//     } catch (e) {
//       setError("Network error loading dashboard.");
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => { fetchAll(); }, [fetchAll]);

//   // ── Derived values ────────────────────────────────────────────────────────
//   const totalValue  = parseFloat(portfolio?.current_value           || summary?.portfolio?.current_value           || 0);
//   const totalReturn = parseFloat(portfolio?.total_return            || summary?.portfolio?.total_return            || 0);
//   const totalRetPct = parseFloat(portfolio?.total_return_percent    || summary?.portfolio?.total_return_percent    || 0);
//   const cashBalance = parseFloat(wallet?.available_balance          || summary?.wallet?.available_balance          || 0);
//   const todayPnl    = parseFloat(portfolio?.day_change              || summary?.portfolio?.day_change              || 0);
//   const todayPnlPct = parseFloat(portfolio?.day_change_percent      || summary?.portfolio?.day_change_percent      || 0);
//   const openPositions = holdings.length;
//   const profitCount   = holdings.filter((h) => parseFloat(h.unrealized_pnl || 0) >= 0).length;
//   const up            = totalReturn >= 0;

//   // Sector allocation — use current_value when > 0, else fall back to total_invested
//   // This ensures the pie chart works even when current prices haven't been set yet
//   const sectorMap = {};
//   holdings.forEach((h) => {
//     const s   = h.sector || "Other";
//     const val = parseFloat(h.current_value || 0) > 0
//       ? parseFloat(h.current_value)
//       : parseFloat(h.total_invested || 0);
//     sectorMap[s] = (sectorMap[s] || 0) + val;
//   });
//   const sectorTotal = Object.values(sectorMap).reduce((a, b) => a + b, 0);
//   const secData = Object.entries(sectorMap).map(([n, v], i) => ({
//     name:  n,
//     value: sectorTotal > 0 ? parseFloat(((v / sectorTotal) * 100).toFixed(1)) : 0,
//     color: secColors[i % secColors.length],
//   })).filter(s => s.value > 0);

//   // Time-frame slice
//   const sliceMap = { "1W": 7, "1M": 30, "3M": 90, "6M": 90, ALL: 90 };
//   const chartData = perfHistory.slice(-(sliceMap[tf] || 90));

//   // Greeting
//   const getIST = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
//   const greeting = () => {
//     const h = getIST().getHours();
//     return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
//   };
//   const formattedDate = new Intl.DateTimeFormat("en-IN", {
//     weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata",
//   }).format(new Date());

//   const displayName = user?.full_name || user?.name || user?.username || "Investor";

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center h-96 flex-col gap-3">
//         <div className="w-9 h-9 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
//         <p className="text-sm text-gray-500">Loading your dashboard…</p>
//       </div>
//     );
//   }

//   return (
//     <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
//       {/* Header */}
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-xl font-bold text-white">
//             {greeting()}, {displayName.split(" ")[0]} 👋
//           </h1>
//           <p className="text-sm text-gray-500 mt-0.5">{formattedDate} · Your portfolio overview</p>
//         </div>
//         <div className="flex items-center gap-2">
//           <button
//             onClick={fetchAll}
//             className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
//           >
//             <RefreshCw className="w-4 h-4" />
//           </button>
//           <button
//             onClick={() => navigate("/user/trade")}
//             className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/15"
//           >
//             <Plus className="w-4 h-4" /> New Trade
//           </button>
//         </div>
//       </div>

//       {error && (
//         <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
//           <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
//         </div>
//       )}

//       {/* Stats Cards */}
//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//         {[
//           {
//             label: "Portfolio Value",
//             value: `$${Number(totalValue).toLocaleString("en", { maximumFractionDigits: 0 })}`,
//             sub:   `${up ? "+" : "-"}$${Math.abs(totalReturn).toFixed(0)} all time`,
//             icon:  Wallet, up,
//             color: "from-cyan-500/15 to-cyan-500/5", border: "border-cyan-500/15", ic: "text-cyan-400",
//           },
//           {
//             label: "Today's P&L",
//             value: `${todayPnl >= 0 ? "+" : ""}$${Math.abs(todayPnl).toFixed(0)}`,
//             sub:   `${todayPnlPct >= 0 ? "+" : ""}${todayPnlPct.toFixed(2)}% today`,
//             icon:  TrendingUp, up: todayPnl >= 0,
//             color: "from-emerald-500/15 to-emerald-500/5", border: "border-emerald-500/15", ic: "text-emerald-400",
//           },
//           {
//             label: "Cash Balance",
//             value: `$${Number(cashBalance).toLocaleString("en", { maximumFractionDigits: 0 })}`,
//             sub:   "Available to invest",
//             icon:  DollarSign, up: null,
//             color: "from-blue-500/15 to-blue-500/5", border: "border-blue-500/15", ic: "text-blue-400",
//           },
//           {
//             label: "Open Positions",
//             value: openPositions.toString(),
//             sub:   `${profitCount} in profit`,
//             icon:  PieIcon, up: null,
//             color: "from-violet-500/15 to-violet-500/5", border: "border-violet-500/15", ic: "text-violet-400",
//           },
//         ].map((s, i) => (
//           <motion.div
//             key={i}
//             initial={{ opacity: 0, y: 16 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ delay: i * 0.08 }}
//             className={`bg-gradient-to-br ${s.color} border ${s.border} rounded-2xl p-4`}
//           >
//             <div className="flex items-center justify-between mb-3">
//               <span className="text-xs text-gray-500">{s.label}</span>
//               <s.icon className={`w-4 h-4 ${s.ic}`} />
//             </div>
//             <div className="text-xl font-bold text-white mb-1">{s.value}</div>
//             <div className={`text-xs flex items-center gap-1 ${
//               s.up === true ? "text-emerald-400" : s.up === false ? "text-red-400" : "text-gray-500"
//             }`}>
//               {s.up !== null && <ArrowUpRight className="w-3 h-3" />}
//               {s.sub}
//             </div>
//           </motion.div>
//         ))}
//       </div>

//       <div className="grid lg:grid-cols-3 gap-5">
//         {/* Portfolio Performance Chart */}
//         <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="flex items-center justify-between mb-5">
//             <div>
//               <div className="text-xs text-gray-500 mb-0.5">My Portfolio Performance</div>
//               <div className="text-2xl font-bold text-white">
//                 ${Number(totalValue).toLocaleString("en", { maximumFractionDigits: 0 })}
//               </div>
//               <div className={`flex items-center gap-1 mt-0.5 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
//                 {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
//                 {up ? "+" : ""}{Number(totalRetPct).toFixed(1)}% all time
//               </div>
//             </div>
//             <div className="flex gap-1">
//               {tfs.map((t) => (
//                 <button
//                   key={t}
//                   onClick={() => setTf(t)}
//                   className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
//                     tf === t
//                       ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/25"
//                       : "text-gray-600 hover:text-gray-400"
//                   }`}
//                 >
//                   {t}
//                 </button>
//               ))}
//             </div>
//           </div>
//           <div className="h-52">
//             {chartData.length > 0 ? (
//               <ResponsiveContainer width="100%" height="100%">
//                 <AreaChart data={chartData}>
//                   <defs>
//                     <linearGradient id="udashGrad" x1="0" y1="0" x2="0" y2="1">
//                       <stop offset="5%"  stopColor="#06B6D4" stopOpacity={0.22} />
//                       <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
//                     </linearGradient>
//                   </defs>
//                   <XAxis
//                     dataKey="date"
//                     tick={{ fill: "#4B5563", fontSize: 10 }}
//                     tickLine={false} axisLine={false}
//                     interval="preserveStartEnd"
//                   />
//                   <YAxis
//                     tick={{ fill: "#4B5563", fontSize: 10 }}
//                     tickLine={false} axisLine={false}
//                     tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
//                   />
//                   <Tooltip
//                     contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                     formatter={(v) => [`$${Number(v).toLocaleString()}`, "Value"]}
//                   />
//                   <Area type="monotone" dataKey="close" stroke="#06B6D4" strokeWidth={2} fill="url(#udashGrad)" dot={false} />
//                 </AreaChart>
//               </ResponsiveContainer>
//             ) : (
//               <div className="flex flex-col items-center justify-center h-full gap-2">
//                 <p className="text-sm text-gray-600">No performance history yet</p>
//                 <p className="text-xs text-gray-700">Make your first trade to start tracking</p>
//               </div>
//             )}
//           </div>
//         </div>

//         {/* My Allocation */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-sm font-medium text-white mb-4">My Allocation</div>
//           {secData.length > 0 ? (
//             <>
//               <div className="h-36 mb-4">
//                 <ResponsiveContainer width="100%" height="100%">
//                   <PieChart>
//                     <Pie data={secData} cx="50%" cy="50%" innerRadius={38} outerRadius={64} dataKey="value" paddingAngle={3}>
//                       {secData.map((e, i) => <Cell key={i} fill={e.color} />)}
//                     </Pie>
//                     <Tooltip
//                       contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                       formatter={(v) => [`${v}%`, ""]}
//                     />
//                   </PieChart>
//                 </ResponsiveContainer>
//               </div>
//               {secData.map((s, i) => (
//                 <div key={i} className="flex items-center justify-between mb-2">
//                   <div className="flex items-center gap-2">
//                     <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
//                     <span className="text-xs text-gray-400">{s.name}</span>
//                   </div>
//                   <span className="text-xs text-white">{s.value}%</span>
//                 </div>
//               ))}
//             </>
//           ) : (
//             <div className="text-xs text-gray-600 text-center py-8">No holdings yet</div>
//           )}
//         </div>
//       </div>

//       <div className="grid lg:grid-cols-3 gap-5">
//         {/* My Holdings */}
//         <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//             <div className="text-sm font-medium text-white">My Holdings</div>
//             <button
//               onClick={() => navigate("/user/portfolio")}
//               className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
//             >
//               View Portfolio <ChevronRight className="w-3 h-3" />
//             </button>
//           </div>
//           {holdings.length > 0 ? (
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["Symbol", "Shares", "Avg Cost", "Current", "P&L", "Return"].map((h) => (
//                       <th key={h} className="px-5 py-2.5 text-left text-xs text-gray-600 font-medium">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {holdings.slice(0, 6).map((h) => {
//                     const qty     = parseFloat(h.quantity             || 0);
//                     const avgCost = parseFloat(h.average_buy_price    || 0);
//                     // current_price may be 0/null if not set — fall back to avg cost so row renders
//                     const currPx  = parseFloat(h.current_price        || 0) > 0
//                       ? parseFloat(h.current_price)
//                       : avgCost;
//                     const mktVal  = parseFloat(h.current_value        || 0) > 0
//                       ? parseFloat(h.current_value)
//                       : qty * currPx;
//                     const invested= parseFloat(h.total_invested       || qty * avgCost);
//                     const pnl     = parseFloat(h.unrealized_pnl       || 0) !== 0
//                       ? parseFloat(h.unrealized_pnl)
//                       : mktVal - invested;
//                     const pct     = parseFloat(h.unrealized_pnl_percent || 0) !== 0
//                       ? parseFloat(h.unrealized_pnl_percent)
//                       : (avgCost > 0 ? ((currPx - avgCost) / avgCost) * 100 : 0);
//                     const hUp     = pnl >= 0;
//                     return (
//                       <tr
//                         key={h.holding_id || h.stock_id}
//                         onClick={() => navigate(`/user/stock/${h.ticker_symbol}`)}
//                         className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
//                       >
//                         <td className="px-5 py-3">
//                           <div className="flex items-center gap-2">
//                             {h.logo_url ? (
//                               <img src={h.logo_url} alt={h.ticker_symbol} className="w-6 h-6 rounded-lg object-contain bg-white/5" />
//                             ) : (
//                               <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
//                                 <span className="text-xs font-bold text-cyan-400">{(h.ticker_symbol || "?").slice(0, 2)}</span>
//                               </div>
//                             )}
//                             <div>
//                               <div className="text-sm font-bold text-white">{h.ticker_symbol}</div>
//                               <div className="text-xs text-gray-600">{h.sector || "—"}</div>
//                             </div>
//                           </div>
//                         </td>
//                         <td className="px-5 py-3 text-sm text-gray-400">{qty.toFixed(2)}</td>
//                         <td className="px-5 py-3 text-sm text-gray-400">${avgCost.toFixed(2)}</td>
//                         <td className="px-5 py-3 text-sm text-white">${currPx.toFixed(2)}</td>
//                         <td className={`px-5 py-3 text-sm ${hUp ? "text-emerald-400" : "text-red-400"}`}>
//                           {hUp ? "+" : "-"}${Math.abs(pnl).toFixed(0)}
//                         </td>
//                         <td className={`px-5 py-3 text-sm ${hUp ? "text-emerald-400" : "text-red-400"}`}>
//                           {hUp ? "+" : ""}{pct.toFixed(1)}%
//                         </td>
//                       </tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           ) : (
//             <div className="py-12 text-center text-gray-600 text-sm">
//               No holdings yet.{" "}
//               <button onClick={() => navigate("/user/trade")} className="text-cyan-400 hover:underline">
//                 Start trading
//               </button>
//             </div>
//           )}
//         </div>

//         {/* Daily P&L + Market Movers / My Stocks */}
//         <div className="space-y-5">
//           <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//             <div className="text-xs text-gray-500 mb-3">Daily P&L (14 days)</div>
//             <div className="h-28">
//               {dailyPnl.length > 0 && dailyPnl.some(d => d.v !== 0) ? (
//                 <ResponsiveContainer width="100%" height="100%">
//                   <BarChart data={dailyPnl}>
//                     <Bar dataKey="v" radius={[3, 3, 0, 0]}>
//                       {dailyPnl.map((d, i) => <Cell key={i} fill={d.v >= 0 ? "#10B981" : "#EF4444"} />)}
//                     </Bar>
//                     <Tooltip
//                       contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                       formatter={(v) => [`$${Number(v).toFixed(0)}`, "P&L"]}
//                     />
//                   </BarChart>
//                 </ResponsiveContainer>
//               ) : (
//                 <div className="flex items-center justify-center h-full text-xs text-gray-600">No data yet</div>
//               )}
//             </div>
//           </div>

//           <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
//             <div className="text-xs text-gray-500 mb-3">
//               {myStocksToday.length > 0 ? "My Stocks Today" : "Market Movers"}
//             </div>
//             <div className="space-y-2.5">
//               {(myStocksToday.length > 0 ? myStocksToday : marketIndices).slice(0, 4).map((m, i) => {
//                 const ticker    = m.ticker_symbol || m.symbol || m.name || "—";
//                 const price     = parseFloat(m.current_price || m.price || 0);
//                 const changePct = parseFloat(m.price_change_percent || m.change_percent || m.change || 0);
//                 const isUp      = changePct >= 0;
//                 return (
//                   <div key={i} className="flex items-center justify-between">
//                     <span className="text-xs text-gray-400">{ticker}</span>
//                     <div className="text-right">
//                       <div className="text-xs text-white">${price.toFixed(2)}</div>
//                       <div className={`text-xs ${isUp ? "text-emerald-400" : "text-red-400"}`}>
//                         {isUp ? "+" : ""}{changePct.toFixed(2)}%
//                       </div>
//                     </div>
//                   </div>
//                 );
//               })}
//               {myStocksToday.length === 0 && marketIndices.length === 0 && (
//                 <div className="text-xs text-gray-600 text-center py-2">No data</div>
//               )}
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

















