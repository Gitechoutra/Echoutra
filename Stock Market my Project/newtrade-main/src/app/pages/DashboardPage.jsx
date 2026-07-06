import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  PieChart,
  Activity,
  Wallet,
  Plus,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart as RPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

export function DashboardPage() {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState("3M");
  const timeframes = ["1W", "1M", "3M", "6M", "1Y", "ALL"];

  const [summary, setSummary] = useState(null);
  const [myStocksToday, setMyStocksToday] = useState([]);
  const [watchlistWidget, setWatchlistWidget] = useState([]);
  const [monthlyReturns, setMonthlyReturns] = useState([]);
  const [marketOverview, setMarketOverview] = useState([]);
  const [marketMovers, setMarketMovers] = useState([]);
  const [portfolioPerf, setPortfolioPerf] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    const headers = { Authorization: `Bearer ${getToken()}` };
    try {
      const [summaryRes, stocksTodayRes, watchlistRes, returnsRes, marketRes, moversRes] =
        await Promise.all([
          fetch(`${API_BASE}/dashboard/user/summary`, { headers }),
          fetch(`${API_BASE}/dashboard/user/my_stocks_today`, { headers }),
          fetch(`${API_BASE}/dashboard/user/watchlist_widget`, { headers }),
          fetch(`${API_BASE}/dashboard/user/monthly_returns`, { headers }),
          fetch(`${API_BASE}/dashboard/user/market_overview`, { headers }),
          fetch(`${API_BASE}/dashboard/market_movers`, { headers }),
        ]);

      const [summaryData, stocksTodayData, watchlistData, returnsData, marketData, moversData] =
        await Promise.all([
          summaryRes.json(),
          stocksTodayRes.json(),
          watchlistRes.json(),
          returnsRes.json(),
          marketRes.json(),
          moversRes.json(),
        ]);

      if (summaryData.bool) setSummary(summaryData.response);
      if (stocksTodayData.bool) setMyStocksToday(stocksTodayData.response || []);
      if (watchlistData.bool) setWatchlistWidget(watchlistData.response || []);
      if (returnsData.bool) {
        const returns = returnsData.response || [];
        setMonthlyReturns(returns.map((r) => ({ month: r.month || r.label, value: r.return_pct || r.value || 0 })));
      }
      if (marketData.bool) setMarketOverview(marketData.response || []);
      if (moversData.bool) setMarketMovers(moversData.response || []);

      // Fetch portfolio performance chart if portfolio exists
      if (summaryData.bool && summaryData.response?.portfolio_id) {
        const perfRes = await fetch(
          `${API_BASE}/portfolios/${summaryData.response.portfolio_id}/performance`,
          { headers }
        );
        const perfData = await perfRes.json();
        if (perfData.bool) {
          const rawPerf = perfData.response?.chart || perfData.response?.history || [];
          setPortfolioPerf(rawPerf.map((p) => ({ date: p.date, close: p.value || p.close })));
        }
      }
    } catch {
      setError("Network error. Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const sliceMap = { "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, ALL: 9999 };
  const chartSlice = sliceMap[timeframe] || 30;
  const chartData = portfolioPerf.slice(-chartSlice);

  const portfolioValue = summary?.portfolio_value || 0;
  const portfolioReturn = summary?.total_return || 0;
  const portfolioReturnPct = summary?.total_return_pct || 0;
  const todayPnl = summary?.today_pnl || 0;
  const todayPnlPct = summary?.today_pnl_pct || 0;
  const cashBalance = summary?.cash_balance || summary?.wallet_balance || 0;
  const openPositions = summary?.open_positions || myStocksToday.length || 0;

  const sectorData = summary?.sector_allocation
    ? Object.entries(summary.sector_allocation).map(([name, value], i) => ({
        name,
        value: parseFloat(value.toFixed(1)),
        color: ["#06B6D4", "#8B5CF6", "#F59E0B", "#10B981"][i % 4],
      }))
    : [
        { name: "Technology", value: 65, color: "#06B6D4" },
        { name: "Financials", value: 18, color: "#8B5CF6" },
        { name: "Consumer", value: 10, color: "#F59E0B" },
        { name: "Other", value: 7, color: "#10B981" },
      ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            Good morning{summary?.user_name ? `, ${summary.user_name.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · Markets Open
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            className="p-2 rounded-lg bg-[#1A2235] border border-[#1E2D4A] text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate("/app/trade")}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            New Trade
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Portfolio Value",
            value: `$${portfolioValue.toLocaleString("en", { maximumFractionDigits: 0 })}`,
            sub: `${portfolioReturn >= 0 ? "+" : ""}$${portfolioReturn.toFixed(0)} (${portfolioReturnPct >= 0 ? "+" : ""}${portfolioReturnPct.toFixed(1)}%)`,
            icon: Wallet,
            up: portfolioReturn >= 0 ? true : false,
            color: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/20",
            iconColor: "text-cyan-400",
          },
          {
            label: "Today's P&L",
            value: `${todayPnl >= 0 ? "+" : ""}$${Math.abs(todayPnl).toFixed(0)}`,
            sub: `${todayPnlPct >= 0 ? "+" : ""}${todayPnlPct.toFixed(2)}% today`,
            icon: TrendingUp,
            up: todayPnl >= 0,
            color: `from-${todayPnl >= 0 ? "emerald" : "red"}-500/20 to-${todayPnl >= 0 ? "emerald" : "red"}-500/5 border-${todayPnl >= 0 ? "emerald" : "red"}-500/20`,
            iconColor: todayPnl >= 0 ? "text-emerald-400" : "text-red-400",
          },
          {
            label: "Cash Balance",
            value: `$${cashBalance.toLocaleString("en", { maximumFractionDigits: 0 })}`,
            sub: "Available to invest",
            icon: DollarSign,
            up: null,
            color: "from-blue-500/20 to-blue-500/5 border-blue-500/20",
            iconColor: "text-blue-400",
          },
          {
            label: "Open Positions",
            value: openPositions.toString(),
            sub: `${myStocksToday.filter((s) => (s.change_pct || 0) >= 0).length} up · ${myStocksToday.filter((s) => (s.change_pct || 0) < 0).length} down`,
            icon: PieChart,
            up: null,
            color: "from-purple-500/20 to-purple-500/5 border-purple-500/20",
            iconColor: "text-purple-400",
          },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`bg-gradient-to-br ${stat.color} border rounded-xl p-4`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500">{stat.label}</span>
              <stat.icon className={`w-4 h-4 ${stat.iconColor}`} />
            </div>
            <div className="text-xl font-bold text-white mb-1">{stat.value}</div>
            <div
              className={`text-xs flex items-center gap-1 ${
                stat.up === true ? "text-emerald-400" : stat.up === false ? "text-red-400" : "text-gray-500"
              }`}
            >
              {stat.up === true && <ArrowUpRight className="w-3 h-3" />}
              {stat.up === false && <ArrowDownRight className="w-3 h-3" />}
              {stat.sub}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-sm text-gray-500 mb-0.5">Portfolio Performance</div>
              <div className="text-2xl font-bold text-white">
                ${portfolioValue.toLocaleString("en", { maximumFractionDigits: 0 })}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span className="text-xs text-emerald-400">
                  {portfolioReturnPct >= 0 ? "+" : ""}{portfolioReturnPct.toFixed(1)}% all time
                </span>
              </div>
            </div>
            <div className="flex gap-1">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                    timeframe === tf
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      : "text-gray-600 hover:text-gray-400"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "#0F1629", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [`$${v?.toLocaleString()}`, "Value"]}
                />
                <Area type="monotone" dataKey="close" stroke="#06B6D4" strokeWidth={2} fill="url(#portfolioGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
          <div className="text-sm text-gray-500 mb-3">Sector Allocation</div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <RPieChart>
                <Pie data={sectorData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                  {sectorData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#0F1629", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [`${v}%`, ""]}
                />
              </RPieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {sectorData.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-xs text-gray-400">{s.name}</span>
                </div>
                <span className="text-xs font-medium text-white">{s.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D4A]">
            <div className="text-sm font-medium text-white">Holdings</div>
            <button
              onClick={() => navigate("/app/portfolio")}
              className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1E2D4A]">
                  {["Symbol", "Shares", "Avg Cost", "Current", "P&L", "Return"].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs text-gray-600 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myStocksToday.length > 0 ? (
                  myStocksToday.map((h) => {
                    const pnl = ((h.current_price || 0) - (h.avg_cost || 0)) * (h.shares || 0);
                    const pnlPct = h.avg_cost ? (((h.current_price || 0) - h.avg_cost) / h.avg_cost) * 100 : 0;
                    const up = pnl >= 0;
                    return (
                      <tr
                        key={h.symbol || h.stock_symbol}
                        onClick={() => navigate(`/app/stock/${h.symbol || h.stock_symbol}`)}
                        className="border-b border-[#1E2D4A]/50 hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="text-sm font-medium text-white">{h.symbol || h.stock_symbol}</div>
                          <div className="text-xs text-gray-600 truncate max-w-[100px]">{(h.name || h.stock_name || "").split(" ")[0]}</div>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-400">{h.shares || h.quantity || 0}</td>
                        <td className="px-5 py-3 text-sm text-gray-400">${(h.avg_cost || 0).toFixed(2)}</td>
                        <td className="px-5 py-3 text-sm text-white">${(h.current_price || 0).toFixed(2)}</td>
                        <td className={`px-5 py-3 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
                          {up ? "+" : ""}${pnl.toFixed(0)}
                        </td>
                        <td className={`px-5 py-3 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
                          {up ? "+" : ""}{pnlPct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-600">No holdings found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
            <div className="text-sm text-gray-500 mb-3">Monthly Returns</div>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyReturns}>
                  <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                    {monthlyReturns.map((entry, i) => (
                      <Cell key={i} fill={(entry.value || 0) >= 0 ? "#10B981" : "#EF4444"} />
                    ))}
                  </Bar>
                  <Tooltip
                    contentStyle={{ background: "#0F1629", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11 }}
                    formatter={(v) => [`${v?.toFixed(1)}%`, "Return"]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2D4A]">
              <div className="text-sm font-medium text-white">Top Movers</div>
              <Activity className="w-4 h-4 text-gray-600" />
            </div>
            <div className="divide-y divide-[#1E2D4A]/50">
              {marketMovers.slice(0, 5).map((s, i) => {
                const pct = s.change_pct || s.changePct || 0;
                const up = pct >= 0;
                return (
                  <div
                    key={i}
                    onClick={() => navigate(`/app/stock/${s.symbol || s.ticker}`)}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">{s.symbol || s.ticker}</div>
                      <div className="text-xs text-gray-600">${(s.price || s.current_price || 0).toFixed(2)}</div>
                    </div>
                    <div className={`flex items-center gap-1 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
                      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {up ? "+" : ""}{pct.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
              {marketMovers.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-gray-600">No mover data</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {marketOverview.length > 0 && (
        <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
          <div className="text-sm text-gray-500 mb-4">Market Indices</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {marketOverview.map((idx, i) => {
              const change = idx.change || idx.change_pct || 0;
              const up = change >= 0;
              return (
                <div key={i} className="text-center">
                  <div className="text-xs text-gray-600 mb-1">{idx.name || idx.index_name}</div>
                  <div className="text-base font-bold text-white">{idx.value || idx.current_value}</div>
                  <div className={`text-xs mt-0.5 ${up ? "text-emerald-400" : "text-red-400"}`}>
                    {up ? "+" : ""}{change}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}











