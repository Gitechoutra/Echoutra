import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  Users, IndianRupee, Activity, TrendingUp, ArrowUpRight,
  ChevronRight, Shield, RefreshCw, AlertCircle, BarChart2,
} from "lucide-react";
import {
  ResponsiveContainer, Tooltip, XAxis, YAxis,
  BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";
import { StockLogo } from "../../components/StockLogo";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({
  Authorization:  `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

/* Currency formatter: all amounts display in Indian Rupees (₹) */
const fmtCurrency = (val) => {
  return `₹${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
};

const makeDauData = (activeUsers = 0) =>
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, i) => ({
    day,
    users: Math.max(1, Math.floor(activeUsers * (0.45 + i * 0.05 + Math.random() * 0.1))),
  }));

/* ══════════════════════════════════════════════════════════════════════════ */
export function AdminDashboard() {
  const navigate = useNavigate();

  /* ── Core dashboard data from /admin/dashboard ── */
  const [dashData,    setDashData]    = useState(null);
  const [txSummary,   setTxSummary]   = useState(null);  // /transactions/admin/summary
  const [recentUsers, setRecentUsers] = useState([]);
  const [dauData,     setDauData]     = useState(makeDauData());
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  /* ── Fetch all dashboard data ── */
  const fetchDashboard = async () => {
    setLoading(true);
    setError("");
    const token = getToken();
    if (!token) { navigate("/signin?role=admin"); return; }

    try {
      /* Fire requests in parallel — /transactions/admin/summary gives tx stats */
      const [dashRes, recentRes, txRes] = await Promise.all([
        fetch(`${API_BASE}/admin/dashboard`,                   { headers: authHdr() }),
        fetch(`${API_BASE}/dashboard/admin/recent_users`,      { headers: authHdr() }),
        fetch(`${API_BASE}/transactions/admin/summary`,        { headers: authHdr() }),
      ]);

      /* ── /admin/dashboard ── */
      if (dashRes.status === 401 || dashRes.status === 403) {
        navigate("/signin?role=admin"); return;
      }

      const [dashJson, recentJson, txJson] = await Promise.all([
        dashRes.json(), recentRes.json(), txRes.json(),
      ]);

      if (!dashJson.bool) {
        setError(dashJson.response?.message || "Failed to load dashboard."); return;
      }

      /*
        Backend /admin/dashboard response structure (from routes.py):
        {
          users:   { total, active, new_today, suspended, plan_distribution },
          financial: { total_aum, revenue_today, revenue_7d, revenue_30d },
          trading:   { trades_today },     ← no "volume" field here
          top_stocks: [...],
          recent_users: [...]
        }
      */
      const resp = dashJson.response || {};
      setDashData(resp);

      /* Recent users — prefer dedicated endpoint */
      if (recentJson.bool) {
        const ru = recentJson.response?.users
          || (Array.isArray(recentJson.response) ? recentJson.response : []);
        setRecentUsers(ru.slice(0, 8));
      } else if (resp.recent_users?.length) {
        setRecentUsers(resp.recent_users.slice(0, 8));
      }

      /* Transaction summary from /transactions/admin/summary */
      if (txJson.bool && txJson.response) {
        setTxSummary(txJson.response);
      }

      /* DAU from platform_stats if available */
      try {
        const statsRes  = await fetch(`${API_BASE}/admin/platform_stats?days=7`, { headers: authHdr() });
        const statsJson = await statsRes.json();
        if (statsJson.bool && statsJson.response?.stats?.length > 0) {
          const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
          const dau  = statsJson.response.stats.slice(-7).map((s, i) => ({
            day:   days[i] || `D${i+1}`,
            users: s.active_users_today || 0,
          }));
          if (dau.some(d => d.users > 0)) setDauData(dau);
        }
      } catch {}

    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          <button onClick={fetchDashboard} className="ml-auto text-xs underline">Retry</button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     MAP BACKEND FIELDS → DISPLAY VALUES
     
     /admin/dashboard returns:
       dashData.users.total          → Total Users
       dashData.users.active         → Active Users
       dashData.users.new_today      → New Today
       dashData.users.suspended      → Suspended
       dashData.financial.total_aum  → AUM (INR)
       dashData.financial.revenue_30d → Revenue 30d (INR)
       dashData.financial.revenue_7d  → Revenue 7d (INR)
       dashData.trading.trades_today  → Trades Today (count, not volume)
     
     /transactions/admin/summary (txSummary) returns:
       txSummary.all_time.buy_volume   → total buy INR volume
       txSummary.all_time.sell_volume  → total sell INR volume
       txSummary.all_time.buy_count    → total buy count
       txSummary.all_time.sell_count   → total sell count
       txSummary.today.buy_volume      → today's buy volume
       txSummary.today.buy_count       → today's buy count
  ══════════════════════════════════════════════════════════════════════ */
  const userBlock  = dashData?.users      || {};
  const finBlock   = dashData?.financial  || {};
  const tradeBlock = dashData?.trading    || {};
  const topStocks  = dashData?.top_stocks || [];

  const totalUsers   = userBlock.total      || 0;
  const activeUsers  = userBlock.active     || 0;
  const newToday     = userBlock.new_today  || 0;
  const suspended    = userBlock.suspended  || 0;
  const totalAum     = finBlock.total_aum   || 0;
  const rev30d       = finBlock.revenue_30d || 0;
  const rev7d        = finBlock.revenue_7d  || 0;
  const tradesToday  = tradeBlock.trades_today || 0;

  /* Tx stats from summary */
  const allTimeBuys   = txSummary?.all_time?.buy_count    || 0;
  const allTimeSells  = txSummary?.all_time?.sell_count   || 0;
  const allTimeBuyVol = txSummary?.all_time?.buy_volume   || 0;
  const allTimeSellVol= txSummary?.all_time?.sell_volume  || 0;
  const totalTxns     = allTimeBuys + allTimeSells;
  const tradingVolume = allTimeBuyVol + allTimeSellVol;

  const activePct = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : "0.0";

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  /* ── Stat cards ── */
  const statCards = [
    {
      label:  "Total Users",
      value:  totalUsers.toLocaleString(),
      sub:    `${activeUsers.toLocaleString()} active`,
      icon:   Users,
      color:  "from-violet-500/20 to-violet-500/5",
      border: "border-violet-500/15",
      iconC:  "text-violet-400",
    },
    {
      label:  "Active Users",
      value:  activeUsers.toLocaleString(),
      sub:    `${activePct}% of total users`,
      icon:   Activity,
      color:  "from-emerald-500/20 to-emerald-500/5",
      border: "border-emerald-500/15",
      iconC:  "text-emerald-400",
    },
    {
      label:  "Total AUM",
      /* AUM is in INR (wallet/portfolio balances default to INR) */
      value:  fmtCurrency(totalAum, "INR"),
      sub:    "Platform assets under management",
      icon:   IndianRupee,
      color:  "from-cyan-500/20 to-cyan-500/5",
      border: "border-cyan-500/15",
      iconC:  "text-cyan-400",
    },
    {
      label:  "Revenue (30d)",
      value:  fmtCurrency(rev30d, "INR"),
      sub:    `${fmtCurrency(rev7d,"INR")} last 7 days`,
      icon:   TrendingUp,
      color:  "from-amber-500/20 to-amber-500/5",
      border: "border-amber-500/15",
      iconC:  "text-amber-400",
    },
  ];

  /* Bar chart — user breakdown */
  const userBarData = [
    { name: "Total",     value: totalUsers,  color: "#8B5CF6" },
    { name: "Active",    value: activeUsers, color: "#06B6D4" },
    { name: "New Today", value: newToday,    color: "#10B981" },
    { name: "Suspended", value: suspended,   color: "#EF4444" },
  ];

  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Platform-wide overview — {today}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchDashboard}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl">
            <Shield className="w-4 h-4 text-violet-400" />
            <span className="text-sm text-violet-300 font-medium">Admin View</span>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className={`bg-gradient-to-br ${s.color} border ${s.border} rounded-2xl p-4`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.iconC}`} />
            </div>
            <div className="text-2xl font-bold text-white mb-1">{s.value}</div>
            <div className="text-xs flex items-center gap-1 text-emerald-400">
              <ArrowUpRight className="w-3 h-3" />{s.sub}
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* User breakdown bar chart */}
        <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">User Breakdown</div>
              <div className="text-2xl font-bold text-white">{totalUsers.toLocaleString()}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span className="text-xs text-emerald-400">
                  {activeUsers.toLocaleString()} active · {newToday} new today · {suspended} suspended
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-600 px-2 py-1 bg-white/5 rounded-lg">
              {tradesToday.toLocaleString()} trades today
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userBarData} barSize={44}>
                <XAxis dataKey="name" tick={{ fill: "#4B5563", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
                  formatter={(v) => [v.toLocaleString(), "Users"]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {userBarData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue & activity summary */}
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="text-xs text-gray-500 mb-1">Revenue & Activity</div>
          <div className="text-sm font-medium text-white mb-4">Commission earned</div>
          <div className="space-y-3">
            {[
              { label: "Revenue (30 days)", value: `₹${Number(rev30d).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, accent: "text-emerald-400" },
              { label: "Revenue (7 days)",  value: `₹${Number(rev7d).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,  accent: "text-cyan-400" },
              { label: "Assets under mgmt", value: `₹${Number(totalAum).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, accent: "text-violet-400" },
              { label: "Trades today",      value: tradesToday.toLocaleString(), accent: "text-amber-400" },
              { label: "Active users",      value: `${activeUsers.toLocaleString()} (${activePct}%)`, accent: "text-white" },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{r.label}</span>
                <span className={`text-sm font-semibold ${r.accent}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DAU + Recent Users ── */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* DAU */}
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="text-xs text-gray-500 mb-4">Daily Active Users (this week)</div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dauData} barSize={20}>
                <XAxis dataKey="day" tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Bar dataKey="users" radius={[4, 4, 0, 0]}>
                  {dauData.map((_, i) => <Cell key={i} fill={i === 6 ? "#8B5CF6" : "#1E2D4A"} />)}
                </Bar>
                <Tooltip
                  contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
                  formatter={(v) => [v.toLocaleString(), "Users"]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="bg-white/5 rounded-xl p-2.5 text-center">
              <div className="text-sm font-bold text-white">{newToday.toLocaleString()}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">New Today</div>
            </div>
            <div className="bg-white/5 rounded-xl p-2.5 text-center">
              <div className="text-sm font-bold text-white">{suspended.toLocaleString()}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Suspended</div>
            </div>
          </div>
        </div>

        {/* Recent users */}
        <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="text-sm font-medium text-white">Recent Users</div>
            <button onClick={() => navigate("/admin/users")}
              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors">
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["User","Role","Status","Joined"].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs text-gray-600 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentUsers.length > 0 ? recentUsers.map(u => (
                  <tr key={u.user_id || u.id}
                    onClick={() => navigate(`/admin/users/${u.user_id || u.id}`)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {(u.full_name || u.username || u.email || "U").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white truncate max-w-[140px]">
                            {u.full_name || u.username || "—"}
                          </div>
                          <div className="text-xs text-gray-600 truncate max-w-[140px]">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-gray-400">{u.role || "USER"}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        (u.status||"").toUpperCase() === "ACTIVE"     ? "bg-emerald-500/10 text-emerald-400"
                        :(u.status||"").toUpperCase() === "PENDING"   ? "bg-amber-500/10 text-amber-400"
                        :["SUSPENDED","BANNED","BLOCKED"].includes((u.status||"").toUpperCase())
                                                                      ? "bg-red-500/10 text-red-400"
                        : "bg-gray-500/10 text-gray-500"
                      }`}>{u.status || "—"}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-600">
                      {(u.created_on || u.joined_at)
                        ? new Date(u.created_on || u.joined_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-600 text-sm">No recent users</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Financial summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total AUM",        value: `₹${(totalAum/1e5).toFixed(2)}L`,                 icon: "💰" },
          { label: "Revenue (7d)",     value: fmtCurrency(rev7d, "INR"),                         icon: "📈" },
          { label: "Trades Today",     value: tradesToday.toLocaleString(),                      icon: "🔄" },
          { label: "Trading Volume",   value: `₹${(tradingVolume/1e5).toFixed(2)}L`,             icon: "💹" },
          { label: "Total Buy Orders", value: allTimeBuys.toLocaleString(),                      icon: "📊" },
          { label: "Total Sell Orders",value: allTimeSells.toLocaleString(),                     icon: "📉" },
          { label: "Buy Volume",       value: `₹${(allTimeBuyVol/1e5).toFixed(2)}L`,             icon: "🟢" },
          { label: "Sell Volume",      value: `₹${(allTimeSellVol/1e5).toFixed(2)}L`,            icon: "🔴" },
        ].map((s, i) => (
          <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4 text-center">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-lg font-bold text-white">{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Top stocks ── */}
      {topStocks.length > 0 && (
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="text-sm font-medium text-white">Top Stocks by Platform AUM</div>
            <button onClick={() => navigate("/admin/stocks")}
              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors">
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["#","Stock","Holders","Platform AUM","AUM %","Rating"].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs text-gray-600 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topStocks.map((s, i) => (
                  <tr key={s.stock_id || i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-xs text-gray-600">{i + 1}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <StockLogo symbol={s.ticker_symbol} name={s.company_name} size="sm" />
                        <div>
                          <div className="text-sm font-bold text-white">{s.ticker_symbol}</div>
                          <div className="text-xs text-gray-600 truncate max-w-[120px]">{s.company_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-300">{(s.total_holders||0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-white">
                      {/* AUM is in INR */}
                      ₹{(s.platform_aum||0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full"
                            style={{ width: `${Math.min(100, s.platform_aum_percent || 0)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">
                          {(s.platform_aum_percent || 0).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {s.consensus_rating ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          ["STRONG_BUY","BUY"].includes(s.consensus_rating)
                            ? "bg-emerald-500/10 text-emerald-400"
                            : s.consensus_rating === "HOLD"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-red-500/10 text-red-400"
                        }`}>
                          {s.consensus_rating.replace("_", " ")}
                        </span>
                      ) : <span className="text-xs text-gray-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}























// import { useState, useEffect } from "react";
// import { useNavigate } from "react-router";
// import { motion } from "motion/react";
// import {
//   Users,
//   DollarSign,
//   Activity,
//   TrendingUp,
//   ArrowUpRight,
//   ChevronRight,
//   Shield,
//   RefreshCw,
//   AlertCircle,
//   Wallet,
//   Briefcase,
// } from "lucide-react";
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
//   PieChart,
//   Pie,
// } from "recharts";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken = () => localStorage.getItem("access_token");

// const authHeaders = () => ({
//   Authorization: `Bearer ${getToken()}`,
//   "Content-Type": "application/json",
// });

// export function AdminDashboard() {
//   const navigate = useNavigate();
//   const [dashData, setDashData] = useState(null);
//   const [planDist, setPlanDist] = useState([
//     { name: "Free", value: 0, color: "#1E293B" },
//     { name: "Pro", value: 0, color: "#06B6D4" },
//     { name: "Elite", value: 0, color: "#8B5CF6" },
//   ]);
//   const [recentUsers, setRecentUsers] = useState([]);
//   const [topStocks, setTopStocks] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");
//   const [stats, setStats] = useState({
//     totalUsers: 0,
//     activeUsers: 0,
//     totalWalletBalance: 0,
//     tradingVolume: 0,
//     totalBuys: 0,
//     totalSells: 0,
//     totalTransactions: 0,
//     activeStocks: 0,
//     totalStocks: 0,
//   });

//   const fetchDashboard = async () => {
//     setLoading(true);
//     setError("");
    
//     const token = getToken();
//     if (!token) {
//       console.log("No token found, redirecting to login...");
//       navigate("/signin?role=admin");
//       return;
//     }
    
//     try {
//       console.log("Fetching admin dashboard...");
//       const dashRes = await fetch(`${API_BASE}/admin/dashboard`, {
//         headers: authHeaders(),
//       });
      
//       console.log("Dashboard response status:", dashRes.status);
      
//       if (dashRes.status === 401 || dashRes.status === 403) {
//         console.log("Unauthorized, redirecting to login...");
//         navigate("/signin?role=admin");
//         return;
//       }
      
//       if (!dashRes.ok) {
//         throw new Error(`HTTP ${dashRes.status}`);
//       }
      
//       const dashJson = await dashRes.json();
//       console.log("Dashboard data:", dashJson);

//       if (!dashJson.bool) {
//         setError(dashJson.response?.message || "Failed to load dashboard.");
//         setLoading(false);
//         return;
//       }

//       const data = dashJson.response || {};
      
//       // Update stats from dashboard data
//       setStats({
//         totalUsers: data.users?.total || 0,
//         activeUsers: data.users?.active || 0,
//         totalWalletBalance: data.financial?.total_aum || 0,
//         tradingVolume: data.trading?.volume || 0,
//         totalBuys: data.transactions?.total_buys || 0,
//         totalSells: data.transactions?.total_sells || 0,
//         totalTransactions: data.transactions?.total || 0,
//         activeStocks: data.stocks?.active || 0,
//         totalStocks: data.stocks?.total || 0,
//       });
      
//       // Set plan distribution
//       if (data.users?.plan_distribution && Object.keys(data.users.plan_distribution).length > 0) {
//         const planColors = {
//           FREE: "#1E293B",
//           BASIC: "#3B82F6",
//           PRO: "#06B6D4",
//           PREMIUM: "#8B5CF6",
//           ENTERPRISE: "#F59E0B",
//         };
//         const planDistData = Object.entries(data.users.plan_distribution).map(([name, count]) => ({
//           name: name.charAt(0) + name.slice(1).toLowerCase(),
//           value: count,
//           color: planColors[name] || "#6B7280",
//         }));
//         setPlanDist(planDistData);
//       }
      
//       // Set top stocks
//       if (data.top_stocks && data.top_stocks.length > 0) {
//         setTopStocks(data.top_stocks);
//       }
      
//       // Set recent users
//       if (data.recent_users && data.recent_users.length > 0) {
//         setRecentUsers(data.recent_users);
//       }
      
//       setDashData(data);
      
//     } catch (err) {
//       console.error("Dashboard fetch error:", err);
//       setError(err.message || "Network error. Please check your connection.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchDashboard();
//   }, []);

//   // Show loading state
//   if (loading) {
//     return (
//       <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
//         <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//         <p className="text-sm text-gray-500">Loading dashboard...</p>
//       </div>
//     );
//   }

//   // Show error state with retry button
//   if (error) {
//     return (
//       <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-6">
//         <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-3 rounded-xl">
//           <AlertCircle className="w-4 h-4 flex-shrink-0" />
//           <span>{error}</span>
//         </div>
//         <button
//           onClick={fetchDashboard}
//           className="px-4 py-2 bg-violet-500/20 text-violet-400 rounded-lg text-sm hover:bg-violet-500/30 transition-colors flex items-center gap-2"
//         >
//           <RefreshCw className="w-3 h-3" />
//           Retry
//         </button>
//       </div>
//     );
//   }

//   const today = new Date().toLocaleDateString("en-US", {
//     month: "long",
//     day: "numeric",
//     year: "numeric",
//   });

//   // Mock data for daily active users (since API might not have this)
//   const dailyActiveData = [
//     { day: "Mon", users: Math.floor(stats.activeUsers * 0.6) || 45 },
//     { day: "Tue", users: Math.floor(stats.activeUsers * 0.65) || 52 },
//     { day: "Wed", users: Math.floor(stats.activeUsers * 0.7) || 58 },
//     { day: "Thu", users: Math.floor(stats.activeUsers * 0.75) || 63 },
//     { day: "Fri", users: Math.floor(stats.activeUsers * 0.8) || 71 },
//     { day: "Sat", users: Math.floor(stats.activeUsers * 0.5) || 38 },
//     { day: "Sun", users: Math.floor(stats.activeUsers * 0.45) || 34 },
//   ];

//   const statCards = [
//     {
//       label: "Total Users",
//       value: stats.totalUsers.toLocaleString(),
//       sub: `${stats.activeUsers} active`,
//       icon: Users,
//       color: "from-violet-500/20 to-violet-500/5",
//       border: "border-violet-500/15",
//       icon_c: "text-violet-400",
//     },
//     {
//       label: "Active Users",
//       value: stats.activeUsers.toLocaleString(),
//       sub: `${stats.totalUsers ? ((stats.activeUsers / stats.totalUsers) * 100).toFixed(1) : 0}% of total`,
//       icon: Activity,
//       color: "from-emerald-500/20 to-emerald-500/5",
//       border: "border-emerald-500/15",
//       icon_c: "text-emerald-400",
//     },
//     {
//       label: "Total Wallet Balance",
//       value: `$${stats.totalWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
//       sub: "Platform-wide balance",
//       icon: Wallet,
//       color: "from-cyan-500/20 to-cyan-500/5",
//       border: "border-cyan-500/15",
//       icon_c: "text-cyan-400",
//     },
//     {
//       label: "Trading Volume",
//       value: `$${stats.tradingVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
//       sub: "Total all-time volume",
//       icon: TrendingUp,
//       color: "from-amber-500/20 to-amber-500/5",
//       border: "border-amber-500/15",
//       icon_c: "text-amber-400",
//     },
//   ];

//   return (
//     <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
//       {/* Header */}
//       <div className="flex items-center justify-between flex-wrap gap-3">
//         <div>
//           <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
//           <p className="text-sm text-gray-500 mt-0.5">
//             Platform-wide overview — {today}
//           </p>
//         </div>
//         <div className="flex items-center gap-2">
//           <button
//             onClick={fetchDashboard}
//             className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
//             title="Refresh"
//           >
//             <RefreshCw className="w-4 h-4" />
//           </button>
//           <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl">
//             <Shield className="w-4 h-4 text-violet-400" />
//             <span className="text-sm text-violet-300 font-medium">Admin View</span>
//           </div>
//         </div>
//       </div>

//       {/* Stats Cards */}
//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
//         {statCards.map((s, i) => (
//           <motion.div
//             key={i}
//             initial={{ opacity: 0, y: 20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ delay: i * 0.08 }}
//             className={`bg-gradient-to-br ${s.color} border ${s.border} rounded-2xl p-4`}
//           >
//             <div className="flex items-center justify-between mb-3">
//               <span className="text-xs text-gray-500">{s.label}</span>
//               <s.icon className={`w-4 h-4 ${s.icon_c}`} />
//             </div>
//             <div className="text-2xl font-bold text-white mb-1">{s.value}</div>
//             <div className="text-xs flex items-center gap-1 text-emerald-400">
//               <ArrowUpRight className="w-3 h-3" />
//               {s.sub}
//             </div>
//           </motion.div>
//         ))}
//       </div>

//       {/* Charts row */}
//       <div className="grid lg:grid-cols-3 gap-5">
//         {/* Transaction Overview */}
//         <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="flex items-center justify-between mb-5">
//             <div>
//               <div className="text-xs text-gray-500 mb-0.5">Transaction Overview</div>
//               <div className="text-2xl font-bold text-white">
//                 {stats.totalTransactions.toLocaleString()}
//               </div>
//               <div className="flex items-center gap-1 mt-0.5">
//                 <TrendingUp className="w-3 h-3 text-emerald-400" />
//                 <span className="text-xs text-emerald-400">
//                   {stats.totalBuys} buys · {stats.totalSells} sells
//                 </span>
//               </div>
//             </div>
//           </div>
//           <div className="h-48">
//             <ResponsiveContainer width="100%" height="100%">
//               <BarChart
//                 data={[
//                   { name: "Total", value: stats.totalTransactions || 1 },
//                   { name: "Buys", value: stats.totalBuys || 0 },
//                   { name: "Sells", value: stats.totalSells || 0 },
//                 ]}
//                 barSize={40}
//               >
//                 <XAxis dataKey="name" tick={{ fill: "#4B5563", fontSize: 11 }} tickLine={false} axisLine={false} />
//                 <YAxis tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} />
//                 <Tooltip
//                   contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                   labelStyle={{ color: "#9CA3AF" }}
//                   itemStyle={{ color: "#8B5CF6" }}
//                   formatter={(value) => [value.toLocaleString(), "Count"]}
//                 />
//                 <Bar dataKey="value" radius={[4, 4, 0, 0]}>
//                   {[0, 1, 2].map((i) => (
//                     <Cell key={i} fill={i === 0 ? "#8B5CF6" : i === 1 ? "#06B6D4" : "#F59E0B"} />
//                   ))}
//                 </Bar>
//               </BarChart>
//             </ResponsiveContainer>
//           </div>
//         </div>

//         {/* Plan distribution */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-1">Plan Distribution</div>
//           <div className="text-sm font-medium text-white mb-4">{stats.totalUsers.toLocaleString()} users</div>
//           <div className="h-36 mb-4">
//             <ResponsiveContainer width="100%" height="100%">
//               <PieChart>
//                 <Pie 
//                   data={planDist} 
//                   cx="50%" 
//                   cy="50%" 
//                   innerRadius={38} 
//                   outerRadius={64} 
//                   dataKey="value" 
//                   paddingAngle={3}
//                 >
//                   {planDist.map((e, i) => (
//                     <Cell key={i} fill={e.color} />
//                   ))}
//                 </Pie>
//                 <Tooltip
//                   contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                   formatter={(value, name, props) => [`${value} users`, props.payload.name]}
//                 />
//               </PieChart>
//             </ResponsiveContainer>
//           </div>
//           <div className="space-y-2">
//             {planDist.map((p, i) => (
//               <div key={i} className="flex items-center justify-between">
//                 <div className="flex items-center gap-2">
//                   <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
//                   <span className="text-xs text-gray-400">{p.name}</span>
//                 </div>
//                 <span className="text-xs text-white">{p.value} users</span>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>

//       {/* Activity + Recent Users */}
//       <div className="grid lg:grid-cols-3 gap-5">
//         {/* Daily active users */}
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//           <div className="text-xs text-gray-500 mb-4">Daily Active Users (this week)</div>
//           <div className="h-32">
//             <ResponsiveContainer width="100%" height="100%">
//               <BarChart data={dailyActiveData} barSize={20}>
//                 <XAxis dataKey="day" tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} />
//                 <Bar dataKey="users" radius={[4, 4, 0, 0]}>
//                   {dailyActiveData.map((_, i) => (
//                     <Cell key={i} fill={i === 6 ? "#8B5CF6" : "#1E2D4A"} />
//                   ))}
//                 </Bar>
//                 <Tooltip
//                   contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
//                   formatter={(value) => [value.toLocaleString(), "Active Users"]}
//                 />
//               </BarChart>
//             </ResponsiveContainer>
//           </div>
//         </div>

//         {/* Recent users */}
//         <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//             <div className="text-sm font-medium text-white">Recent Users</div>
//             <button
//               onClick={() => navigate("/admin/users")}
//               className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
//             >
//               View All <ChevronRight className="w-3 h-3" />
//             </button>
//           </div>
//           <div className="overflow-x-auto">
//             <table className="w-full">
//               <thead>
//                 <tr className="border-b border-white/5">
//                   {["User", "Status", "Joined"].map((h) => (
//                     <th key={h} className="px-5 py-2.5 text-left text-xs text-gray-600 font-medium">{h}</th>
//                   ))}
//                 </tr>
//               </thead>
//               <tbody>
//                 {recentUsers.length > 0 ? (
//                   recentUsers.slice(0, 5).map((u) => (
//                     <tr
//                       key={u.user_id || u.id}
//                       onClick={() => navigate(`/admin/users/${u.user_id || u.id}`)}
//                       className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
//                     >
//                       <td className="px-5 py-3">
//                         <div className="flex items-center gap-2.5">
//                           <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
//                             {(u.username || u.email || "U").slice(0, 2).toUpperCase()}
//                           </div>
//                           <div>
//                             <div className="text-sm font-medium text-white">{u.username || u.email}</div>
//                             <div className="text-xs text-gray-600">{u.email}</div>
//                           </div>
//                         </div>
//                       </td>
//                       <td className="px-5 py-3">
//                         <span className={`text-xs px-2 py-0.5 rounded-full ${
//                           (u.status || "").toUpperCase() === "ACTIVE"
//                             ? "bg-emerald-500/10 text-emerald-400"
//                             : (u.status || "").toUpperCase() === "BLOCKED" || (u.status || "").toUpperCase() === "SUSPENDED"
//                             ? "bg-red-500/10 text-red-400"
//                             : "bg-gray-500/10 text-gray-500"
//                         }`}>
//                           {u.status || "ACTIVE"}
//                         </span>
//                       </td>
//                       <td className="px-5 py-3 text-xs text-gray-600">
//                         {u.created_on ? new Date(u.created_on).toLocaleDateString() : "—"}
//                       </td>
//                     </tr>
//                   ))
//                 ) : (
//                   <tr>
//                     <td colSpan={3} className="px-5 py-8 text-center text-gray-600 text-sm">No recent users</td>
//                   </tr>
//                 )}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       </div>

//       {/* Quick stats */}
//       <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
//         {[
//           { label: "Total Transactions", value: stats.totalTransactions.toLocaleString(), icon: "📊" },
//           { label: "Trade Volume", value: `$${(stats.tradingVolume / 1e6).toFixed(2)}M`, icon: "💹" },
//           { label: "Active Stocks", value: stats.activeStocks.toString() || "0", icon: "📈" },
//           { label: "Total Stocks", value: stats.totalStocks.toString() || "0", icon: "🗂️" },
//         ].map((s, i) => (
//           <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4 text-center">
//             <div className="text-2xl mb-2">{s.icon}</div>
//             <div className="text-lg font-bold text-white">{s.value}</div>
//             <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
//           </div>
//         ))}
//       </div>

//       {/* Top Stocks by AUM */}
//       {topStocks.length > 0 && (
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//             <div className="text-sm font-medium text-white">Top Stocks by Platform AUM</div>
//           </div>
//           <div className="overflow-x-auto">
//             <table className="w-full">
//               <thead>
//                 <tr className="border-b border-white/5">
//                   {["Symbol", "Company", "Holders", "Platform AUM", "Popularity"].map((h) => (
//                     <th key={h} className="px-5 py-2.5 text-left text-xs text-gray-600 font-medium">{h}</th>
//                   ))}
//                 </tr>
//               </thead>
//               <tbody>
//                 {topStocks.map((stock, idx) => (
//                   <tr key={stock.stock_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
//                     <td className="px-5 py-3">
//                       <div className="flex items-center gap-2">
//                         {stock.logo_url ? (
//                           <img src={stock.logo_url} alt={stock.ticker_symbol} className="w-6 h-6 rounded-full" />
//                         ) : (
//                           <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
//                             <span className="text-xs font-bold text-cyan-400">{stock.ticker_symbol?.slice(0, 2)}</span>
//                           </div>
//                         )}
//                         <span className="text-sm font-bold text-white">{stock.ticker_symbol}</span>
//                       </div>
//                     </td>
//                     <td className="px-5 py-3 text-sm text-gray-400 max-w-[200px] truncate">{stock.company_name}</td>
//                     <td className="px-5 py-3 text-sm text-gray-400">{stock.total_holders?.toLocaleString() || 0}</td>
//                     <td className="px-5 py-3 text-sm text-white">
//                       ${(stock.platform_aum || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
//                     </td>
//                     <td className="px-5 py-3">
//                       <div className="flex items-center gap-2">
//                         <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
//                           <div 
//                             className="h-full bg-violet-500 rounded-full" 
//                             style={{ width: `${Math.min(100, (stock.popularity_rank ? 100 - stock.popularity_rank : 50))}%` }}
//                           />
//                         </div>
//                         <span className="text-xs text-gray-500">#{stock.popularity_rank || idx + 1}</span>
//                       </div>
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       )}

//       {/* No data message */}
//       {stats.totalUsers === 0 && !loading && !error && (
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-8 text-center">
//           <div className="text-gray-500 text-sm">
//             No data available. This could be because:
//             <ul className="mt-2 text-xs text-gray-600 list-disc list-inside">
//               <li>You're not logged in as an admin</li>
//               <li>The backend server is not running</li>
//               <li>The API endpoint is not configured correctly</li>
//             </ul>
//             <button
//               onClick={fetchDashboard}
//               className="mt-4 px-4 py-2 bg-violet-500/20 text-violet-400 rounded-lg text-sm hover:bg-violet-500/30 transition-colors"
//             >
//               Refresh Data
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

















