// import { useState, useEffect, useCallback } from "react";
// import { useNavigate } from "react-router";
// import { motion, AnimatePresence } from "motion/react";
// import {
//   TrendingUp, TrendingDown, RefreshCw, Plus, Trash2, Edit2,
//   AlertCircle, CheckCircle, BarChart2, ChevronDown, ChevronUp,
//   Star, X, Loader2, Download, Filter,
// } from "lucide-react";
// import {
//   AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
//   PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
// } from "recharts";

// const API_BASE  = "http://127.0.0.1:5050/v1";
// const getToken  = () => localStorage.getItem("access_token");
// const authHdr   = () => ({
//   Authorization: `Bearer ${getToken()}`,
//   "Content-Type": "application/json",
// });
// const SEC_COLORS = ["#06B6D4","#8B5CF6","#F59E0B","#10B981","#EF4444","#F97316","#EC4899","#64748B"];

// /* ── Currency helpers ────────────────────────────────────────────────────────
//    Platform default currency: INR (Wallets model default='INR', Razorpay=INR)
//    Stock prices use the stock's own `currency` field (INR for NSE/BSE, USD for NYSE/NASDAQ).
//    Portfolio aggregate values (current_value, total_invested, etc.) are in INR.
//    ──────────────────────────────────────────────────────────────────────────── */
// const fmtINR = (v, compact = false) => {
//   const n = Number(v || 0);
//   if (compact) {
//     if (n >= 1e7)  return `₹${(n / 1e7).toFixed(2)}Cr`;
//     if (n >= 1e5)  return `₹${(n / 1e5).toFixed(2)}L`;
//     if (n >= 1e3)  return `₹${(n / 1e3).toFixed(1)}K`;
//   }
//   return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
// };
// const fmtPrice = (v, currency = "INR") =>
//   currency === "USD"
//     ? `₹${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
//     : `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// /* ── Derive return when backend hasn't computed total_return_percent yet ── */
// function deriveReturn(p) {
//   const curr   = parseFloat(p?.current_value  || 0);
//   const invest = parseFloat(p?.total_invested  || 0);
//   const bPct   = parseFloat(p?.total_return_percent || 0);
//   const bAbs   = parseFloat(p?.total_return || 0);
//   if (bPct !== 0 || bAbs !== 0) return { pct: bPct, abs: bAbs };
//   if (invest > 0) {
//     const abs = curr - invest;
//     return { pct: (abs / invest) * 100, abs };
//   }
//   return { pct: 0, abs: 0 };
// }

// /* ── Toast ── */
// function Toast({ msg, ok, onClose }) {
//   useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
//   return (
//     <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
//       className={`fixed top-24 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-medium ${
//         ok ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
//            : "bg-red-500/10 border-red-500/25 text-red-400"}`}>
//       {ok ? <CheckCircle className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
//       {msg}
//     </motion.div>
//   );
// }

// export function UserPortfolio() {
//   const navigate = useNavigate();

//   /* ── State ── */
//   const [portfolios,    setPortfolios]    = useState([]);
//   const [activePortId,  setActivePortId]  = useState(null);
//   const [holdings,      setHoldings]      = useState([]);
//   const [perfHistory,   setPerfHistory]   = useState([]);
//   const [transactions,  setTransactions]  = useState([]);
//   const [loading,       setLoading]       = useState(true);
//   const [perfLoading,   setPerfLoading]   = useState(false);
//   const [toast,         setToast]         = useState(null);
//   const showToast = (msg, ok = true) => setToast({ msg, ok });

//   /* ── UI state ── */
//   const [tab,          setTab]          = useState("holdings");  // holdings | performance | transactions
//   const [perfInterval, setPerfInterval] = useState("DAILY");    // DAILY | WEEKLY | MONTHLY
//   const [sortField,    setSortField]    = useState("current_value");
//   const [sortAsc,      setSortAsc]      = useState(false);
//   const [filterSector, setFilterSector] = useState("All");
//   const [showCreate,   setShowCreate]   = useState(false);
//   const [showEdit,     setShowEdit]     = useState(false);
//   const [showDelete,   setShowDelete]   = useState(false);
//   const [actionLoading,setActionLoading]= useState(false);

//   /* ── Create/Edit form ── */
//   const EMPTY_FORM = { portfolio_name: "", description: "", is_default: false, currency: "INR" };
//   const [form, setForm] = useState(EMPTY_FORM);
//   const updateForm = (k, v) => setForm(p => ({ ...p, [k]: v }));

//   /* ── Transaction filters ── */
//   const [txnType,     setTxnType]     = useState("all");
//   const [txnDateFrom, setTxnDateFrom] = useState("");
//   const [txnDateTo,   setTxnDateTo]   = useState("");
//   const [txnPage,     setTxnPage]     = useState(1);
//   const [txnTotal,    setTxnTotal]    = useState(0);

//   /* ════════════════════════════════════════════════════════════════════════
//      DATA LOADERS
//   ════════════════════════════════════════════════════════════════════════ */
//   const fetchPortfolios = useCallback(async () => {
//     const res  = await fetch(`${API_BASE}/portfolios/my`, { headers: authHdr() });
//     const data = await res.json();
//     if (data.bool) {
//       const ports = data.response?.portfolios || [];
//       setPortfolios(ports);
//       if (ports.length > 0 && !activePortId) {
//         const def = ports.find((p) => p.is_default) || ports[0];
//         setActivePortId(def.portfolio_id);
//         return def.portfolio_id;
//       }
//     }
//     return activePortId;
//   }, [activePortId]);

//   const fetchHoldings = useCallback(async (portId) => {
//     if (!portId) return;
//     const res  = await fetch(`${API_BASE}/portfolios/${portId}`, { headers: authHdr() });
//     const data = await res.json();
//     if (data.bool) setHoldings(data.response?.holdings || []);
//   }, []);

//   const fetchPerformance = useCallback(async (portId, interval = "DAILY") => {
//     if (!portId) return;
//     setPerfLoading(true);
//     try {
//       const res  = await fetch(
//         `${API_BASE}/portfolios/${portId}/performance?interval=${interval}&limit=180`,
//         { headers: authHdr() }
//       );
//       const data = await res.json();
//       if (data.bool) {
//         const pts = data.response?.data || [];
//         setPerfHistory(
//           pts.map((p) => ({
//             date:       (p.date || "").slice(5),
//             value:      parseFloat(p.total_value      || p.portfolio_value || 0),
//             invested:   parseFloat(p.total_invested   || 0),
//             return_pct: parseFloat(p.return_percent   || p.day_return_percent || 0),
//             day_pnl:    parseFloat(p.day_pnl          || 0),
//           }))
//         );
//       }
//     } catch {}
//     finally { setPerfLoading(false); }
//   }, []);

//   const fetchTransactions = useCallback(async (portId, type = "all", from = "", to = "", page = 1) => {
//     if (!portId) return;
//     try {
//       const params = new URLSearchParams({ portfolio_id: portId, per_page: 20, page });
//       if (type !== "all") params.set("type", type.toUpperCase());
//       if (from) params.set("from_date", from);
//       if (to)   params.set("to_date",   to);
//       const res  = await fetch(`${API_BASE}/transactions/my?${params}`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) {
//         setTransactions(data.response?.transactions || data.response?.data || []);
//         setTxnTotal(data.response?.total || 0);
//       }
//     } catch {}
//   }, []);

//   const loadAll = useCallback(async () => {
//     setLoading(true);
//     try {
//       const portId = await fetchPortfolios();
//       if (portId) {
//         await Promise.allSettled([
//           fetchHoldings(portId),
//           fetchPerformance(portId, perfInterval),
//           fetchTransactions(portId),
//         ]);
//       }
//     } catch {}
//     finally { setLoading(false); }
//   }, [fetchPortfolios, fetchHoldings, fetchPerformance, fetchTransactions, perfInterval]);

//   useEffect(() => { loadAll(); }, []); // eslint-disable-line

//   /* Switch portfolio */
//   const switchPortfolio = async (portId) => {
//     setActivePortId(portId);
//     setHoldings([]);
//     setPerfHistory([]);
//     setTransactions([]);
//     await Promise.allSettled([
//       fetchHoldings(portId),
//       fetchPerformance(portId, perfInterval),
//       fetchTransactions(portId, txnType, txnDateFrom, txnDateTo, 1),
//     ]);
//   };

//   /* Switch performance interval */
//   const switchPerfInterval = async (interval) => {
//     setPerfInterval(interval);
//     await fetchPerformance(activePortId, interval);
//   };

//   /* Refresh transactions with filters */
//   const applyTxnFilters = () =>
//     fetchTransactions(activePortId, txnType, txnDateFrom, txnDateTo, 1);

//   /* ════════════════════════════════════════════════════════════════════════
//      PORTFOLIO CRUD
//   ════════════════════════════════════════════════════════════════════════ */
//   const handleCreatePortfolio = async () => {
//     if (!form.portfolio_name.trim()) { showToast("Portfolio name is required.", false); return; }
//     setActionLoading(true);
//     try {
//       const res  = await fetch(`${API_BASE}/portfolios/create`, {
//         method: "POST", headers: authHdr(),
//         body:   JSON.stringify({
//           portfolio_name: form.portfolio_name.trim(),
//           description:    form.description.trim(),
//           is_default:     form.is_default,
//           currency:       form.currency || "INR",
//         }),
//       });
//       const data = await res.json();
//       if (data.bool) {
//         showToast("Portfolio created.");
//         setShowCreate(false);
//         setForm(EMPTY_FORM);
//         await loadAll();
//       } else {
//         showToast(data.response?.message || "Failed to create.", false);
//       }
//     } catch { showToast("Network error.", false); }
//     finally { setActionLoading(false); }
//   };

//   const handleEditPortfolio = async () => {
//     if (!form.portfolio_name.trim()) { showToast("Name required.", false); return; }
//     setActionLoading(true);
//     try {
//       const res  = await fetch(`${API_BASE}/portfolios/${activePortId}`, {
//         method: "PUT", headers: authHdr(),
//         body:   JSON.stringify({
//           portfolio_name: form.portfolio_name.trim(),
//           description:    form.description.trim(),
//           is_default:     form.is_default,
//           currency:       form.currency || "INR",
//         }),
//       });
//       const data = await res.json();
//       if (data.bool) {
//         showToast("Portfolio updated.");
//         setShowEdit(false);
//         setForm(EMPTY_FORM);
//         await fetchPortfolios();
//       } else {
//         showToast(data.response?.message || "Failed.", false);
//       }
//     } catch { showToast("Network error.", false); }
//     finally { setActionLoading(false); }
//   };

//   const handleDeletePortfolio = async () => {
//     if (portfolios.length <= 1) { showToast("Cannot delete your only portfolio.", false); return; }
//     setActionLoading(true);
//     try {
//       const res  = await fetch(`${API_BASE}/portfolios/${activePortId}`, {
//         method: "DELETE", headers: authHdr(),
//       });
//       const data = await res.json();
//       if (data.bool) {
//         showToast("Portfolio deleted.");
//         setShowDelete(false);
//         setActivePortId(null);
//         await loadAll();
//       } else {
//         showToast(data.response?.message || "Failed.", false);
//       }
//     } catch { showToast("Network error.", false); }
//     finally { setActionLoading(false); }
//   };

//   const openEdit = () => {
//     const p = portfolios.find((x) => x.portfolio_id === activePortId);
//     if (p) {
//       setForm({
//         portfolio_name: p.portfolio_name || "",
//         description:    p.description    || "",
//         is_default:     p.is_default     || false,
//         currency:       p.currency       || "INR",
//       });
//       setShowEdit(true);
//     }
//   };

//   /* ════════════════════════════════════════════════════════════════════════
//      DERIVED VALUES
//   ════════════════════════════════════════════════════════════════════════ */
//   const activePort     = portfolios.find((p) => p.portfolio_id === activePortId) || null;
//   const { pct: retPct, abs: retAbs } = deriveReturn(activePort);
//   const totalValue     = parseFloat(activePort?.current_value  || 0);
//   const totalInvested  = parseFloat(activePort?.total_invested  || 0);
//   const dayPnl         = parseFloat(activePort?.day_pnl        || activePort?.today_pnl || 0);
//   const dayPct         = parseFloat(activePort?.day_return_percent || activePort?.today_return_percent || 0);
//   const dividendIncome = parseFloat(activePort?.total_dividends || 0);
//   const portfolioCurr  = activePort?.currency || "INR";
//   const up             = retAbs >= 0;
//   const dayUp          = dayPnl >= 0;

//   /* Sector allocation */
//   const sectorMap = {};
//   holdings.forEach((h) => {
//     const s = h.sector || "Other";
//     sectorMap[s] = (sectorMap[s] || 0) + parseFloat(h.current_value || 0);
//   });
//   const secData = Object.entries(sectorMap)
//     .sort((a, b) => b[1] - a[1])
//     .map(([name, val], i) => ({
//       name,
//       value: totalValue > 0 ? parseFloat(((val / totalValue) * 100).toFixed(1)) : 0,
//       color: SEC_COLORS[i % SEC_COLORS.length],
//     }));

//   /* Holdings sort + filter */
//   const allSectors = ["All", ...Array.from(new Set(holdings.map((h) => h.sector || "Other"))).sort()];
//   const sortedHoldings = [...holdings]
//     .filter((h) => filterSector === "All" || (h.sector || "Other") === filterSector)
//     .sort((a, b) => {
//       const va = parseFloat(a[sortField] || 0);
//       const vb = parseFloat(b[sortField] || 0);
//       return sortAsc ? va - vb : vb - va;
//     });

//   const SortHeader = ({ field, label }) => (
//     <th
//       className="px-4 py-3 text-left text-xs text-gray-600 font-medium cursor-pointer hover:text-gray-300 whitespace-nowrap select-none"
//       onClick={() => { if (sortField === field) setSortAsc(!sortAsc); else { setSortField(field); setSortAsc(false); } }}
//     >
//       <div className="flex items-center gap-1">
//         {label}
//         {sortField === field
//           ? sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
//           : <ChevronDown className="w-3 h-3 opacity-30" />}
//       </div>
//     </th>
//   );

//   /* ── Form modal (shared for create and edit) ── */
//   const PortfolioFormModal = ({ title, onSubmit, onClose }) => (
//     <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//       <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }}
//         className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
//         <div className="flex items-center justify-between">
//           <h3 className="text-base font-bold text-white">{title}</h3>
//           <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
//         </div>
//         <div>
//           <label className="text-xs text-gray-500 mb-1.5 block">Portfolio Name <span className="text-red-400">*</span></label>
//           <input type="text" value={form.portfolio_name} onChange={(e) => updateForm("portfolio_name", e.target.value)}
//             placeholder="e.g. Long-term Growth"
//             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
//         </div>
//         <div>
//           <label className="text-xs text-gray-500 mb-1.5 block">Description</label>
//           <textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)}
//             placeholder="Optional description…" rows={2}
//             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30 resize-none" />
//         </div>
//         <div>
//           <label className="text-xs text-gray-500 mb-1.5 block">Base Currency</label>
//           <select value={form.currency} onChange={(e) => updateForm("currency", e.target.value)}
//             className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30">
//             <option value="INR">₹ INR — Indian Rupee (Default)</option>
//             <option value="USD">$ USD — US Dollar</option>
//           </select>
//           <p className="text-xs text-gray-700 mt-1">Platform trades & wallet use INR by default (Razorpay).</p>
//         </div>
//         <div className="flex items-center gap-3">
//           <button
//             onClick={() => updateForm("is_default", !form.is_default)}
//             className={`relative w-10 h-5.5 rounded-full transition-colors ${form.is_default ? "bg-cyan-500" : "bg-white/10"}`}>
//             <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_default ? "translate-x-5" : "translate-x-0.5"}`} />
//           </button>
//           <span className="text-xs text-gray-400">Set as default portfolio</span>
//         </div>
//         <div className="flex gap-3 pt-1">
//           <button onClick={onClose} className="flex-1 py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white">
//             Cancel
//           </button>
//           <button onClick={onSubmit} disabled={actionLoading}
//             className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium text-white hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-60">
//             {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
//             {title}
//           </button>
//         </div>
//       </motion.div>
//     </div>
//   );

//   /* ════════════════════════════════════════════════════════════════════════
//      RENDER
//   ════════════════════════════════════════════════════════════════════════ */
//   if (loading) {
//     return (
//       <div className="flex flex-col items-center justify-center h-96 gap-3">
//         <div className="w-9 h-9 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
//         <p className="text-sm text-gray-500">Loading portfolios…</p>
//       </div>
//     );
//   }

//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">

//       <AnimatePresence>
//         {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
//       </AnimatePresence>

//       {/* Create Modal */}
//       <AnimatePresence>
//         {showCreate && (
//           <PortfolioFormModal
//             title="Create Portfolio"
//             onSubmit={handleCreatePortfolio}
//             onClose={() => { setShowCreate(false); setForm(EMPTY_FORM); }}
//           />
//         )}
//       </AnimatePresence>

//       {/* Edit Modal */}
//       <AnimatePresence>
//         {showEdit && (
//           <PortfolioFormModal
//             title="Edit Portfolio"
//             onSubmit={handleEditPortfolio}
//             onClose={() => { setShowEdit(false); setForm(EMPTY_FORM); }}
//           />
//         )}
//       </AnimatePresence>

//       {/* Delete Confirm */}
//       <AnimatePresence>
//         {showDelete && (
//           <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }}
//               className="bg-[#0C1220] border border-red-500/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
//               <h3 className="text-base font-bold text-white mb-2">Delete Portfolio?</h3>
//               <p className="text-sm text-gray-400 mb-5">
//                 <span className="text-red-400 font-medium">{activePort?.portfolio_name}</span> and all its records will be permanently removed.
//               </p>
//               <div className="flex gap-3">
//                 <button onClick={() => setShowDelete(false)} className="flex-1 py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white">Cancel</button>
//                 <button onClick={handleDeletePortfolio} disabled={actionLoading}
//                   className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-60">
//                   {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
//                   Delete
//                 </button>
//               </div>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>

//       {/* ── Header ── */}
//       <div className="flex items-center justify-between flex-wrap gap-3">
//         <div>
//           <h1 className="text-xl font-bold text-white">My Portfolio</h1>
//           <p className="text-sm text-gray-500 mt-0.5">Track your investments and performance in ₹ INR</p>
//         </div>
//         <div className="flex items-center gap-2">
//           <button onClick={loadAll} className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
//             <RefreshCw className="w-4 h-4" />
//           </button>
//           <button onClick={() => navigate("/user/trade")}
//             className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium text-white hover:opacity-90 shadow-lg shadow-cyan-500/15">
//             <Plus className="w-4 h-4" />New Trade
//           </button>
//         </div>
//       </div>

//       {/* ── Portfolio Switcher ── */}
//       <div className="flex flex-wrap items-center gap-2">
//         {portfolios.map((p) => (
//           <button key={p.portfolio_id}
//             onClick={() => switchPortfolio(p.portfolio_id)}
//             className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-all ${
//               activePortId === p.portfolio_id
//                 ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
//                 : "border-white/8 bg-[#0C1220] text-gray-500 hover:text-white hover:border-white/15"
//             }`}>
//             {p.is_default && <Star className="w-3 h-3 text-amber-400" />}
//             {p.portfolio_name}
//             <span className={`text-xs px-1.5 py-0.5 rounded-md ${p.currency === "USD" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"}`}>
//               {p.currency || "INR"}
//             </span>
//           </button>
//         ))}
//         <button onClick={() => { setForm(EMPTY_FORM); setShowCreate(true); }}
//           className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-dashed border-white/15 text-gray-500 hover:text-white hover:border-white/25 transition-all">
//           <Plus className="w-3.5 h-3.5" />New Portfolio
//         </button>
//         {activePort && (
//           <>
//             <button onClick={openEdit} className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-500 hover:text-white transition-colors">
//               <Edit2 className="w-3.5 h-3.5" />
//             </button>
//             {portfolios.length > 1 && (
//               <button onClick={() => setShowDelete(true)} className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-500 hover:text-red-400 transition-colors">
//                 <Trash2 className="w-3.5 h-3.5" />
//               </button>
//             )}
//           </>
//         )}
//       </div>

//       {/* ── Summary KPI Cards ── */}
//       <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
//         {[
//           {
//             label: "Portfolio Value",
//             value: fmtINR(totalValue, true),
//             sub:   portfolioCurr,
//             color: "text-white",
//             bg:    "border-white/5",
//           },
//           {
//             label: "Total Invested",
//             value: fmtINR(totalInvested, true),
//             sub:   totalValue > 0 && totalInvested > 0 ? `${((totalValue / totalInvested) * 100).toFixed(1)}% of cost` : "—",
//             color: "text-gray-300",
//             bg:    "border-white/5",
//           },
//           {
//             label: "Total Return",
//             value: `${up?"+":""}${retPct.toFixed(1)}%`,
//             sub:   `${up?"+":"-"}${fmtINR(Math.abs(retAbs), true)}`,
//             color: up ? "text-emerald-400" : "text-red-400",
//             bg:    up ? "border-emerald-500/15" : "border-red-500/15",
//           },
//           {
//             label: "Today's P&L",
//             value: `${dayUp?"+":""}${fmtINR(dayPnl, true)}`,
//             sub:   `${dayUp?"+":""}${dayPct.toFixed(2)}%`,
//             color: dayUp ? "text-emerald-400" : "text-red-400",
//             bg:    dayUp ? "border-emerald-500/15" : "border-red-500/15",
//           },
//           {
//             label: "Dividends",
//             value: fmtINR(dividendIncome, true),
//             sub:   "income received",
//             color: "text-amber-400",
//             bg:    "border-amber-500/15",
//           },
//         ].map((s, i) => (
//           <motion.div key={i} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.06 }}
//             className={`bg-[#0C1220] border ${s.bg} rounded-2xl p-4`}>
//             <div className="text-xs text-gray-500 mb-1.5">{s.label}</div>
//             <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
//             <div className="text-xs text-gray-600 mt-0.5">{s.sub}</div>
//           </motion.div>
//         ))}
//       </div>

//       {/* ── Tabs ── */}
//       <div className="flex gap-1 p-1 bg-[#0C1220] border border-white/5 rounded-2xl w-fit">
//         {[
//           { key: "holdings",     label: "Holdings" },
//           { key: "performance",  label: "Performance" },
//           { key: "transactions", label: "Transactions" },
//         ].map(({ key, label }) => (
//           <button key={key} onClick={() => setTab(key)}
//             className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
//               tab === key
//                 ? "bg-gradient-to-r from-cyan-500/20 to-blue-600/10 text-cyan-300 border border-cyan-500/20"
//                 : "text-gray-500 hover:text-gray-300"
//             }`}>
//             {label}
//           </button>
//         ))}
//       </div>

//       {/* ════════════════ HOLDINGS TAB ════════════════ */}
//       {tab === "holdings" && (
//         <div className="space-y-5">
//           <div className="grid lg:grid-cols-3 gap-5">
//             {/* Holdings Table */}
//             <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//               <div className="flex flex-wrap items-center justify-between px-5 py-4 border-b border-white/5 gap-2">
//                 <div className="text-sm font-medium text-white">
//                   {sortedHoldings.length} Holding{sortedHoldings.length !== 1 ? "s" : ""}
//                 </div>
//                 <div className="flex items-center gap-2">
//                   <Filter className="w-3.5 h-3.5 text-gray-600" />
//                   <select value={filterSector} onChange={(e) => setFilterSector(e.target.value)}
//                     className="bg-[#141C30] border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none">
//                     {allSectors.map((s) => <option key={s} value={s}>{s}</option>)}
//                   </select>
//                 </div>
//               </div>

//               {sortedHoldings.length > 0 ? (
//                 <div className="overflow-x-auto">
//                   <table className="w-full">
//                     <thead>
//                       <tr className="border-b border-white/5">
//                         <th className="px-4 py-3 text-left text-xs text-gray-600 font-medium">Symbol</th>
//                         <SortHeader field="quantity"         label="Qty" />
//                         <SortHeader field="average_buy_price"label="Avg Cost" />
//                         <SortHeader field="current_price"    label="CMP" />
//                         <SortHeader field="current_value"    label="Value" />
//                         <SortHeader field="unrealized_pnl"   label="Unrealized P&L" />
//                         <SortHeader field="unrealized_pnl_percent" label="Return" />
//                         <th className="px-4 py-3 text-left text-xs text-gray-600 font-medium">Alloc %</th>
//                         <th className="px-4 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">52W Range</th>
//                       </tr>
//                     </thead>
//                     <tbody>
//                       {sortedHoldings.map((h, i) => {
//                         const pnl    = parseFloat(h.unrealized_pnl         || 0);
//                         const pnlPct = parseFloat(h.unrealized_pnl_percent || 0);
//                         const hUp    = pnl >= 0;
//                         const hCurr  = h.currency || "INR";
//                         const alloc  = totalValue > 0
//                           ? ((parseFloat(h.current_value || 0) / totalValue) * 100).toFixed(1)
//                           : "0";
//                         /* 52W range bar */
//                         const low    = parseFloat(h.week_52_low  || 0);
//                         const high   = parseFloat(h.week_52_high || 0);
//                         const curr   = parseFloat(h.current_price || 0);
//                         const range  = high - low;
//                         const barPct = range > 0 ? Math.min(100, Math.max(0, ((curr - low) / range) * 100)) : 0;
//                         return (
//                           <motion.tr key={h.holding_id || h.stock_id || i}
//                             initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay: i*0.03 }}
//                             onClick={() => navigate(`/user/stock/${h.ticker_symbol}`)}
//                             className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group">
//                             <td className="px-4 py-3">
//                               <div className="flex items-center gap-2.5">
//                                 {h.logo_url ? (
//                                   <img src={h.logo_url} alt={h.ticker_symbol}
//                                     className="w-7 h-7 rounded-lg object-contain bg-white/5"
//                                     onError={(e) => { e.target.style.display="none"; }} />
//                                 ) : (
//                                   <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center flex-shrink-0">
//                                     <span className="text-[9px] font-bold text-cyan-400">{(h.ticker_symbol||"").slice(0,2)}</span>
//                                   </div>
//                                 )}
//                                 <div className="min-w-0">
//                                   <div className="text-sm font-bold text-white">{h.ticker_symbol}</div>
//                                   <div className="text-xs text-gray-600 truncate max-w-[80px]">{h.sector || h.exchange || "—"}</div>
//                                 </div>
//                               </div>
//                             </td>
//                             <td className="px-4 py-3 text-sm text-gray-400">
//                               {parseFloat(h.quantity || 0).toFixed(2)}
//                             </td>
//                             <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
//                               {fmtPrice(h.average_buy_price, hCurr)}
//                             </td>
//                             <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
//                               {fmtPrice(h.current_price, hCurr)}
//                             </td>
//                             <td className="px-4 py-3 text-sm font-medium text-white whitespace-nowrap">
//                               {fmtINR(h.current_value, true)}
//                             </td>
//                             <td className={`px-4 py-3 text-sm whitespace-nowrap ${hUp ? "text-emerald-400" : "text-red-400"}`}>
//                               {hUp?"+":"-"}{fmtINR(Math.abs(pnl), true)}
//                             </td>
//                             <td className={`px-4 py-3 text-sm font-medium ${hUp ? "text-emerald-400" : "text-red-400"}`}>
//                               <div className="flex items-center gap-1">
//                                 {hUp ? <TrendingUp className="w-3.5 h-3.5"/> : <TrendingDown className="w-3.5 h-3.5"/>}
//                                 {hUp?"+":""}{pnlPct.toFixed(1)}%
//                               </div>
//                             </td>
//                             <td className="px-4 py-3">
//                               <div className="flex items-center gap-1.5">
//                                 <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
//                                   <div className="h-full bg-cyan-500 rounded-full" style={{ width:`${alloc}%` }} />
//                                 </div>
//                                 <span className="text-xs text-gray-500">{alloc}%</span>
//                               </div>
//                             </td>
//                             <td className="px-4 py-3">
//                               {high > 0 ? (
//                                 <div>
//                                   <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden mb-1">
//                                     <div className="h-full bg-violet-500 rounded-full" style={{ width:`${barPct}%` }} />
//                                   </div>
//                                   <div className="flex justify-between text-[9px] text-gray-700">
//                                     <span>{fmtPrice(low, hCurr).replace(/\.00$/,"")}</span>
//                                     <span>{fmtPrice(high, hCurr).replace(/\.00$/,"")}</span>
//                                   </div>
//                                 </div>
//                               ) : <span className="text-xs text-gray-700">—</span>}
//                             </td>
//                           </motion.tr>
//                         );
//                       })}
//                     </tbody>
//                   </table>
//                 </div>
//               ) : (
//                 <div className="py-14 text-center text-sm text-gray-600">
//                   No holdings in this portfolio.{" "}
//                   <button onClick={() => navigate("/user/trade")} className="text-cyan-400 hover:underline">
//                     Start trading
//                   </button>
//                 </div>
//               )}
//             </div>

//             {/* Allocation pie */}
//             <div className="space-y-4">
//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="text-sm font-medium text-white mb-4">Sector Allocation</div>
//                 {secData.length > 0 ? (
//                   <>
//                     <div className="h-44 mb-3">
//                       <ResponsiveContainer width="100%" height="100%">
//                         <PieChart>
//                           <Pie data={secData} cx="50%" cy="50%" innerRadius={42} outerRadius={72}
//                             dataKey="value" paddingAngle={3}>
//                             {secData.map((e, i) => <Cell key={i} fill={e.color} />)}
//                           </Pie>
//                           <Tooltip
//                             contentStyle={{ background:"#0C1220", border:"1px solid rgba(255,255,255,.08)", borderRadius:12, fontSize:11 }}
//                             formatter={(v) => [`${v}%`, ""]} />
//                         </PieChart>
//                       </ResponsiveContainer>
//                     </div>
//                     <div className="space-y-1.5">
//                       {secData.map((s, i) => (
//                         <div key={i} className="flex items-center justify-between">
//                           <div className="flex items-center gap-2">
//                             <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
//                             <span className="text-xs text-gray-400">{s.name}</span>
//                           </div>
//                           <span className="text-xs text-white">{s.value}%</span>
//                         </div>
//                       ))}
//                     </div>
//                   </>
//                 ) : (
//                   <div className="text-xs text-gray-600 text-center py-8">No holdings data</div>
//                 )}
//               </div>

//               {/* Portfolio info card */}
//               {activePort && (
//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5 space-y-2.5">
//                   <div className="text-sm font-medium text-white mb-3">Portfolio Details</div>
//                   {[
//                     { label:"Name",         value: activePort.portfolio_name },
//                     { label:"Currency",     value: activePort.currency || "INR" },
//                     { label:"Default",      value: activePort.is_default ? "Yes ⭐" : "No" },
//                     { label:"Holdings",     value: `${holdings.length} stocks` },
//                     { label:"Avg Cost",     value: fmtINR(activePort.average_buy_price || 0, true) },
//                     { label:"Total Invested",value:fmtINR(totalInvested, true) },
//                     { label:"Dividends",    value: fmtINR(dividendIncome, true) },
//                     { label:"Created",      value: activePort.created_on ? new Date(activePort.created_on).toLocaleDateString("en-IN") : "—" },
//                   ].map(({ label, value }, i) => (
//                     <div key={i} className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
//                       <span className="text-xs text-gray-600">{label}</span>
//                       <span className="text-xs text-white font-medium">{value}</span>
//                     </div>
//                   ))}
//                   {activePort.description && (
//                     <p className="text-xs text-gray-600 pt-1">{activePort.description}</p>
//                   )}
//                 </div>
//               )}
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ════════════════ PERFORMANCE TAB ════════════════ */}
//       {tab === "performance" && (
//         <div className="space-y-5">
//           {/* Interval selector */}
//           <div className="flex gap-2 flex-wrap">
//             {["DAILY","WEEKLY","MONTHLY"].map((iv) => (
//               <button key={iv} onClick={() => switchPerfInterval(iv)}
//                 className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
//                   perfInterval === iv
//                     ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
//                     : "border-white/8 text-gray-500 hover:text-white"
//                 }`}>
//                 {iv.charAt(0)+iv.slice(1).toLowerCase()}
//               </button>
//             ))}
//           </div>

//           {/* Value vs Invested chart */}
//           <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//             <div className="flex items-center justify-between mb-4">
//               <div>
//                 <div className="text-xs text-gray-500 mb-0.5">Portfolio Value vs Cost (₹ INR)</div>
//                 <div className="text-2xl font-bold text-white">{fmtINR(totalValue)}</div>
//                 <div className={`flex items-center gap-1.5 mt-0.5 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
//                   {up ? <TrendingUp className="w-3.5 h-3.5"/> : <TrendingDown className="w-3.5 h-3.5"/>}
//                   {up?"+":""}{retPct.toFixed(2)}% ({up?"+":"-"}{fmtINR(Math.abs(retAbs), true)})
//                 </div>
//               </div>
//             </div>
//             <div className="h-64">
//               {perfLoading ? (
//                 <div className="flex items-center justify-center h-full">
//                   <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
//                 </div>
//               ) : perfHistory.length > 0 ? (
//                 <ResponsiveContainer width="100%" height="100%">
//                   <AreaChart data={perfHistory}>
//                     <defs>
//                       <linearGradient id="perfGradV" x1="0" y1="0" x2="0" y2="1">
//                         <stop offset="5%"  stopColor="#06B6D4" stopOpacity={0.22} />
//                         <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
//                       </linearGradient>
//                       <linearGradient id="perfGradI" x1="0" y1="0" x2="0" y2="1">
//                         <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.12} />
//                         <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
//                       </linearGradient>
//                     </defs>
//                     <XAxis dataKey="date" tick={{ fill:"#4B5563", fontSize:10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
//                     <YAxis tick={{ fill:"#4B5563", fontSize:10 }} tickLine={false} axisLine={false}
//                       tickFormatter={(v) => v >= 1e5 ? `₹${(v/1e5).toFixed(1)}L` : `₹${(v/1e3).toFixed(0)}K`} />
//                     <Tooltip contentStyle={{ background:"#0C1220", border:"1px solid rgba(255,255,255,.08)", borderRadius:12, fontSize:11 }}
//                       formatter={(v, name) => [fmtINR(v), name === "value" ? "Portfolio" : "Invested"]} />
//                     <Area type="monotone" dataKey="value"    stroke="#06B6D4" strokeWidth={2} fill="url(#perfGradV)" dot={false} name="value" />
//                     <Area type="monotone" dataKey="invested" stroke="#8B5CF6" strokeWidth={1.5} fill="url(#perfGradI)" dot={false} strokeDasharray="4 2" name="invested" />
//                   </AreaChart>
//                 </ResponsiveContainer>
//               ) : (
//                 <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-gray-600">
//                   <BarChart2 className="w-8 h-8 text-gray-700" />
//                   No performance history yet
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Daily return % chart */}
//           <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//             <div className="text-sm font-medium text-white mb-4">Daily Return (%)</div>
//             <div className="h-40">
//               {perfHistory.length > 0 ? (
//                 <ResponsiveContainer width="100%" height="100%">
//                   <LineChart data={perfHistory}>
//                     <XAxis dataKey="date" tick={{ fill:"#4B5563", fontSize:10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
//                     <YAxis tick={{ fill:"#4B5563", fontSize:10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`} />
//                     <Tooltip contentStyle={{ background:"#0C1220", border:"1px solid rgba(255,255,255,.08)", borderRadius:12, fontSize:11 }}
//                       formatter={(v) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Return"]} />
//                     <Line type="monotone" dataKey="return_pct" stroke="#10B981" strokeWidth={1.5} dot={false} />
//                   </LineChart>
//                 </ResponsiveContainer>
//               ) : (
//                 <div className="flex items-center justify-center h-full text-sm text-gray-600">No data</div>
//               )}
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ════════════════ TRANSACTIONS TAB ════════════════ */}
//       {tab === "transactions" && (
//         <div className="space-y-4">
//           {/* Filters */}
//           <div className="flex flex-wrap gap-3 items-center p-4 bg-[#0C1220] border border-white/5 rounded-2xl">
//             <div className="flex gap-2 flex-wrap">
//               {["all","BUY","SELL","DIVIDEND","DEPOSIT","WITHDRAWAL","FEE"].map((t) => (
//                 <button key={t} onClick={() => setTxnType(t)}
//                   className={`px-3 py-1.5 text-xs rounded-xl border capitalize transition-all ${
//                     txnType === t
//                       ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
//                       : "border-white/8 text-gray-600 hover:text-white"
//                   }`}>
//                   {t.toLowerCase()}
//                 </button>
//               ))}
//             </div>
//             <div className="flex items-center gap-2 ml-auto flex-wrap">
//               <input type="date" value={txnDateFrom} onChange={(e) => setTxnDateFrom(e.target.value)}
//                 className="bg-[#141C30] border border-white/8 rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none" />
//               <span className="text-xs text-gray-600">to</span>
//               <input type="date" value={txnDateTo} onChange={(e) => setTxnDateTo(e.target.value)}
//                 className="bg-[#141C30] border border-white/8 rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none" />
//               <button onClick={applyTxnFilters}
//                 className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-xs text-cyan-300 hover:bg-cyan-500/20 transition-all">
//                 Apply
//               </button>
//             </div>
//           </div>

//           {/* Transaction table */}
//           <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//             <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//               <div className="text-sm font-medium text-white">
//                 Transactions
//                 {txnTotal > 0 && <span className="ml-2 text-xs text-gray-600">({txnTotal} total)</span>}
//               </div>
//               <button onClick={() => {
//                   const link = document.createElement("a");
//                   link.href = `${API_BASE}/transactions/statement?portfolio_id=${activePortId}&token=${getToken()}`;
//                   link.download = `transactions_${activePortId}.csv`;
//                   link.click();
//                 }}
//                 className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-400 hover:text-white transition-colors">
//                 <Download className="w-3.5 h-3.5" />Export CSV
//               </button>
//             </div>
//             {transactions.length > 0 ? (
//               <div className="overflow-x-auto">
//                 <table className="w-full">
//                   <thead>
//                     <tr className="border-b border-white/5">
//                       {["Type","Symbol","Qty","Price","Gross","Fee","Net Amount","Status","Date"].map((h) => (
//                         <th key={h} className="px-4 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                       ))}
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {transactions.map((t, i) => {
//                       const tType   = t.txn_type  || t.transaction_type || "";
//                       const tStatus = t.txn_status || t.status          || "";
//                       const isBuy   = tType === "BUY";
//                       const isSell  = tType === "SELL";
//                       const tCurr   = t.currency || "INR";
//                       return (
//                         <motion.tr key={t.txn_id || t.transaction_id || i}
//                           initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay: i*0.03 }}
//                           className="border-b border-white/5 hover:bg-white/5 transition-colors">
//                           <td className="px-4 py-3">
//                             <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
//                               isBuy   ? "bg-emerald-500/10 text-emerald-400"
//                               : isSell? "bg-red-500/10 text-red-400"
//                               : "bg-blue-500/10 text-blue-400"
//                             }`}>{tType || "—"}</span>
//                           </td>
//                           <td className="px-4 py-3">
//                             {t.ticker_symbol || t.symbol ? (
//                               <button onClick={() => navigate(`/user/stock/${t.ticker_symbol || t.symbol}`)}
//                                 className="text-sm font-bold text-white hover:text-cyan-400 transition-colors">
//                                 {t.ticker_symbol || t.symbol}
//                               </button>
//                             ) : <span className="text-xs text-gray-600">—</span>}
//                           </td>
//                           <td className="px-4 py-3 text-sm text-gray-400">
//                             {t.quantity ? parseFloat(t.quantity).toFixed(2) : "—"}
//                           </td>
//                           <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
//                             {t.price_per_unit ? fmtPrice(t.price_per_unit, tCurr) : "—"}
//                           </td>
//                           <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
//                             {fmtINR(t.gross_amount || 0, true)}
//                           </td>
//                           <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
//                             {t.fee > 0 ? fmtINR(t.fee, true) : "—"}
//                           </td>
//                           <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${
//                             isBuy ? "text-red-400" : "text-emerald-400"
//                           }`}>
//                             {isBuy ? "-" : "+"}{fmtINR(Math.abs(t.net_amount || 0), true)}
//                           </td>
//                           <td className="px-4 py-3">
//                             <span className={`text-xs px-2 py-0.5 rounded-full ${
//                               ["COMPLETED","FILLED","SUCCESS"].includes(tStatus)
//                                 ? "bg-emerald-500/10 text-emerald-400"
//                                 : tStatus === "PENDING"
//                                   ? "bg-amber-500/10 text-amber-400"
//                                   : "bg-gray-500/10 text-gray-500"
//                             }`}>{tStatus || "—"}</span>
//                           </td>
//                           <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
//                             {(t.transacted_at || t.created_on)
//                               ? new Date(t.transacted_at || t.created_on).toLocaleString("en-IN", { dateStyle:"short", timeStyle:"short" })
//                               : "—"}
//                           </td>
//                         </motion.tr>
//                       );
//                     })}
//                   </tbody>
//                 </table>
//               </div>
//             ) : (
//               <div className="py-14 text-center text-sm text-gray-600">
//                 No transactions found{txnType !== "all" ? ` of type "${txnType}"` : ""}.
//               </div>
//             )}

//             {/* Pagination */}
//             {txnTotal > 20 && (
//               <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-white/5">
//                 <button onClick={() => { const p = Math.max(1, txnPage-1); setTxnPage(p); fetchTransactions(activePortId, txnType, txnDateFrom, txnDateTo, p); }}
//                   disabled={txnPage === 1}
//                   className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors">
//                   Previous
//                 </button>
//                 <span className="text-xs text-gray-500">Page {txnPage} of {Math.ceil(txnTotal / 20)}</span>
//                 <button onClick={() => { const p = txnPage+1; setTxnPage(p); fetchTransactions(activePortId, txnType, txnDateFrom, txnDateTo, p); }}
//                   disabled={txnPage >= Math.ceil(txnTotal / 20)}
//                   className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors">
//                   Next
//                 </button>
//               </div>
//             )}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

























import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  TrendingUp, TrendingDown, ArrowUpRight, Download,
  RefreshCw, Plus, AlertCircle,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { valueDomain, fmtAxisINR, showDots } from "../../utils/chart";
import { inr } from "../../utils/currency";
import { useLiveQuotes, liveHoldings, livePortfolio } from "../../context/LiveQuotesContext";
import { StockLogo } from "../../components/StockLogo";

const API_BASE  = "http://127.0.0.1:5050/v1";
const getToken  = () => localStorage.getItem("access_token");
const authHdr   = () => ({
  Authorization:  `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

const SECTOR_COLORS = [
  "#06B6D4", "#8B5CF6", "#F59E0B", "#10B981",
  "#EF4444", "#3B82F6", "#EC4899", "#14B8A6",
];

// Reusable holdings/positions table card. Used for both DELIVERY holdings and
// INTRADAY positions (showStatus=true adds an OPEN/CLOSED column).
function HoldingsCard({ title, subtitle, list, totalValue, navigate, showStatus = false, emptyText }) {
  const cols = ["#", "Symbol", "Shares", "Avg Cost", "Current", "Market Value", "P&L", "Return", "Weight"];
  if (showStatus) cols.push("Status");

  // Ranked by live market value, largest first. Because `list` is already
  // price-overlaid, this re-sorts as the market moves — and the S.No column is
  // simply the index of that ranking, so it follows automatically instead of
  // being a fixed number stamped on a row.
  const ranked = useMemo(() => {
    const valueOf = (h) => {
      const qty = parseFloat(h.quantity || 0);
      const px  = parseFloat(h.current_price || 0) || parseFloat(h.average_buy_price || 0);
      return parseFloat(h.current_value || 0) > 0 ? parseFloat(h.current_value) : qty * px;
    };
    // Open positions rank above closed ones; a closed row has no live value to
    // rank on and shouldn't push a live position down the list.
    return [...list].sort((a, b) => {
      const aClosed = a.is_active === false || a.position_status === "CLOSED";
      const bClosed = b.is_active === false || b.position_status === "CLOSED";
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      return valueOf(b) - valueOf(a);
    });
  }, [list]);
  return (
    <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <div className="text-sm font-medium text-white">{title}</div>
          {subtitle && <div className="text-[11px] text-gray-600 mt-0.5">{subtitle}</div>}
        </div>
        <div className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/15 rounded-full text-xs text-cyan-400">
          {list.length} position{list.length !== 1 ? "s" : ""}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="py-10 text-center text-gray-600 text-sm">{emptyText || "Nothing here yet"}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {cols.map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((h, idx) => {
                const short    = h.position_side === "SHORT" || h.is_short === true;
                const closed   = h.is_active === false || h.position_status === "CLOSED";
                // `quantity` is what is still OPEN, which is 0 once a position
                // closes — accurate, but it reads as "0 shares" against a trade
                // that plainly happened. Closed rows show the size traded.
                const qty      = closed
                  ? parseFloat(h.quantity_traded ?? h.quantity ?? 0)
                  : parseFloat(h.quantity || 0);
                const avgCost  = parseFloat(h.average_buy_price || 0);
                const currPx   = parseFloat(h.current_price || 0) > 0 ? parseFloat(h.current_price) : avgCost;
                // A closed position holds nothing, so its market value is 0 —
                // `qty` above is the size that WAS traded and must not be
                // multiplied back into a live valuation.
                const mktVal   = closed
                  ? 0
                  : (parseFloat(h.current_value || 0) > 0 ? parseFloat(h.current_value) : qty * currPx);
                const invested = parseFloat(h.total_invested || qty * avgCost);
                const realized = parseFloat(h.realized_pnl || 0);

                // A closed position's P&L is settled — show the realized figure.
                // Its `unrealized_pnl` is whatever it happened to be at the last
                // revaluation before it closed, which is stale and misleading now
                // that the trade is booked.
                // A short's unrealized P&L runs the other way: it gains as the
                // price falls.
                const fallbackPnl = short ? (avgCost - currPx) * qty : mktVal - invested;
                const pnl      = closed
                  ? realized
                  : (parseFloat(h.unrealized_pnl || 0) !== 0 ? parseFloat(h.unrealized_pnl) : fallbackPnl);
                const pnlPct   = closed
                  ? (invested > 0 ? (realized / invested) * 100 : 0)
                  : (parseFloat(h.unrealized_pnl_percent || 0) !== 0
                      ? parseFloat(h.unrealized_pnl_percent)
                      : (avgCost > 0 ? ((short ? avgCost - currPx : currPx - avgCost) / avgCost) * 100 : 0));
                const up       = pnl >= 0;
                const weight   = totalValue > 0 && !closed ? (mktVal / totalValue) * 100 : 0;
                const ticker   = h.ticker_symbol || "—";
                return (
                  <motion.tr
                    key={h.holding_id || idx}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.04 }}
                    onClick={() => ticker !== "—" && navigate(`/user/stock/${ticker}`)}
                    className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${closed ? "opacity-60" : ""}`}
                  >
                    <td className="px-5 py-3.5 text-sm text-gray-500 tabular-nums">{idx + 1}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <StockLogo symbol={ticker} name={h.company_name} size="sm" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-white">{ticker}</span>
                            {short && (
                              <span
                                title="Sold first — you owe these shares until you buy them back"
                                className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-[9px] font-bold text-amber-400"
                              >
                                SHORT
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-600">{h.sector || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-300">{qty.toFixed(4)}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-300">₹{avgCost.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-sm text-white">₹{currPx.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-sm text-white">{inr(mktVal)}</td>
                    <td className={`px-5 py-3.5 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
                      {up ? "+" : "-"}{inr(Math.abs(pnl), { symbol: true })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className={`flex items-center gap-1 text-sm ${up ? "text-emerald-400" : "text-red-400"}`}>
                        {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {up ? "+" : ""}{pnlPct.toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${Math.min(100, weight)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{weight.toFixed(1)}%</span>
                      </div>
                    </td>
                    {showStatus && (
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${closed
                          ? "text-gray-400 bg-gray-500/10 border-gray-500/20"
                          : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"}`}>
                          {closed ? "CLOSED" : "OPEN"}
                        </span>
                      </td>
                    )}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function UserPortfolio() {
  const navigate = useNavigate();
  const { quotes, updatedAt: quotesUpdatedAt } = useLiveQuotes();

  // *Raw = what the fetch returned; the live-overlaid `holdings` / `portfolio`
  // are derived below so every value on this page moves with the market instead
  // of waiting for the server's 5-minute revaluation.
  const [portfolioRaw, setPortfolio]  = useState(null);
  const [holdingsRaw, setHoldings]    = useState([]);
  const [perfData,    setPerfData]    = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [sectorData,  setSectorData]  = useState([]);
  // True when the chart is showing today's value ticks rather than daily history.
  const [isIntraday,  setIsIntraday]  = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [creating,    setCreating]    = useState(false);

  // ── Create a default portfolio for new users ─────────────────────────────
  const createDefaultPortfolio = useCallback(async () => {
    setCreating(true);
    try {
      const res  = await fetch(`${API_BASE}/portfolios/create`, {
        method:  "POST",
        headers: authHdr(),
        body:    JSON.stringify({ portfolio_name: "My Portfolio", portfolio_type: "MAIN" }),
      });
      const data = await res.json();
      if (data.bool && data.response?.portfolio_id) return data.response.portfolio_id;
    } catch (err) {
      console.error("createDefaultPortfolio:", err);
    } finally {
      setCreating(false);
    }
    return null;
  }, []);

  /* This used to synthesise a 7-day curve by interpolating invested → current
     value whenever no snapshots existed. That drew a smooth line the portfolio
     never actually traced — invented data presented as history. The chart now
     only ever plots real `portfolio_performance_history` rows, and shows an
     honest "building history" state until at least two days exist. */

  // ── Fetch performance history for chart ──────────────────────────────────
  const fetchPerformance = useCallback(async (portfolioId) => {
    try {
      const res  = await fetch(
        `${API_BASE}/portfolios/${portfolioId}/performance?interval=DAILY&limit=90`,
        { headers: authHdr() }
      );
      const data = await res.json();

      // Response: { data: [{ date, total_value, total_invested, daily_return,
      //                       daily_return_percent, cumulative_return,
      //                       cumulative_return_percent, holdings_count }] }
      const records = (data.bool && data.response?.data) || [];

      /* Daily snapshots are one point per day, so a portfolio in its first days
         has nothing to draw a line from. Fall back to the intraday value ticks —
         real samples of the portfolio's value as prices moved, not interpolation. */
      if (records.length < 2) {
        const tickRes  = await fetch(
          `${API_BASE}/portfolios/${portfolioId}/performance?interval=INTRADAY&limit=300`,
          { headers: authHdr() }
        );
        const tickData = await tickRes.json();
        const ticks    = (tickData.bool && tickData.response?.data) || [];
        if (ticks.length > records.length) {
          setPerfData(ticks.map(t => ({
            date:  new Date(t.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            close: parseFloat(t.total_value || 0),
          })));
          setIsIntraday(true);
          setMonthlyData([]);
          return;
        }
      }
      setIsIntraday(false);

      setPerfData(records.map(d => ({
        date:  d.date?.slice(5) || d.date,
        close: parseFloat(d.total_value || 0),
      })));

      // Monthly returns — group daily records by YYYY-MM, comparing the first
      // and last snapshot in each month. A month with a single snapshot has no
      // measurable return yet, so it is left out rather than charted as 0%.
      const monthly = {};
      records.forEach(d => {
        if (!d.date) return;
        const m = d.date.slice(0, 7);
        const v = parseFloat(d.total_value || 0);
        if (!monthly[m]) monthly[m] = { start: v, end: v, n: 0 };
        monthly[m].end = v;
        monthly[m].n  += 1;
      });
      setMonthlyData(
        Object.entries(monthly)
          .filter(([, v]) => v.n > 1 && v.start > 0)
          .slice(-7)
          .map(([k, v]) => ({
            m: k.slice(5),
            r: parseFloat((((v.end - v.start) / v.start) * 100).toFixed(2)),
          }))
      );
    } catch (err) {
      console.error("fetchPerformance:", err);
      setPerfData([]);
      setMonthlyData([]);
    }
  }, []);

  // ── Main data loader ──────────────────────────────────────────────────────
  /* `silent` = background refresh: no spinner, and a transient failure leaves
     the page as-is rather than replacing live data with an error. */
  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(""); }
    try {
      // 1. Get portfolios list
      const listRes  = await fetch(`${API_BASE}/portfolios/my`, { headers: authHdr() });
      const listData = await listRes.json();
      let portfolios = listData.bool ? (listData.response?.portfolios || []) : [];

      // 2. Auto-create for new users — never on a background refresh. Creating
      //    rows is a side effect that belongs to a deliberate page load; on a
      //    10-second tick a failure here would retry forever and flip the
      //    "Setting up your portfolio…" spinner over live data.
      if (portfolios.length === 0) {
        if (silent) return;
        const newId = await createDefaultPortfolio();
        if (!newId) { setError("Could not create portfolio. Please try again."); setLoading(false); return; }
        const re   = await fetch(`${API_BASE}/portfolios/my`, { headers: authHdr() });
        const reD  = await re.json();
        portfolios = reD.bool ? (reD.response?.portfolios || []) : [];
        if (portfolios.length === 0) { setError("Portfolio created but could not load. Please refresh."); setLoading(false); return; }
      }

      // 3. Pick default portfolio — backend uses is_default (not is_primary)
      const primary = portfolios.find(p => p.is_default) || portfolios[0];

      // 4. Fetch portfolio detail + holdings
      // GET /portfolios/<id> → _portfolio_dict + holdings: [_holding_dict, ...]
      // include_closed=1 also returns CLOSED intraday positions for the Positions view.
      const detRes  = await fetch(`${API_BASE}/portfolios/${primary.portfolio_id}?include_closed=1`, { headers: authHdr() });
      const detData = await detRes.json();

      if (detData.bool && detData.response) {
        const port = detData.response;
        setPortfolio(port);

        const holdingsList = port.holdings || [];
        setHoldings(holdingsList);

        // Aggregates (sector allocation, synthetic charts) use ACTIVE positions
        // only — CLOSED intraday positions must not pollute the totals.
        const activeHoldings = holdingsList.filter(h => h.is_active !== false);

        // Build sector allocation
        // Use current_value when > 0, else total_invested (handles stocks with no live price yet)
        if (activeHoldings.length > 0) {
          const sectorMap = {};
          activeHoldings.forEach(h => {
            const sec = h.sector || "Other";
            const val = parseFloat(h.current_value || 0) > 0
              ? parseFloat(h.current_value)
              : parseFloat(h.total_invested || 0);
            sectorMap[sec] = (sectorMap[sec] || 0) + val;
          });
          const sectorTotal = Object.values(sectorMap).reduce((a, b) => a + b, 0);
          const secArr = Object.entries(sectorMap)
            .map(([name, value], i) => ({
              name,
              value: sectorTotal > 0 ? parseFloat(((value / sectorTotal) * 100).toFixed(1)) : 0,
              color: SECTOR_COLORS[i % SECTOR_COLORS.length],
            }))
            .filter(s => s.value > 0)
            .sort((a, b) => b.value - a.value);
          setSectorData(secArr);
        }

        // 5. Fetch performance chart + monthly returns
        await fetchPerformance(primary.portfolio_id, activeHoldings);
      } else {
        if (!silent) setError("Failed to load portfolio details.");
      }
    } catch (err) {
      console.error("loadData:", err);
      if (!silent) setError("Network error. Please try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [createDefaultPortfolio, fetchPerformance]);

  useEffect(() => { loadData(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Holdings change on TRADES, not on ticks — but trades happen in places this
     page cannot see: another tab, the Trade screen, a stop-loss firing, the
     close-of-day square-off. Rather than trying to catch every origin, the
     holdings are re-read whenever a fresh quote batch lands. That covers all of
     them, including the ones the server initiates on its own.
     `silent` keeps the spinner off so the page never flickers. */
  useEffect(() => {
    if (!quotesUpdatedAt) return;
    loadData({ silent: true });
  }, [quotesUpdatedAt]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live overlay ──────────────────────────────────────────────────────────
  // Each holding takes the current price from the shared quote poll, and the
  // summary tiles are rolled up from those holdings using the same arithmetic
  // the server uses (see livePortfolio → revalue_portfolio). Value, P&L and
  // today's change therefore track the market continuously.
  const holdings  = useMemo(() => liveHoldings(holdingsRaw, quotes), [holdingsRaw, quotes]);
  const portfolio = useMemo(() => livePortfolio(portfolioRaw, holdings), [portfolioRaw, holdings]);

  // ── Derived values ────────────────────────────────────────────────────────
  // Backend _portfolio_dict:
  //   current_value, total_invested, total_return, total_return_percent,
  //   realized_pnl, unrealized_pnl, day_change, day_change_percent
  const totalValue    = parseFloat(portfolio?.current_value        || 0);
  const totalInvested = parseFloat(portfolio?.total_invested       || 0);

  // Keep Delivery holdings and Intraday positions separate in the UI.
  // Delivery shows active holdings only; Intraday shows OPEN + CLOSED positions.
  const deliveryHoldings  = holdings.filter(h => (h.trade_mode || "DELIVERY") === "DELIVERY" && h.is_active !== false);
  const intradayPositions = holdings.filter(h => h.trade_mode === "INTRADAY");
  const activePositionCount = holdings.filter(h => h.is_active !== false).length;
  const totalPnl      = parseFloat(portfolio?.total_return         || 0);   // total_return, NOT total_pnl
  const totalPnlPct   = parseFloat(portfolio?.total_return_percent || 0);
  const dayPnl        = parseFloat(portfolio?.day_change           || 0);   // day_change, NOT day_pnl
  const dayPnlPct     = parseFloat(portfolio?.day_change_percent   || 0);

  // Chart direction: first → last point. Falls back to overall P&L when there is
  // only one point, so the colour never contradicts the figure above it.
  const perfUp = perfData.length > 1
    ? perfData[perfData.length - 1].close >= perfData[0].close
    : totalPnlPct >= 0;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading || creating) {
    return (
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">
            {creating ? "Setting up your portfolio…" : "Loading portfolio…"}
          </p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">My Portfolio</h1>
          <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 bg-[#0C1220] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">My Portfolio</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {portfolio?.portfolio_name || "My Portfolio"} — only your investments are visible here
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 bg-[#0C1220] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
            <RefreshCw className="w-4 h-4" /><span className="hidden sm:block">Refresh</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-[#0C1220] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
            <Download className="w-4 h-4" /><span className="hidden sm:block">Export</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { l: "Portfolio Value", v: inr(totalValue),     sub: `${activePositionCount} position${activePositionCount !== 1 ? "s" : ""}`, up: null },
          { l: "Total P&L",      v: `${totalPnl >= 0 ? "+" : ""}₹${Math.abs(totalPnl).toFixed(2)}`,          sub: `${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}% all time`, up: totalPnl >= 0 },
          { l: "Today's Change", v: `${dayPnl >= 0 ? "+" : ""}₹${Math.abs(dayPnl).toFixed(2)}`,              sub: `${dayPnlPct >= 0 ? "+" : ""}${dayPnlPct.toFixed(2)}% today`,     up: dayPnl >= 0 },
          { l: "Invested",       v: inr(totalInvested),   sub: "Total cost basis",                                                up: null },
        ].map((card, i) => (
          <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-500 mb-1">{card.l}</div>
            <div className={`text-xl font-bold ${card.up === true ? "text-emerald-400" : card.up === false ? "text-red-400" : "text-white"}`}>
              {card.v}
            </div>
            <div className="text-xs text-gray-600 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Performance Chart */}
        <div className="lg:col-span-2 bg-[#0C1220] border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-gray-500">My Portfolio Performance</div>
              <div className="text-2xl font-bold text-white">
                {inr(totalValue)}
              </div>
            </div>
            {totalPnlPct !== 0 && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border ${
                totalPnlPct >= 0 ? "bg-emerald-500/10 border-emerald-500/15" : "bg-red-500/10 border-red-500/15"
              }`}>
                <ArrowUpRight className={`w-3.5 h-3.5 ${totalPnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`} />
                <span className={`text-sm ${totalPnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
          <div className="h-52">
            {perfData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={perfData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={perfUp ? "#10B981" : "#EF4444"} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={perfUp ? "#10B981" : "#EF4444"} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  {/* Zoom to the value range — starting at 0 flattens real day-to-day
                      movement into a straight line on a large portfolio. */}
                  <YAxis
                    tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false} width={72}
                    domain={valueDomain}
                    tickFormatter={fmtAxisINR}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
                    formatter={v => [`₹${parseFloat(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Value"]}
                  />
                  {/* A single snapshot has no line to draw — show the point itself. */}
                  <Area type="monotone" dataKey="close" stroke={perfUp ? "#10B981" : "#EF4444"} strokeWidth={2}
                    fill="url(#pGrad)" dot={showDots(perfData)} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="text-gray-600 text-sm">No performance history yet</div>
                <div className="text-gray-700 text-xs">Make your first trade to start tracking</div>
              </div>
            )}
          </div>
          {isIntraday && perfData.length > 1 && (
            <div className="text-[11px] text-gray-600 mt-2">
              Showing today's value as prices moved. Daily history builds up from here.
            </div>
          )}
          {perfData.length === 1 && (
            <div className="text-[11px] text-gray-600 mt-2">
              Your first data point — the chart fills out as your portfolio is tracked.
            </div>
          )}
        </div>

        {/* Allocation + Monthly Returns */}
        <div className="space-y-4">
          {/* Sector Allocation */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
            <div className="text-sm font-medium text-white mb-3">My Allocation</div>
            {sectorData.length > 0 ? (
              <>
                <div className="h-32 mb-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sectorData} cx="50%" cy="50%" innerRadius={33} outerRadius={58} dataKey="value" paddingAngle={4}>
                        {sectorData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
                        formatter={v => [`${v}%`, ""]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {sectorData.slice(0, 4).map((s, i) => (
                  <div key={i} className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-xs text-gray-400">{s.name}</span>
                    </div>
                    <span className="text-xs text-white">{s.value}%</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-gray-600 text-xs">No holdings yet</div>
            )}
          </div>

          {/* Monthly Returns */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
            <div className="text-sm font-medium text-white mb-3">Monthly Returns</div>
            <div className="h-24">
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} barSize={16}>
                    <XAxis dataKey="m" tick={{ fill: "#4B5563", fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Bar dataKey="r" radius={[3, 3, 0, 0]}>
                      {monthlyData.map((e, i) => <Cell key={i} fill={e.r >= 0 ? "#10B981" : "#EF4444"} />)}
                    </Bar>
                    <Tooltip
                      contentStyle={{ background: "#0C1220", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, fontSize: 11 }}
                      formatter={v => [`${parseFloat(v).toFixed(2)}%`, "Return"]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-600 text-xs">No return data yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Holdings + Intraday Positions (kept separate) */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => navigate("/user/trade")}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 hover:bg-emerald-500/20 transition-all"
        >
          <Plus className="w-3 h-3" /> Buy Stock
        </button>
      </div>

      <HoldingsCard
        title="Delivery Holdings"
        subtitle="Shares held in your portfolio until sold"
        list={deliveryHoldings}
        totalValue={totalValue}
        navigate={navigate}
        emptyText="No delivery holdings yet — buy a stock in Delivery mode to get started."
      />

      {intradayPositions.length > 0 && (
        <HoldingsCard
          title="Intraday Positions"
          subtitle="Open and closed intraday trades"
          list={intradayPositions}
          totalValue={totalValue}
          navigate={navigate}
          showStatus
          emptyText="No intraday positions."
        />
      )}
    </div>
  );
}














