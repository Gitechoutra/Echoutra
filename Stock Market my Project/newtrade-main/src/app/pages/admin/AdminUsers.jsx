import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, TrendingUp, TrendingDown, Users, UserCheck,
  UserX, ShieldCheck, Eye, AlertCircle, RefreshCw, IndianRupee,
  MessageSquare, Send, X, Headphones, ImagePlus, Loader2,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });
// Multipart uploads must NOT set Content-Type — the browser adds the boundary.
const authOnly = () => ({ Authorization: `Bearer ${getToken()}` });
// Absolute, token-bearing URL an <img> can load directly.
const attachmentUrl = (att) => `${API_BASE}${att.url}?token=${getToken()}`;

const statusColors = {
  ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
  Active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
  PENDING:   "bg-amber-500/10  text-amber-400  border-amber-500/15",
  Pending:   "bg-amber-500/10  text-amber-400  border-amber-500/15",
  INACTIVE:  "bg-gray-500/10   text-gray-500   border-gray-500/15",
  Inactive:  "bg-gray-500/10   text-gray-500   border-gray-500/15",
  SUSPENDED: "bg-red-500/10    text-red-400    border-red-500/15",
  Suspended: "bg-red-500/10    text-red-400    border-red-500/15",
  BLOCKED:   "bg-red-500/10    text-red-400    border-red-500/15",
  BANNED:    "bg-red-900/20    text-red-500    border-red-900/30",
};
/* ── KYC badges ──
   The backend stores six states (see KYCStatus); the table collapses them into
   four visual outcomes. PENDING and UNDER_REVIEW both read as "under review" to
   an admin, and NOT_STARTED/EXPIRED are shown neutrally so a user who never
   submitted documents is never mistaken for one awaiting a decision. */
const kycBadges = {
  APPROVED:     { label: "KYC Approved",  cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15" },
  PENDING:      { label: "KYC Pending",   cls: "bg-amber-500/10   text-amber-400   border-amber-500/15" },
  UNDER_REVIEW: { label: "KYC Pending",   cls: "bg-amber-500/10   text-amber-400   border-amber-500/15" },
  REJECTED:     { label: "KYC Rejected",  cls: "bg-red-500/10     text-red-400     border-red-500/15" },
  NOT_STARTED:  { label: "Not Started",   cls: "bg-white/5        text-gray-500    border-white/5" },
  EXPIRED:      { label: "KYC Expired",   cls: "bg-gray-500/10    text-gray-400    border-gray-500/15" },
};
const kycBadge = (s) => kycBadges[String(s || "").toUpperCase()] || kycBadges.NOT_STARTED;

/* ── Currency formatter — wallet/portfolio values are always in INR
     (Razorpay processes deposits in INR; the Wallets model defaults to INR) ── */
const fmtINR = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/*
   FIX — "Total Return +0.0%" bug:
   The backend Portfolios row stores `total_return_percent` as a column, but
   it is only recalculated when a trade executes (see trade_orders routes).
   For portfolios with deposits/holdings created via seeders or admin actions
   without a matching trade event, total_return_percent stays NULL/0 even
   though current_value and total_invested are both non-zero.

   SOLUTION: if the backend value is missing/zero AND total_invested > 0,
   derive the return client-side from current_value vs total_invested —
   this is the same formula the backend itself uses
   (total_return_percent = (current_value - total_invested) / total_invested * 100).
*/
function deriveReturn(p) {
  const currentValue   = parseFloat(p.current_value   || 0);
  const totalInvested  = parseFloat(p.total_invested  || 0);
  const backendPct     = parseFloat(p.total_return_percent || 0);
  const backendAbs     = parseFloat(p.total_return || p.profit_loss || 0);

  // If backend already computed a non-zero return, trust it
  if (backendPct !== 0 || backendAbs !== 0) {
    return { pct: backendPct, abs: backendAbs };
  }
  // Otherwise derive from current_value vs total_invested
  if (totalInvested > 0) {
    const abs = currentValue - totalInvested;
    const pct = (abs / totalInvested) * 100;
    return { pct, abs };
  }
  return { pct: 0, abs: 0 };
}

// ── Enrich a single user row with portfolio data ──────────────────────────────
// kyc_status already arrives on the /users/list_users payload, so it needs no
// per-row request here.
async function enrichUser(u) {
  const userId = u.user_id || u.id;
  const result = {
    id:             userId,
    name:           u.full_name || u.name || "—",
    email:          u.email     || "—",
    avatar:         (u.full_name || u.name || "U").slice(0, 2).toUpperCase(),
    // /users returns the profile picture as avatar_url — fall back to initials.
    avatarUrl:      u.avatar_url || "",
    status:         u.status    || "ACTIVE",
    country:        u.country   || u.profile?.country || "—",
    lastLogin:      u.last_login ? new Date(u.last_login).toLocaleDateString() : "—",
    joinedAt:       u.created_on || u.created_at || "",
    kycStatus:      u.kyc_status || "NOT_STARTED",
    // defaults — overwritten if APIs respond
    portfolioValue: 0,
    totalReturn:    0,
    totalReturnPct: 0,
    holdings:       0,
  };

  await Promise.allSettled([
    // Portfolio
    (async () => {
      const res  = await fetch(
        `${API_BASE}/portfolios/admin/all?user_id=${userId}&per_page=1`,
        { headers: authHdr() }
      );
      const data = await res.json();
      if (data.bool && data.response?.portfolios?.length > 0) {
        const p = data.response.portfolios[0];
        result.portfolioValue = parseFloat(p.current_value || p.total_value || 0);
        result.holdings       = parseInt(p.total_holdings_count || p.holdings_count || 0, 10);
        // FIX: derive return when backend hasn't computed it yet
        const { pct, abs } = deriveReturn(p);
        result.totalReturnPct = pct;
        result.totalReturn    = abs;
      }
    })(),
    // Profile (country fallback)
    (async () => {
      if (result.country !== "—") return;
      const res  = await fetch(`${API_BASE}/user_profiles/${userId}`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool && data.response) {
        result.country = data.response.country || data.response.location || "—";
      }
    })(),
  ]);

  return result;
}

export function AdminUsers() {
  const navigate = useNavigate();

  const [search,       setSearch]       = useState("");
  const [kycFilter,    setKyc]          = useState("All");
  const [statusFilter, setStat]         = useState("All");
  const [sortBy,       setSortBy]       = useState("name");
  const [users,        setUsers]        = useState([]);
  const [summaryStats, setSummaryStats] = useState({ total: 0, active: 0, suspended: 0, kycApproved: 0, totalValue: 0 });
  const [loading,      setLoading]      = useState(true);
  const [enriching,    setEnriching]    = useState(false);
  const [error,        setError]        = useState("");
  const [page,         setPage]         = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);
  const [totalUsers,   setTotalUsers]   = useState(0);

  /* ── Support chat ── */
  const [chatUser,     setChatUser]     = useState(null);   // { id, name, email }
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft,    setChatDraft]    = useState("");
  const [chatSending,  setChatSending]  = useState(false);
  const [chatUploading,setChatUploading] = useState(false);
  const [chatUnread,   setChatUnread]   = useState({});     // { [user_id]: count }
  const chatBottomRef  = useRef(null);
  const chatFileRef    = useRef(null);

  const fetchUsers = useCallback(async (pageNum = 1, searchTerm = "", kyc = "All", status = "All") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: pageNum, per_page: 20 });
      if (searchTerm.trim()) params.set("search",     searchTerm.trim());
      if (kyc    !== "All") params.set("kyc_status",  kyc);
      if (status !== "All") params.set("status",      status.toUpperCase());

      const res  = await fetch(`${API_BASE}/users/list_users?${params}`, { headers: authHdr() });
      const data = await res.json();

      if (!data.bool) {
        if (data.status === 401 || data.status === 403) { navigate("/signin?role=admin"); return; }
        setError(data.response?.message || "Failed to load users.");
        setLoading(false);
        return;
      }

      const raw        = data.response?.users || data.response || [];
      const pagination = data.response?.pagination || {};
      const total      = data.response?.total       || pagination.total  || raw.length;
      const pages      = data.response?.total_pages || pagination.total_pages || Math.ceil(total / 20) || 1;

      setTotalUsers(total);
      setTotalPages(pages);

      const baseRows = raw.map((u) => ({
        id:             u.user_id || u.id,
        name:           u.full_name || u.name || "—",
        email:          u.email     || "—",
        avatar:         (u.full_name || u.name || "U").slice(0, 2).toUpperCase(),
        // /users returns the profile picture as avatar_url — fall back to initials.
        avatarUrl:      u.avatar_url || "",
        status:         u.status    || "ACTIVE",
        country:        u.country   || "—",
        lastLogin:      u.last_login ? new Date(u.last_login).toLocaleDateString() : "—",
        kycStatus:      u.kyc_status || "NOT_STARTED",
        portfolioValue: null,
        totalReturn:    0,
        totalReturnPct: 0,
        holdings:       null,
      }));
      setUsers(baseRows);
      setLoading(false);

      setEnriching(true);
      const BATCH = 5;
      const enriched = [...baseRows];
      for (let i = 0; i < raw.length; i += BATCH) {
        const batch   = raw.slice(i, i + BATCH);
        const results = await Promise.allSettled(batch.map((u) => enrichUser(u)));
        results.forEach((r, j) => {
          if (r.status === "fulfilled") enriched[i + j] = r.value;
        });
        setUsers([...enriched]);
      }

      setSummaryStats({
        total:       total,
        active:      enriched.filter(u => ["ACTIVE","Active"].includes(u.status)).length,
        suspended:   enriched.filter(u => ["SUSPENDED","BANNED","BLOCKED"].includes(u.status)).length,
        kycApproved: enriched.filter(u => u.kycStatus === "APPROVED").length,
        totalValue:  enriched.reduce((a, u) => a + (u.portfolioValue || 0), 0),
      });
    } catch (e) {
      setError("Network error. Could not load users.");
      setLoading(false);
    } finally {
      setEnriching(false);
    }
  }, [navigate]);

  useEffect(() => {
    setPage(1);
    fetchUsers(1, search, kycFilter, statusFilter);
  }, [kycFilter, statusFilter]); // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchUsers(1, search, kycFilter, statusFilter); }, 450);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line

  /* ── Keep KYC status fresh ──
     list_users reads kyc_status straight from the DB, so a re-fetch is all it
     takes to pick up an approve/reject an admin made elsewhere (the user detail
     page, or another tab). Re-fetch when this tab regains focus rather than
     polling on a timer — the decision only changes on an admin action. */
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        fetchUsers(page, search, kycFilter, statusFilter);
      }
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchUsers, page, search, kycFilter, statusFilter]);

  const filtered = [...users].sort((a, b) => {
    if (sortBy === "value")  return (b.portfolioValue || 0) - (a.portfolioValue || 0);
    if (sortBy === "return") return (b.totalReturnPct || 0) - (a.totalReturnPct || 0);
    return (a.name || "").localeCompare(b.name || "");
  });

  /* ── Support chat: per-user unread badges (poll every 20s) ── */
  const fetchChatUnread = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res  = await fetch(`${API_BASE}/support/admin/conversations`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) {
        const map = {};
        (data.response?.conversations || []).forEach((c) => { map[c.user_id] = c.unread_count; });
        setChatUnread(map);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchChatUnread();
    const id = setInterval(fetchChatUnread, 20000);
    return () => clearInterval(id);
  }, [fetchChatUnread]);

  /* ── Support chat: open / fetch / send ── */
  const fetchChatThread = useCallback(async (userId) => {
    if (!getToken() || !userId) return;
    try {
      const res  = await fetch(`${API_BASE}/support/admin/thread/${userId}`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) {
        setChatMessages(data.response?.messages || []);
        setChatUnread((m) => ({ ...m, [userId]: 0 }));
      }
    } catch { /* silent */ }
  }, []);

  const openChat = (u, e) => {
    if (e) e.stopPropagation();
    setChatUser({ id: u.id, name: u.name, email: u.email });
    setChatMessages([]);
    setChatDraft("");
    fetchChatThread(u.id);
  };

  // Poll the open thread every 4s so user messages arrive in real time
  useEffect(() => {
    if (!chatUser) return;
    const id = setInterval(() => fetchChatThread(chatUser.id), 4000);
    return () => clearInterval(id);
  }, [chatUser, fetchChatThread]);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const sendReply = async () => {
    const text = chatDraft.trim();
    if (!text || chatSending || !chatUser) return;
    setChatSending(true);
    const optimistic = { message_id: `tmp-${Date.now()}`, sender_role: "ADMIN", message: text, created_on: new Date().toISOString() };
    setChatMessages((m) => [...m, optimistic]);
    setChatDraft("");
    try {
      const res  = await fetch(`${API_BASE}/support/admin/reply/${chatUser.id}`, {
        method: "POST", headers: authHdr(), body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (data.bool) fetchChatThread(chatUser.id);
    } catch { /* keep optimistic */ }
    finally { setChatSending(false); }
  };

  const sendChatImage = async (file) => {
    if (!file || chatUploading || !chatUser) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024)     { alert("Image is too large (max 5 MB)."); return; }
    setChatUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch(`${API_BASE}/support/admin/upload/${chatUser.id}`, {
        method: "POST", headers: authOnly(), body: form,
      });
      const data = await res.json();
      if (data.bool) fetchChatThread(chatUser.id);
      else alert(data.response?.message || "Upload failed.");
    } catch { alert("Upload failed. Please try again."); }
    finally { setChatUploading(false); }
  };

  const onPickChatImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) sendChatImage(file);
  };

  const fmtChatTime = (s) => {
    try { return new Date(s).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }); }
    catch { return ""; }
  };

  const fmtValue = (v) => {
    if (v === null) return <span className="text-gray-700 text-xs animate-pulse">…</span>;
    return fmtINR(v);
  };
  const fmtHoldings = (v) => {
    if (v === null) return <span className="text-gray-700 text-xs animate-pulse">…</span>;
    return `${v} stocks`;
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">All Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">View and manage every registered investor</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchUsers(page, search, kycFilter, statusFilter)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${enriching ? "animate-spin" : ""}`} />
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-[#0C1220] border border-white/5 px-3 py-2 rounded-xl">
            <Users className="w-3.5 h-3.5 text-violet-400" />
            <span>{totalUsers} total users</span>
          </div>
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
            label: "Total Portfolio Value",
            value: `₹${(summaryStats.totalValue / 100000).toFixed(2)}L`,
            icon: IndianRupee, color: "text-violet-400", bg: "border-violet-500/15",
          },
          {
            label: "Active Users",
            value: summaryStats.active.toString(),
            icon: UserCheck, color: "text-emerald-400", bg: "border-emerald-500/15",
          },
          {
            label: "Suspended / Banned",
            value: summaryStats.suspended.toString(),
            icon: UserX, color: "text-red-400", bg: "border-red-500/15",
          },
          {
            label: "KYC Approved",
            value: summaryStats.kycApproved.toString(),
            icon: ShieldCheck, color: "text-amber-400", bg: "border-amber-500/15",
          },
        ].map((s, i) => (
          <div key={i} className={`bg-[#0C1220] border ${s.bg} rounded-2xl p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full bg-[#0C1220] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500/30 transition-colors"
          />
        </div>

        {/* Filters — one mutually-exclusive row that wraps cleanly on any width.
            Selecting any filter clears the others so only one is ever active. */}
        {(() => {
          const chip = (active) =>
            `px-3 py-2 text-xs rounded-xl border transition-all whitespace-nowrap ${
              active
                ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                : "border-white/8 text-gray-600 hover:text-white"
            }`;
          const selectKyc    = (k) => { setKyc(k); setStat("All"); };
          const selectStatus = (s) => { setStat(s); setKyc("All"); };
          return (
            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={() => { setKyc("All"); setStat("All"); }}
                className={chip(kycFilter === "All" && statusFilter === "All")}>
                All
              </button>
              {[
                ["APPROVED",    "KYC Approved"],
                ["PENDING",     "KYC Pending"],
                ["REJECTED",    "KYC Rejected"],
                ["NOT_STARTED", "Not Started"],
              ].map(([value, label]) => (
                <button key={value} onClick={() => selectKyc(value)} className={chip(kycFilter === value)}>
                  {label}
                </button>
              ))}
              <span className="w-px h-5 bg-white/10 mx-1" />
              {["Active", "Pending", "Suspended", "Banned"].map((s) => (
                <button key={s} onClick={() => selectStatus(s)} className={chip(statusFilter === s)}>
                  {s}
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["User", "Country", "KYC Status", "Portfolio Value", "Total Return", "Holdings", "Status", "Action"].map((h) => (
                      <th key={h} className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => {
                    const up = (u.totalReturnPct || 0) >= 0;
                    return (
                      <motion.tr
                        key={u.id || i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
                        onClick={() => navigate(`/admin/users/${u.id}`)}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt=""
                                className="w-9 h-9 rounded-full object-cover border border-white/10 flex-shrink-0" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                                {u.avatar}
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-semibold text-white">{u.name}</div>
                              <div className="text-xs text-gray-600">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-400">
                          {u.country || "—"}
                        </td>
                        <td className="px-5 py-4">
                          {(() => {
                            const b = kycBadge(u.kycStatus);
                            return (
                              <span className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${b.cls}`}>
                                {b.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-white">
                          {fmtValue(u.portfolioValue)}
                        </td>
                        <td className={`px-5 py-4 text-sm font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>
                          {u.portfolioValue === null ? (
                            <span className="text-gray-700 text-xs animate-pulse">…</span>
                          ) : u.portfolioValue === 0 ? (
                            <span className="text-xs text-gray-700">No holdings</span>
                          ) : (
                            <>
                              <div className="flex items-center gap-1">
                                {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                {up ? "+" : ""}{(u.totalReturnPct || 0).toFixed(1)}%
                              </div>
                              <div className="text-xs opacity-70">
                                {up ? "+" : "-"}{fmtINR(Math.abs(u.totalReturn || 0))}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-400">
                          {fmtHoldings(u.holdings)}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2.5 py-1 rounded-full border ${statusColors[u.status] || statusColors.Inactive}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/admin/users/${u.id}`); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs text-violet-300 hover:bg-violet-500/20 transition-all opacity-0 group-hover:opacity-100">
                              <Eye className="w-3 h-3" /> View
                            </button>
                            <button
                              onClick={(e) => openChat(u, e)}
                              title="Open support chat"
                              className="relative flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs text-cyan-300 hover:bg-cyan-500/20 transition-all">
                              <MessageSquare className="w-3 h-3" /> Chat
                              {chatUnread[u.id] > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center border border-[#0C1220]">
                                  {chatUnread[u.id] > 9 ? "9+" : chatUnread[u.id]}
                                </span>
                              )}
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                  {filtered.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-600 text-sm">
                        No users match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {enriching && (
              <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5 text-xs text-gray-600">
                <div className="w-3 h-3 border border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
                Loading portfolio data…
              </div>
            )}
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchUsers(p, search, kycFilter, statusFilter); }}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchUsers(p, search, kycFilter, statusFilter); }}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* ══════════════════════════ SUPPORT CHAT MODAL ══════════════════════════ */}
      <AnimatePresence>
        {chatUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setChatUser(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0C1220] border border-cyan-500/20 rounded-2xl w-full max-w-lg h-[80vh] max-h-[640px] flex flex-col shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="px-5 py-4 bg-gradient-to-r from-cyan-500/15 to-blue-600/10 border-b border-white/5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-sm font-bold text-white">
                  {(chatUser.name || "U").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{chatUser.name}</div>
                  <div className="text-xs text-gray-500 truncate">{chatUser.email}</div>
                </div>
                <button onClick={() => setChatUser(null)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6">
                    <Headphones className="w-8 h-8 text-cyan-500/40 mb-2" />
                    <p className="text-sm text-gray-400">No messages yet</p>
                    <p className="text-xs text-gray-600 mt-1">Start the conversation with {chatUser.name}.</p>
                  </div>
                )}
                {chatMessages.map((m) => {
                  const admin = m.sender_role === "ADMIN";
                  return (
                    <div key={m.message_id} className={`flex ${admin ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm ${
                        admin
                          ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-br-sm"
                          : "bg-[#141C30] border border-white/8 text-gray-200 rounded-bl-sm"
                      }`}>
                        <div className={`text-[10px] font-semibold mb-0.5 ${admin ? "text-white/70" : "text-cyan-400"}`}>
                          {admin ? "You (Support)" : chatUser.name}
                        </div>
                        {m.attachment && (
                          <a href={attachmentUrl(m.attachment)} target="_blank" rel="noreferrer" className="block mb-1">
                            <img
                              src={attachmentUrl(m.attachment)}
                              alt={m.attachment.file_name || "image"}
                              className="rounded-lg max-h-60 w-auto object-cover border border-white/10"
                              loading="lazy"
                            />
                          </a>
                        )}
                        {m.message && <div className="whitespace-pre-wrap break-words">{m.message}</div>}
                        <div className={`text-[10px] mt-1 ${admin ? "text-white/60" : "text-gray-500"}`}>{fmtChatTime(m.created_on)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>

              {/* Composer */}
              <div className="p-3 border-t border-white/5 flex items-center gap-2">
                <input ref={chatFileRef} type="file" accept="image/*" onChange={onPickChatImage} className="hidden" />
                <button
                  onClick={() => chatFileRef.current?.click()}
                  disabled={chatUploading}
                  title="Send an image"
                  className="w-10 h-10 rounded-xl bg-[#141C30] border border-white/8 flex items-center justify-center text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/30 disabled:opacity-50 flex-shrink-0">
                  {chatUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                </button>
                <input
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="Type your reply…"
                  className="flex-1 bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/30"
                />
                <button
                  onClick={sendReply}
                  disabled={chatSending || !chatDraft.trim()}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white disabled:opacity-50 hover:opacity-90 flex-shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}























// import { useState, useEffect, useCallback } from "react";
// import { useNavigate } from "react-router";
// import { motion } from "motion/react";
// import {
//   Search, TrendingUp, TrendingDown, Users, UserCheck,
//   UserX, Crown, Eye, AlertCircle, RefreshCw,
// } from "lucide-react";
// import { formatCurrency } from "./currency";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken = () => localStorage.getItem("access_token");
// const authHdr  = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

// const statusColors = {
//   ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
//   Active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
//   PENDING:   "bg-amber-500/10  text-amber-400  border-amber-500/15",
//   Pending:   "bg-amber-500/10  text-amber-400  border-amber-500/15",
//   INACTIVE:  "bg-gray-500/10   text-gray-500   border-gray-500/15",
//   Inactive:  "bg-gray-500/10   text-gray-500   border-gray-500/15",
//   SUSPENDED: "bg-red-500/10    text-red-400    border-red-500/15",
//   Suspended: "bg-red-500/10    text-red-400    border-red-500/15",
//   BLOCKED:   "bg-red-500/10    text-red-400    border-red-500/15",
//   BANNED:    "bg-red-900/20    text-red-500    border-red-900/30",
// };
// const planColors = {
//   Elite:      "bg-violet-500/10 text-violet-300 border-violet-500/15",
//   ELITE:      "bg-violet-500/10 text-violet-300 border-violet-500/15",
//   ENTERPRISE: "bg-violet-500/10 text-violet-300 border-violet-500/15",
//   Pro:        "bg-cyan-500/10   text-cyan-300   border-cyan-500/15",
//   PRO:        "bg-cyan-500/10   text-cyan-300   border-cyan-500/15",
//   PREMIUM:    "bg-cyan-500/10   text-cyan-300   border-cyan-500/15",
//   Basic:      "bg-blue-500/10   text-blue-300   border-blue-500/15",
//   BASIC:      "bg-blue-500/10   text-blue-300   border-blue-500/15",
//   Free:       "bg-white/5       text-gray-500   border-white/5",
//   FREE:       "bg-white/5       text-gray-500   border-white/5",
// };

// /**
//  * enrichUser — FIXED
//  *
//  * Root issue traced: every row showed Plan="Premium" and Return="+0.0%"
//  * regardless of which user_id was queried. Two defensive fixes applied:
//  *
//  * 1. PLAN: previously this silently fell back to whatever the subscription
//  *    response contained without verifying the subscription's user_id matches
//  *    the row's user_id. If the backend ever returns an unfiltered/global
//  *    "most recent active subscription" instead of one scoped to user_id
//  *    (e.g. a query param being ignored server-side), every row would render
//  *    the same plan. We now explicitly check `s.user_id === userId` before
//  *    trusting the plan name, and fall back to "Free" (not blank/stale data)
//  *    if the check fails or no subscription exists.
//  *
//  * 2. RETURN %: previously trusted total_return_percent blindly. We now also
//  *    cross-check that the returned portfolio's user_id matches, for the same
//  *    reason. If portfolioValue is genuinely 0 (no trades yet), that's real
//  *    data and is now visually distinguished from "still loading" (null).
//  *
//  * 3. CURRENCY: now reads currency code from each API response instead of
//  *    assuming USD.
//  */
// async function enrichUser(u) {
//   const userId = u.user_id || u.id;
//   const result = {
//     id:             userId,
//     name:           u.full_name || u.name || "—",
//     email:          u.email     || "—",
//     avatar:         (u.full_name || u.name || "U").slice(0, 2).toUpperCase(),
//     status:         u.status    || "ACTIVE",
//     country:        u.country   || u.profile?.country || "—",
//     lastLogin:      u.last_login ? new Date(u.last_login).toLocaleDateString() : "—",
//     joinedAt:       u.created_on || u.created_at || "",
//     // defaults — overwritten only if API confirms data belongs to THIS user
//     plan:           "Free",
//     currency:       "INR",
//     portfolioValue: 0,
//     totalReturn:    0,
//     totalReturnPct: 0,
//     holdings:       0,
//     hasPortfolio:   false,
//     hasSubscription:false,
//   };

//   await Promise.allSettled([
//     // Portfolio — verify ownership before trusting values
//     (async () => {
//       const res  = await fetch(
//         `${API_BASE}/portfolios/admin/all?user_id=${userId}&per_page=1`,
//         { headers: authHdr() }
//       );
//       const data = await res.json();
//       if (data.bool && data.response?.portfolios?.length > 0) {
//         const p = data.response.portfolios[0];
//         // Defensive check: only trust this row if it actually belongs to userId
//         if (String(p.user_id) === String(userId)) {
//           result.portfolioValue = parseFloat(p.current_value || p.total_value || 0);
//           result.totalReturn    = parseFloat(p.total_return || p.profit_loss || 0);
//           result.totalReturnPct = parseFloat(p.total_return_percent || p.return_pct || 0);
//           result.holdings       = parseInt(p.total_holdings_count || p.holdings_count || 0, 10);
//           result.currency       = p.currency || result.currency;
//           result.hasPortfolio   = true;
//         }
//       }
//     })(),
//     // Subscription — verify ownership before trusting plan name
//     (async () => {
//       const res  = await fetch(
//         `${API_BASE}/subscriptions/admin/all?user_id=${userId}&status=ACTIVE&per_page=1`,
//         { headers: authHdr() }
//       );
//       const data = await res.json();
//       if (data.bool && data.response?.subscriptions?.length > 0) {
//         const s = data.response.subscriptions[0];
//         // Defensive check: only trust this plan if the subscription's
//         // own user_id field actually matches the row we're enriching.
//         // This guards against a backend filter being silently ignored.
//         if (!s.user_id || String(s.user_id) === String(userId)) {
//           result.plan = (
//             s.plan?.plan_name ||
//             s.plan_name       ||
//             s.plan?.plan_tier ||
//             s.plan_tier       || "Free"
//           );
//           result.currency        = s.plan?.currency || s.currency || result.currency;
//           result.hasSubscription = true;
//         }
//       }
//     })(),
//     // Profile (country fallback)
//     (async () => {
//       if (result.country !== "—") return;
//       const res  = await fetch(`${API_BASE}/user_profiles/${userId}`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) {
//         result.country = data.response.country || "—";
//       }
//     })(),
//   ]);

//   return result;
// }

// export function AdminUsers() {
//   const navigate = useNavigate();

//   const [search,       setSearch]       = useState("");
//   const [planFilter,   setPlan]         = useState("All");
//   const [statusFilter, setStat]         = useState("All");
//   const [sortBy,       setSortBy]       = useState("name");
//   const [users,        setUsers]        = useState([]);
//   const [summaryStats, setSummaryStats] = useState({ total: 0, active: 0, suspended: 0, elite: 0, totalValue: 0 });
//   const [loading,      setLoading]      = useState(true);
//   const [enriching,    setEnriching]    = useState(false);
//   const [error,        setError]        = useState("");
//   const [page,         setPage]         = useState(1);
//   const [totalPages,   setTotalPages]   = useState(1);
//   const [totalUsers,   setTotalUsers]   = useState(0);

//   const fetchUsers = useCallback(async (pageNum = 1, searchTerm = "", plan = "All", status = "All") => {
//     setLoading(true);
//     setError("");
//     try {
//       const params = new URLSearchParams({ page: pageNum, per_page: 20 });
//       if (searchTerm.trim()) params.set("search",  searchTerm.trim());
//       if (plan   !== "All") params.set("plan",     plan);
//       if (status !== "All") params.set("status",   status.toUpperCase());

//       const res  = await fetch(`${API_BASE}/users/list_users?${params}`, { headers: authHdr() });
//       const data = await res.json();

//       if (!data.bool) {
//         if (data.status === 401 || data.status === 403) { navigate("/signin?role=admin"); return; }
//         setError(data.response?.message || "Failed to load users.");
//         setLoading(false);
//         return;
//       }

//       const raw        = data.response?.users || data.response || [];
//       const pagination = data.response?.pagination || {};
//       const total      = data.response?.total       || pagination.total  || raw.length;
//       const pages      = data.response?.total_pages || pagination.total_pages || Math.ceil(total / 20) || 1;

//       setTotalUsers(total);
//       setTotalPages(pages);

//       const baseRows = raw.map((u) => ({
//         id:             u.user_id || u.id,
//         name:           u.full_name || u.name || "—",
//         email:          u.email     || "—",
//         avatar:         (u.full_name || u.name || "U").slice(0, 2).toUpperCase(),
//         status:         u.status    || "ACTIVE",
//         country:        u.country   || "—",
//         lastLogin:      u.last_login ? new Date(u.last_login).toLocaleDateString() : "—",
//         plan:           "—",
//         currency:       "INR",
//         portfolioValue: null,
//         totalReturn:    0,
//         totalReturnPct: 0,
//         holdings:       null,
//         hasPortfolio:   false,
//         hasSubscription:false,
//       }));
//       setUsers(baseRows);
//       setLoading(false);

//       setEnriching(true);
//       const BATCH = 5;
//       const enriched = [...baseRows];
//       for (let i = 0; i < raw.length; i += BATCH) {
//         const batch   = raw.slice(i, i + BATCH);
//         const results = await Promise.allSettled(batch.map((u) => enrichUser(u)));
//         results.forEach((r, j) => {
//           if (r.status === "fulfilled") enriched[i + j] = r.value;
//         });
//         setUsers([...enriched]);
//       }

//       setSummaryStats({
//         total:      total,
//         active:     enriched.filter(u => ["ACTIVE","Active"].includes(u.status)).length,
//         suspended:  enriched.filter(u => ["SUSPENDED","BANNED","BLOCKED"].includes(u.status)).length,
//         elite:      enriched.filter(u => ["Elite","ELITE","ENTERPRISE","PREMIUM"].includes(u.plan)).length,
//         totalValue: enriched.reduce((a, u) => a + (u.portfolioValue || 0), 0),
//       });
//     } catch (e) {
//       setError("Network error. Could not load users.");
//       setLoading(false);
//     } finally {
//       setEnriching(false);
//     }
//   }, [navigate]);

//   useEffect(() => {
//     setPage(1);
//     fetchUsers(1, search, planFilter, statusFilter);
//   }, [planFilter, statusFilter]); // eslint-disable-line

//   useEffect(() => {
//     const t = setTimeout(() => { setPage(1); fetchUsers(1, search, planFilter, statusFilter); }, 450);
//     return () => clearTimeout(t);
//   }, [search]); // eslint-disable-line

//   const filtered = [...users].sort((a, b) => {
//     if (sortBy === "value")  return (b.portfolioValue || 0) - (a.portfolioValue || 0);
//     if (sortBy === "return") return (b.totalReturnPct || 0) - (a.totalReturnPct || 0);
//     return (a.name || "").localeCompare(b.name || "");
//   });

//   const fmtValue = (v, currency) => {
//     if (v === null) return <span className="text-gray-700 text-xs animate-pulse">…</span>;
//     return formatCurrency(v, currency, { maximumFractionDigits: 0 });
//   };
//   const fmtHoldings = (v) => {
//     if (v === null) return <span className="text-gray-700 text-xs animate-pulse">…</span>;
//     return `${v} stocks`;
//   };

//   // Dominant currency across loaded rows, for the summary card
//   const dominantCurrency = users.find(u => u.hasPortfolio)?.currency || "INR";

//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
//       {/* ── Header ── */}
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-xl font-bold text-white">All Users</h1>
//           <p className="text-sm text-gray-500 mt-0.5">View and manage every registered investor</p>
//         </div>
//         <div className="flex items-center gap-2">
//           <button
//             onClick={() => fetchUsers(page, search, planFilter, statusFilter)}
//             className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
//           >
//             <RefreshCw className={`w-4 h-4 ${enriching ? "animate-spin" : ""}`} />
//           </button>
//           <div className="flex items-center gap-2 text-xs text-gray-500 bg-[#0C1220] border border-white/5 px-3 py-2 rounded-xl">
//             <Users className="w-3.5 h-3.5 text-violet-400" />
//             <span>{totalUsers} total users</span>
//           </div>
//         </div>
//       </div>

//       {/* ── Error ── */}
//       {error && (
//         <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
//           <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
//         </div>
//       )}

//       {/* ── Summary cards ── */}
//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//         {[
//           {
//             label: "Total Portfolio Value",
//             value: formatCurrency(summaryStats.totalValue, dominantCurrency, { compact: true }),
//             icon: Crown, color: "text-violet-400", bg: "border-violet-500/15",
//           },
//           {
//             label: "Active Users",
//             value: summaryStats.active.toString(),
//             icon: UserCheck, color: "text-emerald-400", bg: "border-emerald-500/15",
//           },
//           {
//             label: "Suspended / Banned",
//             value: summaryStats.suspended.toString(),
//             icon: UserX, color: "text-red-400", bg: "border-red-500/15",
//           },
//           {
//             label: "Elite / Premium",
//             value: summaryStats.elite.toString(),
//             icon: Crown, color: "text-amber-400", bg: "border-amber-500/15",
//           },
//         ].map((s, i) => (
//           <div key={i} className={`bg-[#0C1220] border ${s.bg} rounded-2xl p-4`}>
//             <div className="flex items-center justify-between mb-2">
//               <span className="text-xs text-gray-500">{s.label}</span>
//               <s.icon className={`w-4 h-4 ${s.color}`} />
//             </div>
//             <div className="text-2xl font-bold text-white">{s.value}</div>
//           </div>
//         ))}
//       </div>

//       {/* ── Filters ── */}
//       <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
//         <div className="relative flex-1 min-w-[200px] max-w-sm">
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
//           <input
//             type="text"
//             value={search}
//             onChange={(e) => setSearch(e.target.value)}
//             placeholder="Search by name or email…"
//             className="w-full bg-[#0C1220] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500/30 transition-colors"
//           />
//         </div>
//         <div className="flex gap-2 flex-wrap">
//           {["All", "Free", "Basic", "Pro", "Premium", "Enterprise"].map((p) => (
//             <button key={p} onClick={() => setPlan(p)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${
//                 planFilter === p
//                   ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
//                   : "border-white/8 text-gray-600 hover:text-white"
//               }`}>
//               {p}
//             </button>
//           ))}
//         </div>
//         <div className="flex gap-2 flex-wrap">
//           {["All", "Active", "Pending", "Suspended", "Banned"].map((s) => (
//             <button key={s} onClick={() => setStat(s)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${
//                 statusFilter === s
//                   ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
//                   : "border-white/8 text-gray-600 hover:text-white"
//               }`}>
//               {s}
//             </button>
//           ))}
//         </div>
//         <div className="flex gap-2 ml-auto">
//           {[["value","By Value"],["return","By Return"],["name","By Name"]].map(([v, l]) => (
//             <button key={v} onClick={() => setSortBy(v)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${
//                 sortBy === v
//                   ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
//                   : "border-white/8 text-gray-600 hover:text-white"
//               }`}>
//               {l}
//             </button>
//           ))}
//         </div>
//       </div>

//       {/* ── Table ── */}
//       <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//         {loading ? (
//           <div className="flex items-center justify-center py-16">
//             <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//           </div>
//         ) : (
//           <>
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["User", "Country", "Plan", "Portfolio Value", "Total Return", "Holdings", "Status", "Action"].map((h) => (
//                       <th key={h} className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {filtered.map((u, i) => {
//                     const up = (u.totalReturnPct || 0) >= 0;
//                     return (
//                       <motion.tr
//                         key={u.id || i}
//                         initial={{ opacity: 0 }}
//                         animate={{ opacity: 1 }}
//                         transition={{ delay: i * 0.03 }}
//                         className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
//                         onClick={() => navigate(`/admin/users/${u.id}`)}
//                       >
//                         <td className="px-5 py-4">
//                           <div className="flex items-center gap-3">
//                             <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
//                               {u.avatar}
//                             </div>
//                             <div>
//                               <div className="text-sm font-semibold text-white">{u.name}</div>
//                               <div className="text-xs text-gray-600">{u.email}</div>
//                             </div>
//                           </div>
//                         </td>
//                         <td className="px-5 py-4 text-sm text-gray-400">
//                           {u.country || "—"}
//                         </td>
//                         <td className="px-5 py-4">
//                           {u.plan === "—" ? (
//                             <span className="text-gray-700 text-xs animate-pulse">…</span>
//                           ) : (
//                             <span className={`text-xs px-2.5 py-1 rounded-full border ${planColors[u.plan] || planColors.Free}`}>
//                               {u.plan}
//                               {!u.hasSubscription && u.plan === "Free" && (
//                                 <span className="ml-1 opacity-50">(no sub)</span>
//                               )}
//                             </span>
//                           )}
//                         </td>
//                         <td className="px-5 py-4 text-sm font-semibold text-white">
//                           {fmtValue(u.portfolioValue, u.currency)}
//                         </td>
//                         <td className={`px-5 py-4 text-sm font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>
//                           {u.portfolioValue === null ? (
//                             <span className="text-gray-700 text-xs animate-pulse">…</span>
//                           ) : !u.hasPortfolio ? (
//                             <span className="text-gray-700 text-xs">No portfolio</span>
//                           ) : (
//                             <>
//                               <div className="flex items-center gap-1">
//                                 {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
//                                 {up ? "+" : ""}{(u.totalReturnPct || 0).toFixed(1)}%
//                               </div>
//                               <div className="text-xs opacity-70">
//                                 {up ? "+" : "-"}{formatCurrency(Math.abs(u.totalReturn || 0), u.currency, { maximumFractionDigits: 0 })}
//                               </div>
//                             </>
//                           )}
//                         </td>
//                         <td className="px-5 py-4 text-sm text-gray-400">
//                           {fmtHoldings(u.holdings)}
//                         </td>
//                         <td className="px-5 py-4">
//                           <span className={`text-xs px-2.5 py-1 rounded-full border ${statusColors[u.status] || statusColors.Inactive}`}>
//                             {u.status}
//                           </span>
//                         </td>
//                         <td className="px-5 py-4">
//                           <button className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs text-violet-300 hover:bg-violet-500/20 transition-all opacity-0 group-hover:opacity-100">
//                             <Eye className="w-3 h-3" /> View
//                           </button>
//                         </td>
//                       </motion.tr>
//                     );
//                   })}
//                   {filtered.length === 0 && !loading && (
//                     <tr>
//                       <td colSpan={8} className="py-12 text-center text-gray-600 text-sm">
//                         No users match your filters
//                       </td>
//                     </tr>
//                   )}
//                 </tbody>
//               </table>
//             </div>

//             {enriching && (
//               <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5 text-xs text-gray-600">
//                 <div className="w-3 h-3 border border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
//                 Loading portfolio &amp; plan data…
//               </div>
//             )}
//           </>
//         )}
//       </div>

//       {/* ── Pagination ── */}
//       {totalPages > 1 && (
//         <div className="flex items-center justify-center gap-2">
//           <button
//             onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchUsers(p, search, planFilter, statusFilter); }}
//             disabled={page === 1}
//             className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
//           >
//             Previous
//           </button>
//           <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
//           <button
//             onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchUsers(p, search, planFilter, statusFilter); }}
//             disabled={page === totalPages}
//             className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
//           >
//             Next
//           </button>
//         </div>
//       )}
//     </div>
//   );
// }


















// --------------------------------------------------------






// import { useState, useEffect, useCallback } from "react";
// import { useNavigate } from "react-router";
// import { motion } from "motion/react";
// import {
//   Search, TrendingUp, TrendingDown, Users, UserCheck,
//   UserX, Crown, Eye, AlertCircle, RefreshCw, IndianRupee,
// } from "lucide-react";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken = () => localStorage.getItem("access_token");
// const authHdr  = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

// const statusColors = {
//   ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
//   Active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
//   PENDING:   "bg-amber-500/10  text-amber-400  border-amber-500/15",
//   Pending:   "bg-amber-500/10  text-amber-400  border-amber-500/15",
//   INACTIVE:  "bg-gray-500/10   text-gray-500   border-gray-500/15",
//   Inactive:  "bg-gray-500/10   text-gray-500   border-gray-500/15",
//   SUSPENDED: "bg-red-500/10    text-red-400    border-red-500/15",
//   Suspended: "bg-red-500/10    text-red-400    border-red-500/15",
//   BLOCKED:   "bg-red-500/10    text-red-400    border-red-500/15",
//   BANNED:    "bg-red-900/20    text-red-500    border-red-900/30",
// };
// const planColors = {
//   Elite:      "bg-violet-500/10 text-violet-300 border-violet-500/15",
//   ELITE:      "bg-violet-500/10 text-violet-300 border-violet-500/15",
//   ENTERPRISE: "bg-violet-500/10 text-violet-300 border-violet-500/15",
//   Pro:        "bg-cyan-500/10   text-cyan-300   border-cyan-500/15",
//   PRO:        "bg-cyan-500/10   text-cyan-300   border-cyan-500/15",
//   PREMIUM:    "bg-cyan-500/10   text-cyan-300   border-cyan-500/15",
//   Basic:      "bg-blue-500/10   text-blue-300   border-blue-500/15",
//   BASIC:      "bg-blue-500/10   text-blue-300   border-blue-500/15",
//   Free:       "bg-white/5       text-gray-500   border-white/5",
//   FREE:       "bg-white/5       text-gray-500   border-white/5",
// };

// /* ── Currency formatter — wallet/portfolio values are always in INR
//      (Razorpay processes deposits in INR; the Wallets model defaults to INR) ── */
// const fmtINR = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// /*
//    FIX — "Total Return +0.0%" bug:
//    The backend Portfolios row stores `total_return_percent` as a column, but
//    it is only recalculated when a trade executes (see trade_orders routes).
//    For portfolios with deposits/holdings created via seeders or admin actions
//    without a matching trade event, total_return_percent stays NULL/0 even
//    though current_value and total_invested are both non-zero.

//    SOLUTION: if the backend value is missing/zero AND total_invested > 0,
//    derive the return client-side from current_value vs total_invested —
//    this is the same formula the backend itself uses
//    (total_return_percent = (current_value - total_invested) / total_invested * 100).
// */
// function deriveReturn(p) {
//   const currentValue   = parseFloat(p.current_value   || 0);
//   const totalInvested  = parseFloat(p.total_invested  || 0);
//   const backendPct     = parseFloat(p.total_return_percent || 0);
//   const backendAbs     = parseFloat(p.total_return || p.profit_loss || 0);

//   // If backend already computed a non-zero return, trust it
//   if (backendPct !== 0 || backendAbs !== 0) {
//     return { pct: backendPct, abs: backendAbs };
//   }
//   // Otherwise derive from current_value vs total_invested
//   if (totalInvested > 0) {
//     const abs = currentValue - totalInvested;
//     const pct = (abs / totalInvested) * 100;
//     return { pct, abs };
//   }
//   return { pct: 0, abs: 0 };
// }

// // ── Enrich a single user row with portfolio + subscription data ───────────────
// async function enrichUser(u) {
//   const userId = u.user_id || u.id;
//   const result = {
//     id:             userId,
//     name:           u.full_name || u.name || "—",
//     email:          u.email     || "—",
//     avatar:         (u.full_name || u.name || "U").slice(0, 2).toUpperCase(),
//     status:         u.status    || "ACTIVE",
//     country:        u.country   || u.profile?.country || "—",
//     lastLogin:      u.last_login ? new Date(u.last_login).toLocaleDateString() : "—",
//     joinedAt:       u.created_on || u.created_at || "",
//     // defaults — overwritten if APIs respond
//     plan:           "Free",
//     portfolioValue: 0,
//     totalReturn:    0,
//     totalReturnPct: 0,
//     holdings:       0,
//   };

//   await Promise.allSettled([
//     // Portfolio
//     (async () => {
//       const res  = await fetch(
//         `${API_BASE}/portfolios/admin/all?user_id=${userId}&per_page=1`,
//         { headers: authHdr() }
//       );
//       const data = await res.json();
//       if (data.bool && data.response?.portfolios?.length > 0) {
//         const p = data.response.portfolios[0];
//         result.portfolioValue = parseFloat(p.current_value || p.total_value || 0);
//         result.holdings       = parseInt(p.total_holdings_count || p.holdings_count || 0, 10);
//         // FIX: derive return when backend hasn't computed it yet
//         const { pct, abs } = deriveReturn(p);
//         result.totalReturnPct = pct;
//         result.totalReturn    = abs;
//       }
//     })(),
//     // Subscription
//     (async () => {
//       const res  = await fetch(
//         `${API_BASE}/subscriptions/admin/all?user_id=${userId}&status=ACTIVE&per_page=1`,
//         { headers: authHdr() }
//       );
//       const data = await res.json();
//       if (data.bool && data.response?.subscriptions?.length > 0) {
//         const s = data.response.subscriptions[0];
//         result.plan =
//           s.plan?.plan_name      ||
//           s.plan_name            ||
//           s.plan?.plan_tier      ||
//           s.plan_tier            || "Free";
//       }
//     })(),
//     // Profile (country fallback)
//     (async () => {
//       if (result.country !== "—") return;
//       const res  = await fetch(`${API_BASE}/user_profiles/${userId}`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) {
//         result.country = data.response.country || data.response.location || "—";
//       }
//     })(),
//   ]);

//   return result;
// }

// export function AdminUsers() {
//   const navigate = useNavigate();

//   const [search,       setSearch]       = useState("");
//   const [planFilter,   setPlan]         = useState("All");
//   const [statusFilter, setStat]         = useState("All");
//   const [sortBy,       setSortBy]       = useState("name");
//   const [users,        setUsers]        = useState([]);
//   const [summaryStats, setSummaryStats] = useState({ total: 0, active: 0, suspended: 0, elite: 0, totalValue: 0 });
//   const [loading,      setLoading]      = useState(true);
//   const [enriching,    setEnriching]    = useState(false);
//   const [error,        setError]        = useState("");
//   const [page,         setPage]         = useState(1);
//   const [totalPages,   setTotalPages]   = useState(1);
//   const [totalUsers,   setTotalUsers]   = useState(0);

//   const fetchUsers = useCallback(async (pageNum = 1, searchTerm = "", plan = "All", status = "All") => {
//     setLoading(true);
//     setError("");
//     try {
//       const params = new URLSearchParams({ page: pageNum, per_page: 20 });
//       if (searchTerm.trim()) params.set("search",  searchTerm.trim());
//       if (plan   !== "All") params.set("plan",     plan);
//       if (status !== "All") params.set("status",   status.toUpperCase());

//       const res  = await fetch(`${API_BASE}/users/list_users?${params}`, { headers: authHdr() });
//       const data = await res.json();

//       if (!data.bool) {
//         if (data.status === 401 || data.status === 403) { navigate("/signin?role=admin"); return; }
//         setError(data.response?.message || "Failed to load users.");
//         setLoading(false);
//         return;
//       }

//       const raw        = data.response?.users || data.response || [];
//       const pagination = data.response?.pagination || {};
//       const total      = data.response?.total       || pagination.total  || raw.length;
//       const pages      = data.response?.total_pages || pagination.total_pages || Math.ceil(total / 20) || 1;

//       setTotalUsers(total);
//       setTotalPages(pages);

//       const baseRows = raw.map((u) => ({
//         id:             u.user_id || u.id,
//         name:           u.full_name || u.name || "—",
//         email:          u.email     || "—",
//         avatar:         (u.full_name || u.name || "U").slice(0, 2).toUpperCase(),
//         status:         u.status    || "ACTIVE",
//         country:        u.country   || "—",
//         lastLogin:      u.last_login ? new Date(u.last_login).toLocaleDateString() : "—",
//         plan:           "—",
//         portfolioValue: null,
//         totalReturn:    0,
//         totalReturnPct: 0,
//         holdings:       null,
//       }));
//       setUsers(baseRows);
//       setLoading(false);

//       setEnriching(true);
//       const BATCH = 5;
//       const enriched = [...baseRows];
//       for (let i = 0; i < raw.length; i += BATCH) {
//         const batch   = raw.slice(i, i + BATCH);
//         const results = await Promise.allSettled(batch.map((u) => enrichUser(u)));
//         results.forEach((r, j) => {
//           if (r.status === "fulfilled") enriched[i + j] = r.value;
//         });
//         setUsers([...enriched]);
//       }

//       setSummaryStats({
//         total:      total,
//         active:     enriched.filter(u => ["ACTIVE","Active"].includes(u.status)).length,
//         suspended:  enriched.filter(u => ["SUSPENDED","BANNED","BLOCKED"].includes(u.status)).length,
//         elite:      enriched.filter(u => ["Elite","ELITE","ENTERPRISE","PREMIUM"].includes(u.plan)).length,
//         totalValue: enriched.reduce((a, u) => a + (u.portfolioValue || 0), 0),
//       });
//     } catch (e) {
//       setError("Network error. Could not load users.");
//       setLoading(false);
//     } finally {
//       setEnriching(false);
//     }
//   }, [navigate]);

//   useEffect(() => {
//     setPage(1);
//     fetchUsers(1, search, planFilter, statusFilter);
//   }, [planFilter, statusFilter]); // eslint-disable-line

//   useEffect(() => {
//     const t = setTimeout(() => { setPage(1); fetchUsers(1, search, planFilter, statusFilter); }, 450);
//     return () => clearTimeout(t);
//   }, [search]); // eslint-disable-line

//   const filtered = [...users].sort((a, b) => {
//     if (sortBy === "value")  return (b.portfolioValue || 0) - (a.portfolioValue || 0);
//     if (sortBy === "return") return (b.totalReturnPct || 0) - (a.totalReturnPct || 0);
//     return (a.name || "").localeCompare(b.name || "");
//   });

//   const fmtValue = (v) => {
//     if (v === null) return <span className="text-gray-700 text-xs animate-pulse">…</span>;
//     return fmtINR(v);
//   };
//   const fmtHoldings = (v) => {
//     if (v === null) return <span className="text-gray-700 text-xs animate-pulse">…</span>;
//     return `${v} stocks`;
//   };

//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-xl font-bold text-white">All Users</h1>
//           <p className="text-sm text-gray-500 mt-0.5">View and manage every registered investor</p>
//         </div>
//         <div className="flex items-center gap-2">
//           <button
//             onClick={() => fetchUsers(page, search, planFilter, statusFilter)}
//             className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
//           >
//             <RefreshCw className={`w-4 h-4 ${enriching ? "animate-spin" : ""}`} />
//           </button>
//           <div className="flex items-center gap-2 text-xs text-gray-500 bg-[#0C1220] border border-white/5 px-3 py-2 rounded-xl">
//             <Users className="w-3.5 h-3.5 text-violet-400" />
//             <span>{totalUsers} total users</span>
//           </div>
//         </div>
//       </div>

//       {error && (
//         <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
//           <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
//         </div>
//       )}

//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//         {[
//           {
//             label: "Total Portfolio Value",
//             value: `₹${(summaryStats.totalValue / 100000).toFixed(2)}L`,
//             icon: IndianRupee, color: "text-violet-400", bg: "border-violet-500/15",
//           },
//           {
//             label: "Active Users",
//             value: summaryStats.active.toString(),
//             icon: UserCheck, color: "text-emerald-400", bg: "border-emerald-500/15",
//           },
//           {
//             label: "Suspended / Banned",
//             value: summaryStats.suspended.toString(),
//             icon: UserX, color: "text-red-400", bg: "border-red-500/15",
//           },
//           {
//             label: "Elite / Premium",
//             value: summaryStats.elite.toString(),
//             icon: Crown, color: "text-amber-400", bg: "border-amber-500/15",
//           },
//         ].map((s, i) => (
//           <div key={i} className={`bg-[#0C1220] border ${s.bg} rounded-2xl p-4`}>
//             <div className="flex items-center justify-between mb-2">
//               <span className="text-xs text-gray-500">{s.label}</span>
//               <s.icon className={`w-4 h-4 ${s.color}`} />
//             </div>
//             <div className="text-2xl font-bold text-white">{s.value}</div>
//           </div>
//         ))}
//       </div>

//       <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
//         <div className="relative flex-1 min-w-[200px] max-w-sm">
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
//           <input
//             type="text"
//             value={search}
//             onChange={(e) => setSearch(e.target.value)}
//             placeholder="Search by name or email…"
//             className="w-full bg-[#0C1220] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500/30 transition-colors"
//           />
//         </div>
//         <div className="flex gap-2 flex-wrap">
//           {["All", "Free", "Basic", "Pro", "Premium", "Enterprise"].map((p) => (
//             <button key={p} onClick={() => setPlan(p)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${
//                 planFilter === p
//                   ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
//                   : "border-white/8 text-gray-600 hover:text-white"
//               }`}>
//               {p}
//             </button>
//           ))}
//         </div>
//         <div className="flex gap-2 flex-wrap">
//           {["All", "Active", "Pending", "Suspended", "Banned"].map((s) => (
//             <button key={s} onClick={() => setStat(s)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${
//                 statusFilter === s
//                   ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
//                   : "border-white/8 text-gray-600 hover:text-white"
//               }`}>
//               {s}
//             </button>
//           ))}
//         </div>
//         <div className="flex gap-2 ml-auto">
//           {[["value","By Value"],["return","By Return"],["name","By Name"]].map(([v, l]) => (
//             <button key={v} onClick={() => setSortBy(v)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${
//                 sortBy === v
//                   ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
//                   : "border-white/8 text-gray-600 hover:text-white"
//               }`}>
//               {l}
//             </button>
//           ))}
//         </div>
//       </div>

//       <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//         {loading ? (
//           <div className="flex items-center justify-center py-16">
//             <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//           </div>
//         ) : (
//           <>
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["User", "Country", "Plan", "Portfolio Value", "Total Return", "Holdings", "Status", "Action"].map((h) => (
//                       <th key={h} className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {filtered.map((u, i) => {
//                     const up = (u.totalReturnPct || 0) >= 0;
//                     return (
//                       <motion.tr
//                         key={u.id || i}
//                         initial={{ opacity: 0 }}
//                         animate={{ opacity: 1 }}
//                         transition={{ delay: i * 0.03 }}
//                         className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
//                         onClick={() => navigate(`/admin/users/${u.id}`)}
//                       >
//                         <td className="px-5 py-4">
//                           <div className="flex items-center gap-3">
//                             <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
//                               {u.avatar}
//                             </div>
//                             <div>
//                               <div className="text-sm font-semibold text-white">{u.name}</div>
//                               <div className="text-xs text-gray-600">{u.email}</div>
//                             </div>
//                           </div>
//                         </td>
//                         <td className="px-5 py-4 text-sm text-gray-400">
//                           {u.country || "—"}
//                         </td>
//                         <td className="px-5 py-4">
//                           {u.plan === "—" ? (
//                             <span className="text-gray-700 text-xs animate-pulse">…</span>
//                           ) : (
//                             <span className={`text-xs px-2.5 py-1 rounded-full border ${planColors[u.plan] || planColors.Free}`}>
//                               {u.plan}
//                             </span>
//                           )}
//                         </td>
//                         <td className="px-5 py-4 text-sm font-semibold text-white">
//                           {fmtValue(u.portfolioValue)}
//                         </td>
//                         <td className={`px-5 py-4 text-sm font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>
//                           {u.portfolioValue === null ? (
//                             <span className="text-gray-700 text-xs animate-pulse">…</span>
//                           ) : u.portfolioValue === 0 ? (
//                             <span className="text-xs text-gray-700">No holdings</span>
//                           ) : (
//                             <>
//                               <div className="flex items-center gap-1">
//                                 {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
//                                 {up ? "+" : ""}{(u.totalReturnPct || 0).toFixed(1)}%
//                               </div>
//                               <div className="text-xs opacity-70">
//                                 {up ? "+" : "-"}{fmtINR(Math.abs(u.totalReturn || 0))}
//                               </div>
//                             </>
//                           )}
//                         </td>
//                         <td className="px-5 py-4 text-sm text-gray-400">
//                           {fmtHoldings(u.holdings)}
//                         </td>
//                         <td className="px-5 py-4">
//                           <span className={`text-xs px-2.5 py-1 rounded-full border ${statusColors[u.status] || statusColors.Inactive}`}>
//                             {u.status}
//                           </span>
//                         </td>
//                         <td className="px-5 py-4">
//                           <button className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs text-violet-300 hover:bg-violet-500/20 transition-all opacity-0 group-hover:opacity-100">
//                             <Eye className="w-3 h-3" /> View
//                           </button>
//                         </td>
//                       </motion.tr>
//                     );
//                   })}
//                   {filtered.length === 0 && !loading && (
//                     <tr>
//                       <td colSpan={8} className="py-12 text-center text-gray-600 text-sm">
//                         No users match your filters
//                       </td>
//                     </tr>
//                   )}
//                 </tbody>
//               </table>
//             </div>

//             {enriching && (
//               <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5 text-xs text-gray-600">
//                 <div className="w-3 h-3 border border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
//                 Loading portfolio &amp; plan data…
//               </div>
//             )}
//           </>
//         )}
//       </div>

//       {totalPages > 1 && (
//         <div className="flex items-center justify-center gap-2">
//           <button
//             onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchUsers(p, search, planFilter, statusFilter); }}
//             disabled={page === 1}
//             className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
//           >
//             Previous
//           </button>
//           <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
//           <button
//             onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchUsers(p, search, planFilter, statusFilter); }}
//             disabled={page === totalPages}
//             className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
//           >
//             Next
//           </button>
//         </div>
//       )}
//     </div>
//   );
// }
















// ************************************** Dollor code ***********************************



// import { useState, useEffect, useCallback } from "react";
// import { useNavigate } from "react-router";
// import { motion } from "motion/react";
// import {
//   Search, TrendingUp, TrendingDown, Users, UserCheck,
//   UserX, Crown, Eye, AlertCircle, RefreshCw,
// } from "lucide-react";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken = () => localStorage.getItem("access_token");
// const authHdr  = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

// const statusColors = {
//   ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
//   Active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
//   PENDING:   "bg-amber-500/10  text-amber-400  border-amber-500/15",
//   Pending:   "bg-amber-500/10  text-amber-400  border-amber-500/15",
//   INACTIVE:  "bg-gray-500/10   text-gray-500   border-gray-500/15",
//   Inactive:  "bg-gray-500/10   text-gray-500   border-gray-500/15",
//   SUSPENDED: "bg-red-500/10    text-red-400    border-red-500/15",
//   Suspended: "bg-red-500/10    text-red-400    border-red-500/15",
//   BLOCKED:   "bg-red-500/10    text-red-400    border-red-500/15",
//   BANNED:    "bg-red-900/20    text-red-500    border-red-900/30",
// };
// const planColors = {
//   Elite:      "bg-violet-500/10 text-violet-300 border-violet-500/15",
//   ELITE:      "bg-violet-500/10 text-violet-300 border-violet-500/15",
//   ENTERPRISE: "bg-violet-500/10 text-violet-300 border-violet-500/15",
//   Pro:        "bg-cyan-500/10   text-cyan-300   border-cyan-500/15",
//   PRO:        "bg-cyan-500/10   text-cyan-300   border-cyan-500/15",
//   PREMIUM:    "bg-cyan-500/10   text-cyan-300   border-cyan-500/15",
//   Basic:      "bg-blue-500/10   text-blue-300   border-blue-500/15",
//   BASIC:      "bg-blue-500/10   text-blue-300   border-blue-500/15",
//   Free:       "bg-white/5       text-gray-500   border-white/5",
//   FREE:       "bg-white/5       text-gray-500   border-white/5",
// };

// // ── Enrich a single user row with portfolio + subscription data ───────────────
// async function enrichUser(u) {
//   const userId = u.user_id || u.id;
//   const result = {
//     id:             userId,
//     name:           u.full_name || u.name || "—",
//     email:          u.email     || "—",
//     avatar:         (u.full_name || u.name || "U").slice(0, 2).toUpperCase(),
//     status:         u.status    || "ACTIVE",
//     country:        u.country   || u.profile?.country || "—",
//     lastLogin:      u.last_login ? new Date(u.last_login).toLocaleDateString() : "—",
//     joinedAt:       u.created_on || u.created_at || "",
//     // defaults — overwritten if APIs respond
//     plan:           "Free",
//     portfolioValue: 0,
//     totalReturn:    0,
//     totalReturnPct: 0,
//     holdings:       0,
//   };

//   // Run portfolio + subscription fetch in parallel (silent on failure)
//   await Promise.allSettled([
//     // Portfolio
//     (async () => {
//       const res  = await fetch(
//         `${API_BASE}/portfolios/admin/all?user_id=${userId}&per_page=1`,
//         { headers: authHdr() }
//       );
//       const data = await res.json();
//       if (data.bool && data.response?.portfolios?.length > 0) {
//         const p = data.response.portfolios[0];
//         result.portfolioValue = parseFloat(p.current_value  || p.total_value  || 0);
//         result.totalReturn    = parseFloat(p.total_return   || p.profit_loss  || 0);
//         result.totalReturnPct = parseFloat(p.total_return_percent || p.return_pct || 0);
//         result.holdings       = parseInt(p.total_holdings_count || p.holdings_count || 0, 10);
//       }
//     })(),
//     // Subscription
//     (async () => {
//       const res  = await fetch(
//         `${API_BASE}/subscriptions/admin/all?user_id=${userId}&status=ACTIVE&per_page=1`,
//         { headers: authHdr() }
//       );
//       const data = await res.json();
//       if (data.bool && data.response?.subscriptions?.length > 0) {
//         const s = data.response.subscriptions[0];
//         result.plan =
//           s.plan?.plan_name      ||
//           s.plan_name            ||
//           s.plan?.plan_tier      ||
//           s.plan_tier            || "Free";
//       }
//     })(),
//     // Profile (country fallback)
//     (async () => {
//       if (result.country !== "—") return; // already have it from _user_dict
//       const res  = await fetch(`${API_BASE}/user_profiles/${userId}`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) {
//         result.country = data.response.country || data.response.location || "—";
//       }
//     })(),
//   ]);

//   return result;
// }

// export function AdminUsers() {
//   const navigate = useNavigate();

//   const [search,       setSearch]       = useState("");
//   const [planFilter,   setPlan]         = useState("All");
//   const [statusFilter, setStat]         = useState("All");
//   const [sortBy,       setSortBy]       = useState("name");
//   const [users,        setUsers]        = useState([]);
//   const [summaryStats, setSummaryStats] = useState({ total: 0, active: 0, suspended: 0, elite: 0, totalValue: 0 });
//   const [loading,      setLoading]      = useState(true);
//   const [enriching,    setEnriching]    = useState(false);
//   const [error,        setError]        = useState("");
//   const [page,         setPage]         = useState(1);
//   const [totalPages,   setTotalPages]   = useState(1);
//   const [totalUsers,   setTotalUsers]   = useState(0);

//   // ── Fetch base user list ────────────────────────────────────────────────────
//   const fetchUsers = useCallback(async (pageNum = 1, searchTerm = "", plan = "All", status = "All") => {
//     setLoading(true);
//     setError("");
//     try {
//       const params = new URLSearchParams({ page: pageNum, per_page: 20 });
//       if (searchTerm.trim()) params.set("search",  searchTerm.trim());
//       if (plan   !== "All") params.set("plan",     plan);
//       if (status !== "All") params.set("status",   status.toUpperCase());

//       const res  = await fetch(`${API_BASE}/users/list_users?${params}`, { headers: authHdr() });
//       const data = await res.json();

//       if (!data.bool) {
//         if (data.status === 401 || data.status === 403) { navigate("/signin?role=admin"); return; }
//         setError(data.response?.message || "Failed to load users.");
//         setLoading(false);
//         return;
//       }

//       const raw        = data.response?.users || data.response || [];
//       const pagination = data.response?.pagination || {};
//       const total      = data.response?.total       || pagination.total  || raw.length;
//       const pages      = data.response?.total_pages || pagination.total_pages || Math.ceil(total / 20) || 1;

//       setTotalUsers(total);
//       setTotalPages(pages);

//       // Build base rows immediately so table renders fast
//       const baseRows = raw.map((u) => ({
//         id:             u.user_id || u.id,
//         name:           u.full_name || u.name || "—",
//         email:          u.email     || "—",
//         avatar:         (u.full_name || u.name || "U").slice(0, 2).toUpperCase(),
//         status:         u.status    || "ACTIVE",
//         country:        u.country   || "—",    // _user_dict joins profile.country
//         lastLogin:      u.last_login ? new Date(u.last_login).toLocaleDateString() : "—",
//         plan:           "—",                   // filled after enrichment
//         portfolioValue: null,                  // null = loading
//         totalReturn:    0,
//         totalReturnPct: 0,
//         holdings:       null,                  // null = loading
//       }));
//       setUsers(baseRows);
//       setLoading(false);

//       // ── Enrich rows with portfolio + subscription data in batches of 5 ──────
//       setEnriching(true);
//       const BATCH = 5;
//       const enriched = [...baseRows];
//       for (let i = 0; i < raw.length; i += BATCH) {
//         const batch   = raw.slice(i, i + BATCH);
//         const results = await Promise.allSettled(batch.map((u) => enrichUser(u)));
//         results.forEach((r, j) => {
//           if (r.status === "fulfilled") enriched[i + j] = r.value;
//         });
//         setUsers([...enriched]); // update table progressively
//       }

//       // Recompute summary from enriched data
//       setSummaryStats({
//         total:      total,
//         active:     enriched.filter(u => ["ACTIVE","Active"].includes(u.status)).length,
//         suspended:  enriched.filter(u => ["SUSPENDED","BANNED","BLOCKED"].includes(u.status)).length,
//         elite:      enriched.filter(u => ["Elite","ELITE","ENTERPRISE","PREMIUM"].includes(u.plan)).length,
//         totalValue: enriched.reduce((a, u) => a + (u.portfolioValue || 0), 0),
//       });
//     } catch (e) {
//       setError("Network error. Could not load users.");
//       setLoading(false);
//     } finally {
//       setEnriching(false);
//     }
//   }, [navigate]);

//   // ── Initial load + filter changes ──────────────────────────────────────────
//   useEffect(() => {
//     setPage(1);
//     fetchUsers(1, search, planFilter, statusFilter);
//   }, [planFilter, statusFilter]); // eslint-disable-line

//   // ── Debounced search ────────────────────────────────────────────────────────
//   useEffect(() => {
//     const t = setTimeout(() => { setPage(1); fetchUsers(1, search, planFilter, statusFilter); }, 450);
//     return () => clearTimeout(t);
//   }, [search]); // eslint-disable-line

//   // ── Sort client-side ────────────────────────────────────────────────────────
//   const filtered = [...users].sort((a, b) => {
//     if (sortBy === "value")  return (b.portfolioValue || 0) - (a.portfolioValue || 0);
//     if (sortBy === "return") return (b.totalReturnPct || 0) - (a.totalReturnPct || 0);
//     return (a.name || "").localeCompare(b.name || "");
//   });

//   // ── Helpers ─────────────────────────────────────────────────────────────────
//   const fmtValue = (v) => {
//     if (v === null) return <span className="text-gray-700 text-xs animate-pulse">…</span>;
//     return `$${Number(v).toLocaleString("en", { maximumFractionDigits: 0 })}`;
//   };
//   const fmtHoldings = (v) => {
//     if (v === null) return <span className="text-gray-700 text-xs animate-pulse">…</span>;
//     return `${v} stocks`;
//   };

//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
//       {/* ── Header ── */}
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-xl font-bold text-white">All Users</h1>
//           <p className="text-sm text-gray-500 mt-0.5">View and manage every registered investor</p>
//         </div>
//         <div className="flex items-center gap-2">
//           <button
//             onClick={() => fetchUsers(page, search, planFilter, statusFilter)}
//             className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
//           >
//             <RefreshCw className={`w-4 h-4 ${enriching ? "animate-spin" : ""}`} />
//           </button>
//           <div className="flex items-center gap-2 text-xs text-gray-500 bg-[#0C1220] border border-white/5 px-3 py-2 rounded-xl">
//             <Users className="w-3.5 h-3.5 text-violet-400" />
//             <span>{totalUsers} total users</span>
//           </div>
//         </div>
//       </div>

//       {/* ── Error ── */}
//       {error && (
//         <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
//           <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
//         </div>
//       )}

//       {/* ── Summary cards ── */}
//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//         {[
//           {
//             label: "Total Portfolio Value",
//             value: `$${(summaryStats.totalValue / 1000).toFixed(0)}K`,
//             icon: Crown, color: "text-violet-400", bg: "border-violet-500/15",
//           },
//           {
//             label: "Active Users",
//             value: summaryStats.active.toString(),
//             icon: UserCheck, color: "text-emerald-400", bg: "border-emerald-500/15",
//           },
//           {
//             label: "Suspended / Banned",
//             value: summaryStats.suspended.toString(),
//             icon: UserX, color: "text-red-400", bg: "border-red-500/15",
//           },
//           {
//             label: "Elite / Premium",
//             value: summaryStats.elite.toString(),
//             icon: Crown, color: "text-amber-400", bg: "border-amber-500/15",
//           },
//         ].map((s, i) => (
//           <div key={i} className={`bg-[#0C1220] border ${s.bg} rounded-2xl p-4`}>
//             <div className="flex items-center justify-between mb-2">
//               <span className="text-xs text-gray-500">{s.label}</span>
//               <s.icon className={`w-4 h-4 ${s.color}`} />
//             </div>
//             <div className="text-2xl font-bold text-white">{s.value}</div>
//           </div>
//         ))}
//       </div>

//       {/* ── Filters ── */}
//       <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
//         {/* Search */}
//         <div className="relative flex-1 min-w-[200px] max-w-sm">
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
//           <input
//             type="text"
//             value={search}
//             onChange={(e) => setSearch(e.target.value)}
//             placeholder="Search by name or email…"
//             className="w-full bg-[#0C1220] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500/30 transition-colors"
//           />
//         </div>
//         {/* Plan filter */}
//         <div className="flex gap-2 flex-wrap">
//           {["All", "Free", "Basic", "Pro", "Premium", "Enterprise"].map((p) => (
//             <button key={p} onClick={() => setPlan(p)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${
//                 planFilter === p
//                   ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
//                   : "border-white/8 text-gray-600 hover:text-white"
//               }`}>
//               {p}
//             </button>
//           ))}
//         </div>
//         {/* Status filter */}
//         <div className="flex gap-2 flex-wrap">
//           {["All", "Active", "Pending", "Suspended", "Banned"].map((s) => (
//             <button key={s} onClick={() => setStat(s)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${
//                 statusFilter === s
//                   ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
//                   : "border-white/8 text-gray-600 hover:text-white"
//               }`}>
//               {s}
//             </button>
//           ))}
//         </div>
//         {/* Sort */}
//         <div className="flex gap-2 ml-auto">
//           {[["value","By Value"],["return","By Return"],["name","By Name"]].map(([v, l]) => (
//             <button key={v} onClick={() => setSortBy(v)}
//               className={`px-3 py-2 text-xs rounded-xl border transition-all ${
//                 sortBy === v
//                   ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
//                   : "border-white/8 text-gray-600 hover:text-white"
//               }`}>
//               {l}
//             </button>
//           ))}
//         </div>
//       </div>

//       {/* ── Table ── */}
//       <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//         {loading ? (
//           <div className="flex items-center justify-center py-16">
//             <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//           </div>
//         ) : (
//           <>
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["User", "Country", "Plan", "Portfolio Value", "Total Return", "Holdings", "Status", "Action"].map((h) => (
//                       <th key={h} className="px-5 py-3.5 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {filtered.map((u, i) => {
//                     const up = (u.totalReturnPct || 0) >= 0;
//                     return (
//                       <motion.tr
//                         key={u.id || i}
//                         initial={{ opacity: 0 }}
//                         animate={{ opacity: 1 }}
//                         transition={{ delay: i * 0.03 }}
//                         className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
//                         onClick={() => navigate(`/admin/users/${u.id}`)}
//                       >
//                         {/* User */}
//                         <td className="px-5 py-4">
//                           <div className="flex items-center gap-3">
//                             <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
//                               {u.avatar}
//                             </div>
//                             <div>
//                               <div className="text-sm font-semibold text-white">{u.name}</div>
//                               <div className="text-xs text-gray-600">{u.email}</div>
//                             </div>
//                           </div>
//                         </td>
//                         {/* Country */}
//                         <td className="px-5 py-4 text-sm text-gray-400">
//                           {u.country || "—"}
//                         </td>
//                         {/* Plan */}
//                         <td className="px-5 py-4">
//                           {u.plan === "—" ? (
//                             <span className="text-gray-700 text-xs animate-pulse">…</span>
//                           ) : (
//                             <span className={`text-xs px-2.5 py-1 rounded-full border ${planColors[u.plan] || planColors.Free}`}>
//                               {u.plan}
//                             </span>
//                           )}
//                         </td>
//                         {/* Portfolio Value */}
//                         <td className="px-5 py-4 text-sm font-semibold text-white">
//                           {fmtValue(u.portfolioValue)}
//                         </td>
//                         {/* Total Return */}
//                         <td className={`px-5 py-4 text-sm font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>
//                           {u.portfolioValue === null ? (
//                             <span className="text-gray-700 text-xs animate-pulse">…</span>
//                           ) : (
//                             <>
//                               <div className="flex items-center gap-1">
//                                 {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
//                                 {up ? "+" : ""}{(u.totalReturnPct || 0).toFixed(1)}%
//                               </div>
//                               <div className="text-xs opacity-70">
//                                 {up ? "+" : "-"}${Math.abs(u.totalReturn || 0).toLocaleString("en", { maximumFractionDigits: 0 })}
//                               </div>
//                             </>
//                           )}
//                         </td>
//                         {/* Holdings */}
//                         <td className="px-5 py-4 text-sm text-gray-400">
//                           {fmtHoldings(u.holdings)}
//                         </td>
//                         {/* Status */}
//                         <td className="px-5 py-4">
//                           <span className={`text-xs px-2.5 py-1 rounded-full border ${statusColors[u.status] || statusColors.Inactive}`}>
//                             {u.status}
//                           </span>
//                         </td>
//                         {/* Action */}
//                         <td className="px-5 py-4">
//                           <button className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs text-violet-300 hover:bg-violet-500/20 transition-all opacity-0 group-hover:opacity-100">
//                             <Eye className="w-3 h-3" /> View
//                           </button>
//                         </td>
//                       </motion.tr>
//                     );
//                   })}
//                   {filtered.length === 0 && !loading && (
//                     <tr>
//                       <td colSpan={8} className="py-12 text-center text-gray-600 text-sm">
//                         No users match your filters
//                       </td>
//                     </tr>
//                   )}
//                 </tbody>
//               </table>
//             </div>

//             {/* Enriching indicator */}
//             {enriching && (
//               <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5 text-xs text-gray-600">
//                 <div className="w-3 h-3 border border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
//                 Loading portfolio &amp; plan data…
//               </div>
//             )}
//           </>
//         )}
//       </div>

//       {/* ── Pagination ── */}
//       {totalPages > 1 && (
//         <div className="flex items-center justify-center gap-2">
//           <button
//             onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchUsers(p, search, planFilter, statusFilter); }}
//             disabled={page === 1}
//             className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
//           >
//             Previous
//           </button>
//           <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
//           <button
//             onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchUsers(p, search, planFilter, statusFilter); }}
//             disabled={page === totalPages}
//             className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
//           >
//             Next
//           </button>
//         </div>
//       )}
//     </div>
//   );
// }




















