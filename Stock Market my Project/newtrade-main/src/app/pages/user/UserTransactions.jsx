import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft,
  DollarSign, Download, RefreshCw, Search, Filter,
  ChevronLeft, ChevronRight, X, AlertCircle, Receipt,
  Wallet, BarChart2, CheckCircle, Clock, XCircle,
} from "lucide-react";
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
  AreaChart, Area,
} from "recharts";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({
  Authorization:  `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

/* ── Type styling ────────────────────────────────────────────────────────── */
const TYPE_CONFIG = {
  BUY:        { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: TrendingUp,   label: "Buy"      },
  SELL:       { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",         icon: TrendingDown, label: "Sell"     },
  DIVIDEND:   { color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",     icon: DollarSign,   label: "Dividend" },
  DEPOSIT:    { color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20",       icon: ArrowDownLeft,label: "Deposit"  },
  WITHDRAWAL: { color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20",   icon: ArrowUpRight, label: "Withdraw" },
  FEE:        { color: "text-gray-400",    bg: "bg-gray-500/10 border-gray-500/20",       icon: Receipt,      label: "Fee"      },
};

const STATUS_CONFIG = {
  COMPLETED: { color: "text-emerald-400", Icon: CheckCircle },
  PENDING:   { color: "text-amber-400",   Icon: Clock       },
  FAILED:    { color: "text-red-400",     Icon: XCircle     },
  REVERSED:  { color: "text-gray-400",    Icon: XCircle     },
};

const FILTERS = ["All", "BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL", "FEE"];

/* ═══════════════════════════════════════════════════════════════════════════ */
export function UserTransactions() {
  const navigate = useNavigate();

  /* ── Data state ────────────────────────────────────────────────────────── */
  const [transactions, setTransactions] = useState([]);
  const [summary,      setSummary]      = useState(null);
  const [walletData,   setWalletData]   = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [total,        setTotal]        = useState(0);
  const [totalPages,   setTotalPages]   = useState(1);

  /* ── Filter / pagination state ─────────────────────────────────────────── */
  const [typeFilter,  setTypeFilter]  = useState("All");
  const [search,      setSearch]      = useState("");
  const [fromDate,    setFromDate]    = useState("");
  const [toDate,      setToDate]      = useState("");
  const [page,        setPage]        = useState(1);
  const [perPage]                     = useState(20);
  const [showFilters, setShowFilters] = useState(false);

  /* ── Detail modal ──────────────────────────────────────────────────────── */
  const [selected,    setSelected]    = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* ── Monthly chart data (derived from transactions) ────────────────────── */
  const [monthlyChart, setMonthlyChart] = useState([]);

  /* ── Fetch wallet ──────────────────────────────────────────────────────── */
  const fetchWallet = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/wallets/me`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) setWalletData(data.response);
    } catch {}
  }, []);

  /* ── Fetch summary ─────────────────────────────────────────────────────── */
  const fetchSummary = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/transactions/summary`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) setSummary(data.response);
    } catch {}
  }, []);

  /* ── Fetch transactions (main list) ────────────────────────────────────── */
  const fetchTransactions = useCallback(async (pg = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page:     pg,
        per_page: perPage,
      });
      if (typeFilter !== "All")  params.set("type",      typeFilter);
      if (fromDate)              params.set("from_date", fromDate);
      if (toDate)                params.set("to_date",   toDate);

      const res  = await fetch(`${API_BASE}/transactions/my?${params}`, { headers: authHdr() });
      const data = await res.json();

      if (data.bool) {
        const list = data.response?.transactions || data.response?.data || [];
        setTransactions(list);
        setTotal(data.response?.total || list.length);
        setTotalPages(data.response?.total_pages || 1);

        /* Build monthly chart from the fetched batch */
        buildMonthlyChart(list);
      } else {
        setError(data.response?.message || "Failed to load transactions.");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, fromDate, toDate, perPage]);

  /* ── Build monthly buy/sell chart ──────────────────────────────────────── */
  const buildMonthlyChart = (list) => {
    const map = {};
    list.forEach(t => {
      const d = t.transacted_at || t.created_at || t.created_on || "";
      if (!d) return;
      const m = d.slice(0, 7); // YYYY-MM
      if (!map[m]) map[m] = { month: d.slice(5, 7), buy: 0, sell: 0 };
      const amt = parseFloat(t.net_amount || t.amount || 0);
      const type = (t.transaction_type || t.txn_type || "").toUpperCase();
      if (type === "BUY")  map[m].buy  += amt;
      if (type === "SELL") map[m].sell += amt;
    });
    setMonthlyChart(Object.values(map).slice(-6));
  };

  /* ── Fetch detail ──────────────────────────────────────────────────────── */
  const fetchDetail = async (txnId) => {
    setDetailLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/transactions/${txnId}`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) setSelected(data.response);
      else setSelected(transactions.find(t => (t.txn_id || t.transaction_id) === txnId));
    } catch {
      setSelected(transactions.find(t => (t.txn_id || t.transaction_id) === txnId));
    } finally {
      setDetailLoading(false);
    }
  };

  /* ── Download statement ────────────────────────────────────────────────── */
  const downloadStatement = async () => {
    try {
      const res  = await fetch(`${API_BASE}/transactions/statement`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool && data.response?.download_url) {
        window.open(data.response.download_url, "_blank");
      } else {
        /* Fallback: export displayed transactions as CSV */
        const csv = [
          ["Date", "Type", "Symbol", "Qty", "Price", "Amount", "Fee", "Net", "Status"].join(","),
          ...transactions.map(t => [
            (t.transacted_at || "").slice(0, 10),
            t.transaction_type || t.txn_type || "",
            t.ticker_symbol || "",
            t.quantity || "",
            t.price_per_unit || "",
            t.amount || "",
            t.fee || "",
            t.net_amount || "",
            t.status || t.txn_status || "",
          ].join(","))
        ].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {}
  };

  /* ── Init ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    fetchWallet();
    fetchSummary();
  }, []);

  useEffect(() => {
    setPage(1);
    fetchTransactions(1);
  }, [typeFilter, fromDate, toDate]);

  /* ── Helpers ───────────────────────────────────────────────────────────── */
  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchTransactions(newPage);
  };

  const clearFilters = () => {
    setTypeFilter("All");
    setFromDate("");
    setToDate("");
    setSearch("");
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return d.slice(0, 10); }
  };

  const fmtAmt = (v) => {
    const n = parseFloat(v || 0);
    return `$${Math.abs(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  /* Client-side search filter */
  const displayed = search
    ? transactions.filter(t =>
        (t.ticker_symbol || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.transaction_type || t.txn_type || "").toLowerCase().includes(search.toLowerCase())
      )
    : transactions;

  /* ── Summary cards data ─────────────────────────────────────────────────── */
  const summaryCards = [
    {
      label:  "Total Invested",
      value:  fmtAmt(summary?.total_invested || summary?.total_buy_amount),
      icon:   TrendingUp,
      color:  "text-emerald-400",
      border: "border-emerald-500/15",
    },
    {
      label:  "Total Sold",
      value:  fmtAmt(summary?.total_sold || summary?.total_sell_amount),
      icon:   TrendingDown,
      color:  "text-red-400",
      border: "border-red-500/15",
    },
    {
      label:  "Dividends",
      value:  fmtAmt(summary?.total_dividends),
      icon:   DollarSign,
      color:  "text-amber-400",
      border: "border-amber-500/15",
    },
    {
      label:  "Wallet Balance",
      value:  fmtAmt(walletData?.balance),
      icon:   Wallet,
      color:  "text-cyan-400",
      border: "border-cyan-500/15",
    },
  ];

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Transactions</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Your complete trading and wallet history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchTransactions(page)}
            className="p-2 rounded-xl bg-[#0C1220] border border-white/8 text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={downloadStatement}
            className="flex items-center gap-2 px-3 py-2 bg-[#0C1220] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
            <Download className="w-4 h-4" />
            <span className="hidden sm:block">Export</span>
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((s, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`bg-[#0C1220] border ${s.border} rounded-2xl p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className="text-xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-gray-600 mt-0.5">
              {s.label === "Wallet Balance" && walletData
                ? `Available: ${fmtAmt(walletData.available_balance)}`
                : `${total} total transactions`}
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Monthly Chart ── */}
      {monthlyChart.length > 0 && (
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="text-sm font-medium text-white mb-4">Monthly Activity</div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart} barSize={16} barGap={4}>
                <XAxis dataKey="month" tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
                  formatter={(v, name) => [`$${parseFloat(v).toLocaleString("en", { maximumFractionDigits: 0 })}`, name === "buy" ? "Bought" : "Sold"]}
                />
                <Bar dataKey="buy"  radius={[3, 3, 0, 0]} fill="#10B981" />
                <Bar dataKey="sell" radius={[3, 3, 0, 0]} fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-xs text-gray-500">Bought</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-xs text-gray-500">Sold</span></div>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="space-y-3">
        {/* Type filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setTypeFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-xl whitespace-nowrap border transition-all ${
                typeFilter === f
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                  : "border-white/8 text-gray-600 hover:text-white"
              }`}>
              {f === "All" ? "All Types" : TYPE_CONFIG[f]?.label || f}
            </button>
          ))}

          <button onClick={() => setShowFilters(!showFilters)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border whitespace-nowrap transition-all ${
              showFilters || fromDate || toDate
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                : "border-white/8 text-gray-600 hover:text-white"
            }`}>
            <Filter className="w-3 h-3" />
            Filters
            {(fromDate || toDate) && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
          </button>
        </div>

        {/* Advanced filters row */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="flex flex-col sm:flex-row gap-3 bg-[#0C1220] border border-white/5 rounded-2xl p-4">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search symbol…"
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30" />
                </div>
                {/* Date from */}
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">From</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/30" />
                </div>
                {/* Date to */}
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">To</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/30" />
                </div>
                {/* Clear */}
                {(fromDate || toDate || search || typeFilter !== "All") && (
                  <button onClick={clearFilters}
                    className="flex items-center gap-1 px-3 py-2.5 text-xs text-gray-400 hover:text-white border border-white/8 rounded-xl transition-colors self-end">
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Transactions Table ── */}
      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="text-sm font-medium text-white">
            Transaction History
            {total > 0 && (
              <span className="ml-2 text-xs text-gray-600">({total} total)</span>
            )}
          </div>
          {(fromDate || toDate || typeFilter !== "All") && (
            <span className="text-xs text-cyan-400 px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              Filtered
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 mx-5 my-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Receipt className="w-12 h-12 text-gray-700" />
            <div className="text-gray-500 text-sm">No transactions found</div>
            <div className="text-gray-700 text-xs">
              {typeFilter !== "All" || fromDate || toDate
                ? "Try adjusting your filters"
                : "Your transaction history will appear here after your first trade"}
            </div>
            {typeFilter !== "All" && (
              <button onClick={clearFilters}
                className="px-4 py-2 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white transition-colors">
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Date", "Type", "Symbol", "Quantity", "Price", "Amount", "Fee", "Net Amount", "Status"].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((t, i) => {
                    const txnId   = t.txn_id || t.transaction_id || t.tx_id || i;
                    const txnType = (t.transaction_type || t.txn_type || "BUY").toUpperCase();
                    const status  = (t.status || t.txn_status || "COMPLETED").toUpperCase();
                    const cfg     = TYPE_CONFIG[txnType]    || TYPE_CONFIG.BUY;
                    const sCfg    = STATUS_CONFIG[status]   || STATUS_CONFIG.COMPLETED;
                    const up      = txnType === "BUY" || txnType === "DEPOSIT" || txnType === "DIVIDEND";

                    return (
                      <motion.tr key={txnId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => fetchDetail(txnId)}
                        className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="text-xs text-gray-400">{fmtDate(t.transacted_at || t.created_at || t.created_on)}</div>
                          <div className="text-xs text-gray-600">{(t.transacted_at || "").slice(11, 16)}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                            <cfg.icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {t.ticker_symbol ? (
                            <div>
                              <div className="text-sm font-bold text-white">{t.ticker_symbol}</div>
                              <div className="text-xs text-gray-600">{t.company_name || ""}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-400">
                          {t.quantity ? parseFloat(t.quantity).toFixed(4) : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-400">
                          {t.price_per_unit ? `$${parseFloat(t.price_per_unit).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-white">
                          {fmtAmt(t.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">
                          {t.fee ? fmtAmt(t.fee) : "—"}
                        </td>
                        <td className={`px-5 py-3.5 text-sm font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>
                          {up ? "+" : "-"}{fmtAmt(t.net_amount || t.amount)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className={`flex items-center gap-1.5 text-xs ${sCfg.color}`}>
                            <sCfg.Icon className="w-3.5 h-3.5" />
                            {status}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-white/5">
                <div className="text-xs text-gray-600">
                  Page {page} of {totalPages} · {total} transactions
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1}
                    className="p-1.5 rounded-lg bg-[#141C30] border border-white/8 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                    return (
                      <button key={p} onClick={() => handlePageChange(p)}
                        className={`w-8 h-8 text-xs rounded-lg border transition-all ${
                          p === page
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                            : "border-white/8 bg-[#141C30] text-gray-500 hover:text-white"
                        }`}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}
                    className="p-1.5 rounded-lg bg-[#141C30] border border-white/8 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Transaction Detail Modal ── */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0C1220] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="text-base font-semibold text-white">Transaction Detail</div>
                <button onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  {/* Type badge */}
                  {(() => {
                    const txnType = (selected.transaction_type || selected.txn_type || "BUY").toUpperCase();
                    const cfg     = TYPE_CONFIG[txnType] || TYPE_CONFIG.BUY;
                    return (
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${cfg.bg}`}>
                          <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
                        </div>
                        <div>
                          <div className="text-base font-bold text-white">{cfg.label} Order</div>
                          <div className="text-xs text-gray-500">
                            {fmtDate(selected.transacted_at || selected.created_at)}
                          </div>
                        </div>
                        <div className="ml-auto">
                          {(() => {
                            const s = (selected.status || selected.txn_status || "COMPLETED").toUpperCase();
                            const sc = STATUS_CONFIG[s] || STATUS_CONFIG.COMPLETED;
                            return (
                              <div className={`flex items-center gap-1.5 text-xs ${sc.color}`}>
                                <sc.Icon className="w-3.5 h-3.5" />
                                {s}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Detail rows */}
                  <div className="bg-[#141C30] rounded-xl p-4 space-y-3">
                    {[
                      ["Transaction ID",  selected.txn_id || selected.transaction_id || "—"],
                      ["Symbol",          selected.ticker_symbol || "—"],
                      ["Quantity",        selected.quantity ? parseFloat(selected.quantity).toFixed(4) : "—"],
                      ["Price per Unit",  selected.price_per_unit ? `$${parseFloat(selected.price_per_unit).toFixed(4)}` : "—"],
                      ["Gross Amount",    fmtAmt(selected.amount)],
                      ["Fee",             selected.fee ? fmtAmt(selected.fee) : "Free"],
                      ["Net Amount",      fmtAmt(selected.net_amount || selected.amount)],
                    ].map(([l, v]) => (
                      <div key={l} className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">{l}</span>
                        <span className="text-white font-medium">{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Action */}
                  {selected.ticker_symbol && (
                    <button
                      onClick={() => { setSelected(null); navigate(`/user/stock/${selected.ticker_symbol}`); }}
                      className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-all">
                      View {selected.ticker_symbol} →
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}