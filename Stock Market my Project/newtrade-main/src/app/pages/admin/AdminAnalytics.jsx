import { useState, useEffect } from "react";
import { motion } from "motion/react";
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
  LineChart,
  Line,
  PieChart,
  Pie,
} from "recharts";
import { AlertCircle, RefreshCw } from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

/* ── Currency formatter — platform default is INR (Wallets/Transactions
     models all default to currency='INR'; Razorpay settles in INR) ── */
const fmtINR = (v, decimals = 0) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`;

const fmtCompactINR = (v) => {
  const n = Number(v || 0);
  if (n >= 1e7)  return `₹${(n / 1e7).toFixed(2)}Cr`;   // crore
  if (n >= 1e5)  return `₹${(n / 1e5).toFixed(2)}L`;    // lakh
  if (n >= 1e3)  return `₹${(n / 1e3).toFixed(1)}K`;
  return fmtINR(n);
};

/*
   FIX — same "0% return" root cause seen in AdminUsers.jsx and
   AdminUserDetail.jsx. The leaderboard endpoint returns
   total_return_percent / total_return straight from the Portfolios
   row, which can be NULL/0 if no trade event has recalculated it yet
   even though portfolio_value (current_value) is clearly non-zero.
   We derive it the same way here for display consistency.
*/
function deriveLeaderReturn(u) {
  const portfolioVal  = parseFloat(u.portfolio_value || 0);
  const totalInvested = parseFloat(u.total_invested  || 0);
  const backendPct    = parseFloat(u.total_return_percent || 0);
  const backendAbs    = parseFloat(u.total_return || 0);
  if (backendPct !== 0 || backendAbs !== 0) return { pct: backendPct, abs: backendAbs };
  if (totalInvested > 0) {
    const abs = portfolioVal - totalInvested;
    return { pct: (abs / totalInvested) * 100, abs };
  }
  return { pct: 0, abs: 0 };
}

export function AdminAnalytics() {
  const [aumData, setAumData] = useState([]);
  const [userGrowth, setUserGrowth] = useState([]);
  const [tradeVolume, setTradeVolume] = useState([]);
  const [revenueBreak, setRevenueBreak] = useState([
    { name: "Pro Subs",     value: 48, color: "#06B6D4" },
    { name: "Elite Subs",   value: 31, color: "#8B5CF6" },
    { name: "Trading Fees", value: 14, color: "#F59E0B" },
    { name: "Other",        value:  7, color: "#6B7280" },
  ]);
  const [countryData, setCountryData] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [kpis, setKpis] = useState({
    totalAum:       "₹0",
    monthlyRevenue: "₹0",
    avgPortfolio:   "₹0",
    churnRate:      "2.1%",
    totalUsers:     0,
  });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    const headers = { Authorization: `Bearer ${getToken()}` };

    try {
      const [aumRes, growthRes, volumeRes, revenueRes, countryRes, leaderRes] =
        await Promise.all([
          fetch(`${API_BASE}/admin/analytics/aum_trend`,     { headers }),
          fetch(`${API_BASE}/admin/analytics/user_growth`,   { headers }),
          fetch(`${API_BASE}/admin/analytics/trade_volume`,  { headers }),
          fetch(`${API_BASE}/admin/analytics/revenue`,       { headers }),
          fetch(`${API_BASE}/admin/analytics/country_stats`, { headers }),
          fetch(`${API_BASE}/admin/analytics/leaderboard`,   { headers }),
        ]);

      const [aumJson, growthJson, volumeJson, revenueJson, countryJson, leaderJson] =
        await Promise.all([
          aumRes.json(),
          growthRes.json(),
          volumeRes.json(),
          revenueRes.json(),
          countryRes.json(),
          leaderRes.json(),
        ]);

      // ── AUM Trend ──────────────────────────────────────────────────────────
      if (aumJson.bool) {
        const raw = aumJson.response?.data || [];
        const mapped = raw.map((d) => ({
          date:  d.date,
          close: parseFloat(d.total_aum) || 0,
        }));
        setAumData(mapped);

        const latest = mapped[mapped.length - 1];
        if (latest) {
          setKpis((prev) => ({ ...prev, totalAum: fmtCompactINR(latest.close) }));
        }
      }

      // ── User Growth ────────────────────────────────────────────────────────
      if (growthJson.bool) {
        const raw = growthJson.response?.data || [];
        const mapped = raw.map((d) => ({
          month: d.date,
          users: d.total_users || 0,
          new:   d.new_users   || 0,
        }));
        setUserGrowth(mapped);

        const latest = mapped[mapped.length - 1];
        if (latest) {
          setKpis((prev) => ({ ...prev, totalUsers: latest.users }));
        }
      }

      // ── Trade Volume ───────────────────────────────────────────────────────
      if (volumeJson.bool) {
        const raw = volumeJson.response?.data || [];
        setTradeVolume(
          raw.map((d, i) => ({
            day:    d.date || `D${i + 1}`,
            volume: parseFloat(d.trade_volume) || 0,
          }))
        );
      }

      // ── Revenue ────────────────────────────────────────────────────────────
      if (revenueJson.bool) {
        const raw        = revenueJson.response;
        const byType     = raw?.totals_by_type || {};
        const colorMap   = ["#06B6D4", "#8B5CF6", "#F59E0B", "#6B7280", "#10B981"];
        const typeTotal  = Object.values(byType).reduce((s, v) => s + parseFloat(v || 0), 0);

        if (Object.keys(byType).length > 0) {
          const breakdown = Object.entries(byType).map(([type, amount], i) => ({
            name:  type
              .replace(/_/g, " ")
              .toLowerCase()
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            value: typeTotal > 0 ? Math.round((parseFloat(amount) / typeTotal) * 100) : 0,
            color: colorMap[i % colorMap.length],
          }));
          setRevenueBreak(breakdown);
        }

        const data30 = raw?.data || [];
        const last30Sum = data30
          .slice(-30)
          .reduce((s, r) => s + parseFloat(r.net_revenue || 0), 0);

        if (last30Sum > 0) {
          setKpis((prev) => ({ ...prev, monthlyRevenue: fmtCompactINR(last30Sum) }));
        }
      }

      // ── Country Stats ──────────────────────────────────────────────────────
      if (countryJson.bool) {
        const raw = countryJson.response?.countries || [];
        setCountryData(
          raw
            .map((c) => ({
              country: c.country_name || c.country_code || "Unknown",
              users:   c.total_users  || 0,
            }))
            .sort((a, b) => b.users - a.users)
            .slice(0, 10)
        );
      }

      // ── Leaderboard ────────────────────────────────────────────────────────
      if (leaderJson.bool) {
        const raw = leaderJson.response?.leaderboard || [];
        // FIX: derive return % per user so it doesn't show 0% when the
        // backend hasn't recalculated total_return_percent yet
        const enriched = raw.map((u) => {
          const { pct, abs } = deriveLeaderReturn(u);
          return { ...u, _derivedReturnPct: pct, _derivedReturnAbs: abs };
        });
        setLeaderboard(enriched);
      }

      // ── Avg Portfolio (computed client-side from leaderboard if available) ──
      if (leaderJson.bool) {
        const raw = leaderJson.response?.leaderboard || [];
        if (raw.length > 0) {
          const avgVal = raw.reduce((s, u) => s + parseFloat(u.portfolio_value || 0), 0) / raw.length;
          setKpis((prev) => ({ ...prev, avgPortfolio: fmtCompactINR(avgVal) }));
        }
      }
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setError("Network error. Could not load analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const maxCountryUsers =
    countryData.length > 0 ? Math.max(...countryData.map((c) => c.users)) : 1;

  const kpiCards = [
    { label: "Total AUM",        value: kpis.totalAum,       change: "+3.4%",  up: true  },
    { label: "Monthly Revenue",  value: kpis.monthlyRevenue, change: "+12.4%", up: true  },
    { label: "Avg Portfolio",    value: kpis.avgPortfolio,   change: "+8.2%",  up: true  },
    { label: "Churn Rate",       value: kpis.churnRate,      change: "-0.4%",  up: false },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Platform-wide performance metrics</p>
        </div>
        <button
          onClick={fetchAll}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((k, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-[#0C1220] border border-white/5 rounded-2xl p-4"
          >
            <div className="text-xs text-gray-500 mb-2">{k.label}</div>
            <div className="text-2xl font-bold text-white mb-1">{k.value}</div>
            <div className={`text-xs ${k.up ? "text-emerald-400" : "text-red-400"}`}>
              {k.change} this month
            </div>
          </motion.div>
        ))}
      </div>

      {/* AUM Over Time */}
      <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Assets Under Management (90 days)</div>
            <div className="text-2xl font-bold text-white">{kpis.totalAum}</div>
          </div>
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/15 rounded-xl text-xs text-emerald-400">
            +3.4% this month
          </div>
        </div>
        {aumData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-sm text-gray-600">
            No AUM data available
          </div>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={aumData.slice(-90)}>
                <defs>
                  <linearGradient id="aumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#4B5563", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#4B5563", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => fmtCompactINR(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0C1220",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 12,
                    fontSize: 11,
                  }}
                  formatter={(v) => [fmtCompactINR(v), "AUM"]}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  fill="url(#aumGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* User Growth */}
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="text-xs text-gray-500 mb-1">User Growth</div>
          <div className="text-lg font-bold text-white mb-4">
            {kpis.totalUsers ? kpis.totalUsers.toLocaleString() : "—"} Total Users
          </div>
          {userGrowth.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-sm text-gray-600">
              No user growth data available
            </div>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={userGrowth}>
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#4B5563", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "#4B5563", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v.toLocaleString()}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0C1220",
                      border: "1px solid rgba(255,255,255,.08)",
                      borderRadius: 12,
                      fontSize: 11,
                    }}
                    formatter={(v) => [v.toLocaleString(), "Users"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke="#06B6D4"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Revenue Breakdown */}
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="text-xs text-gray-500 mb-1">Revenue Breakdown</div>
          <div className="text-lg font-bold text-white mb-4">
            {kpis.monthlyRevenue} / month
          </div>
          <div className="flex gap-5 items-center">
            <div className="h-36 w-36 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueBreak}
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={62}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {revenueBreak.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#0C1220",
                      border: "1px solid rgba(255,255,255,.08)",
                      borderRadius: 12,
                      fontSize: 11,
                    }}
                    formatter={(v) => [`${v}%`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2.5">
              {revenueBreak.map((r, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: r.color }}
                    />
                    <span className="text-xs text-gray-400">{r.name}</span>
                  </div>
                  <span className="text-xs text-white font-medium">{r.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trade Volume */}
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="text-xs text-gray-500 mb-1">Daily Trade Volume</div>
          <div className="text-lg font-bold text-white mb-4">30-day snapshot</div>
          {tradeVolume.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-sm text-gray-600">
              No trade volume data available
            </div>
          ) : (
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tradeVolume.slice(-30)} barSize={8}>
                  <Bar dataKey="volume" radius={[3, 3, 0, 0]}>
                    {tradeVolume.slice(-30).map((_, i, arr) => (
                      <Cell
                        key={i}
                        fill={i === arr.length - 1 ? "#8B5CF6" : "#1E2D4A"}
                      />
                    ))}
                  </Bar>
                  <Tooltip
                    contentStyle={{
                      background: "#0C1220",
                      border: "1px solid rgba(255,255,255,.08)",
                      borderRadius: 12,
                      fontSize: 11,
                    }}
                    formatter={(v) => [fmtCompactINR(v), "Volume"]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Users by Country */}
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="text-xs text-gray-500 mb-1">Users by Country</div>
          <div className="text-lg font-bold text-white mb-4">
            {countryData.length} Countries
          </div>
          <div className="space-y-2.5">
            {countryData.length > 0 ? (
              countryData.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-24 truncate">{c.country}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full"
                      style={{ width: `${(c.users / maxCountryUsers) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">
                    {c.users.toLocaleString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-600 text-center py-4">
                No country data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">
          Top Performing Users (by Return %)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {["Rank", "User", "Holdings", "Portfolio", "Return %", "Gain (₹)"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs text-gray-600 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaderboard.length > 0 ? (
                leaderboard.map((u, i) => {
                  // FIX: use the derived return values computed in fetchAll(),
                  // falling back to backend fields if present
                  const returnPct   = u._derivedReturnPct  ?? parseFloat(u.total_return_percent) ?? 0;
                  const returnAmt   = u._derivedReturnAbs  ?? parseFloat(u.total_return)          ?? 0;
                  const portfolioVal = parseFloat(u.portfolio_value)     || 0;
                  const up          = returnPct >= 0;
                  const initials    = (u.username || u.full_name || "U")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <tr
                      key={u.user_id || i}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-5 py-3 text-sm font-bold text-amber-400">
                        #{u.rank ?? i + 1}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt={initials}
                              className="w-7 h-7 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white">
                              {initials}
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-white">
                              {u.username || u.full_name || `User #${u.user_id}`}
                            </div>
                            <div className="text-xs text-gray-600">
                              {u.country || ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-400">
                        {u.holdings_count ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-white">
                        {fmtINR(portfolioVal)}
                      </td>
                      <td
                        className={`px-5 py-3 text-sm font-bold ${
                          portfolioVal === 0
                            ? "text-gray-600"
                            : up ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {portfolioVal === 0 ? "—" : (
                          <>{up ? "+" : ""}{returnPct.toFixed(1)}%</>
                        )}
                      </td>
                      <td
                        className={`px-5 py-3 text-sm ${
                          portfolioVal === 0
                            ? "text-gray-600"
                            : up ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {portfolioVal === 0 ? "—" : (
                          <>{up ? "+" : "-"}{fmtINR(Math.abs(returnAmt))}</>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-gray-600 text-sm"
                  >
                    No leaderboard data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}























// import { useState, useEffect } from "react";
// import { motion } from "motion/react";
// import {
//   AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
//   BarChart, Bar, Cell, LineChart, Line, PieChart, Pie,
// } from "recharts";
// import { AlertCircle, RefreshCw } from "lucide-react";
// import { formatCurrency } from "./currency";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken = () => localStorage.getItem("access_token");

// export function AdminAnalytics() {
//   const [aumData, setAumData] = useState([]);
//   const [userGrowth, setUserGrowth] = useState([]);
//   const [tradeVolume, setTradeVolume] = useState([]);
//   const [revenueBreak, setRevenueBreak] = useState([
//     { name: "Pro Subs",     value: 48, color: "#06B6D4" },
//     { name: "Elite Subs",   value: 31, color: "#8B5CF6" },
//     { name: "Trading Fees", value: 14, color: "#F59E0B" },
//     { name: "Other",        value:  7, color: "#6B7280" },
//   ]);
//   const [countryData, setCountryData] = useState([]);
//   const [leaderboard, setLeaderboard] = useState([]);
//   /* FIX: currency now tracked instead of hardcoded $ everywhere.
//      Defaults to INR — the backend default for all financial models. */
//   const [currency, setCurrency] = useState("INR");
//   const [kpis, setKpis] = useState({
//     totalAum:       0,
//     monthlyRevenue: 0,
//     avgPortfolio:   0,   // FIX: was hardcoded "$47,200" string, now computed
//     churnRate:      "2.1%", // no backend source for this yet — kept as placeholder, clearly labeled below
//     totalUsers:     0,
//   });
//   const [loading, setLoading] = useState(true);
//   const [error,   setError]   = useState("");

//   const fetchAll = async () => {
//     setLoading(true);
//     setError("");
//     const headers = { Authorization: `Bearer ${getToken()}` };

//     try {
//       const [aumRes, growthRes, volumeRes, revenueRes, countryRes, leaderRes] =
//         await Promise.all([
//           fetch(`${API_BASE}/admin/analytics/aum_trend`,     { headers }),
//           fetch(`${API_BASE}/admin/analytics/user_growth`,   { headers }),
//           fetch(`${API_BASE}/admin/analytics/trade_volume`,  { headers }),
//           fetch(`${API_BASE}/admin/analytics/revenue`,       { headers }),
//           fetch(`${API_BASE}/admin/analytics/country_stats`, { headers }),
//           fetch(`${API_BASE}/admin/analytics/leaderboard`,   { headers }),
//         ]);

//       const [aumJson, growthJson, volumeJson, revenueJson, countryJson, leaderJson] =
//         await Promise.all([
//           aumRes.json(), growthRes.json(), volumeRes.json(),
//           revenueRes.json(), countryRes.json(), leaderRes.json(),
//         ]);

//       // ── AUM Trend ──────────────────────────────────────────────────────────
//       if (aumJson.bool) {
//         const raw = aumJson.response?.data || [];
//         const mapped = raw.map((d) => ({ date: d.date, close: parseFloat(d.total_aum) || 0 }));
//         setAumData(mapped);
//         const latest = mapped[mapped.length - 1];
//         if (latest) setKpis((prev) => ({ ...prev, totalAum: latest.close }));
//       }

//       // ── User Growth ────────────────────────────────────────────────────────
//       if (growthJson.bool) {
//         const raw = growthJson.response?.data || [];
//         const mapped = raw.map((d) => ({
//           month: d.date, users: d.total_users || 0, new: d.new_users || 0,
//         }));
//         setUserGrowth(mapped);
//         const latest = mapped[mapped.length - 1];
//         if (latest) setKpis((prev) => ({ ...prev, totalUsers: latest.users }));
//       }

//       // ── Trade Volume ───────────────────────────────────────────────────────
//       if (volumeJson.bool) {
//         const raw = volumeJson.response?.data || [];
//         setTradeVolume(
//           raw.map((d, i) => ({ day: d.date || `D${i + 1}`, volume: parseFloat(d.trade_volume) || 0 }))
//         );
//       }

//       // ── Revenue ────────────────────────────────────────────────────────────
//       if (revenueJson.bool) {
//         const raw       = revenueJson.response;
//         const byType    = raw?.totals_by_type || {};
//         const colorMap  = ["#06B6D4", "#8B5CF6", "#F59E0B", "#6B7280", "#10B981"];
//         const typeTotal = Object.values(byType).reduce((s, v) => s + parseFloat(v || 0), 0);

//         if (Object.keys(byType).length > 0) {
//           const breakdown = Object.entries(byType).map(([type, amount], i) => ({
//             name:  type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
//             value: typeTotal > 0 ? Math.round((parseFloat(amount) / typeTotal) * 100) : 0,
//             color: colorMap[i % colorMap.length],
//           }));
//           setRevenueBreak(breakdown);
//         }

//         // FIX: detect currency from the revenue data itself, if present
//         const data30 = raw?.data || [];
//         if (data30[0]?.currency) setCurrency(data30[0].currency);

//         const last30Sum = data30.slice(-30).reduce((s, r) => s + parseFloat(r.net_revenue || 0), 0);
//         setKpis((prev) => ({ ...prev, monthlyRevenue: last30Sum }));
//       }

//       // ── Country Stats ──────────────────────────────────────────────────────
//       if (countryJson.bool) {
//         const raw = countryJson.response?.countries || [];
//         setCountryData(
//           raw.map((c) => ({ country: c.country_name || c.country_code || "Unknown", users: c.total_users || 0 }))
//              .sort((a, b) => b.users - a.users)
//              .slice(0, 10)
//         );
//       }

//       // ── Leaderboard ────────────────────────────────────────────────────────
//       // FIX: avgPortfolio KPI was a hardcoded string. Now computed from the
//       // leaderboard's portfolio values, which is the only place we get
//       // multiple users' portfolio values in one response.
//       if (leaderJson.bool) {
//         const lb = leaderJson.response?.leaderboard || [];
//         setLeaderboard(lb);
//         if (lb.length > 0) {
//           const avg = lb.reduce((s, u) => s + (parseFloat(u.portfolio_value) || 0), 0) / lb.length;
//           setKpis((prev) => ({ ...prev, avgPortfolio: avg }));
//           // Currency: pick up from leaderboard if revenue didn't supply one
//           if (lb[0]?.currency) setCurrency((c) => c === "INR" ? (lb[0].currency || c) : c);
//         }
//       }
//     } catch (err) {
//       console.error("Analytics fetch error:", err);
//       setError("Network error. Could not load analytics.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => { fetchAll(); }, []);

//   const maxCountryUsers = countryData.length > 0 ? Math.max(...countryData.map((c) => c.users)) : 1;

//   const kpiCards = [
//     { label: "Total AUM",       value: formatCurrency(kpis.totalAum, currency, { compact: true }),       change: "+3.4%",  up: true  },
//     { label: "Monthly Revenue", value: formatCurrency(kpis.monthlyRevenue, currency, { compact: true }),  change: "+12.4%", up: true  },
//     { label: "Avg Portfolio",   value: formatCurrency(kpis.avgPortfolio, currency, { compact: true }),    change: "+8.2%",  up: true  },
//     { label: "Churn Rate",      value: kpis.churnRate,                                                    change: "-0.4%",  up: false },
//   ];

//   if (loading) {
//     return (
//       <div className="flex flex-col items-center justify-center h-96 gap-4">
//         <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//         <p className="text-sm text-gray-500">Loading analytics...</p>
//       </div>
//     );
//   }

//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-xl font-bold text-white">Analytics</h1>
//           <p className="text-sm text-gray-500 mt-0.5">Platform-wide performance metrics</p>
//         </div>
//         <button onClick={fetchAll} className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
//           <RefreshCw className="w-4 h-4" />
//         </button>
//       </div>

//       {error && (
//         <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
//           <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
//         </div>
//       )}

//       {/* KPI Cards */}
//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//         {kpiCards.map((k, i) => (
//           <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
//             className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
//             <div className="text-xs text-gray-500 mb-2">{k.label}</div>
//             <div className="text-2xl font-bold text-white mb-1">{k.value}</div>
//             <div className={`text-xs ${k.up ? "text-emerald-400" : "text-red-400"}`}>
//               {k.change} this month
//               {k.label === "Churn Rate" && (
//                 <span className="block text-gray-700 mt-0.5">(no backend source yet — placeholder)</span>
//               )}
//             </div>
//           </motion.div>
//         ))}
//       </div>

//       {/* AUM Over Time */}
//       <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//         <div className="flex items-center justify-between mb-5">
//           <div>
//             <div className="text-xs text-gray-500 mb-0.5">Assets Under Management (90 days)</div>
//             <div className="text-2xl font-bold text-white">{formatCurrency(kpis.totalAum, currency, { compact: true })}</div>
//           </div>
//           <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/15 rounded-xl text-xs text-emerald-400">
//             +3.4% this month
//           </div>
//         </div>
//         {aumData.length === 0 ? (
//           <div className="h-52 flex items-center justify-center text-sm text-gray-600">No AUM data available</div>
//         ) : (
//           <div className="h-52">
//             <ResponsiveContainer width="100%" height="100%">
//               <AreaChart data={aumData.slice(-90)}>
//                 <defs>
//                   <linearGradient id="aumGrad" x1="0" y1="0" x2="0" y2="1">
//                     <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.25} />
//                     <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}    />
//                   </linearGradient>
//                 </defs>
//                 <XAxis dataKey="date" tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
//                 <YAxis tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false}
//                   tickFormatter={(v) => formatCurrency(v, currency, { compact: true })} />
//                 <Tooltip
//                   contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                   formatter={(v) => [formatCurrency(v, currency, { compact: true }), "AUM"]}
//                 />
//                 <Area type="monotone" dataKey="close" stroke="#8B5CF6" strokeWidth={2} fill="url(#aumGrad)" dot={false} />
//               </AreaChart>
//             </ResponsiveContainer>
//           </div>
//         )}
//       </div>

//       <div className="grid lg:grid-cols-2 gap-5">
//         {/* User Growth */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-1">User Growth</div>
//           <div className="text-lg font-bold text-white mb-4">
//             {kpis.totalUsers ? kpis.totalUsers.toLocaleString() : "—"} Total Users
//           </div>
//           {userGrowth.length === 0 ? (
//             <div className="h-44 flex items-center justify-center text-sm text-gray-600">No user growth data available</div>
//           ) : (
//             <div className="h-44">
//               <ResponsiveContainer width="100%" height="100%">
//                 <LineChart data={userGrowth}>
//                   <XAxis dataKey="month" tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
//                   <YAxis tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString()} />
//                   <Tooltip
//                     contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                     formatter={(v) => [v.toLocaleString(), "Users"]}
//                   />
//                   <Line type="monotone" dataKey="users" stroke="#06B6D4" strokeWidth={2} dot={false} />
//                 </LineChart>
//               </ResponsiveContainer>
//             </div>
//           )}
//         </div>

//         {/* Revenue Breakdown */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-1">Revenue Breakdown</div>
//           <div className="text-lg font-bold text-white mb-4">
//             {formatCurrency(kpis.monthlyRevenue, currency, { compact: true })} / month
//           </div>
//           <div className="flex gap-5 items-center">
//             <div className="h-36 w-36 flex-shrink-0">
//               <ResponsiveContainer width="100%" height="100%">
//                 <PieChart>
//                   <Pie data={revenueBreak} cx="50%" cy="50%" innerRadius={32} outerRadius={62} dataKey="value" paddingAngle={3}>
//                     {revenueBreak.map((e, i) => <Cell key={i} fill={e.color} />)}
//                   </Pie>
//                   <Tooltip
//                     contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                     formatter={(v) => [`${v}%`, ""]}
//                   />
//                 </PieChart>
//               </ResponsiveContainer>
//             </div>
//             <div className="flex-1 space-y-2.5">
//               {revenueBreak.map((r, i) => (
//                 <div key={i} className="flex items-center justify-between">
//                   <div className="flex items-center gap-2">
//                     <div className="w-2 h-2 rounded-full" style={{ background: r.color }} />
//                     <span className="text-xs text-gray-400">{r.name}</span>
//                   </div>
//                   <span className="text-xs text-white font-medium">{r.value}%</span>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* Trade Volume */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-1">Daily Trade Volume</div>
//           <div className="text-lg font-bold text-white mb-4">30-day snapshot</div>
//           {tradeVolume.length === 0 ? (
//             <div className="h-36 flex items-center justify-center text-sm text-gray-600">No trade volume data available</div>
//           ) : (
//             <div className="h-36">
//               <ResponsiveContainer width="100%" height="100%">
//                 <BarChart data={tradeVolume.slice(-30)} barSize={8}>
//                   <Bar dataKey="volume" radius={[3, 3, 0, 0]}>
//                     {tradeVolume.slice(-30).map((_, i, arr) => (
//                       <Cell key={i} fill={i === arr.length - 1 ? "#8B5CF6" : "#1E2D4A"} />
//                     ))}
//                   </Bar>
//                   <Tooltip
//                     contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                     formatter={(v) => [formatCurrency(v, currency, { compact: true }), "Volume"]}
//                   />
//                 </BarChart>
//               </ResponsiveContainer>
//             </div>
//           )}
//         </div>

//         {/* Users by Country */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-1">Users by Country</div>
//           <div className="text-lg font-bold text-white mb-4">{countryData.length} Countries</div>
//           <div className="space-y-2.5">
//             {countryData.length > 0 ? (
//               countryData.map((c, i) => (
//                 <div key={i} className="flex items-center gap-3">
//                   <span className="text-xs text-gray-400 w-24 truncate">{c.country}</span>
//                   <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
//                     <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full"
//                       style={{ width: `${(c.users / maxCountryUsers) * 100}%` }} />
//                   </div>
//                   <span className="text-xs text-gray-500 w-12 text-right">{c.users.toLocaleString()}</span>
//                 </div>
//               ))
//             ) : (
//               <div className="text-xs text-gray-600 text-center py-4">No country data available</div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* Leaderboard */}
//       <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//         <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">
//           Top Performing Users (by Return %)
//         </div>
//         <div className="overflow-x-auto">
//           <table className="w-full">
//             <thead>
//               <tr className="border-b border-white/5">
//                 {["Rank", "User", "Holdings", "Portfolio", "Return %", "Gain"].map((h) => (
//                   <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium">{h}</th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody>
//               {leaderboard.length > 0 ? (
//                 leaderboard.map((u, i) => {
//                   const returnPct    = parseFloat(u.total_return_percent) || 0;
//                   const returnAmt    = parseFloat(u.total_return)         || 0;
//                   const portfolioVal = parseFloat(u.portfolio_value)      || 0;
//                   const up           = returnPct >= 0;
//                   const initials     = (u.username || u.full_name || "U").slice(0, 2).toUpperCase();
//                   const rowCurrency  = u.currency || currency;

//                   return (
//                     <tr key={u.user_id || i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
//                       <td className="px-5 py-3 text-sm font-bold text-amber-400">#{u.rank ?? i + 1}</td>
//                       <td className="px-5 py-3">
//                         <div className="flex items-center gap-2.5">
//                           {u.avatar_url ? (
//                             <img src={u.avatar_url} alt={initials} className="w-7 h-7 rounded-full object-cover" />
//                           ) : (
//                             <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white">
//                               {initials}
//                             </div>
//                           )}
//                           <div>
//                             <div className="text-sm font-medium text-white">
//                               {u.username || u.full_name || `User #${u.user_id}`}
//                             </div>
//                             <div className="text-xs text-gray-600">{u.country || ""}</div>
//                           </div>
//                         </div>
//                       </td>
//                       <td className="px-5 py-3 text-sm text-gray-400">{u.holdings_count ?? "—"}</td>
//                       <td className="px-5 py-3 text-sm text-white">
//                         {formatCurrency(portfolioVal, rowCurrency, { maximumFractionDigits: 0 })}
//                       </td>
//                       <td className={`px-5 py-3 text-sm font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
//                         {up ? "+" : ""}{returnPct.toFixed(1)}%
//                       </td>
//                       <td className={`px-5 py-3 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
//                         {up ? "+" : "-"}{formatCurrency(Math.abs(returnAmt), rowCurrency, { maximumFractionDigits: 0 })}
//                       </td>
//                     </tr>
//                   );
//                 })
//               ) : (
//                 <tr>
//                   <td colSpan={6} className="px-5 py-8 text-center text-gray-600 text-sm">
//                     No leaderboard data available
//                   </td>
//                 </tr>
//               )}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }





















// import { useState, useEffect } from "react";
// import { motion } from "motion/react";
// import {
//   AreaChart,
//   Area,
//   ResponsiveContainer,
//   Tooltip,
//   XAxis,
//   YAxis,
//   BarChart,
//   Bar,
//   Cell,
//   LineChart,
//   Line,
//   PieChart,
//   Pie,
// } from "recharts";
// import { AlertCircle, RefreshCw } from "lucide-react";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken = () => localStorage.getItem("access_token");

// export function AdminAnalytics() {
//   const [aumData, setAumData] = useState([]);
//   const [userGrowth, setUserGrowth] = useState([]);
//   const [tradeVolume, setTradeVolume] = useState([]);
//   const [revenueBreak, setRevenueBreak] = useState([
//     { name: "Pro Subs",     value: 48, color: "#06B6D4" },
//     { name: "Elite Subs",   value: 31, color: "#8B5CF6" },
//     { name: "Trading Fees", value: 14, color: "#F59E0B" },
//     { name: "Other",        value:  7, color: "#6B7280" },
//   ]);
//   const [countryData, setCountryData] = useState([]);
//   const [leaderboard, setLeaderboard] = useState([]);
//   const [kpis, setKpis] = useState({
//     totalAum:       "$0",
//     monthlyRevenue: "$0",
//     avgPortfolio:   "$47,200",
//     churnRate:      "2.1%",
//     totalUsers:     0,
//   });
//   const [loading, setLoading] = useState(true);
//   const [error,   setError]   = useState("");

//   const fetchAll = async () => {
//     setLoading(true);
//     setError("");
//     const headers = { Authorization: `Bearer ${getToken()}` };

//     try {
//       const [aumRes, growthRes, volumeRes, revenueRes, countryRes, leaderRes] =
//         await Promise.all([
//           fetch(`${API_BASE}/admin/analytics/aum_trend`,     { headers }),
//           fetch(`${API_BASE}/admin/analytics/user_growth`,   { headers }),
//           fetch(`${API_BASE}/admin/analytics/trade_volume`,  { headers }),
//           fetch(`${API_BASE}/admin/analytics/revenue`,       { headers }),
//           fetch(`${API_BASE}/admin/analytics/country_stats`, { headers }),
//           fetch(`${API_BASE}/admin/analytics/leaderboard`,   { headers }),
//         ]);

//       const [aumJson, growthJson, volumeJson, revenueJson, countryJson, leaderJson] =
//         await Promise.all([
//           aumRes.json(),
//           growthRes.json(),
//           volumeRes.json(),
//           revenueRes.json(),
//           countryRes.json(),
//           leaderRes.json(),
//         ]);

//       // ── AUM Trend ──────────────────────────────────────────────────────────
//       // Backend: response.data[].{ date, total_aum, total_users, new_users }
//       if (aumJson.bool) {
//         const raw = aumJson.response?.data || [];
//         const mapped = raw.map((d) => ({
//           date:  d.date,
//           close: parseFloat(d.total_aum) || 0,
//         }));
//         setAumData(mapped);

//         const latest = mapped[mapped.length - 1];
//         if (latest) {
//           const aum = latest.close;
//           setKpis((prev) => ({
//             ...prev,
//             totalAum:
//               aum >= 1e9
//                 ? `$${(aum / 1e9).toFixed(2)}B`
//                 : aum >= 1e6
//                 ? `$${(aum / 1e6).toFixed(1)}M`
//                 : `$${aum.toLocaleString()}`,
//           }));
//         }
//       }

//       // ── User Growth ────────────────────────────────────────────────────────
//       // Backend: response.data[].{ date, total_users, new_users, active_users, free_users, paid_users }
//       if (growthJson.bool) {
//         const raw = growthJson.response?.data || [];
//         const mapped = raw.map((d) => ({
//           month: d.date,                              // use date as x-axis label
//           users: d.total_users || 0,
//           new:   d.new_users   || 0,
//         }));
//         setUserGrowth(mapped);

//         const latest = mapped[mapped.length - 1];
//         if (latest) {
//           setKpis((prev) => ({ ...prev, totalUsers: latest.users }));
//         }
//       }

//       // ── Trade Volume ───────────────────────────────────────────────────────
//       // Backend: response.data[].{ date, trades_today, trade_volume }
//       if (volumeJson.bool) {
//         const raw = volumeJson.response?.data || [];
//         setTradeVolume(
//           raw.map((d, i) => ({
//             day:    d.date || `D${i + 1}`,
//             volume: parseFloat(d.trade_volume) || 0,   // already in dollars
//           }))
//         );
//       }

//       // ── Revenue ────────────────────────────────────────────────────────────
//       // Backend: response.totals_by_type = { SUBSCRIPTION: n, TRADING_FEE: n, ... }
//       //          response.data[].{ date, revenue_type, gross_revenue, net_revenue, ... }
//       if (revenueJson.bool) {
//         const raw        = revenueJson.response;
//         const byType     = raw?.totals_by_type || {};   // { TYPE: amount }
//         const colorMap   = ["#06B6D4", "#8B5CF6", "#F59E0B", "#6B7280", "#10B981"];
//         const typeTotal  = Object.values(byType).reduce((s, v) => s + parseFloat(v || 0), 0);

//         if (Object.keys(byType).length > 0) {
//           const breakdown = Object.entries(byType).map(([type, amount], i) => ({
//             name:  type
//               .replace(/_/g, " ")
//               .toLowerCase()
//               .replace(/\b\w/g, (c) => c.toUpperCase()),
//             value: typeTotal > 0 ? Math.round((parseFloat(amount) / typeTotal) * 100) : 0,
//             color: colorMap[i % colorMap.length],
//           }));
//           setRevenueBreak(breakdown);
//         }

//         // Monthly revenue = sum of last 30 days net_revenue from data array
//         const data30 = raw?.data || [];
//         const last30Sum = data30
//           .slice(-30)
//           .reduce((s, r) => s + parseFloat(r.net_revenue || 0), 0);

//         if (last30Sum > 0) {
//           setKpis((prev) => ({
//             ...prev,
//             monthlyRevenue:
//               last30Sum >= 1e6
//                 ? `$${(last30Sum / 1e6).toFixed(1)}M`
//                 : `$${Math.round(last30Sum).toLocaleString()}`,
//           }));
//         }
//       }

//       // ── Country Stats ──────────────────────────────────────────────────────
//       // Backend: response.countries[].{ country_name, country_code, total_users, ... }
//       if (countryJson.bool) {
//         const raw = countryJson.response?.countries || [];
//         setCountryData(
//           raw
//             .map((c) => ({
//               country: c.country_name || c.country_code || "Unknown",
//               users:   c.total_users  || 0,
//             }))
//             .sort((a, b) => b.users - a.users)          // descending
//             .slice(0, 10)                                // top 10
//         );
//       }

//       // ── Leaderboard ────────────────────────────────────────────────────────
//       // Backend: response.leaderboard[].{ rank, user_id, username, avatar_url,
//       //          portfolio_value, total_return, total_return_percent, holdings_count }
//       if (leaderJson.bool) {
//         setLeaderboard(leaderJson.response?.leaderboard || []);
//       }
//     } catch (err) {
//       console.error("Analytics fetch error:", err);
//       setError("Network error. Could not load analytics.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => { fetchAll(); }, []);

//   const maxCountryUsers =
//     countryData.length > 0 ? Math.max(...countryData.map((c) => c.users)) : 1;

//   const kpiCards = [
//     { label: "Total AUM",        value: kpis.totalAum,       change: "+3.4%",  up: true  },
//     { label: "Monthly Revenue",  value: kpis.monthlyRevenue, change: "+12.4%", up: true  },
//     { label: "Avg Portfolio",    value: kpis.avgPortfolio,   change: "+8.2%",  up: true  },
//     { label: "Churn Rate",       value: kpis.churnRate,      change: "-0.4%",  up: false },
//   ];

//   if (loading) {
//     return (
//       <div className="flex flex-col items-center justify-center h-96 gap-4">
//         <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//         <p className="text-sm text-gray-500">Loading analytics...</p>
//       </div>
//     );
//   }

//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
//       {/* Header */}
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-xl font-bold text-white">Analytics</h1>
//           <p className="text-sm text-gray-500 mt-0.5">Platform-wide performance metrics</p>
//         </div>
//         <button
//           onClick={fetchAll}
//           className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
//         >
//           <RefreshCw className="w-4 h-4" />
//         </button>
//       </div>

//       {/* Error banner */}
//       {error && (
//         <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
//           <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
//         </div>
//       )}

//       {/* KPI Cards */}
//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//         {kpiCards.map((k, i) => (
//           <motion.div
//             key={i}
//             initial={{ opacity: 0, y: 16 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ delay: i * 0.08 }}
//             className="bg-[#0C1220] border border-white/5 rounded-2xl p-4"
//           >
//             <div className="text-xs text-gray-500 mb-2">{k.label}</div>
//             <div className="text-2xl font-bold text-white mb-1">{k.value}</div>
//             <div className={`text-xs ${k.up ? "text-emerald-400" : "text-red-400"}`}>
//               {k.change} this month
//             </div>
//           </motion.div>
//         ))}
//       </div>

//       {/* AUM Over Time */}
//       <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//         <div className="flex items-center justify-between mb-5">
//           <div>
//             <div className="text-xs text-gray-500 mb-0.5">Assets Under Management (90 days)</div>
//             <div className="text-2xl font-bold text-white">{kpis.totalAum}</div>
//           </div>
//           <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/15 rounded-xl text-xs text-emerald-400">
//             +3.4% this month
//           </div>
//         </div>
//         {aumData.length === 0 ? (
//           <div className="h-52 flex items-center justify-center text-sm text-gray-600">
//             No AUM data available
//           </div>
//         ) : (
//           <div className="h-52">
//             <ResponsiveContainer width="100%" height="100%">
//               <AreaChart data={aumData.slice(-90)}>
//                 <defs>
//                   <linearGradient id="aumGrad" x1="0" y1="0" x2="0" y2="1">
//                     <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.25} />
//                     <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}    />
//                   </linearGradient>
//                 </defs>
//                 <XAxis
//                   dataKey="date"
//                   tick={{ fill: "#4B5563", fontSize: 10 }}
//                   tickLine={false}
//                   axisLine={false}
//                   interval="preserveStartEnd"
//                 />
//                 <YAxis
//                   tick={{ fill: "#4B5563", fontSize: 10 }}
//                   tickLine={false}
//                   axisLine={false}
//                   tickFormatter={(v) =>
//                     v >= 1e9
//                       ? `$${(v / 1e9).toFixed(1)}B`
//                       : v >= 1e6
//                       ? `$${(v / 1e6).toFixed(1)}M`
//                       : `$${v.toLocaleString()}`
//                   }
//                 />
//                 <Tooltip
//                   contentStyle={{
//                     background: "#0C1220",
//                     border: "1px solid rgba(255,255,255,.08)",
//                     borderRadius: 12,
//                     fontSize: 11,
//                   }}
//                   formatter={(v) => [
//                     v >= 1e9
//                       ? `$${(v / 1e9).toFixed(2)}B`
//                       : v >= 1e6
//                       ? `$${(v / 1e6).toFixed(2)}M`
//                       : `$${Number(v).toLocaleString()}`,
//                     "AUM",
//                   ]}
//                 />
//                 <Area
//                   type="monotone"
//                   dataKey="close"
//                   stroke="#8B5CF6"
//                   strokeWidth={2}
//                   fill="url(#aumGrad)"
//                   dot={false}
//                 />
//               </AreaChart>
//             </ResponsiveContainer>
//           </div>
//         )}
//       </div>

//       <div className="grid lg:grid-cols-2 gap-5">
//         {/* User Growth */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-1">User Growth</div>
//           <div className="text-lg font-bold text-white mb-4">
//             {kpis.totalUsers ? kpis.totalUsers.toLocaleString() : "—"} Total Users
//           </div>
//           {userGrowth.length === 0 ? (
//             <div className="h-44 flex items-center justify-center text-sm text-gray-600">
//               No user growth data available
//             </div>
//           ) : (
//             <div className="h-44">
//               <ResponsiveContainer width="100%" height="100%">
//                 <LineChart data={userGrowth}>
//                   <XAxis
//                     dataKey="month"
//                     tick={{ fill: "#4B5563", fontSize: 10 }}
//                     tickLine={false}
//                     axisLine={false}
//                     interval="preserveStartEnd"
//                   />
//                   <YAxis
//                     tick={{ fill: "#4B5563", fontSize: 10 }}
//                     tickLine={false}
//                     axisLine={false}
//                     tickFormatter={(v) => v.toLocaleString()}
//                   />
//                   <Tooltip
//                     contentStyle={{
//                       background: "#0C1220",
//                       border: "1px solid rgba(255,255,255,.08)",
//                       borderRadius: 12,
//                       fontSize: 11,
//                     }}
//                     formatter={(v) => [v.toLocaleString(), "Users"]}
//                   />
//                   <Line
//                     type="monotone"
//                     dataKey="users"
//                     stroke="#06B6D4"
//                     strokeWidth={2}
//                     dot={false}
//                   />
//                 </LineChart>
//               </ResponsiveContainer>
//             </div>
//           )}
//         </div>

//         {/* Revenue Breakdown */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-1">Revenue Breakdown</div>
//           <div className="text-lg font-bold text-white mb-4">
//             {kpis.monthlyRevenue} / month
//           </div>
//           <div className="flex gap-5 items-center">
//             <div className="h-36 w-36 flex-shrink-0">
//               <ResponsiveContainer width="100%" height="100%">
//                 <PieChart>
//                   <Pie
//                     data={revenueBreak}
//                     cx="50%"
//                     cy="50%"
//                     innerRadius={32}
//                     outerRadius={62}
//                     dataKey="value"
//                     paddingAngle={3}
//                   >
//                     {revenueBreak.map((e, i) => (
//                       <Cell key={i} fill={e.color} />
//                     ))}
//                   </Pie>
//                   <Tooltip
//                     contentStyle={{
//                       background: "#0C1220",
//                       border: "1px solid rgba(255,255,255,.08)",
//                       borderRadius: 12,
//                       fontSize: 11,
//                     }}
//                     formatter={(v) => [`${v}%`, ""]}
//                   />
//                 </PieChart>
//               </ResponsiveContainer>
//             </div>
//             <div className="flex-1 space-y-2.5">
//               {revenueBreak.map((r, i) => (
//                 <div key={i} className="flex items-center justify-between">
//                   <div className="flex items-center gap-2">
//                     <div
//                       className="w-2 h-2 rounded-full"
//                       style={{ background: r.color }}
//                     />
//                     <span className="text-xs text-gray-400">{r.name}</span>
//                   </div>
//                   <span className="text-xs text-white font-medium">{r.value}%</span>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* Trade Volume */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-1">Daily Trade Volume</div>
//           <div className="text-lg font-bold text-white mb-4">30-day snapshot</div>
//           {tradeVolume.length === 0 ? (
//             <div className="h-36 flex items-center justify-center text-sm text-gray-600">
//               No trade volume data available
//             </div>
//           ) : (
//             <div className="h-36">
//               <ResponsiveContainer width="100%" height="100%">
//                 <BarChart data={tradeVolume.slice(-30)} barSize={8}>
//                   <Bar dataKey="volume" radius={[3, 3, 0, 0]}>
//                     {tradeVolume.slice(-30).map((_, i, arr) => (
//                       <Cell
//                         key={i}
//                         fill={i === arr.length - 1 ? "#8B5CF6" : "#1E2D4A"}
//                       />
//                     ))}
//                   </Bar>
//                   <Tooltip
//                     contentStyle={{
//                       background: "#0C1220",
//                       border: "1px solid rgba(255,255,255,.08)",
//                       borderRadius: 12,
//                       fontSize: 11,
//                     }}
//                     formatter={(v) => [
//                       v >= 1e6
//                         ? `$${(v / 1e6).toFixed(1)}M`
//                         : `$${Number(v).toLocaleString()}`,
//                       "Volume",
//                     ]}
//                   />
//                 </BarChart>
//               </ResponsiveContainer>
//             </div>
//           )}
//         </div>

//         {/* Users by Country */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-1">Users by Country</div>
//           <div className="text-lg font-bold text-white mb-4">
//             {countryData.length} Countries
//           </div>
//           <div className="space-y-2.5">
//             {countryData.length > 0 ? (
//               countryData.map((c, i) => (
//                 <div key={i} className="flex items-center gap-3">
//                   <span className="text-xs text-gray-400 w-24 truncate">{c.country}</span>
//                   <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
//                     <div
//                       className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full"
//                       style={{ width: `${(c.users / maxCountryUsers) * 100}%` }}
//                     />
//                   </div>
//                   <span className="text-xs text-gray-500 w-12 text-right">
//                     {c.users.toLocaleString()}
//                   </span>
//                 </div>
//               ))
//             ) : (
//               <div className="text-xs text-gray-600 text-center py-4">
//                 No country data available
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* Leaderboard */}
//       <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//         <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">
//           Top Performing Users (by Return %)
//         </div>
//         <div className="overflow-x-auto">
//           <table className="w-full">
//             <thead>
//               <tr className="border-b border-white/5">
//                 {["Rank", "User", "Holdings", "Portfolio", "Return %", "Gain ($)"].map((h) => (
//                   <th
//                     key={h}
//                     className="px-5 py-3 text-left text-xs text-gray-600 font-medium"
//                   >
//                     {h}
//                   </th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody>
//               {leaderboard.length > 0 ? (
//                 leaderboard.map((u, i) => {
//                   // Backend fields: rank, user_id, username, avatar_url,
//                   //   portfolio_value, total_return, total_return_percent, holdings_count
//                   const returnPct   = parseFloat(u.total_return_percent) || 0;
//                   const returnAmt   = parseFloat(u.total_return)         || 0;
//                   const portfolioVal = parseFloat(u.portfolio_value)     || 0;
//                   const up          = returnPct >= 0;
//                   const initials    = (u.username || u.full_name || "U")
//                     .slice(0, 2)
//                     .toUpperCase();

//                   return (
//                     <tr
//                       key={u.user_id || i}
//                       className="border-b border-white/5 hover:bg-white/5 transition-colors"
//                     >
//                       <td className="px-5 py-3 text-sm font-bold text-amber-400">
//                         #{u.rank ?? i + 1}
//                       </td>
//                       <td className="px-5 py-3">
//                         <div className="flex items-center gap-2.5">
//                           {u.avatar_url ? (
//                             <img
//                               src={u.avatar_url}
//                               alt={initials}
//                               className="w-7 h-7 rounded-full object-cover"
//                             />
//                           ) : (
//                             <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white">
//                               {initials}
//                             </div>
//                           )}
//                           <div>
//                             <div className="text-sm font-medium text-white">
//                               {u.username || u.full_name || `User #${u.user_id}`}
//                             </div>
//                             <div className="text-xs text-gray-600">
//                               {u.country || ""}
//                             </div>
//                           </div>
//                         </div>
//                       </td>
//                       <td className="px-5 py-3 text-sm text-gray-400">
//                         {u.holdings_count ?? "—"}
//                       </td>
//                       <td className="px-5 py-3 text-sm text-white">
//                         ${portfolioVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
//                       </td>
//                       <td
//                         className={`px-5 py-3 text-sm font-bold ${
//                           up ? "text-emerald-400" : "text-red-400"
//                         }`}
//                       >
//                         {up ? "+" : ""}
//                         {returnPct.toFixed(1)}%
//                       </td>
//                       <td
//                         className={`px-5 py-3 text-sm ${
//                           up ? "text-emerald-400" : "text-red-400"
//                         }`}
//                       >
//                         {up ? "+" : "-"}$
//                         {Math.abs(returnAmt).toLocaleString(undefined, {
//                           maximumFractionDigits: 0,
//                         })}
//                       </td>
//                     </tr>
//                   );
//                 })
//               ) : (
//                 <tr>
//                   <td
//                     colSpan={6}
//                     className="px-5 py-8 text-center text-gray-600 text-sm"
//                   >
//                     No leaderboard data available
//                   </td>
//                 </tr>
//               )}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }






















