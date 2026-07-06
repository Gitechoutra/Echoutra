import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Download,
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
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

export function PortfolioPage() {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolio, setActivePortfolio] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [perfChart, setPerfChart] = useState([]);
  const [sectorData, setSectorData] = useState([]);
  const [monthlyReturns, setMonthlyReturns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedHolding, setSelectedHolding] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    const headers = { Authorization: `Bearer ${getToken()}` };
    try {
      const [portfoliosRes, summaryRes, returnsRes] = await Promise.all([
        fetch(`${API_BASE}/portfolios/my`, { headers }),
        fetch(`${API_BASE}/dashboard/user/summary`, { headers }),
        fetch(`${API_BASE}/dashboard/user/monthly_returns`, { headers }),
      ]);
      const [portfoliosData, summaryData, returnsData] = await Promise.all([
        portfoliosRes.json(),
        summaryRes.json(),
        returnsRes.json(),
      ]);

      if (summaryData.bool) setSummary(summaryData.response);
      if (returnsData.bool) {
        const raw = returnsData.response || [];
        setMonthlyReturns(raw.map((r) => ({ month: r.month || r.label, return: r.return_pct || r.value || 0 })));
      }

      if (portfoliosData.bool) {
        const pList = portfoliosData.response?.portfolios || portfoliosData.response || [];
        setPortfolios(pList);
        if (pList.length > 0) {
          const pid = pList[0].portfolio_id || pList[0].id;
          setActivePortfolio(pList[0]);
          const [detailRes, perfRes] = await Promise.all([
            fetch(`${API_BASE}/portfolios/${pid}`, { headers }),
            fetch(`${API_BASE}/portfolios/${pid}/performance`, { headers }),
          ]);
          const [detailData, perfData] = await Promise.all([detailRes.json(), perfRes.json()]);
          if (detailData.bool) {
            const raw = detailData.response?.holdings || detailData.response || [];
            setHoldings(raw.map((h) => ({
              symbol: h.symbol || h.stock_symbol,
              name: h.name || h.stock_name || h.symbol,
              shares: h.shares || h.quantity || 0,
              avgCost: h.avg_cost || h.average_cost || 0,
              currentPrice: h.current_price || h.price || 0,
              sector: h.sector || "Other",
            })));

            // Build sector data
            const secMap = {};
            raw.forEach((h) => {
              const sec = h.sector || "Other";
              const val = (h.shares || h.quantity || 0) * (h.current_price || h.price || 0);
              secMap[sec] = (secMap[sec] || 0) + val;
            });
            const totalVal = Object.values(secMap).reduce((a, b) => a + b, 0);
            const colors = ["#06B6D4", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444"];
            setSectorData(
              Object.entries(secMap).map(([name, val], i) => ({
                name,
                value: parseFloat(((val / totalVal) * 100).toFixed(1)),
                color: colors[i % colors.length],
              }))
            );
          }
          if (perfData.bool) {
            const raw = perfData.response?.chart || perfData.response?.history || perfData.response || [];
            setPerfChart(raw.map((p) => ({ date: p.date, close: p.value || p.close })));
          }
        }
      }
    } catch {
      setError("Network error. Could not load portfolio.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const totalValue = holdings.reduce((acc, h) => acc + h.shares * h.currentPrice, 0);
  const totalCost = holdings.reduce((acc, h) => acc + h.shares * h.avgCost, 0);
  const totalReturn = totalValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;
  const todayPnl = summary?.today_pnl || 0;
  const cashBalance = summary?.cash_balance || summary?.wallet_balance || 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading portfolio...</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Portfolio</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your investments and performance</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-[#1A2235] border border-[#1E2D4A] rounded-lg text-sm text-gray-400 hover:text-white transition-all">
            <Download className="w-4 h-4" />
            <span className="hidden sm:block">Export</span>
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 bg-[#1A2235] border border-[#1E2D4A] rounded-lg text-sm text-gray-400 hover:text-white transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:block">Refresh</span>
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
            label: "Total Value",
            value: `$${totalValue.toLocaleString("en", { maximumFractionDigits: 0 })}`,
            sub: "Portfolio market value",
            up: null,
          },
          {
            label: "Total Return",
            value: `${totalReturn >= 0 ? "+" : ""}$${Math.abs(totalReturn).toFixed(0)}`,
            sub: `${totalReturnPct >= 0 ? "+" : ""}${totalReturnPct.toFixed(1)}% all time`,
            up: totalReturn >= 0,
          },
          {
            label: "Today's Change",
            value: `${todayPnl >= 0 ? "+" : ""}$${Math.abs(todayPnl).toFixed(0)}`,
            sub: `${summary?.today_pnl_pct >= 0 ? "+" : ""}${(summary?.today_pnl_pct || 0).toFixed(2)}% today`,
            up: todayPnl >= 0,
          },
          {
            label: "Cash Balance",
            value: `$${cashBalance.toLocaleString("en", { maximumFractionDigits: 0 })}`,
            sub: "Available to invest",
            up: null,
          },
        ].map((card, i) => (
          <div key={i} className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className={`text-xl font-bold mb-1 ${card.up === true ? "text-emerald-400" : card.up === false ? "text-red-400" : "text-white"}`}>
              {card.value}
            </div>
            <div className="text-xs text-gray-600">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-sm text-gray-500 mb-0.5">Portfolio Performance</div>
              <div className="text-2xl font-bold text-white">
                ${totalValue.toLocaleString("en", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 rounded-full">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-sm text-emerald-400">{totalReturnPct >= 0 ? "+" : ""}{totalReturnPct.toFixed(1)}%</span>
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={perfChart.slice(-90)}>
                <defs>
                  <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "#0F1629", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [`$${v?.toLocaleString()}`, "Value"]}
                />
                <Area type="monotone" dataKey="close" stroke="#10B981" strokeWidth={2} fill="url(#portGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
            <div className="text-sm text-gray-500 mb-3">Allocation</div>
            <div className="h-32 mb-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sectorData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={3}>
                    {sectorData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0F1629", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11 }}
                    formatter={(v) => [`${v}%`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {sectorData.map((s, i) => (
              <div key={i} className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-xs text-gray-400">{s.name}</span>
                </div>
                <span className="text-xs text-white">{s.value}%</span>
              </div>
            ))}
          </div>

          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
            <div className="text-sm text-gray-500 mb-3">Monthly Returns</div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyReturns} barSize={16}>
                  <XAxis dataKey="month" tick={{ fill: "#6B7280", fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Bar dataKey="return" radius={[3, 3, 0, 0]}>
                    {monthlyReturns.map((entry, i) => (
                      <Cell key={i} fill={(entry.return || 0) >= 0 ? "#10B981" : "#EF4444"} />
                    ))}
                  </Bar>
                  <Tooltip
                    contentStyle={{ background: "#0F1629", border: "1px solid #1E2D4A", borderRadius: 8, fontSize: 11 }}
                    formatter={(v) => [`${v}%`, "Return"]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2D4A]">
          <div className="text-sm font-medium text-white">All Holdings</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1E2D4A]">
                {["Symbol", "Shares", "Avg Cost", "Current Price", "Market Value", "Total P&L", "Return %", "Weight"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.length > 0 ? (
                holdings.map((h) => {
                  const value = h.shares * h.currentPrice;
                  const cost = h.shares * h.avgCost;
                  const pnl = value - cost;
                  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
                  const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;
                  const up = pnl >= 0;
                  return (
                    <motion.tr
                      key={h.symbol}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => navigate(`/app/stock/${h.symbol}`)}
                      className={`border-b border-[#1E2D4A]/50 cursor-pointer transition-colors hover:bg-white/5 ${
                        selectedHolding === h.symbol ? "bg-white/5" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="text-sm font-bold text-white">{h.symbol}</div>
                        <div className="text-xs text-gray-600">{h.sector}</div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-300">{h.shares}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-300">${h.avgCost.toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-sm text-white">${h.currentPrice.toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-sm text-white">
                        ${value.toLocaleString("en", { maximumFractionDigits: 0 })}
                      </td>
                      <td className={`px-5 py-3.5 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
                        {up ? "+" : ""}${pnl.toFixed(0)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className={`flex items-center gap-1 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
                          {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {up ? "+" : ""}{pnlPct.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${weight}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{weight.toFixed(1)}%</span>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-600">No holdings found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}









