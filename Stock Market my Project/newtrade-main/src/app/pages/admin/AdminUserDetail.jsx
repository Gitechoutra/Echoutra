import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, TrendingUp, TrendingDown, Ban, Mail, Globe,
  Calendar, Clock, BarChart2, Eye, RefreshCw, AlertCircle,
  CheckCircle2, Crown, KeyRound, MessageSquare, Wallet,
  ShieldCheck, ShieldX, FileText, Activity, X, Loader2,
  ChevronDown, IndianRupee,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip,
  XAxis, YAxis, PieChart, Pie, Cell,
} from "recharts";

const API_BASE  = "http://127.0.0.1:5050/v1";
const getToken  = () => localStorage.getItem("access_token");
const authHdr   = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

const SECTOR_COLORS = ["#8B5CF6","#06B6D4","#F59E0B","#10B981","#EF4444","#F97316","#EC4899"];

/* ── Currency formatter — INR is the platform default (Wallets model) ── */
const fmtINR = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/*
   FIX — same "0% return" root cause as AdminUsers.jsx:
   derive return from current_value vs total_invested when the backend
   hasn't pre-computed total_return_percent on the portfolio row yet.
*/
function deriveReturn(p) {
  const currentValue  = parseFloat(p?.current_value  || 0);
  const totalInvested = parseFloat(p?.total_invested || 0);
  const backendPct    = parseFloat(p?.total_return_percent || 0);
  const backendAbs    = parseFloat(p?.total_return || 0);
  if (backendPct !== 0 || backendAbs !== 0) return { pct: backendPct, abs: backendAbs };
  if (totalInvested > 0) {
    const abs = currentValue - totalInvested;
    return { pct: (abs / totalInvested) * 100, abs };
  }
  return { pct: 0, abs: 0 };
}

// ── Status / plan badge helpers ──────────────────────────────────────────────
const statusCls = {
  ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  PENDING:   "bg-amber-500/10  text-amber-400  border-amber-500/20",
  SUSPENDED: "bg-red-500/10    text-red-400    border-red-500/20",
  Suspended: "bg-red-500/10    text-red-400    border-red-500/20",
  BANNED:    "bg-red-900/20    text-red-500    border-red-900/30",
  Inactive:  "bg-gray-500/10   text-gray-500   border-gray-500/20",
};
const planCls = (plan) =>
  plan === "Elite" || plan === "ENTERPRISE" || plan === "PREMIUM"
    ? "bg-violet-500/10 text-violet-300 border border-violet-500/20"
    : plan === "Pro" || plan === "PRO"
    ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
    : plan === "BASIC"
    ? "bg-blue-500/10 text-blue-300 border border-blue-500/20"
    : "bg-white/5 text-gray-500 border border-white/10";

// ── Tiny toast component ─────────────────────────────────────────────────────
function Toast({ msg, ok, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5
        px-5 py-3 rounded-2xl shadow-2xl border text-sm font-medium
        ${ok
          ? "bg-emerald-900/80 border-emerald-500/30 text-emerald-300"
          : "bg-red-900/80    border-red-500/30    text-red-300"}`}
    >
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
    </motion.div>
  );
}

// ── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ title, desc, confirmLabel, confirmCls, loading, onConfirm, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-[#0C1220] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-bold text-white">{title}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {desc && <p className="text-sm text-gray-400">{desc}</p>}
          {children}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/8 text-sm text-gray-400 hover:text-white"
            >Cancel</button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${confirmCls}`}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  AdminUserDetail
// ─────────────────────────────────────────────────────────────────────────────
export function AdminUserDetail() {
  const { userId } = useParams();
  const navigate   = useNavigate();

  const [userData,     setUserData]     = useState(null);
  const [profile,      setProfile]      = useState(null);
  const [portfolio,    setPortfolio]    = useState(null);
  const [holdings,     setHoldings]     = useState([]);
  const [perfHistory,  setPerfHistory]  = useState([]);
  const [wallet,       setWallet]       = useState(null);
  const [kyc,          setKyc]          = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [sessions,     setSessions]     = useState([]);
  const [plans,        setPlans]        = useState([]);

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError,   setPageError]   = useState("");

  const [toast, setToast] = useState(null);
  const showToast = (msg, ok = true) => setToast({ msg, ok });

  const [modal,       setModal]       = useState(null);
  const [modalInput,  setModalInput]  = useState("");
  const [modalLoading,setModalLoading]= useState(false);

  const [tab, setTab] = useState("overview");

  const apiFetch = useCallback(async (url, options = {}) => {
    const res  = await fetch(url, { headers: authHdr(), ...options });
    const data = await res.json();
    if (res.status === 401 || res.status === 403) {
      navigate("/signin?role=admin");
    }
    return data;
  }, [navigate]);

  const loadUser = useCallback(async () => {
    const data = await apiFetch(`${API_BASE}/users/${userId}`);
    if (data.bool) setUserData(data.response);
    else setPageError(data.response?.message || "Failed to load user.");
  }, [userId, apiFetch]);

  const loadProfile = useCallback(async () => {
    const data = await apiFetch(`${API_BASE}/user_profiles/${userId}`);
    if (data.bool) setProfile(data.response);
  }, [userId, apiFetch]);

  const loadPortfolio = useCallback(async () => {
    const data = await apiFetch(`${API_BASE}/portfolios/admin/all?user_id=${userId}&per_page=1`);
    if (data.bool && data.response?.portfolios?.length > 0) {
      const p = data.response.portfolios[0];
      setPortfolio(p);
      const hData = await apiFetch(`${API_BASE}/portfolios/${p.portfolio_id}`);
      if (hData.bool) {
        setHoldings(hData.response?.holdings || []);
        const perfData = await apiFetch(
          `${API_BASE}/portfolios/${p.portfolio_id}/performance?interval=DAILY&limit=60`
        );
        if (perfData.bool) setPerfHistory(perfData.response?.data || []);
      }
    }
  }, [userId, apiFetch]);

  const loadWallet = useCallback(async () => {
    const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}`);
    if (data.bool) setWallet(data.response);
  }, [userId, apiFetch]);

  const loadKyc = useCallback(async () => {
    const data = await apiFetch(`${API_BASE}/kyc/admin/list?per_page=100`);
    if (data.bool) {
      const found = (data.response?.kyc_submissions || []).find(
        (k) => String(k.user_id) === String(userId)
      );
      setKyc(found || null);
    }
  }, [userId, apiFetch]);

  const loadSubscription = useCallback(async () => {
    const data = await apiFetch(`${API_BASE}/subscriptions/admin/all?user_id=${userId}&status=ACTIVE&per_page=1`);
    if (data.bool && data.response?.subscriptions?.length > 0) {
      setSubscription(data.response.subscriptions[0]);
    }
  }, [userId, apiFetch]);

  const loadSessions = useCallback(async () => {
    const data = await apiFetch(`${API_BASE}/users/${userId}/sessions`);
    if (data.bool) setSessions(data.response?.sessions || []);
  }, [userId, apiFetch]);

  const loadPlans = useCallback(async () => {
    const data = await apiFetch(`${API_BASE}/subscriptions/plans`);
    if (data.bool) setPlans(data.response?.plans || []);
  }, [apiFetch]);

  const loadAll = useCallback(async () => {
    setPageLoading(true);
    setPageError("");
    await Promise.allSettled([
      loadUser(), loadProfile(), loadPortfolio(),
      loadWallet(), loadKyc(), loadSubscription(),
      loadSessions(), loadPlans(),
    ]);
    setPageLoading(false);
  }, [loadUser, loadProfile, loadPortfolio, loadWallet, loadKyc, loadSubscription, loadSessions, loadPlans]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─────────────────────────────────────────────────────────────────────────
  //  Admin Actions
  // ─────────────────────────────────────────────────────────────────────────
  const handleSuspend = async () => {
    if (!modalInput.trim()) return;
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/users/${userId}/suspend`, {
      method: "POST",
      body:   JSON.stringify({ reason: modalInput }),
    });
    setModalLoading(false);
    setModal(null); setModalInput("");
    if (data.bool) { showToast("User suspended."); loadUser(); }
    else showToast(data.response?.message || "Failed.", false);
  };

  const handleActivate = async () => {
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/users/${userId}/status`, {
      method: "PUT",
      body:   JSON.stringify({ status: "ACTIVE", reason: "Admin reinstated account" }),
    });
    setModalLoading(false);
    setModal(null);
    if (data.bool) { showToast("Account activated."); loadUser(); }
    else showToast(data.response?.message || "Failed.", false);
  };

  const handleBan = async () => {
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/users/${userId}/status`, {
      method: "PUT",
      body:   JSON.stringify({ status: "BANNED", reason: modalInput || "Policy violation" }),
    });
    setModalLoading(false);
    setModal(null); setModalInput("");
    if (data.bool) { showToast("User banned."); loadUser(); }
    else showToast(data.response?.message || "Failed.", false);
  };

  const handleResetPassword = async () => {
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/users/${userId}/reset_password`, {
      method: "POST",
    });
    setModalLoading(false);
    setModal(null);
    if (data.bool) {
      showToast(`Temp password: ${data.response?.temp_password || "Sent to user"}`);
    } else showToast(data.response?.message || "Failed.", false);
  };

  const handleUpgradePlan = async () => {
    const planId = modalInput;
    if (!planId) return;
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/subscriptions/admin/upgrade`, {
      method: "POST",
      body:   JSON.stringify({
        user_id:       parseInt(userId),
        plan_id:       parseInt(planId),
        billing_cycle: "MONTHLY",
        note:          "Admin upgrade",
      }),
    });
    setModalLoading(false);
    setModal(null); setModalInput("");
    if (data.bool) { showToast("Plan upgraded."); loadSubscription(); }
    else showToast(data.response?.message || "Failed.", false);
  };

  const handleFreezeWallet = async () => {
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}/freeze`, { method: "POST" });
    setModalLoading(false);
    setModal(null);
    if (data.bool) { showToast("Wallet frozen."); loadWallet(); }
    else showToast(data.response?.message || "Failed.", false);
  };

  const handleUnfreezeWallet = async () => {
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}/unfreeze`, { method: "POST" });
    setModalLoading(false);
    setModal(null);
    if (data.bool) { showToast("Wallet unfrozen."); loadWallet(); }
    else showToast(data.response?.message || "Failed.", false);
  };

  const handleRevokeSessions = async () => {
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/users/${userId}/revoke_sessions`, { method: "POST" });
    setModalLoading(false);
    setModal(null);
    if (data.bool) { showToast("All sessions revoked."); loadSessions(); }
    else showToast(data.response?.message || "Failed.", false);
  };

  const handleApproveKyc = async () => {
    if (!kyc) return;
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/kyc/admin/${kyc.kyc_id}/review`, {
      method: "POST",
      body:   JSON.stringify({ action: "APPROVE", admin_notes: "Documents verified" }),
    });
    setModalLoading(false);
    setModal(null);
    if (data.bool) { showToast("KYC approved."); loadKyc(); }
    else showToast(data.response?.message || "Failed.", false);
  };

  const handleRejectKyc = async () => {
    if (!kyc) return;
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/kyc/admin/${kyc.kyc_id}/review`, {
      method: "POST",
      body:   JSON.stringify({ action: "REJECT", rejection_reason: modalInput || "Documents unclear" }),
    });
    setModalLoading(false);
    setModal(null); setModalInput("");
    if (data.bool) { showToast("KYC rejected."); loadKyc(); }
    else showToast(data.response?.message || "Failed.", false);
  };

  /*
     FIX — notification not reaching the user's bell icon:
     UserLayout.jsx reads `n.message || n.body` to render the notification text
     (it checks `message` FIRST). The previous payload only sent `body`, which
     worked only as a fallback IF the backend Notifications model has a `body`
     column at all. Sending BOTH `message` and `body` with the same content
     guarantees the text displays regardless of which column name the backend
     actually persists to.
  */
  const handleSendMessage = async () => {
    if (!modalInput.trim()) return;
    setModalLoading(true);
    const data = await apiFetch(`${API_BASE}/notifications/admin/send`, {
      method: "POST",
      body:   JSON.stringify({
        user_id:           parseInt(userId),
        broadcast:         false,
        notification_type: "ADMIN_MESSAGE",
        title:             "Message from Admin",
        message:           modalInput,   // ← primary field UserLayout reads
        body:               modalInput,   // ← fallback field, sent for safety
        priority:          "MEDIUM",
      }),
    });
    setModalLoading(false);
    setModal(null); setModalInput("");
    if (data.bool) showToast("Message sent. User will see it within 30 seconds.");
    else showToast(data.response?.message || "Failed.", false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  Sector allocation derived from holdings
  // ─────────────────────────────────────────────────────────────────────────
  const sectorData = (() => {
    if (!holdings.length) return [];
    const totalVal = holdings.reduce((a, h) => a + (h.current_value || 0), 0) || 1;
    const buckets  = {};
    holdings.forEach((h) => {
      const s = h.sector || "Other";
      buckets[s] = (buckets[s] || 0) + (h.current_value || 0);
    });
    return Object.entries(buckets)
      .map(([name, value], i) => ({
        name,
        value: parseFloat(((value / totalVal) * 100).toFixed(1)),
        color: SECTOR_COLORS[i % SECTOR_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  })();

  // ─────────────────────────────────────────────────────────────────────────
  //  Derived display values
  // ─────────────────────────────────────────────────────────────────────────
  const displayName   = userData?.full_name   || profile?.display_name || "—";
  const displayEmail  = userData?.email        || "—";
  const displayAvatar = (displayName).slice(0, 2).toUpperCase();
  const displayStatus = userData?.status       || "—";
  const displayPlan   = subscription?.plan?.plan_name || "Free";
  const displayCountry= profile?.country       || userData?.country || "—";
  const displayJoined = userData?.created_on
    ? new Date(userData.created_on).toLocaleDateString()   : "—";
  const displayLastLogin = userData?.last_login
    ? new Date(userData.last_login).toLocaleDateString()   : "—";

  const totalPortfolioValue = portfolio?.current_value   || 0;
  // FIX: use deriveReturn() instead of trusting potentially-zero backend fields
  const { pct: totalReturnPct, abs: totalReturn } = deriveReturn(portfolio);
  const totalHoldings       = portfolio?.total_holdings_count || holdings.length;
  const up                  = totalReturnPct >= 0;

  const chartData = perfHistory.map((p) => ({
    date:  p.date?.slice(5) || "",
    close: parseFloat(p.total_value || 0),
  }));

  // ─────────────────────────────────────────────────────────────────────────
  //  Loading / error states
  // ─────────────────────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading user details…</p>
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-sm text-red-400">{pageError}</p>
          <button
            onClick={() => navigate("/admin/users")}
            className="text-xs text-gray-500 hover:text-white underline"
          >← Back to Users</button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">

      <AnimatePresence>
        {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {modal === "suspend" && (
          <ConfirmModal
            title="Suspend Account"
            desc="This will immediately revoke all sessions. Enter a reason:"
            confirmLabel="Suspend"
            confirmCls="bg-red-600 hover:bg-red-500"
            loading={modalLoading}
            onConfirm={handleSuspend}
            onClose={() => { setModal(null); setModalInput(""); }}
          >
            <textarea
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              placeholder="Reason for suspension…"
              rows={3}
              className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
            />
          </ConfirmModal>
        )}

        {modal === "ban" && (
          <ConfirmModal
            title="Ban Account"
            desc="Permanently ban this user. Enter reason:"
            confirmLabel="Ban User"
            confirmCls="bg-red-800 hover:bg-red-700"
            loading={modalLoading}
            onConfirm={handleBan}
            onClose={() => { setModal(null); setModalInput(""); }}
          >
            <textarea
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              placeholder="Reason for ban…"
              rows={3}
              className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
            />
          </ConfirmModal>
        )}

        {modal === "activate" && (
          <ConfirmModal
            title="Activate Account"
            desc="Restore this account to ACTIVE status?"
            confirmLabel="Activate"
            confirmCls="bg-emerald-600 hover:bg-emerald-500"
            loading={modalLoading}
            onConfirm={handleActivate}
            onClose={() => setModal(null)}
          />
        )}

        {modal === "reset_pw" && (
          <ConfirmModal
            title="Force Reset Password"
            desc="A temporary password will be generated. The user must change it on next login."
            confirmLabel="Reset Password"
            confirmCls="bg-cyan-600 hover:bg-cyan-500"
            loading={modalLoading}
            onConfirm={handleResetPassword}
            onClose={() => setModal(null)}
          />
        )}

        {modal === "upgrade" && (
          <ConfirmModal
            title="Upgrade Subscription Plan"
            desc="Select a plan to assign to this user:"
            confirmLabel="Upgrade"
            confirmCls="bg-violet-600 hover:bg-violet-500"
            loading={modalLoading}
            onConfirm={handleUpgradePlan}
            onClose={() => { setModal(null); setModalInput(""); }}
          >
            <div className="relative">
              <select
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-white/20 appearance-none"
              >
                <option value="">— Select a plan —</option>
                {plans.map((p) => (
                  <option key={p.plan_id} value={p.plan_id}>
                    {p.plan_name} — ₹{p.price_monthly}/mo
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </ConfirmModal>
        )}

        {modal === "freeze_wallet" && (
          <ConfirmModal
            title="Freeze Wallet"
            desc="The user will not be able to deposit, withdraw or trade until unfrozen."
            confirmLabel="Freeze"
            confirmCls="bg-red-600 hover:bg-red-500"
            loading={modalLoading}
            onConfirm={handleFreezeWallet}
            onClose={() => setModal(null)}
          />
        )}

        {modal === "unfreeze_wallet" && (
          <ConfirmModal
            title="Unfreeze Wallet"
            desc="Restore full wallet access for this user?"
            confirmLabel="Unfreeze"
            confirmCls="bg-emerald-600 hover:bg-emerald-500"
            loading={modalLoading}
            onConfirm={handleUnfreezeWallet}
            onClose={() => setModal(null)}
          />
        )}

        {modal === "revoke_sessions" && (
          <ConfirmModal
            title="Revoke All Sessions"
            desc="All active sessions for this user will be immediately terminated."
            confirmLabel="Revoke All"
            confirmCls="bg-amber-600 hover:bg-amber-500"
            loading={modalLoading}
            onConfirm={handleRevokeSessions}
            onClose={() => setModal(null)}
          />
        )}

        {modal === "kyc_approve" && (
          <ConfirmModal
            title="Approve KYC"
            desc="Mark this user's identity verification as approved?"
            confirmLabel="Approve KYC"
            confirmCls="bg-emerald-600 hover:bg-emerald-500"
            loading={modalLoading}
            onConfirm={handleApproveKyc}
            onClose={() => setModal(null)}
          />
        )}

        {modal === "kyc_reject" && (
          <ConfirmModal
            title="Reject KYC"
            desc="Enter a reason for rejection:"
            confirmLabel="Reject KYC"
            confirmCls="bg-red-600 hover:bg-red-500"
            loading={modalLoading}
            onConfirm={handleRejectKyc}
            onClose={() => { setModal(null); setModalInput(""); }}
          >
            <textarea
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              placeholder="Rejection reason…"
              rows={3}
              className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
            />
          </ConfirmModal>
        )}

        {modal === "message" && (
          <ConfirmModal
            title="Send Admin Message"
            desc="This will appear as a notification in the user's account within 30 seconds:"
            confirmLabel="Send Message"
            confirmCls="bg-violet-600 hover:bg-violet-500"
            loading={modalLoading}
            onConfirm={handleSendMessage}
            onClose={() => { setModal(null); setModalInput(""); }}
          >
            <textarea
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              placeholder="Type your message…"
              rows={3}
              className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
            />
          </ConfirmModal>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate("/admin/users")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Users
        </button>
        <button
          onClick={loadAll}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-gradient-to-br from-[#0F1530] to-[#0C1220] border border-violet-500/15 rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">

          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-2xl font-black text-white shadow-xl shadow-violet-500/20">
              {displayAvatar}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0C1220]
              ${displayStatus === "ACTIVE" || displayStatus === "Active" ? "bg-emerald-400" : "bg-gray-500"}`}
            />
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-white">{displayName}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full border ${statusCls[displayStatus] || statusCls.Inactive}`}>
                {displayStatus}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full ${planCls(displayPlan)}`}>
                {displayPlan} Plan
              </span>
              {userData?.is_email_verified && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ✓ Verified
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{displayEmail}</div>
              <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />{displayCountry}</div>
              <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined {displayJoined}</div>
              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Last login {displayLastLogin}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setModal("message")}
              className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm text-violet-300 hover:bg-violet-500/20 transition-all"
            >
              <Mail className="w-4 h-4" /> Message
            </button>
            {(displayStatus === "SUSPENDED" || displayStatus === "BANNED") ? (
              <button
                onClick={() => setModal("activate")}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-300 hover:bg-emerald-500/20 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" /> Activate
              </button>
            ) : (
              <button
                onClick={() => setModal("suspend")}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 hover:bg-red-500/20 transition-all"
              >
                <Ban className="w-4 h-4" /> Suspend
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Portfolio Value",  value: fmtINR(totalPortfolioValue), up: null },
          { label: "Total Return",     value: totalPortfolioValue > 0 ? `${up?"+":""}${Number(totalReturnPct).toFixed(1)}%` : "—", up: totalPortfolioValue > 0 ? up : null },
          { label: "Total P&L",        value: totalPortfolioValue > 0 ? `${up?"+":"-"}${fmtINR(Math.abs(totalReturn))}` : "—", up: totalPortfolioValue > 0 ? up : null },
          { label: "Holdings",         value: `${totalHoldings} stocks`, up: null },
        ].map((s, i) => (
          <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className={`text-xl font-bold ${s.up === true ? "text-emerald-400" : s.up === false ? "text-red-400" : "text-white"}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 p-1 bg-[#0C1220] border border-white/5 rounded-2xl mb-6 overflow-x-auto">
        {[
          { key: "overview",  label: "Overview",  icon: Eye },
          { key: "holdings",  label: "Holdings",  icon: BarChart2 },
          { key: "wallet",    label: "Wallet",     icon: Wallet },
          { key: "sessions",  label: "Sessions",   icon: Activity },
          { key: "kyc",       label: "KYC",        icon: ShieldCheck },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
              tab === key
                ? "bg-violet-600/20 text-violet-300 border border-violet-500/20"
                : "text-gray-500 hover:text-white"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid lg:grid-cols-3 gap-6">

          <div className="lg:col-span-2 space-y-5">

            <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Portfolio Performance</div>
                  <div className="text-2xl font-bold text-white">
                    {fmtINR(totalPortfolioValue)}
                  </div>
                  {totalPortfolioValue > 0 && (
                    <div className={`flex items-center gap-1 mt-0.5 text-sm ${up?"text-emerald-400":"text-red-400"}`}>
                      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {up?"+":""}{Number(totalReturnPct).toFixed(1)}% all-time
                    </div>
                  )}
                </div>
                <div className="px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                  <span className="text-xs text-violet-300 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Admin View
                  </span>
                </div>
              </div>
              <div className="h-52">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="udGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={up?"#10B981":"#EF4444"} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={up?"#10B981":"#EF4444"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} tickFormatter={(v)=>`₹${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{background:"#0C1220",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,fontSize:11}}
                        formatter={(v)=>[fmtINR(v),"Value"]}
                      />
                      <Area type="monotone" dataKey="close" stroke={up?"#10B981":"#EF4444"} strokeWidth={2} fill="url(#udGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-gray-600">No performance data yet</div>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-4">Account Details</div>
                {[
                  { label: "User ID",       value: userData?.user_id || userId },
                  { label: "Username",      value: userData?.username || "—" },
                  { label: "Role",          value: userData?.role || "USER" },
                  { label: "Plan",          value: displayPlan },
                  { label: "Status",        value: displayStatus },
                  { label: "Country",       value: displayCountry },
                  { label: "Phone",         value: profile?.phone_number || "—" },
                  { label: "Joined",        value: displayJoined },
                  { label: "Last Login",    value: displayLastLogin },
                  { label: "Email Verified",value: userData?.is_email_verified ? "Yes ✓" : "No" },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-white/5 last:border-0">
                    <span className="text-xs text-gray-600">{item.label}</span>
                    <span className="text-xs text-white font-medium">{String(item.value)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                  <div className="text-sm font-medium text-white mb-3">KYC Status</div>
                  <div className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 mb-3 ${
                    kyc?.kyc_status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : kyc?.kyc_status === "REJECTED" ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : kyc?.kyc_status === "PENDING" || kyc?.kyc_status === "UNDER_REVIEW"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                  }`}>
                    {kyc?.kyc_status || "NOT STARTED"}
                  </div>
                  {kyc && kyc.kyc_status !== "APPROVED" && (
                    <div className="flex gap-2">
                      <button onClick={()=>setModal("kyc_approve")} className="flex-1 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">Approve</button>
                      <button onClick={()=>setModal("kyc_reject")}  className="flex-1 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">Reject</button>
                    </div>
                  )}
                </div>

                <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                  <div className="text-sm font-medium text-white mb-3">Subscription</div>
                  {[
                    { label: "Plan",          value: displayPlan },
                    { label: "Status",        value: subscription?.status || "FREE" },
                    { label: "Billing",       value: subscription?.billing_cycle || "—" },
                    { label: "Period End",    value: subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—" },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
                      <span className="text-xs text-gray-600">{item.label}</span>
                      <span className="text-xs text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">

            <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
              <div className="text-sm font-medium text-white mb-4">Sector Allocation</div>
              {sectorData.length > 0 ? (
                <>
                  <div className="h-36 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sectorData} cx="50%" cy="50%" innerRadius={36} outerRadius={62} dataKey="value" paddingAngle={4}>
                          {sectorData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{background:"#0C1220",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,fontSize:11}}
                          formatter={(v)=>[`${v}%`,""]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {sectorData.map((s, i) => (
                    <div key={i} className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{background:s.color}} />
                        <span className="text-xs text-gray-400">{s.name}</span>
                      </div>
                      <span className="text-xs text-white">{s.value}%</span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-xs text-gray-600 text-center py-4">No holdings data</div>
              )}
            </div>

            <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
              <div className="text-sm font-medium text-white mb-4">Admin Actions</div>
              <div className="space-y-2">
                <button onClick={()=>setModal("upgrade")}
                  className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20 transition-all">
                  <Crown className="w-3.5 h-3.5" /> Upgrade Plan
                </button>
                <button onClick={()=>setModal("reset_pw")}
                  className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-all">
                  <KeyRound className="w-3.5 h-3.5" /> Reset Password
                </button>
                <button onClick={()=>setModal("message")}
                  className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-all">
                  <MessageSquare className="w-3.5 h-3.5" /> Send Warning
                </button>
                <button onClick={()=>setModal("revoke_sessions")}
                  className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-all">
                  <ShieldX className="w-3.5 h-3.5" /> Revoke Sessions
                </button>
                {wallet?.status === "FROZEN" ? (
                  <button onClick={()=>setModal("unfreeze_wallet")}
                    className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all">
                    <Wallet className="w-3.5 h-3.5" /> Unfreeze Wallet
                  </button>
                ) : (
                  <button onClick={()=>setModal("freeze_wallet")}
                    className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-orange-500/10 border-orange-500/20 text-orange-300 hover:bg-orange-500/20 transition-all">
                    <Wallet className="w-3.5 h-3.5" /> Freeze Wallet
                  </button>
                )}
                {displayStatus === "ACTIVE" ? (
                  <button onClick={()=>setModal("suspend")}
                    className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
                    <Ban className="w-3.5 h-3.5" /> Suspend Account
                  </button>
                ) : (
                  <button onClick={()=>setModal("activate")}
                    className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Activate Account
                  </button>
                )}
                <button onClick={()=>setModal("ban")}
                  className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-red-900/20 border-red-900/30 text-red-500 hover:bg-red-900/40 transition-all">
                  <ShieldX className="w-3.5 h-3.5" /> Ban Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "holdings" && (
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium text-white">All Holdings — Admin View</span>
            </div>
            <span className="text-xs text-violet-300 px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded-full">
              {holdings.length} positions
            </span>
          </div>
          {holdings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Symbol","Company","Sector","Shares","Avg Cost","Current Price","Market Value","Unrealized P&L","Return","Allocation"].map((h)=>(
                      <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => {
                    const pnl = h.unrealized_pnl || 0;
                    const pct = h.unrealized_pnl_percent || 0;
                    const hUp = pnl >= 0;
                    const currSym = (h.currency === "USD") ? "$" : "₹";
                    return (
                      <motion.tr key={h.holding_id || i} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.03}}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-5 py-3">
                          <div className="text-sm font-bold text-white">{h.ticker_symbol || "—"}</div>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-400 max-w-[120px] truncate">{h.company_name || "—"}</td>
                        <td className="px-5 py-3"><span className="text-xs text-gray-500 px-2 py-0.5 bg-white/5 rounded-full">{h.sector || "—"}</span></td>
                        <td className="px-5 py-3 text-sm text-gray-300">{parseFloat(h.quantity||0).toFixed(2)}</td>
                        <td className="px-5 py-3 text-sm text-gray-300">{currSym}{parseFloat(h.average_buy_price||0).toFixed(2)}</td>
                        <td className="px-5 py-3 text-sm text-white">{currSym}{parseFloat(h.current_price||0).toFixed(2)}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-white">
                          {fmtINR(h.current_value||0)}
                        </td>
                        <td className={`px-5 py-3 text-sm ${hUp?"text-emerald-400":"text-red-400"}`}>
                          {hUp?"+":"-"}{fmtINR(Math.abs(pnl))}
                        </td>
                        <td className={`px-5 py-3 text-sm ${hUp?"text-emerald-400":"text-red-400"}`}>
                          {hUp?"+":""}{parseFloat(pct).toFixed(1)}%
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-400">
                          {parseFloat(h.allocation_percent||0).toFixed(1)}%
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center text-gray-600 text-sm">No holdings found for this user.</div>
          )}
        </div>
      )}

      {tab === "wallet" && (
        <div className="space-y-5">
          {wallet ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label:"Balance",           value:fmtINR(wallet.balance),            color:"text-white" },
                  { label:"Available",         value:fmtINR(wallet.available_balance),  color:"text-emerald-400" },
                  { label:"Locked",            value:fmtINR(wallet.locked_balance),     color:"text-amber-400" },
                  { label:"Status",            value: wallet.status || "ACTIVE",                                      color: wallet.status==="FROZEN"?"text-red-400":"text-emerald-400" },
                ].map((s,i)=>(
                  <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
                    <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-white">Wallet Details</div>
                  <div className="flex gap-2">
                    {wallet.status === "FROZEN" ? (
                      <button onClick={()=>setModal("unfreeze_wallet")}
                        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
                        Unfreeze Wallet
                      </button>
                    ) : (
                      <button onClick={()=>setModal("freeze_wallet")}
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
                        Freeze Wallet
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { label:"Wallet ID",        value:wallet.wallet_id },
                    { label:"Currency",         value:wallet.currency || "INR" },
                    { label:"Total Deposited",  value:fmtINR(wallet.total_deposited) },
                    { label:"Total Withdrawn",  value:fmtINR(wallet.total_withdrawn) },
                    { label:"Total Invested",   value:fmtINR(wallet.total_invested) },
                    { label:"Last Transaction", value:wallet.last_transaction_at ? new Date(wallet.last_transaction_at).toLocaleString() : "—" },
                  ].map((item,i)=>(
                    <div key={i} className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-xs text-gray-600">{item.label}</span>
                      <span className="text-xs text-white font-medium">{String(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {wallet.recent_transactions?.length > 0 && (
                <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/5">
                    <span className="text-sm font-medium text-white">Recent Transactions</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/5">
                          {["Type","Amount","Fee","Net","Status","Date"].map(h=>(
                            <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wallet.recent_transactions.map((t,i)=>(
                          <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-5 py-3 text-xs text-gray-300">{t.transaction_type}</td>
                            <td className="px-5 py-3 text-sm text-white">{fmtINR(t.amount)}</td>
                            <td className="px-5 py-3 text-xs text-gray-500">{fmtINR(t.fee)}</td>
                            <td className="px-5 py-3 text-sm text-emerald-400">{fmtINR(t.net_amount)}</td>
                            <td className="px-5 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${t.status==="COMPLETED"?"bg-emerald-500/10 text-emerald-400":"bg-amber-500/10 text-amber-400"}`}>
                                {t.status}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-600">{t.created_on ? new Date(t.created_on).toLocaleDateString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center text-gray-600 text-sm">
              No wallet found for this user.
            </div>
          )}
        </div>
      )}

      {tab === "sessions" && (
        <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <span className="text-sm font-medium text-white">Active Sessions ({sessions.length})</span>
            <button onClick={()=>setModal("revoke_sessions")}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
              Revoke All Sessions
            </button>
          </div>
          {sessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Device","Browser / OS","IP Address","Location","Status","Last Active","Created"].map(h=>(
                      <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={s.session_id || i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 text-sm text-gray-300">{s.device_type || "—"}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{s.browser} / {s.os || "—"}</td>
                      <td className="px-5 py-3 text-xs font-mono text-gray-400">{s.ip_address || "—"}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          s.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400"
                          : s.status === "REVOKED" ? "bg-red-500/10 text-red-400"
                          : "bg-gray-500/10 text-gray-500"
                        }`}>{s.status}</span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-600">{s.last_activity ? new Date(s.last_activity).toLocaleString() : "—"}</td>
                      <td className="px-5 py-3 text-xs text-gray-600">{s.created_on ? new Date(s.created_on).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center text-gray-600 text-sm">No sessions found.</div>
          )}
        </div>
      )}

      {tab === "kyc" && (
        <div className="space-y-5">
          {kyc ? (
            <>
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-white">KYC Verification</div>
                  <div className="flex gap-2">
                    {kyc.kyc_status !== "APPROVED" && (
                      <button onClick={()=>setModal("kyc_approve")}
                        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
                        Approve
                      </button>
                    )}
                    {kyc.kyc_status !== "REJECTED" && (
                      <button onClick={()=>setModal("kyc_reject")}
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
                        Reject
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { label:"KYC ID",             value:kyc.kyc_id },
                    { label:"Status",             value:kyc.kyc_status },
                    { label:"Legal Name",         value:`${kyc.legal_first_name||""} ${kyc.legal_last_name||""}`.trim() || "—" },
                    { label:"Date of Birth",      value:kyc.date_of_birth || "—" },
                    { label:"Nationality",        value:kyc.nationality || "—" },
                    { label:"Country of Residence",value:kyc.country_of_residence || "—" },
                    { label:"ID Document Type",   value:kyc.id_document_type || "—" },
                    { label:"ID Expiry",          value:kyc.id_document_expiry || "—" },
                    { label:"Liveness Check",     value:kyc.liveness_check_passed === true ? "Passed ✓" : kyc.liveness_check_passed === false ? "Failed ✗" : "Not done" },
                    { label:"Submitted At",       value:kyc.submitted_at ? new Date(kyc.submitted_at).toLocaleString() : "—" },
                    { label:"Approved At",        value:kyc.approved_at ? new Date(kyc.approved_at).toLocaleString() : "—" },
                    { label:"Expires At",         value:kyc.expires_at ? new Date(kyc.expires_at).toLocaleDateString() : "—" },
                  ].map((item,i)=>(
                    <div key={i} className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-xs text-gray-600">{item.label}</span>
                      <span className={`text-xs font-medium ${
                        item.label === "Status" && kyc.kyc_status === "APPROVED" ? "text-emerald-400"
                        : item.label === "Status" && kyc.kyc_status === "REJECTED" ? "text-red-400"
                        : "text-white"
                      }`}>{String(item.value)}</span>
                    </div>
                  ))}
                </div>

                {kyc.rejection_reason && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <div className="text-xs text-red-400 font-medium mb-1">Rejection Reason</div>
                    <div className="text-xs text-red-300">{kyc.rejection_reason}</div>
                  </div>
                )}
                {kyc.admin_notes && (
                  <div className="mt-3 p-3 bg-white/5 border border-white/8 rounded-xl">
                    <div className="text-xs text-gray-500 font-medium mb-1">Admin Notes</div>
                    <div className="text-xs text-gray-300">{kyc.admin_notes}</div>
                  </div>
                )}
              </div>

              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-4">Submitted Documents</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { label:"ID Front",       url:kyc.id_document_front_url },
                    { label:"ID Back",        url:kyc.id_document_back_url },
                    { label:"Selfie",         url:kyc.selfie_url },
                    { label:"Address Proof",  url:kyc.address_document_url },
                  ].map((doc, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/3 border border-white/5 rounded-xl">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        <span className="text-xs text-gray-400">{doc.label}</span>
                      </div>
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-cyan-400 hover:underline">View</a>
                      ) : (
                        <span className="text-xs text-gray-700">Not uploaded</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center">
              <ShieldCheck className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-600">KYC not yet started for this user.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}






















// import { useState, useEffect, useCallback } from "react";
// import { useParams, useNavigate } from "react-router";
// import { motion, AnimatePresence } from "motion/react";
// import {
//   ArrowLeft, TrendingUp, TrendingDown, Ban, Mail, Globe,
//   Calendar, Clock, BarChart2, Eye, RefreshCw, AlertCircle,
//   CheckCircle2, Crown, KeyRound, MessageSquare, Wallet,
//   ShieldCheck, ShieldX, FileText, Activity, X, Loader2,
//   ChevronDown,
// } from "lucide-react";
// import {
//   AreaChart, Area, ResponsiveContainer, Tooltip,
//   XAxis, YAxis, PieChart, Pie, Cell,
// } from "recharts";
// import { formatCurrency } from "./currency";

// const API_BASE  = "http://127.0.0.1:5050/v1";
// const getToken  = () => localStorage.getItem("access_token");
// const authHdr   = () => ({
//   "Content-Type": "application/json",
//   Authorization: `Bearer ${getToken()}`,
// });

// const SECTOR_COLORS = ["#8B5CF6","#06B6D4","#F59E0B","#10B981","#EF4444","#F97316","#EC4899"];

// const statusCls = {
//   ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
//   Active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
//   PENDING:   "bg-amber-500/10  text-amber-400  border-amber-500/20",
//   SUSPENDED: "bg-red-500/10    text-red-400    border-red-500/20",
//   Suspended: "bg-red-500/10    text-red-400    border-red-500/20",
//   BANNED:    "bg-red-900/20    text-red-500    border-red-900/30",
//   Inactive:  "bg-gray-500/10   text-gray-500   border-gray-500/20",
// };
// const planCls = (plan) =>
//   plan === "Elite" || plan === "ENTERPRISE" || plan === "PREMIUM"
//     ? "bg-violet-500/10 text-violet-300 border border-violet-500/20"
//     : plan === "Pro" || plan === "PRO"
//     ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
//     : plan === "BASIC"
//     ? "bg-blue-500/10 text-blue-300 border border-blue-500/20"
//     : "bg-white/5 text-gray-500 border border-white/10";

// function Toast({ msg, ok, onClose }) {
//   useEffect(() => {
//     const t = setTimeout(onClose, 3500);
//     return () => clearTimeout(t);
//   }, [onClose]);
//   return (
//     <motion.div
//       initial={{ opacity: 0, y: 30 }}
//       animate={{ opacity: 1, y: 0 }}
//       exit={{ opacity: 0, y: 30 }}
//       className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5
//         px-5 py-3 rounded-2xl shadow-2xl border text-sm font-medium
//         ${ok
//           ? "bg-emerald-900/80 border-emerald-500/30 text-emerald-300"
//           : "bg-red-900/80    border-red-500/30    text-red-300"}`}
//     >
//       {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
//       {msg}
//     </motion.div>
//   );
// }

// function ConfirmModal({ title, desc, confirmLabel, confirmCls, loading, onConfirm, onClose, children }) {
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
//       <motion.div
//         initial={{ opacity: 0, scale: 0.95 }}
//         animate={{ opacity: 1, scale: 1 }}
//         className="w-full max-w-sm bg-[#0C1220] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
//       >
//         <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
//           <span className="text-sm font-bold text-white">{title}</span>
//           <button onClick={onClose} className="text-gray-500 hover:text-white">
//             <X className="w-4 h-4" />
//           </button>
//         </div>
//         <div className="p-6 space-y-4">
//           {desc && <p className="text-sm text-gray-400">{desc}</p>}
//           {children}
//           <div className="flex gap-3 pt-1">
//             <button
//               onClick={onClose}
//               className="flex-1 py-2.5 rounded-xl border border-white/8 text-sm text-gray-400 hover:text-white"
//             >Cancel</button>
//             <button
//               onClick={onConfirm}
//               disabled={loading}
//               className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${confirmCls}`}
//             >
//               {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
//               {confirmLabel}
//             </button>
//           </div>
//         </div>
//       </motion.div>
//     </div>
//   );
// }

// export function AdminUserDetail() {
//   const { userId } = useParams();
//   const navigate   = useNavigate();

//   const [userData,     setUserData]     = useState(null);
//   const [profile,      setProfile]      = useState(null);
//   const [portfolio,    setPortfolio]    = useState(null);
//   const [holdings,     setHoldings]     = useState([]);
//   const [perfHistory,  setPerfHistory]  = useState([]);
//   const [wallet,       setWallet]       = useState(null);
//   const [kyc,          setKyc]          = useState(null);
//   const [subscription, setSubscription] = useState(null);
//   const [sessions,     setSessions]     = useState([]);
//   const [plans,        setPlans]        = useState([]);

//   const [pageLoading, setPageLoading] = useState(true);
//   const [pageError,   setPageError]   = useState("");

//   const [toast, setToast] = useState(null);
//   const showToast = (msg, ok = true) => setToast({ msg, ok });

//   const [modal,       setModal]       = useState(null);
//   const [modalInput,  setModalInput]  = useState("");
//   const [modalLoading,setModalLoading]= useState(false);

//   const [tab, setTab] = useState("overview");

//   const apiFetch = useCallback(async (url, options = {}) => {
//     const res  = await fetch(url, { headers: authHdr(), ...options });
//     const data = await res.json();
//     if (res.status === 401 || res.status === 403) {
//       navigate("/signin?role=admin");
//     }
//     return data;
//   }, [navigate]);

//   const loadUser = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/users/${userId}`);
//     if (data.bool) setUserData(data.response);
//     else setPageError(data.response?.message || "Failed to load user.");
//   }, [userId, apiFetch]);

//   const loadProfile = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/user_profiles/${userId}`);
//     if (data.bool) setProfile(data.response);
//   }, [userId, apiFetch]);

//   const loadPortfolio = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/portfolios/admin/all?user_id=${userId}&per_page=1`);
//     if (data.bool && data.response?.portfolios?.length > 0) {
//       const p = data.response.portfolios[0];
//       setPortfolio(p);
//       const hData = await apiFetch(`${API_BASE}/portfolios/${p.portfolio_id}`);
//       if (hData.bool) {
//         setHoldings(hData.response?.holdings || []);
//         const perfData = await apiFetch(
//           `${API_BASE}/portfolios/${p.portfolio_id}/performance?interval=DAILY&limit=60`
//         );
//         if (perfData.bool) setPerfHistory(perfData.response?.data || []);
//       }
//     }
//   }, [userId, apiFetch]);

//   const loadWallet = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}`);
//     if (data.bool) setWallet(data.response);
//   }, [userId, apiFetch]);

//   const loadKyc = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/kyc/admin/list?per_page=100`);
//     if (data.bool) {
//       const found = (data.response?.kyc_submissions || []).find(
//         (k) => String(k.user_id) === String(userId)
//       );
//       setKyc(found || null);
//     }
//   }, [userId, apiFetch]);

//   const loadSubscription = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/subscriptions/admin/all?user_id=${userId}&status=ACTIVE&per_page=1`);
//     if (data.bool && data.response?.subscriptions?.length > 0) {
//       const s = data.response.subscriptions[0];
//       // Defensive: only trust this subscription if it actually belongs to this user
//       if (!s.user_id || String(s.user_id) === String(userId)) {
//         setSubscription(s);
//       }
//     }
//   }, [userId, apiFetch]);

//   const loadSessions = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/users/${userId}/sessions`);
//     if (data.bool) setSessions(data.response?.sessions || []);
//   }, [userId, apiFetch]);

//   const loadPlans = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/subscriptions/plans`);
//     if (data.bool) setPlans(data.response?.plans || []);
//   }, [apiFetch]);

//   const loadAll = useCallback(async () => {
//     setPageLoading(true);
//     setPageError("");
//     await Promise.allSettled([
//       loadUser(), loadProfile(), loadPortfolio(),
//       loadWallet(), loadKyc(), loadSubscription(),
//       loadSessions(), loadPlans(),
//     ]);
//     setPageLoading(false);
//   }, [loadUser, loadProfile, loadPortfolio, loadWallet, loadKyc, loadSubscription, loadSessions, loadPlans]);

//   useEffect(() => { loadAll(); }, [loadAll]);

//   const handleSuspend = async () => {
//     if (!modalInput.trim()) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/suspend`, {
//       method: "POST",
//       body:   JSON.stringify({ reason: modalInput }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("User suspended."); loadUser(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleActivate = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/status`, {
//       method: "PUT",
//       body:   JSON.stringify({ status: "ACTIVE", reason: "Admin reinstated account" }),
//     });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("Account activated."); loadUser(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleBan = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/status`, {
//       method: "PUT",
//       body:   JSON.stringify({ status: "BANNED", reason: modalInput || "Policy violation" }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("User banned."); loadUser(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleResetPassword = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/reset_password`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) {
//       showToast(`Temp password: ${data.response?.temp_password || "Sent to user"}`);
//     } else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleUpgradePlan = async () => {
//     const planId = modalInput;
//     if (!planId) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/subscriptions/admin/upgrade`, {
//       method: "POST",
//       body:   JSON.stringify({
//         user_id:       parseInt(userId),
//         plan_id:       parseInt(planId),
//         billing_cycle: "MONTHLY",
//         note:          "Admin upgrade",
//       }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("Plan upgraded."); loadSubscription(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleFreezeWallet = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}/freeze`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("Wallet frozen."); loadWallet(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleUnfreezeWallet = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}/unfreeze`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("Wallet unfrozen."); loadWallet(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleRevokeSessions = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/revoke_sessions`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("All sessions revoked."); loadSessions(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleApproveKyc = async () => {
//     if (!kyc) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/kyc/admin/${kyc.kyc_id}/review`, {
//       method: "POST",
//       body:   JSON.stringify({ action: "APPROVE", admin_notes: "Documents verified" }),
//     });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("KYC approved."); loadKyc(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleRejectKyc = async () => {
//     if (!kyc) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/kyc/admin/${kyc.kyc_id}/review`, {
//       method: "POST",
//       body:   JSON.stringify({ action: "REJECT", rejection_reason: modalInput || "Documents unclear" }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("KYC rejected."); loadKyc(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleSendMessage = async () => {
//     if (!modalInput.trim()) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/notifications/admin/send`, {
//       method: "POST",
//       body:   JSON.stringify({
//         user_id:          parseInt(userId),
//         broadcast:        false,
//         notification_type:"ADMIN_MESSAGE",
//         title:            "Message from Admin",
//         body:             modalInput,
//         priority:         "MEDIUM",
//       }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) showToast("Message sent.");
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const sectorData = (() => {
//     if (!holdings.length) return [];
//     const totalVal = holdings.reduce((a, h) => a + (h.current_value || 0), 0) || 1;
//     const buckets  = {};
//     holdings.forEach((h) => {
//       const s = h.sector || "Other";
//       buckets[s] = (buckets[s] || 0) + (h.current_value || 0);
//     });
//     return Object.entries(buckets)
//       .map(([name, value], i) => ({
//         name,
//         value: parseFloat(((value / totalVal) * 100).toFixed(1)),
//         color: SECTOR_COLORS[i % SECTOR_COLORS.length],
//       }))
//       .sort((a, b) => b.value - a.value);
//   })();

//   const displayName   = userData?.full_name   || profile?.display_name || "—";
//   const displayEmail  = userData?.email        || "—";
//   const displayAvatar = (displayName).slice(0, 2).toUpperCase();
//   const displayStatus = userData?.status       || "—";
//   /* FIX: defensive check — only trust subscription plan if confirmed
//      to belong to this user (see loadSubscription above) */
//   const displayPlan   = subscription?.plan?.plan_name || "Free";
//   const displayCountry= profile?.country       || userData?.country || "—";
//   const displayJoined = userData?.created_on
//     ? new Date(userData.created_on).toLocaleDateString()   : "—";
//   const displayLastLogin = userData?.last_login
//     ? new Date(userData.last_login).toLocaleDateString()   : "—";

//   /* FIX: currency now read from the actual portfolio/wallet response
//      instead of being hardcoded to $ everywhere. Backend default is INR. */
//   const portfolioCurrency = portfolio?.currency || "INR";
//   const walletCurrency    = wallet?.currency    || "INR";

//   const totalPortfolioValue = portfolio?.current_value   || 0;
//   const totalReturn         = portfolio?.total_return     || 0;
//   const totalReturnPct      = portfolio?.total_return_percent || 0;
//   const totalHoldings       = portfolio?.total_holdings_count || holdings.length;
//   const up                  = totalReturnPct >= 0;

//   const chartData = perfHistory.map((p) => ({
//     date:  p.date?.slice(5) || "",
//     close: parseFloat(p.total_value || 0),
//   }));

//   if (pageLoading) {
//     return (
//       <div className="flex items-center justify-center h-full min-h-[400px]">
//         <div className="flex flex-col items-center gap-3">
//           <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//           <p className="text-sm text-gray-500">Loading user details…</p>
//         </div>
//       </div>
//     );
//   }

//   if (pageError) {
//     return (
//       <div className="flex items-center justify-center h-full min-h-[400px]">
//         <div className="text-center space-y-3">
//           <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
//           <p className="text-sm text-red-400">{pageError}</p>
//           <button
//             onClick={() => navigate("/admin/users")}
//             className="text-xs text-gray-500 hover:text-white underline"
//           >← Back to Users</button>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto">

//       <AnimatePresence>
//         {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
//       </AnimatePresence>

//       <AnimatePresence>
//         {modal === "suspend" && (
//           <ConfirmModal
//             title="Suspend Account"
//             desc="This will immediately revoke all sessions. Enter a reason:"
//             confirmLabel="Suspend"
//             confirmCls="bg-red-600 hover:bg-red-500"
//             loading={modalLoading}
//             onConfirm={handleSuspend}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Reason for suspension…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}

//         {modal === "ban" && (
//           <ConfirmModal
//             title="Ban Account"
//             desc="Permanently ban this user. Enter reason:"
//             confirmLabel="Ban User"
//             confirmCls="bg-red-800 hover:bg-red-700"
//             loading={modalLoading}
//             onConfirm={handleBan}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Reason for ban…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}

//         {modal === "activate" && (
//           <ConfirmModal
//             title="Activate Account"
//             desc="Restore this account to ACTIVE status?"
//             confirmLabel="Activate"
//             confirmCls="bg-emerald-600 hover:bg-emerald-500"
//             loading={modalLoading}
//             onConfirm={handleActivate}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "reset_pw" && (
//           <ConfirmModal
//             title="Force Reset Password"
//             desc="A temporary password will be generated. The user must change it on next login."
//             confirmLabel="Reset Password"
//             confirmCls="bg-cyan-600 hover:bg-cyan-500"
//             loading={modalLoading}
//             onConfirm={handleResetPassword}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "upgrade" && (
//           <ConfirmModal
//             title="Upgrade Subscription Plan"
//             desc="Select a plan to assign to this user:"
//             confirmLabel="Upgrade"
//             confirmCls="bg-violet-600 hover:bg-violet-500"
//             loading={modalLoading}
//             onConfirm={handleUpgradePlan}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <div className="relative">
//               <select
//                 value={modalInput}
//                 onChange={(e) => setModalInput(e.target.value)}
//                 className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-white/20 appearance-none"
//               >
//                 <option value="">— Select a plan —</option>
//                 {plans.map((p) => (
//                   <option key={p.plan_id} value={p.plan_id}>
//                     {p.plan_name} — {formatCurrency(p.price_monthly, p.currency || "INR")}/mo
//                   </option>
//                 ))}
//               </select>
//               <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
//             </div>
//           </ConfirmModal>
//         )}

//         {modal === "freeze_wallet" && (
//           <ConfirmModal
//             title="Freeze Wallet"
//             desc="The user will not be able to deposit, withdraw or trade until unfrozen."
//             confirmLabel="Freeze"
//             confirmCls="bg-red-600 hover:bg-red-500"
//             loading={modalLoading}
//             onConfirm={handleFreezeWallet}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "unfreeze_wallet" && (
//           <ConfirmModal
//             title="Unfreeze Wallet"
//             desc="Restore full wallet access for this user?"
//             confirmLabel="Unfreeze"
//             confirmCls="bg-emerald-600 hover:bg-emerald-500"
//             loading={modalLoading}
//             onConfirm={handleUnfreezeWallet}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "revoke_sessions" && (
//           <ConfirmModal
//             title="Revoke All Sessions"
//             desc="All active sessions for this user will be immediately terminated."
//             confirmLabel="Revoke All"
//             confirmCls="bg-amber-600 hover:bg-amber-500"
//             loading={modalLoading}
//             onConfirm={handleRevokeSessions}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "kyc_approve" && (
//           <ConfirmModal
//             title="Approve KYC"
//             desc="Mark this user's identity verification as approved?"
//             confirmLabel="Approve KYC"
//             confirmCls="bg-emerald-600 hover:bg-emerald-500"
//             loading={modalLoading}
//             onConfirm={handleApproveKyc}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "kyc_reject" && (
//           <ConfirmModal
//             title="Reject KYC"
//             desc="Enter a reason for rejection:"
//             confirmLabel="Reject KYC"
//             confirmCls="bg-red-600 hover:bg-red-500"
//             loading={modalLoading}
//             onConfirm={handleRejectKyc}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Rejection reason…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}

//         {modal === "message" && (
//           <ConfirmModal
//             title="Send Admin Message"
//             desc="This will appear as a notification in the user's account:"
//             confirmLabel="Send Message"
//             confirmCls="bg-violet-600 hover:bg-violet-500"
//             loading={modalLoading}
//             onConfirm={handleSendMessage}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Type your message…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}
//       </AnimatePresence>

//       <div className="flex items-center justify-between mb-5">
//         <button
//           onClick={() => navigate("/admin/users")}
//           className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
//         >
//           <ArrowLeft className="w-4 h-4" /> Back to Users
//         </button>
//         <button
//           onClick={loadAll}
//           className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
//         >
//           <RefreshCw className="w-4 h-4" />
//         </button>
//       </div>

//       <div className="bg-gradient-to-br from-[#0F1530] to-[#0C1220] border border-violet-500/15 rounded-2xl p-6 mb-6">
//         <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
//           <div className="relative">
//             <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-2xl font-black text-white shadow-xl shadow-violet-500/20">
//               {displayAvatar}
//             </div>
//             <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0C1220]
//               ${displayStatus === "ACTIVE" || displayStatus === "Active" ? "bg-emerald-400" : "bg-gray-500"}`}
//             />
//           </div>

//           <div className="flex-1">
//             <div className="flex flex-wrap items-center gap-3 mb-1">
//               <h1 className="text-2xl font-bold text-white">{displayName}</h1>
//               <span className={`text-xs px-2.5 py-1 rounded-full border ${statusCls[displayStatus] || statusCls.Inactive}`}>
//                 {displayStatus}
//               </span>
//               <span className={`text-xs px-2.5 py-1 rounded-full ${planCls(displayPlan)}`}>
//                 {displayPlan} Plan
//               </span>
//               {userData?.is_email_verified && (
//                 <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
//                   ✓ Verified
//                 </span>
//               )}
//             </div>
//             <div className="flex flex-wrap gap-4 text-sm text-gray-500">
//               <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{displayEmail}</div>
//               <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />{displayCountry}</div>
//               <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined {displayJoined}</div>
//               <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Last login {displayLastLogin}</div>
//             </div>
//           </div>

//           <div className="flex flex-wrap gap-2">
//             <button
//               onClick={() => setModal("message")}
//               className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm text-violet-300 hover:bg-violet-500/20 transition-all"
//             >
//               <Mail className="w-4 h-4" /> Message
//             </button>
//             {(displayStatus === "SUSPENDED" || displayStatus === "BANNED") ? (
//               <button
//                 onClick={() => setModal("activate")}
//                 className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-300 hover:bg-emerald-500/20 transition-all"
//               >
//                 <CheckCircle2 className="w-4 h-4" /> Activate
//               </button>
//             ) : (
//               <button
//                 onClick={() => setModal("suspend")}
//                 className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 hover:bg-red-500/20 transition-all"
//               >
//                 <Ban className="w-4 h-4" /> Suspend
//               </button>
//             )}
//           </div>
//         </div>
//       </div>

//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
//         {[
//           { label: "Portfolio Value", value: formatCurrency(totalPortfolioValue, portfolioCurrency, { maximumFractionDigits: 0 }), up: null },
//           { label: "Total Return",    value: `${up?"+":""}${Number(totalReturnPct).toFixed(1)}%`, up },
//           { label: "Total P&L",       value: `${up?"+":"-"}${formatCurrency(Math.abs(totalReturn), portfolioCurrency, { maximumFractionDigits: 0 })}`, up },
//           { label: "Holdings",        value: `${totalHoldings} stocks`, up: null },
//         ].map((s, i) => (
//           <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
//             <div className="text-xs text-gray-500 mb-1">{s.label}</div>
//             <div className={`text-xl font-bold ${s.up === true ? "text-emerald-400" : s.up === false ? "text-red-400" : "text-white"}`}>
//               {s.value}
//             </div>
//           </div>
//         ))}
//       </div>

//       <div className="flex gap-1 p-1 bg-[#0C1220] border border-white/5 rounded-2xl mb-6 overflow-x-auto">
//         {[
//           { key: "overview",  label: "Overview",  icon: Eye },
//           { key: "holdings",  label: "Holdings",  icon: BarChart2 },
//           { key: "wallet",    label: "Wallet",     icon: Wallet },
//           { key: "sessions",  label: "Sessions",   icon: Activity },
//           { key: "kyc",       label: "KYC",        icon: ShieldCheck },
//         ].map(({ key, label, icon: Icon }) => (
//           <button
//             key={key}
//             onClick={() => setTab(key)}
//             className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
//               tab === key
//                 ? "bg-violet-600/20 text-violet-300 border border-violet-500/20"
//                 : "text-gray-500 hover:text-white"
//             }`}
//           >
//             <Icon className="w-3.5 h-3.5" />{label}
//           </button>
//         ))}
//       </div>

//       {tab === "overview" && (
//         <div className="grid lg:grid-cols-3 gap-6">
//           <div className="lg:col-span-2 space-y-5">
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//               <div className="flex items-center justify-between mb-5">
//                 <div>
//                   <div className="text-xs text-gray-500 mb-0.5">Portfolio Performance</div>
//                   <div className="text-2xl font-bold text-white">
//                     {formatCurrency(totalPortfolioValue, portfolioCurrency, { maximumFractionDigits: 0 })}
//                   </div>
//                   <div className={`flex items-center gap-1 mt-0.5 text-sm ${up?"text-emerald-400":"text-red-400"}`}>
//                     {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
//                     {up?"+":""}{Number(totalReturnPct).toFixed(1)}% all-time
//                   </div>
//                 </div>
//                 <div className="px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg">
//                   <span className="text-xs text-violet-300 flex items-center gap-1">
//                     <Eye className="w-3 h-3" /> Admin View
//                   </span>
//                 </div>
//               </div>
//               <div className="h-52">
//                 {chartData.length > 0 ? (
//                   <ResponsiveContainer width="100%" height="100%">
//                     <AreaChart data={chartData}>
//                       <defs>
//                         <linearGradient id="udGrad" x1="0" y1="0" x2="0" y2="1">
//                           <stop offset="5%"  stopColor={up?"#10B981":"#EF4444"} stopOpacity={0.25} />
//                           <stop offset="95%" stopColor={up?"#10B981":"#EF4444"} stopOpacity={0} />
//                         </linearGradient>
//                       </defs>
//                       <XAxis dataKey="date" tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} interval="preserveStartEnd" />
//                       <YAxis tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} tickFormatter={(v)=>formatCurrency(v, portfolioCurrency, { compact: true })} />
//                       <Tooltip
//                         contentStyle={{background:"#0C1220",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,fontSize:11}}
//                         formatter={(v)=>[formatCurrency(v, portfolioCurrency),"Value"]}
//                       />
//                       <Area type="monotone" dataKey="close" stroke={up?"#10B981":"#EF4444"} strokeWidth={2} fill="url(#udGrad)" dot={false} />
//                     </AreaChart>
//                   </ResponsiveContainer>
//                 ) : (
//                   <div className="flex items-center justify-center h-full text-sm text-gray-600">No performance data yet</div>
//                 )}
//               </div>
//             </div>

//             <div className="grid sm:grid-cols-2 gap-4">
//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="text-sm font-medium text-white mb-4">Account Details</div>
//                 {[
//                   { label: "User ID",       value: userData?.user_id || userId },
//                   { label: "Username",      value: userData?.username || "—" },
//                   { label: "Role",          value: userData?.role || "USER" },
//                   { label: "Plan",          value: displayPlan },
//                   { label: "Status",        value: displayStatus },
//                   { label: "Country",       value: displayCountry },
//                   { label: "Phone",         value: profile?.phone_number || "—" },
//                   { label: "Joined",        value: displayJoined },
//                   { label: "Last Login",    value: displayLastLogin },
//                   { label: "Email Verified",value: userData?.is_email_verified ? "Yes ✓" : "No" },
//                 ].map((item, i) => (
//                   <div key={i} className="flex justify-between py-2 border-b border-white/5 last:border-0">
//                     <span className="text-xs text-gray-600">{item.label}</span>
//                     <span className="text-xs text-white font-medium">{String(item.value)}</span>
//                   </div>
//                 ))}
//               </div>

//               <div className="space-y-4">
//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                   <div className="text-sm font-medium text-white mb-3">KYC Status</div>
//                   <div className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 mb-3 ${
//                     kyc?.kyc_status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
//                     : kyc?.kyc_status === "REJECTED" ? "bg-red-500/10 text-red-400 border-red-500/20"
//                     : kyc?.kyc_status === "PENDING" || kyc?.kyc_status === "UNDER_REVIEW"
//                       ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
//                     : "bg-gray-500/10 text-gray-500 border-gray-500/20"
//                   }`}>
//                     {kyc?.kyc_status || "NOT STARTED"}
//                   </div>
//                   {kyc && kyc.kyc_status !== "APPROVED" && (
//                     <div className="flex gap-2">
//                       <button onClick={()=>setModal("kyc_approve")} className="flex-1 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">Approve</button>
//                       <button onClick={()=>setModal("kyc_reject")}  className="flex-1 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">Reject</button>
//                     </div>
//                   )}
//                 </div>

//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                   <div className="text-sm font-medium text-white mb-3">Subscription</div>
//                   {[
//                     { label: "Plan",          value: displayPlan },
//                     { label: "Status",        value: subscription?.status || "FREE" },
//                     { label: "Billing",       value: subscription?.billing_cycle || "—" },
//                     { label: "Period End",    value: subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—" },
//                   ].map((item, i) => (
//                     <div key={i} className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
//                       <span className="text-xs text-gray-600">{item.label}</span>
//                       <span className="text-xs text-white">{item.value}</span>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           </div>

//           <div className="space-y-5">
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//               <div className="text-sm font-medium text-white mb-4">Sector Allocation</div>
//               {sectorData.length > 0 ? (
//                 <>
//                   <div className="h-36 mb-4">
//                     <ResponsiveContainer width="100%" height="100%">
//                       <PieChart>
//                         <Pie data={sectorData} cx="50%" cy="50%" innerRadius={36} outerRadius={62} dataKey="value" paddingAngle={4}>
//                           {sectorData.map((e, i) => <Cell key={i} fill={e.color} />)}
//                         </Pie>
//                         <Tooltip
//                           contentStyle={{background:"#0C1220",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,fontSize:11}}
//                           formatter={(v)=>[`${v}%`,""]}
//                         />
//                       </PieChart>
//                     </ResponsiveContainer>
//                   </div>
//                   {sectorData.map((s, i) => (
//                     <div key={i} className="flex items-center justify-between mb-2">
//                       <div className="flex items-center gap-2">
//                         <div className="w-2 h-2 rounded-full" style={{background:s.color}} />
//                         <span className="text-xs text-gray-400">{s.name}</span>
//                       </div>
//                       <span className="text-xs text-white">{s.value}%</span>
//                     </div>
//                   ))}
//                 </>
//               ) : (
//                 <div className="text-xs text-gray-600 text-center py-4">No holdings data</div>
//               )}
//             </div>

//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//               <div className="text-sm font-medium text-white mb-4">Admin Actions</div>
//               <div className="space-y-2">
//                 <button onClick={()=>setModal("upgrade")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20 transition-all">
//                   <Crown className="w-3.5 h-3.5" /> Upgrade Plan
//                 </button>
//                 <button onClick={()=>setModal("reset_pw")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-all">
//                   <KeyRound className="w-3.5 h-3.5" /> Reset Password
//                 </button>
//                 <button onClick={()=>setModal("message")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-all">
//                   <MessageSquare className="w-3.5 h-3.5" /> Send Warning
//                 </button>
//                 <button onClick={()=>setModal("revoke_sessions")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-all">
//                   <ShieldX className="w-3.5 h-3.5" /> Revoke Sessions
//                 </button>
//                 {wallet?.status === "FROZEN" ? (
//                   <button onClick={()=>setModal("unfreeze_wallet")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all">
//                     <Wallet className="w-3.5 h-3.5" /> Unfreeze Wallet
//                   </button>
//                 ) : (
//                   <button onClick={()=>setModal("freeze_wallet")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-orange-500/10 border-orange-500/20 text-orange-300 hover:bg-orange-500/20 transition-all">
//                     <Wallet className="w-3.5 h-3.5" /> Freeze Wallet
//                   </button>
//                 )}
//                 {displayStatus === "ACTIVE" ? (
//                   <button onClick={()=>setModal("suspend")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
//                     <Ban className="w-3.5 h-3.5" /> Suspend Account
//                   </button>
//                 ) : (
//                   <button onClick={()=>setModal("activate")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all">
//                     <CheckCircle2 className="w-3.5 h-3.5" /> Activate Account
//                   </button>
//                 )}
//                 <button onClick={()=>setModal("ban")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-red-900/20 border-red-900/30 text-red-500 hover:bg-red-900/40 transition-all">
//                   <ShieldX className="w-3.5 h-3.5" /> Ban Account
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {tab === "holdings" && (
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//             <div className="flex items-center gap-2">
//               <BarChart2 className="w-4 h-4 text-violet-400" />
//               <span className="text-sm font-medium text-white">All Holdings — Admin View</span>
//             </div>
//             <span className="text-xs text-violet-300 px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded-full">
//               {holdings.length} positions
//             </span>
//           </div>
//           {holdings.length > 0 ? (
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["Symbol","Company","Sector","Shares","Avg Cost","Current Price","Market Value","Unrealized P&L","Return","Allocation"].map((h)=>(
//                       <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {holdings.map((h, i) => {
//                     const pnl = h.unrealized_pnl || 0;
//                     const pct = h.unrealized_pnl_percent || 0;
//                     const hUp = pnl >= 0;
//                     const hCurrency = h.currency || portfolioCurrency;
//                     return (
//                       <motion.tr key={h.holding_id || i} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.03}}
//                         className="border-b border-white/5 hover:bg-white/5 transition-colors">
//                         <td className="px-5 py-3">
//                           <div className="text-sm font-bold text-white">{h.ticker_symbol || "—"}</div>
//                         </td>
//                         <td className="px-5 py-3 text-sm text-gray-400 max-w-[120px] truncate">{h.company_name || "—"}</td>
//                         <td className="px-5 py-3"><span className="text-xs text-gray-500 px-2 py-0.5 bg-white/5 rounded-full">{h.sector || "—"}</span></td>
//                         <td className="px-5 py-3 text-sm text-gray-300">{parseFloat(h.quantity||0).toFixed(2)}</td>
//                         <td className="px-5 py-3 text-sm text-gray-300">{formatCurrency(h.average_buy_price, hCurrency)}</td>
//                         <td className="px-5 py-3 text-sm text-white">{formatCurrency(h.current_price, hCurrency)}</td>
//                         <td className="px-5 py-3 text-sm font-semibold text-white">
//                           {formatCurrency(h.current_value, hCurrency, { maximumFractionDigits: 0 })}
//                         </td>
//                         <td className={`px-5 py-3 text-sm ${hUp?"text-emerald-400":"text-red-400"}`}>
//                           {hUp?"+":"-"}{formatCurrency(Math.abs(pnl), hCurrency, { maximumFractionDigits: 0 })}
//                         </td>
//                         <td className={`px-5 py-3 text-sm ${hUp?"text-emerald-400":"text-red-400"}`}>
//                           {hUp?"+":""}{parseFloat(pct).toFixed(1)}%
//                         </td>
//                         <td className="px-5 py-3 text-sm text-gray-400">
//                           {parseFloat(h.allocation_percent||0).toFixed(1)}%
//                         </td>
//                       </motion.tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           ) : (
//             <div className="py-16 text-center text-gray-600 text-sm">No holdings found for this user.</div>
//           )}
//         </div>
//       )}

//       {tab === "wallet" && (
//         <div className="space-y-5">
//           {wallet ? (
//             <>
//               <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//                 {[
//                   { label:"Balance",   value: formatCurrency(wallet.balance, walletCurrency),           color:"text-white" },
//                   { label:"Available", value: formatCurrency(wallet.available_balance, walletCurrency), color:"text-emerald-400" },
//                   { label:"Locked",    value: formatCurrency(wallet.locked_balance, walletCurrency),     color:"text-amber-400" },
//                   { label:"Status",    value: wallet.status || "ACTIVE", color: wallet.status==="FROZEN"?"text-red-400":"text-emerald-400" },
//                 ].map((s,i)=>(
//                   <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
//                     <div className="text-xs text-gray-500 mb-1">{s.label}</div>
//                     <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
//                   </div>
//                 ))}
//               </div>

//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="flex items-center justify-between mb-4">
//                   <div className="text-sm font-medium text-white">Wallet Details</div>
//                   <div className="flex gap-2">
//                     {wallet.status === "FROZEN" ? (
//                       <button onClick={()=>setModal("unfreeze_wallet")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
//                         Unfreeze Wallet
//                       </button>
//                     ) : (
//                       <button onClick={()=>setModal("freeze_wallet")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
//                         Freeze Wallet
//                       </button>
//                     )}
//                   </div>
//                 </div>
//                 <div className="grid sm:grid-cols-2 gap-3">
//                   {[
//                     { label:"Wallet ID",        value: wallet.wallet_id },
//                     { label:"Currency",         value: wallet.currency || "INR" },
//                     { label:"Total Deposited",  value: formatCurrency(wallet.total_deposited, walletCurrency) },
//                     { label:"Total Withdrawn",  value: formatCurrency(wallet.total_withdrawn, walletCurrency) },
//                     { label:"Total Invested",   value: formatCurrency(wallet.total_invested, walletCurrency) },
//                     { label:"Last Transaction", value: wallet.last_transaction_at ? new Date(wallet.last_transaction_at).toLocaleString() : "—" },
//                   ].map((item,i)=>(
//                     <div key={i} className="flex justify-between py-2 border-b border-white/5">
//                       <span className="text-xs text-gray-600">{item.label}</span>
//                       <span className="text-xs text-white font-medium">{String(item.value)}</span>
//                     </div>
//                   ))}
//                 </div>
//               </div>

//               {wallet.recent_transactions?.length > 0 && (
//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//                   <div className="px-5 py-4 border-b border-white/5">
//                     <span className="text-sm font-medium text-white">Recent Transactions</span>
//                   </div>
//                   <div className="overflow-x-auto">
//                     <table className="w-full">
//                       <thead>
//                         <tr className="border-b border-white/5">
//                           {["Type","Amount","Fee","Net","Status","Date"].map(h=>(
//                             <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium">{h}</th>
//                           ))}
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {wallet.recent_transactions.map((t,i)=>(
//                           <tr key={i} className="border-b border-white/5 hover:bg-white/5">
//                             <td className="px-5 py-3 text-xs text-gray-300">{t.transaction_type}</td>
//                             <td className="px-5 py-3 text-sm text-white">{formatCurrency(t.amount, t.currency || walletCurrency)}</td>
//                             <td className="px-5 py-3 text-xs text-gray-500">{formatCurrency(t.fee, t.currency || walletCurrency)}</td>
//                             <td className="px-5 py-3 text-sm text-emerald-400">{formatCurrency(t.net_amount, t.currency || walletCurrency)}</td>
//                             <td className="px-5 py-3">
//                               <span className={`text-xs px-2 py-0.5 rounded-full ${t.status==="COMPLETED"?"bg-emerald-500/10 text-emerald-400":"bg-amber-500/10 text-amber-400"}`}>
//                                 {t.status}
//                               </span>
//                             </td>
//                             <td className="px-5 py-3 text-xs text-gray-600">{t.created_on ? new Date(t.created_on).toLocaleDateString() : "—"}</td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 </div>
//               )}
//             </>
//           ) : (
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center text-gray-600 text-sm">
//               No wallet found for this user.
//             </div>
//           )}
//         </div>
//       )}

//       {tab === "sessions" && (
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//             <span className="text-sm font-medium text-white">Active Sessions ({sessions.length})</span>
//             <button onClick={()=>setModal("revoke_sessions")}
//               className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
//               Revoke All Sessions
//             </button>
//           </div>
//           {sessions.length > 0 ? (
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["Device","Browser / OS","IP Address","Location","Status","Last Active","Created"].map(h=>(
//                       <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {sessions.map((s, i) => (
//                     <tr key={s.session_id || i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
//                       <td className="px-5 py-3 text-sm text-gray-300">{s.device_type || "—"}</td>
//                       <td className="px-5 py-3 text-xs text-gray-500">{s.browser} / {s.os || "—"}</td>
//                       <td className="px-5 py-3 text-xs font-mono text-gray-400">{s.ip_address || "—"}</td>
//                       <td className="px-5 py-3 text-xs text-gray-500">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</td>
//                       <td className="px-5 py-3">
//                         <span className={`text-xs px-2 py-0.5 rounded-full ${
//                           s.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400"
//                           : s.status === "REVOKED" ? "bg-red-500/10 text-red-400"
//                           : "bg-gray-500/10 text-gray-500"
//                         }`}>{s.status}</span>
//                       </td>
//                       <td className="px-5 py-3 text-xs text-gray-600">{s.last_activity ? new Date(s.last_activity).toLocaleString() : "—"}</td>
//                       <td className="px-5 py-3 text-xs text-gray-600">{s.created_on ? new Date(s.created_on).toLocaleDateString() : "—"}</td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           ) : (
//             <div className="py-16 text-center text-gray-600 text-sm">No sessions found.</div>
//           )}
//         </div>
//       )}

//       {tab === "kyc" && (
//         <div className="space-y-5">
//           {kyc ? (
//             <>
//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="flex items-center justify-between mb-4">
//                   <div className="text-sm font-medium text-white">KYC Verification</div>
//                   <div className="flex gap-2">
//                     {kyc.kyc_status !== "APPROVED" && (
//                       <button onClick={()=>setModal("kyc_approve")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
//                         Approve
//                       </button>
//                     )}
//                     {kyc.kyc_status !== "REJECTED" && (
//                       <button onClick={()=>setModal("kyc_reject")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
//                         Reject
//                       </button>
//                     )}
//                   </div>
//                 </div>

//                 <div className="grid sm:grid-cols-2 gap-4">
//                   {[
//                     { label:"KYC ID",             value:kyc.kyc_id },
//                     { label:"Status",             value:kyc.kyc_status },
//                     { label:"Legal Name",         value:`${kyc.legal_first_name||""} ${kyc.legal_last_name||""}`.trim() || "—" },
//                     { label:"Date of Birth",      value:kyc.date_of_birth || "—" },
//                     { label:"Nationality",        value:kyc.nationality || "—" },
//                     { label:"Country of Residence",value:kyc.country_of_residence || "—" },
//                     { label:"ID Document Type",   value:kyc.id_document_type || "—" },
//                     { label:"ID Expiry",          value:kyc.id_document_expiry || "—" },
//                     { label:"Liveness Check",     value:kyc.liveness_check_passed === true ? "Passed ✓" : kyc.liveness_check_passed === false ? "Failed ✗" : "Not done" },
//                     { label:"Submitted At",       value:kyc.submitted_at ? new Date(kyc.submitted_at).toLocaleString() : "—" },
//                     { label:"Approved At",        value:kyc.approved_at ? new Date(kyc.approved_at).toLocaleString() : "—" },
//                     { label:"Expires At",         value:kyc.expires_at ? new Date(kyc.expires_at).toLocaleDateString() : "—" },
//                   ].map((item,i)=>(
//                     <div key={i} className="flex justify-between py-2 border-b border-white/5">
//                       <span className="text-xs text-gray-600">{item.label}</span>
//                       <span className={`text-xs font-medium ${
//                         item.label === "Status" && kyc.kyc_status === "APPROVED" ? "text-emerald-400"
//                         : item.label === "Status" && kyc.kyc_status === "REJECTED" ? "text-red-400"
//                         : "text-white"
//                       }`}>{String(item.value)}</span>
//                     </div>
//                   ))}
//                 </div>

//                 {kyc.rejection_reason && (
//                   <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
//                     <div className="text-xs text-red-400 font-medium mb-1">Rejection Reason</div>
//                     <div className="text-xs text-red-300">{kyc.rejection_reason}</div>
//                   </div>
//                 )}
//                 {kyc.admin_notes && (
//                   <div className="mt-3 p-3 bg-white/5 border border-white/8 rounded-xl">
//                     <div className="text-xs text-gray-500 font-medium mb-1">Admin Notes</div>
//                     <div className="text-xs text-gray-300">{kyc.admin_notes}</div>
//                   </div>
//                 )}
//               </div>

//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="text-sm font-medium text-white mb-4">Submitted Documents</div>
//                 <div className="grid sm:grid-cols-2 gap-3">
//                   {[
//                     { label:"ID Front",       url:kyc.id_document_front_url },
//                     { label:"ID Back",        url:kyc.id_document_back_url },
//                     { label:"Selfie",         url:kyc.selfie_url },
//                     { label:"Address Proof",  url:kyc.address_document_url },
//                   ].map((doc, i) => (
//                     <div key={i} className="flex items-center justify-between p-3 bg-white/3 border border-white/5 rounded-xl">
//                       <div className="flex items-center gap-2">
//                         <FileText className="w-4 h-4 text-gray-500" />
//                         <span className="text-xs text-gray-400">{doc.label}</span>
//                       </div>
//                       {doc.url ? (
//                         <a href={doc.url} target="_blank" rel="noopener noreferrer"
//                           className="text-xs text-cyan-400 hover:underline">View</a>
//                       ) : (
//                         <span className="text-xs text-gray-700">Not uploaded</span>
//                       )}
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </>
//           ) : (
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center">
//               <ShieldCheck className="w-10 h-10 text-gray-700 mx-auto mb-3" />
//               <p className="text-sm text-gray-600">KYC not yet started for this user.</p>
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }























// import { useState, useEffect, useCallback } from "react";
// import { useParams, useNavigate } from "react-router";
// import { motion, AnimatePresence } from "motion/react";
// import {
//   ArrowLeft, TrendingUp, TrendingDown, Ban, Mail, Globe,
//   Calendar, Clock, BarChart2, Eye, RefreshCw, AlertCircle,
//   CheckCircle2, Crown, KeyRound, MessageSquare, Wallet,
//   ShieldCheck, ShieldX, FileText, Activity, X, Loader2,
//   ChevronDown, IndianRupee,
// } from "lucide-react";
// import {
//   AreaChart, Area, ResponsiveContainer, Tooltip,
//   XAxis, YAxis, PieChart, Pie, Cell,
// } from "recharts";

// const API_BASE  = "http://127.0.0.1:5050/v1";
// const getToken  = () => localStorage.getItem("access_token");
// const authHdr   = () => ({
//   "Content-Type": "application/json",
//   Authorization: `Bearer ${getToken()}`,
// });

// const SECTOR_COLORS = ["#8B5CF6","#06B6D4","#F59E0B","#10B981","#EF4444","#F97316","#EC4899"];

// /* ── Currency formatter — INR is the platform default (Wallets model) ── */
// const fmtINR = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// /*
//    FIX — same "0% return" root cause as AdminUsers.jsx:
//    derive return from current_value vs total_invested when the backend
//    hasn't pre-computed total_return_percent on the portfolio row yet.
// */
// function deriveReturn(p) {
//   const currentValue  = parseFloat(p?.current_value  || 0);
//   const totalInvested = parseFloat(p?.total_invested || 0);
//   const backendPct    = parseFloat(p?.total_return_percent || 0);
//   const backendAbs    = parseFloat(p?.total_return || 0);
//   if (backendPct !== 0 || backendAbs !== 0) return { pct: backendPct, abs: backendAbs };
//   if (totalInvested > 0) {
//     const abs = currentValue - totalInvested;
//     return { pct: (abs / totalInvested) * 100, abs };
//   }
//   return { pct: 0, abs: 0 };
// }

// // ── Status / plan badge helpers ──────────────────────────────────────────────
// const statusCls = {
//   ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
//   Active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
//   PENDING:   "bg-amber-500/10  text-amber-400  border-amber-500/20",
//   SUSPENDED: "bg-red-500/10    text-red-400    border-red-500/20",
//   Suspended: "bg-red-500/10    text-red-400    border-red-500/20",
//   BANNED:    "bg-red-900/20    text-red-500    border-red-900/30",
//   Inactive:  "bg-gray-500/10   text-gray-500   border-gray-500/20",
// };
// const planCls = (plan) =>
//   plan === "Elite" || plan === "ENTERPRISE" || plan === "PREMIUM"
//     ? "bg-violet-500/10 text-violet-300 border border-violet-500/20"
//     : plan === "Pro" || plan === "PRO"
//     ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
//     : plan === "BASIC"
//     ? "bg-blue-500/10 text-blue-300 border border-blue-500/20"
//     : "bg-white/5 text-gray-500 border border-white/10";

// // ── Tiny toast component ─────────────────────────────────────────────────────
// function Toast({ msg, ok, onClose }) {
//   useEffect(() => {
//     const t = setTimeout(onClose, 3500);
//     return () => clearTimeout(t);
//   }, [onClose]);
//   return (
//     <motion.div
//       initial={{ opacity: 0, y: 30 }}
//       animate={{ opacity: 1, y: 0 }}
//       exit={{ opacity: 0, y: 30 }}
//       className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5
//         px-5 py-3 rounded-2xl shadow-2xl border text-sm font-medium
//         ${ok
//           ? "bg-emerald-900/80 border-emerald-500/30 text-emerald-300"
//           : "bg-red-900/80    border-red-500/30    text-red-300"}`}
//     >
//       {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
//       {msg}
//     </motion.div>
//   );
// }

// // ── Confirm modal ────────────────────────────────────────────────────────────
// function ConfirmModal({ title, desc, confirmLabel, confirmCls, loading, onConfirm, onClose, children }) {
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
//       <motion.div
//         initial={{ opacity: 0, scale: 0.95 }}
//         animate={{ opacity: 1, scale: 1 }}
//         className="w-full max-w-sm bg-[#0C1220] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
//       >
//         <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
//           <span className="text-sm font-bold text-white">{title}</span>
//           <button onClick={onClose} className="text-gray-500 hover:text-white">
//             <X className="w-4 h-4" />
//           </button>
//         </div>
//         <div className="p-6 space-y-4">
//           {desc && <p className="text-sm text-gray-400">{desc}</p>}
//           {children}
//           <div className="flex gap-3 pt-1">
//             <button
//               onClick={onClose}
//               className="flex-1 py-2.5 rounded-xl border border-white/8 text-sm text-gray-400 hover:text-white"
//             >Cancel</button>
//             <button
//               onClick={onConfirm}
//               disabled={loading}
//               className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${confirmCls}`}
//             >
//               {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
//               {confirmLabel}
//             </button>
//           </div>
//         </div>
//       </motion.div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  AdminUserDetail
// // ─────────────────────────────────────────────────────────────────────────────
// export function AdminUserDetail() {
//   const { userId } = useParams();
//   const navigate   = useNavigate();

//   const [userData,     setUserData]     = useState(null);
//   const [profile,      setProfile]      = useState(null);
//   const [portfolio,    setPortfolio]    = useState(null);
//   const [holdings,     setHoldings]     = useState([]);
//   const [perfHistory,  setPerfHistory]  = useState([]);
//   const [wallet,       setWallet]       = useState(null);
//   const [kyc,          setKyc]          = useState(null);
//   const [subscription, setSubscription] = useState(null);
//   const [sessions,     setSessions]     = useState([]);
//   const [plans,        setPlans]        = useState([]);

//   const [pageLoading, setPageLoading] = useState(true);
//   const [pageError,   setPageError]   = useState("");

//   const [toast, setToast] = useState(null);
//   const showToast = (msg, ok = true) => setToast({ msg, ok });

//   const [modal,       setModal]       = useState(null);
//   const [modalInput,  setModalInput]  = useState("");
//   const [modalLoading,setModalLoading]= useState(false);

//   const [tab, setTab] = useState("overview");

//   const apiFetch = useCallback(async (url, options = {}) => {
//     const res  = await fetch(url, { headers: authHdr(), ...options });
//     const data = await res.json();
//     if (res.status === 401 || res.status === 403) {
//       navigate("/signin?role=admin");
//     }
//     return data;
//   }, [navigate]);

//   const loadUser = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/users/${userId}`);
//     if (data.bool) setUserData(data.response);
//     else setPageError(data.response?.message || "Failed to load user.");
//   }, [userId, apiFetch]);

//   const loadProfile = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/user_profiles/${userId}`);
//     if (data.bool) setProfile(data.response);
//   }, [userId, apiFetch]);

//   const loadPortfolio = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/portfolios/admin/all?user_id=${userId}&per_page=1`);
//     if (data.bool && data.response?.portfolios?.length > 0) {
//       const p = data.response.portfolios[0];
//       setPortfolio(p);
//       const hData = await apiFetch(`${API_BASE}/portfolios/${p.portfolio_id}`);
//       if (hData.bool) {
//         setHoldings(hData.response?.holdings || []);
//         const perfData = await apiFetch(
//           `${API_BASE}/portfolios/${p.portfolio_id}/performance?interval=DAILY&limit=60`
//         );
//         if (perfData.bool) setPerfHistory(perfData.response?.data || []);
//       }
//     }
//   }, [userId, apiFetch]);

//   const loadWallet = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}`);
//     if (data.bool) setWallet(data.response);
//   }, [userId, apiFetch]);

//   const loadKyc = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/kyc/admin/list?per_page=100`);
//     if (data.bool) {
//       const found = (data.response?.kyc_submissions || []).find(
//         (k) => String(k.user_id) === String(userId)
//       );
//       setKyc(found || null);
//     }
//   }, [userId, apiFetch]);

//   const loadSubscription = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/subscriptions/admin/all?user_id=${userId}&status=ACTIVE&per_page=1`);
//     if (data.bool && data.response?.subscriptions?.length > 0) {
//       setSubscription(data.response.subscriptions[0]);
//     }
//   }, [userId, apiFetch]);

//   const loadSessions = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/users/${userId}/sessions`);
//     if (data.bool) setSessions(data.response?.sessions || []);
//   }, [userId, apiFetch]);

//   const loadPlans = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/subscriptions/plans`);
//     if (data.bool) setPlans(data.response?.plans || []);
//   }, [apiFetch]);

//   const loadAll = useCallback(async () => {
//     setPageLoading(true);
//     setPageError("");
//     await Promise.allSettled([
//       loadUser(), loadProfile(), loadPortfolio(),
//       loadWallet(), loadKyc(), loadSubscription(),
//       loadSessions(), loadPlans(),
//     ]);
//     setPageLoading(false);
//   }, [loadUser, loadProfile, loadPortfolio, loadWallet, loadKyc, loadSubscription, loadSessions, loadPlans]);

//   useEffect(() => { loadAll(); }, [loadAll]);

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Admin Actions
//   // ─────────────────────────────────────────────────────────────────────────
//   const handleSuspend = async () => {
//     if (!modalInput.trim()) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/suspend`, {
//       method: "POST",
//       body:   JSON.stringify({ reason: modalInput }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("User suspended."); loadUser(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleActivate = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/status`, {
//       method: "PUT",
//       body:   JSON.stringify({ status: "ACTIVE", reason: "Admin reinstated account" }),
//     });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("Account activated."); loadUser(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleBan = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/status`, {
//       method: "PUT",
//       body:   JSON.stringify({ status: "BANNED", reason: modalInput || "Policy violation" }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("User banned."); loadUser(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleResetPassword = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/reset_password`, {
//       method: "POST",
//     });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) {
//       showToast(`Temp password: ${data.response?.temp_password || "Sent to user"}`);
//     } else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleUpgradePlan = async () => {
//     const planId = modalInput;
//     if (!planId) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/subscriptions/admin/upgrade`, {
//       method: "POST",
//       body:   JSON.stringify({
//         user_id:       parseInt(userId),
//         plan_id:       parseInt(planId),
//         billing_cycle: "MONTHLY",
//         note:          "Admin upgrade",
//       }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("Plan upgraded."); loadSubscription(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleFreezeWallet = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}/freeze`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("Wallet frozen."); loadWallet(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleUnfreezeWallet = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}/unfreeze`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("Wallet unfrozen."); loadWallet(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleRevokeSessions = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/revoke_sessions`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("All sessions revoked."); loadSessions(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleApproveKyc = async () => {
//     if (!kyc) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/kyc/admin/${kyc.kyc_id}/review`, {
//       method: "POST",
//       body:   JSON.stringify({ action: "APPROVE", admin_notes: "Documents verified" }),
//     });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("KYC approved."); loadKyc(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   const handleRejectKyc = async () => {
//     if (!kyc) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/kyc/admin/${kyc.kyc_id}/review`, {
//       method: "POST",
//       body:   JSON.stringify({ action: "REJECT", rejection_reason: modalInput || "Documents unclear" }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("KYC rejected."); loadKyc(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   /*
//      FIX — notification not reaching the user's bell icon:
//      UserLayout.jsx reads `n.message || n.body` to render the notification text
//      (it checks `message` FIRST). The previous payload only sent `body`, which
//      worked only as a fallback IF the backend Notifications model has a `body`
//      column at all. Sending BOTH `message` and `body` with the same content
//      guarantees the text displays regardless of which column name the backend
//      actually persists to.
//   */
//   const handleSendMessage = async () => {
//     if (!modalInput.trim()) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/notifications/admin/send`, {
//       method: "POST",
//       body:   JSON.stringify({
//         user_id:           parseInt(userId),
//         broadcast:         false,
//         notification_type: "ADMIN_MESSAGE",
//         title:             "Message from Admin",
//         message:           modalInput,   // ← primary field UserLayout reads
//         body:               modalInput,   // ← fallback field, sent for safety
//         priority:          "MEDIUM",
//       }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) showToast("Message sent. User will see it within 30 seconds.");
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Sector allocation derived from holdings
//   // ─────────────────────────────────────────────────────────────────────────
//   const sectorData = (() => {
//     if (!holdings.length) return [];
//     const totalVal = holdings.reduce((a, h) => a + (h.current_value || 0), 0) || 1;
//     const buckets  = {};
//     holdings.forEach((h) => {
//       const s = h.sector || "Other";
//       buckets[s] = (buckets[s] || 0) + (h.current_value || 0);
//     });
//     return Object.entries(buckets)
//       .map(([name, value], i) => ({
//         name,
//         value: parseFloat(((value / totalVal) * 100).toFixed(1)),
//         color: SECTOR_COLORS[i % SECTOR_COLORS.length],
//       }))
//       .sort((a, b) => b.value - a.value);
//   })();

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Derived display values
//   // ─────────────────────────────────────────────────────────────────────────
//   const displayName   = userData?.full_name   || profile?.display_name || "—";
//   const displayEmail  = userData?.email        || "—";
//   const displayAvatar = (displayName).slice(0, 2).toUpperCase();
//   const displayStatus = userData?.status       || "—";
//   const displayPlan   = subscription?.plan?.plan_name || "Free";
//   const displayCountry= profile?.country       || userData?.country || "—";
//   const displayJoined = userData?.created_on
//     ? new Date(userData.created_on).toLocaleDateString()   : "—";
//   const displayLastLogin = userData?.last_login
//     ? new Date(userData.last_login).toLocaleDateString()   : "—";

//   const totalPortfolioValue = portfolio?.current_value   || 0;
//   // FIX: use deriveReturn() instead of trusting potentially-zero backend fields
//   const { pct: totalReturnPct, abs: totalReturn } = deriveReturn(portfolio);
//   const totalHoldings       = portfolio?.total_holdings_count || holdings.length;
//   const up                  = totalReturnPct >= 0;

//   const chartData = perfHistory.map((p) => ({
//     date:  p.date?.slice(5) || "",
//     close: parseFloat(p.total_value || 0),
//   }));

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Loading / error states
//   // ─────────────────────────────────────────────────────────────────────────
//   if (pageLoading) {
//     return (
//       <div className="flex items-center justify-center h-full min-h-[400px]">
//         <div className="flex flex-col items-center gap-3">
//           <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//           <p className="text-sm text-gray-500">Loading user details…</p>
//         </div>
//       </div>
//     );
//   }

//   if (pageError) {
//     return (
//       <div className="flex items-center justify-center h-full min-h-[400px]">
//         <div className="text-center space-y-3">
//           <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
//           <p className="text-sm text-red-400">{pageError}</p>
//           <button
//             onClick={() => navigate("/admin/users")}
//             className="text-xs text-gray-500 hover:text-white underline"
//           >← Back to Users</button>
//         </div>
//       </div>
//     );
//   }

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Render
//   // ─────────────────────────────────────────────────────────────────────────
//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto">

//       <AnimatePresence>
//         {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
//       </AnimatePresence>

//       <AnimatePresence>
//         {modal === "suspend" && (
//           <ConfirmModal
//             title="Suspend Account"
//             desc="This will immediately revoke all sessions. Enter a reason:"
//             confirmLabel="Suspend"
//             confirmCls="bg-red-600 hover:bg-red-500"
//             loading={modalLoading}
//             onConfirm={handleSuspend}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Reason for suspension…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}

//         {modal === "ban" && (
//           <ConfirmModal
//             title="Ban Account"
//             desc="Permanently ban this user. Enter reason:"
//             confirmLabel="Ban User"
//             confirmCls="bg-red-800 hover:bg-red-700"
//             loading={modalLoading}
//             onConfirm={handleBan}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Reason for ban…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}

//         {modal === "activate" && (
//           <ConfirmModal
//             title="Activate Account"
//             desc="Restore this account to ACTIVE status?"
//             confirmLabel="Activate"
//             confirmCls="bg-emerald-600 hover:bg-emerald-500"
//             loading={modalLoading}
//             onConfirm={handleActivate}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "reset_pw" && (
//           <ConfirmModal
//             title="Force Reset Password"
//             desc="A temporary password will be generated. The user must change it on next login."
//             confirmLabel="Reset Password"
//             confirmCls="bg-cyan-600 hover:bg-cyan-500"
//             loading={modalLoading}
//             onConfirm={handleResetPassword}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "upgrade" && (
//           <ConfirmModal
//             title="Upgrade Subscription Plan"
//             desc="Select a plan to assign to this user:"
//             confirmLabel="Upgrade"
//             confirmCls="bg-violet-600 hover:bg-violet-500"
//             loading={modalLoading}
//             onConfirm={handleUpgradePlan}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <div className="relative">
//               <select
//                 value={modalInput}
//                 onChange={(e) => setModalInput(e.target.value)}
//                 className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-white/20 appearance-none"
//               >
//                 <option value="">— Select a plan —</option>
//                 {plans.map((p) => (
//                   <option key={p.plan_id} value={p.plan_id}>
//                     {p.plan_name} — ₹{p.price_monthly}/mo
//                   </option>
//                 ))}
//               </select>
//               <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
//             </div>
//           </ConfirmModal>
//         )}

//         {modal === "freeze_wallet" && (
//           <ConfirmModal
//             title="Freeze Wallet"
//             desc="The user will not be able to deposit, withdraw or trade until unfrozen."
//             confirmLabel="Freeze"
//             confirmCls="bg-red-600 hover:bg-red-500"
//             loading={modalLoading}
//             onConfirm={handleFreezeWallet}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "unfreeze_wallet" && (
//           <ConfirmModal
//             title="Unfreeze Wallet"
//             desc="Restore full wallet access for this user?"
//             confirmLabel="Unfreeze"
//             confirmCls="bg-emerald-600 hover:bg-emerald-500"
//             loading={modalLoading}
//             onConfirm={handleUnfreezeWallet}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "revoke_sessions" && (
//           <ConfirmModal
//             title="Revoke All Sessions"
//             desc="All active sessions for this user will be immediately terminated."
//             confirmLabel="Revoke All"
//             confirmCls="bg-amber-600 hover:bg-amber-500"
//             loading={modalLoading}
//             onConfirm={handleRevokeSessions}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "kyc_approve" && (
//           <ConfirmModal
//             title="Approve KYC"
//             desc="Mark this user's identity verification as approved?"
//             confirmLabel="Approve KYC"
//             confirmCls="bg-emerald-600 hover:bg-emerald-500"
//             loading={modalLoading}
//             onConfirm={handleApproveKyc}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {modal === "kyc_reject" && (
//           <ConfirmModal
//             title="Reject KYC"
//             desc="Enter a reason for rejection:"
//             confirmLabel="Reject KYC"
//             confirmCls="bg-red-600 hover:bg-red-500"
//             loading={modalLoading}
//             onConfirm={handleRejectKyc}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Rejection reason…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}

//         {modal === "message" && (
//           <ConfirmModal
//             title="Send Admin Message"
//             desc="This will appear as a notification in the user's account within 30 seconds:"
//             confirmLabel="Send Message"
//             confirmCls="bg-violet-600 hover:bg-violet-500"
//             loading={modalLoading}
//             onConfirm={handleSendMessage}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Type your message…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}
//       </AnimatePresence>

//       <div className="flex items-center justify-between mb-5">
//         <button
//           onClick={() => navigate("/admin/users")}
//           className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
//         >
//           <ArrowLeft className="w-4 h-4" /> Back to Users
//         </button>
//         <button
//           onClick={loadAll}
//           className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
//         >
//           <RefreshCw className="w-4 h-4" />
//         </button>
//       </div>

//       <div className="bg-gradient-to-br from-[#0F1530] to-[#0C1220] border border-violet-500/15 rounded-2xl p-6 mb-6">
//         <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">

//           <div className="relative">
//             <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-2xl font-black text-white shadow-xl shadow-violet-500/20">
//               {displayAvatar}
//             </div>
//             <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0C1220]
//               ${displayStatus === "ACTIVE" || displayStatus === "Active" ? "bg-emerald-400" : "bg-gray-500"}`}
//             />
//           </div>

//           <div className="flex-1">
//             <div className="flex flex-wrap items-center gap-3 mb-1">
//               <h1 className="text-2xl font-bold text-white">{displayName}</h1>
//               <span className={`text-xs px-2.5 py-1 rounded-full border ${statusCls[displayStatus] || statusCls.Inactive}`}>
//                 {displayStatus}
//               </span>
//               <span className={`text-xs px-2.5 py-1 rounded-full ${planCls(displayPlan)}`}>
//                 {displayPlan} Plan
//               </span>
//               {userData?.is_email_verified && (
//                 <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
//                   ✓ Verified
//                 </span>
//               )}
//             </div>
//             <div className="flex flex-wrap gap-4 text-sm text-gray-500">
//               <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{displayEmail}</div>
//               <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />{displayCountry}</div>
//               <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined {displayJoined}</div>
//               <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Last login {displayLastLogin}</div>
//             </div>
//           </div>

//           <div className="flex flex-wrap gap-2">
//             <button
//               onClick={() => setModal("message")}
//               className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm text-violet-300 hover:bg-violet-500/20 transition-all"
//             >
//               <Mail className="w-4 h-4" /> Message
//             </button>
//             {(displayStatus === "SUSPENDED" || displayStatus === "BANNED") ? (
//               <button
//                 onClick={() => setModal("activate")}
//                 className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-300 hover:bg-emerald-500/20 transition-all"
//               >
//                 <CheckCircle2 className="w-4 h-4" /> Activate
//               </button>
//             ) : (
//               <button
//                 onClick={() => setModal("suspend")}
//                 className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 hover:bg-red-500/20 transition-all"
//               >
//                 <Ban className="w-4 h-4" /> Suspend
//               </button>
//             )}
//           </div>
//         </div>
//       </div>

//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
//         {[
//           { label: "Portfolio Value",  value: fmtINR(totalPortfolioValue), up: null },
//           { label: "Total Return",     value: totalPortfolioValue > 0 ? `${up?"+":""}${Number(totalReturnPct).toFixed(1)}%` : "—", up: totalPortfolioValue > 0 ? up : null },
//           { label: "Total P&L",        value: totalPortfolioValue > 0 ? `${up?"+":"-"}${fmtINR(Math.abs(totalReturn))}` : "—", up: totalPortfolioValue > 0 ? up : null },
//           { label: "Holdings",         value: `${totalHoldings} stocks`, up: null },
//         ].map((s, i) => (
//           <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
//             <div className="text-xs text-gray-500 mb-1">{s.label}</div>
//             <div className={`text-xl font-bold ${s.up === true ? "text-emerald-400" : s.up === false ? "text-red-400" : "text-white"}`}>
//               {s.value}
//             </div>
//           </div>
//         ))}
//       </div>

//       <div className="flex gap-1 p-1 bg-[#0C1220] border border-white/5 rounded-2xl mb-6 overflow-x-auto">
//         {[
//           { key: "overview",  label: "Overview",  icon: Eye },
//           { key: "holdings",  label: "Holdings",  icon: BarChart2 },
//           { key: "wallet",    label: "Wallet",     icon: Wallet },
//           { key: "sessions",  label: "Sessions",   icon: Activity },
//           { key: "kyc",       label: "KYC",        icon: ShieldCheck },
//         ].map(({ key, label, icon: Icon }) => (
//           <button
//             key={key}
//             onClick={() => setTab(key)}
//             className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
//               tab === key
//                 ? "bg-violet-600/20 text-violet-300 border border-violet-500/20"
//                 : "text-gray-500 hover:text-white"
//             }`}
//           >
//             <Icon className="w-3.5 h-3.5" />{label}
//           </button>
//         ))}
//       </div>

//       {tab === "overview" && (
//         <div className="grid lg:grid-cols-3 gap-6">

//           <div className="lg:col-span-2 space-y-5">

//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//               <div className="flex items-center justify-between mb-5">
//                 <div>
//                   <div className="text-xs text-gray-500 mb-0.5">Portfolio Performance</div>
//                   <div className="text-2xl font-bold text-white">
//                     {fmtINR(totalPortfolioValue)}
//                   </div>
//                   {totalPortfolioValue > 0 && (
//                     <div className={`flex items-center gap-1 mt-0.5 text-sm ${up?"text-emerald-400":"text-red-400"}`}>
//                       {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
//                       {up?"+":""}{Number(totalReturnPct).toFixed(1)}% all-time
//                     </div>
//                   )}
//                 </div>
//                 <div className="px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg">
//                   <span className="text-xs text-violet-300 flex items-center gap-1">
//                     <Eye className="w-3 h-3" /> Admin View
//                   </span>
//                 </div>
//               </div>
//               <div className="h-52">
//                 {chartData.length > 0 ? (
//                   <ResponsiveContainer width="100%" height="100%">
//                     <AreaChart data={chartData}>
//                       <defs>
//                         <linearGradient id="udGrad" x1="0" y1="0" x2="0" y2="1">
//                           <stop offset="5%"  stopColor={up?"#10B981":"#EF4444"} stopOpacity={0.25} />
//                           <stop offset="95%" stopColor={up?"#10B981":"#EF4444"} stopOpacity={0} />
//                         </linearGradient>
//                       </defs>
//                       <XAxis dataKey="date" tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} interval="preserveStartEnd" />
//                       <YAxis tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} tickFormatter={(v)=>`₹${(v/1000).toFixed(0)}k`} />
//                       <Tooltip
//                         contentStyle={{background:"#0C1220",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,fontSize:11}}
//                         formatter={(v)=>[fmtINR(v),"Value"]}
//                       />
//                       <Area type="monotone" dataKey="close" stroke={up?"#10B981":"#EF4444"} strokeWidth={2} fill="url(#udGrad)" dot={false} />
//                     </AreaChart>
//                   </ResponsiveContainer>
//                 ) : (
//                   <div className="flex items-center justify-center h-full text-sm text-gray-600">No performance data yet</div>
//                 )}
//               </div>
//             </div>

//             <div className="grid sm:grid-cols-2 gap-4">
//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="text-sm font-medium text-white mb-4">Account Details</div>
//                 {[
//                   { label: "User ID",       value: userData?.user_id || userId },
//                   { label: "Username",      value: userData?.username || "—" },
//                   { label: "Role",          value: userData?.role || "USER" },
//                   { label: "Plan",          value: displayPlan },
//                   { label: "Status",        value: displayStatus },
//                   { label: "Country",       value: displayCountry },
//                   { label: "Phone",         value: profile?.phone_number || "—" },
//                   { label: "Joined",        value: displayJoined },
//                   { label: "Last Login",    value: displayLastLogin },
//                   { label: "Email Verified",value: userData?.is_email_verified ? "Yes ✓" : "No" },
//                 ].map((item, i) => (
//                   <div key={i} className="flex justify-between py-2 border-b border-white/5 last:border-0">
//                     <span className="text-xs text-gray-600">{item.label}</span>
//                     <span className="text-xs text-white font-medium">{String(item.value)}</span>
//                   </div>
//                 ))}
//               </div>

//               <div className="space-y-4">
//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                   <div className="text-sm font-medium text-white mb-3">KYC Status</div>
//                   <div className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 mb-3 ${
//                     kyc?.kyc_status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
//                     : kyc?.kyc_status === "REJECTED" ? "bg-red-500/10 text-red-400 border-red-500/20"
//                     : kyc?.kyc_status === "PENDING" || kyc?.kyc_status === "UNDER_REVIEW"
//                       ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
//                     : "bg-gray-500/10 text-gray-500 border-gray-500/20"
//                   }`}>
//                     {kyc?.kyc_status || "NOT STARTED"}
//                   </div>
//                   {kyc && kyc.kyc_status !== "APPROVED" && (
//                     <div className="flex gap-2">
//                       <button onClick={()=>setModal("kyc_approve")} className="flex-1 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">Approve</button>
//                       <button onClick={()=>setModal("kyc_reject")}  className="flex-1 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">Reject</button>
//                     </div>
//                   )}
//                 </div>

//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                   <div className="text-sm font-medium text-white mb-3">Subscription</div>
//                   {[
//                     { label: "Plan",          value: displayPlan },
//                     { label: "Status",        value: subscription?.status || "FREE" },
//                     { label: "Billing",       value: subscription?.billing_cycle || "—" },
//                     { label: "Period End",    value: subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—" },
//                   ].map((item, i) => (
//                     <div key={i} className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
//                       <span className="text-xs text-gray-600">{item.label}</span>
//                       <span className="text-xs text-white">{item.value}</span>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           </div>

//           <div className="space-y-5">

//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//               <div className="text-sm font-medium text-white mb-4">Sector Allocation</div>
//               {sectorData.length > 0 ? (
//                 <>
//                   <div className="h-36 mb-4">
//                     <ResponsiveContainer width="100%" height="100%">
//                       <PieChart>
//                         <Pie data={sectorData} cx="50%" cy="50%" innerRadius={36} outerRadius={62} dataKey="value" paddingAngle={4}>
//                           {sectorData.map((e, i) => <Cell key={i} fill={e.color} />)}
//                         </Pie>
//                         <Tooltip
//                           contentStyle={{background:"#0C1220",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,fontSize:11}}
//                           formatter={(v)=>[`${v}%`,""]}
//                         />
//                       </PieChart>
//                     </ResponsiveContainer>
//                   </div>
//                   {sectorData.map((s, i) => (
//                     <div key={i} className="flex items-center justify-between mb-2">
//                       <div className="flex items-center gap-2">
//                         <div className="w-2 h-2 rounded-full" style={{background:s.color}} />
//                         <span className="text-xs text-gray-400">{s.name}</span>
//                       </div>
//                       <span className="text-xs text-white">{s.value}%</span>
//                     </div>
//                   ))}
//                 </>
//               ) : (
//                 <div className="text-xs text-gray-600 text-center py-4">No holdings data</div>
//               )}
//             </div>

//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//               <div className="text-sm font-medium text-white mb-4">Admin Actions</div>
//               <div className="space-y-2">
//                 <button onClick={()=>setModal("upgrade")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20 transition-all">
//                   <Crown className="w-3.5 h-3.5" /> Upgrade Plan
//                 </button>
//                 <button onClick={()=>setModal("reset_pw")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-all">
//                   <KeyRound className="w-3.5 h-3.5" /> Reset Password
//                 </button>
//                 <button onClick={()=>setModal("message")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-all">
//                   <MessageSquare className="w-3.5 h-3.5" /> Send Warning
//                 </button>
//                 <button onClick={()=>setModal("revoke_sessions")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-all">
//                   <ShieldX className="w-3.5 h-3.5" /> Revoke Sessions
//                 </button>
//                 {wallet?.status === "FROZEN" ? (
//                   <button onClick={()=>setModal("unfreeze_wallet")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all">
//                     <Wallet className="w-3.5 h-3.5" /> Unfreeze Wallet
//                   </button>
//                 ) : (
//                   <button onClick={()=>setModal("freeze_wallet")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-orange-500/10 border-orange-500/20 text-orange-300 hover:bg-orange-500/20 transition-all">
//                     <Wallet className="w-3.5 h-3.5" /> Freeze Wallet
//                   </button>
//                 )}
//                 {displayStatus === "ACTIVE" ? (
//                   <button onClick={()=>setModal("suspend")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
//                     <Ban className="w-3.5 h-3.5" /> Suspend Account
//                   </button>
//                 ) : (
//                   <button onClick={()=>setModal("activate")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all">
//                     <CheckCircle2 className="w-3.5 h-3.5" /> Activate Account
//                   </button>
//                 )}
//                 <button onClick={()=>setModal("ban")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-red-900/20 border-red-900/30 text-red-500 hover:bg-red-900/40 transition-all">
//                   <ShieldX className="w-3.5 h-3.5" /> Ban Account
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {tab === "holdings" && (
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//             <div className="flex items-center gap-2">
//               <BarChart2 className="w-4 h-4 text-violet-400" />
//               <span className="text-sm font-medium text-white">All Holdings — Admin View</span>
//             </div>
//             <span className="text-xs text-violet-300 px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded-full">
//               {holdings.length} positions
//             </span>
//           </div>
//           {holdings.length > 0 ? (
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["Symbol","Company","Sector","Shares","Avg Cost","Current Price","Market Value","Unrealized P&L","Return","Allocation"].map((h)=>(
//                       <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {holdings.map((h, i) => {
//                     const pnl = h.unrealized_pnl || 0;
//                     const pct = h.unrealized_pnl_percent || 0;
//                     const hUp = pnl >= 0;
//                     const currSym = (h.currency === "USD") ? "$" : "₹";
//                     return (
//                       <motion.tr key={h.holding_id || i} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.03}}
//                         className="border-b border-white/5 hover:bg-white/5 transition-colors">
//                         <td className="px-5 py-3">
//                           <div className="text-sm font-bold text-white">{h.ticker_symbol || "—"}</div>
//                         </td>
//                         <td className="px-5 py-3 text-sm text-gray-400 max-w-[120px] truncate">{h.company_name || "—"}</td>
//                         <td className="px-5 py-3"><span className="text-xs text-gray-500 px-2 py-0.5 bg-white/5 rounded-full">{h.sector || "—"}</span></td>
//                         <td className="px-5 py-3 text-sm text-gray-300">{parseFloat(h.quantity||0).toFixed(2)}</td>
//                         <td className="px-5 py-3 text-sm text-gray-300">{currSym}{parseFloat(h.average_buy_price||0).toFixed(2)}</td>
//                         <td className="px-5 py-3 text-sm text-white">{currSym}{parseFloat(h.current_price||0).toFixed(2)}</td>
//                         <td className="px-5 py-3 text-sm font-semibold text-white">
//                           {fmtINR(h.current_value||0)}
//                         </td>
//                         <td className={`px-5 py-3 text-sm ${hUp?"text-emerald-400":"text-red-400"}`}>
//                           {hUp?"+":"-"}{fmtINR(Math.abs(pnl))}
//                         </td>
//                         <td className={`px-5 py-3 text-sm ${hUp?"text-emerald-400":"text-red-400"}`}>
//                           {hUp?"+":""}{parseFloat(pct).toFixed(1)}%
//                         </td>
//                         <td className="px-5 py-3 text-sm text-gray-400">
//                           {parseFloat(h.allocation_percent||0).toFixed(1)}%
//                         </td>
//                       </motion.tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           ) : (
//             <div className="py-16 text-center text-gray-600 text-sm">No holdings found for this user.</div>
//           )}
//         </div>
//       )}

//       {tab === "wallet" && (
//         <div className="space-y-5">
//           {wallet ? (
//             <>
//               <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//                 {[
//                   { label:"Balance",           value:fmtINR(wallet.balance),            color:"text-white" },
//                   { label:"Available",         value:fmtINR(wallet.available_balance),  color:"text-emerald-400" },
//                   { label:"Locked",            value:fmtINR(wallet.locked_balance),     color:"text-amber-400" },
//                   { label:"Status",            value: wallet.status || "ACTIVE",                                      color: wallet.status==="FROZEN"?"text-red-400":"text-emerald-400" },
//                 ].map((s,i)=>(
//                   <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
//                     <div className="text-xs text-gray-500 mb-1">{s.label}</div>
//                     <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
//                   </div>
//                 ))}
//               </div>

//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="flex items-center justify-between mb-4">
//                   <div className="text-sm font-medium text-white">Wallet Details</div>
//                   <div className="flex gap-2">
//                     {wallet.status === "FROZEN" ? (
//                       <button onClick={()=>setModal("unfreeze_wallet")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
//                         Unfreeze Wallet
//                       </button>
//                     ) : (
//                       <button onClick={()=>setModal("freeze_wallet")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
//                         Freeze Wallet
//                       </button>
//                     )}
//                   </div>
//                 </div>
//                 <div className="grid sm:grid-cols-2 gap-3">
//                   {[
//                     { label:"Wallet ID",        value:wallet.wallet_id },
//                     { label:"Currency",         value:wallet.currency || "INR" },
//                     { label:"Total Deposited",  value:fmtINR(wallet.total_deposited) },
//                     { label:"Total Withdrawn",  value:fmtINR(wallet.total_withdrawn) },
//                     { label:"Total Invested",   value:fmtINR(wallet.total_invested) },
//                     { label:"Last Transaction", value:wallet.last_transaction_at ? new Date(wallet.last_transaction_at).toLocaleString() : "—" },
//                   ].map((item,i)=>(
//                     <div key={i} className="flex justify-between py-2 border-b border-white/5">
//                       <span className="text-xs text-gray-600">{item.label}</span>
//                       <span className="text-xs text-white font-medium">{String(item.value)}</span>
//                     </div>
//                   ))}
//                 </div>
//               </div>

//               {wallet.recent_transactions?.length > 0 && (
//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//                   <div className="px-5 py-4 border-b border-white/5">
//                     <span className="text-sm font-medium text-white">Recent Transactions</span>
//                   </div>
//                   <div className="overflow-x-auto">
//                     <table className="w-full">
//                       <thead>
//                         <tr className="border-b border-white/5">
//                           {["Type","Amount","Fee","Net","Status","Date"].map(h=>(
//                             <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium">{h}</th>
//                           ))}
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {wallet.recent_transactions.map((t,i)=>(
//                           <tr key={i} className="border-b border-white/5 hover:bg-white/5">
//                             <td className="px-5 py-3 text-xs text-gray-300">{t.transaction_type}</td>
//                             <td className="px-5 py-3 text-sm text-white">{fmtINR(t.amount)}</td>
//                             <td className="px-5 py-3 text-xs text-gray-500">{fmtINR(t.fee)}</td>
//                             <td className="px-5 py-3 text-sm text-emerald-400">{fmtINR(t.net_amount)}</td>
//                             <td className="px-5 py-3">
//                               <span className={`text-xs px-2 py-0.5 rounded-full ${t.status==="COMPLETED"?"bg-emerald-500/10 text-emerald-400":"bg-amber-500/10 text-amber-400"}`}>
//                                 {t.status}
//                               </span>
//                             </td>
//                             <td className="px-5 py-3 text-xs text-gray-600">{t.created_on ? new Date(t.created_on).toLocaleDateString() : "—"}</td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 </div>
//               )}
//             </>
//           ) : (
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center text-gray-600 text-sm">
//               No wallet found for this user.
//             </div>
//           )}
//         </div>
//       )}

//       {tab === "sessions" && (
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//             <span className="text-sm font-medium text-white">Active Sessions ({sessions.length})</span>
//             <button onClick={()=>setModal("revoke_sessions")}
//               className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
//               Revoke All Sessions
//             </button>
//           </div>
//           {sessions.length > 0 ? (
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["Device","Browser / OS","IP Address","Location","Status","Last Active","Created"].map(h=>(
//                       <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {sessions.map((s, i) => (
//                     <tr key={s.session_id || i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
//                       <td className="px-5 py-3 text-sm text-gray-300">{s.device_type || "—"}</td>
//                       <td className="px-5 py-3 text-xs text-gray-500">{s.browser} / {s.os || "—"}</td>
//                       <td className="px-5 py-3 text-xs font-mono text-gray-400">{s.ip_address || "—"}</td>
//                       <td className="px-5 py-3 text-xs text-gray-500">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</td>
//                       <td className="px-5 py-3">
//                         <span className={`text-xs px-2 py-0.5 rounded-full ${
//                           s.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400"
//                           : s.status === "REVOKED" ? "bg-red-500/10 text-red-400"
//                           : "bg-gray-500/10 text-gray-500"
//                         }`}>{s.status}</span>
//                       </td>
//                       <td className="px-5 py-3 text-xs text-gray-600">{s.last_activity ? new Date(s.last_activity).toLocaleString() : "—"}</td>
//                       <td className="px-5 py-3 text-xs text-gray-600">{s.created_on ? new Date(s.created_on).toLocaleDateString() : "—"}</td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           ) : (
//             <div className="py-16 text-center text-gray-600 text-sm">No sessions found.</div>
//           )}
//         </div>
//       )}

//       {tab === "kyc" && (
//         <div className="space-y-5">
//           {kyc ? (
//             <>
//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="flex items-center justify-between mb-4">
//                   <div className="text-sm font-medium text-white">KYC Verification</div>
//                   <div className="flex gap-2">
//                     {kyc.kyc_status !== "APPROVED" && (
//                       <button onClick={()=>setModal("kyc_approve")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
//                         Approve
//                       </button>
//                     )}
//                     {kyc.kyc_status !== "REJECTED" && (
//                       <button onClick={()=>setModal("kyc_reject")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
//                         Reject
//                       </button>
//                     )}
//                   </div>
//                 </div>

//                 <div className="grid sm:grid-cols-2 gap-4">
//                   {[
//                     { label:"KYC ID",             value:kyc.kyc_id },
//                     { label:"Status",             value:kyc.kyc_status },
//                     { label:"Legal Name",         value:`${kyc.legal_first_name||""} ${kyc.legal_last_name||""}`.trim() || "—" },
//                     { label:"Date of Birth",      value:kyc.date_of_birth || "—" },
//                     { label:"Nationality",        value:kyc.nationality || "—" },
//                     { label:"Country of Residence",value:kyc.country_of_residence || "—" },
//                     { label:"ID Document Type",   value:kyc.id_document_type || "—" },
//                     { label:"ID Expiry",          value:kyc.id_document_expiry || "—" },
//                     { label:"Liveness Check",     value:kyc.liveness_check_passed === true ? "Passed ✓" : kyc.liveness_check_passed === false ? "Failed ✗" : "Not done" },
//                     { label:"Submitted At",       value:kyc.submitted_at ? new Date(kyc.submitted_at).toLocaleString() : "—" },
//                     { label:"Approved At",        value:kyc.approved_at ? new Date(kyc.approved_at).toLocaleString() : "—" },
//                     { label:"Expires At",         value:kyc.expires_at ? new Date(kyc.expires_at).toLocaleDateString() : "—" },
//                   ].map((item,i)=>(
//                     <div key={i} className="flex justify-between py-2 border-b border-white/5">
//                       <span className="text-xs text-gray-600">{item.label}</span>
//                       <span className={`text-xs font-medium ${
//                         item.label === "Status" && kyc.kyc_status === "APPROVED" ? "text-emerald-400"
//                         : item.label === "Status" && kyc.kyc_status === "REJECTED" ? "text-red-400"
//                         : "text-white"
//                       }`}>{String(item.value)}</span>
//                     </div>
//                   ))}
//                 </div>

//                 {kyc.rejection_reason && (
//                   <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
//                     <div className="text-xs text-red-400 font-medium mb-1">Rejection Reason</div>
//                     <div className="text-xs text-red-300">{kyc.rejection_reason}</div>
//                   </div>
//                 )}
//                 {kyc.admin_notes && (
//                   <div className="mt-3 p-3 bg-white/5 border border-white/8 rounded-xl">
//                     <div className="text-xs text-gray-500 font-medium mb-1">Admin Notes</div>
//                     <div className="text-xs text-gray-300">{kyc.admin_notes}</div>
//                   </div>
//                 )}
//               </div>

//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="text-sm font-medium text-white mb-4">Submitted Documents</div>
//                 <div className="grid sm:grid-cols-2 gap-3">
//                   {[
//                     { label:"ID Front",       url:kyc.id_document_front_url },
//                     { label:"ID Back",        url:kyc.id_document_back_url },
//                     { label:"Selfie",         url:kyc.selfie_url },
//                     { label:"Address Proof",  url:kyc.address_document_url },
//                   ].map((doc, i) => (
//                     <div key={i} className="flex items-center justify-between p-3 bg-white/3 border border-white/5 rounded-xl">
//                       <div className="flex items-center gap-2">
//                         <FileText className="w-4 h-4 text-gray-500" />
//                         <span className="text-xs text-gray-400">{doc.label}</span>
//                       </div>
//                       {doc.url ? (
//                         <a href={doc.url} target="_blank" rel="noopener noreferrer"
//                           className="text-xs text-cyan-400 hover:underline">View</a>
//                       ) : (
//                         <span className="text-xs text-gray-700">Not uploaded</span>
//                       )}
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </>
//           ) : (
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center">
//               <ShieldCheck className="w-10 h-10 text-gray-700 mx-auto mb-3" />
//               <p className="text-sm text-gray-600">KYC not yet started for this user.</p>
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }



















// ******************************* Dallor code ******************************************


// import { useState, useEffect, useCallback } from "react";
// import { useParams, useNavigate } from "react-router";
// import { motion, AnimatePresence } from "motion/react";
// import {
//   ArrowLeft, TrendingUp, TrendingDown, Ban, Mail, Globe,
//   Calendar, Clock, BarChart2, Eye, RefreshCw, AlertCircle,
//   CheckCircle2, Crown, KeyRound, MessageSquare, Wallet,
//   ShieldCheck, ShieldX, FileText, Activity, X, Loader2,
//   ChevronDown,
// } from "lucide-react";
// import {
//   AreaChart, Area, ResponsiveContainer, Tooltip,
//   XAxis, YAxis, PieChart, Pie, Cell,
// } from "recharts";

// const API_BASE  = "http://127.0.0.1:5050/v1";
// const getToken  = () => localStorage.getItem("access_token");
// const authHdr   = () => ({
//   "Content-Type": "application/json",
//   Authorization: `Bearer ${getToken()}`,
// });

// const SECTOR_COLORS = ["#8B5CF6","#06B6D4","#F59E0B","#10B981","#EF4444","#F97316","#EC4899"];

// // ── Status / plan badge helpers ──────────────────────────────────────────────
// const statusCls = {
//   ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
//   Active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
//   PENDING:   "bg-amber-500/10  text-amber-400  border-amber-500/20",
//   SUSPENDED: "bg-red-500/10    text-red-400    border-red-500/20",
//   Suspended: "bg-red-500/10    text-red-400    border-red-500/20",
//   BANNED:    "bg-red-900/20    text-red-500    border-red-900/30",
//   Inactive:  "bg-gray-500/10   text-gray-500   border-gray-500/20",
// };
// const planCls = (plan) =>
//   plan === "Elite" || plan === "ENTERPRISE" || plan === "PREMIUM"
//     ? "bg-violet-500/10 text-violet-300 border border-violet-500/20"
//     : plan === "Pro" || plan === "PRO"
//     ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
//     : plan === "BASIC"
//     ? "bg-blue-500/10 text-blue-300 border border-blue-500/20"
//     : "bg-white/5 text-gray-500 border border-white/10";

// // ── Tiny toast component ─────────────────────────────────────────────────────
// function Toast({ msg, ok, onClose }) {
//   useEffect(() => {
//     const t = setTimeout(onClose, 3500);
//     return () => clearTimeout(t);
//   }, [onClose]);
//   return (
//     <motion.div
//       initial={{ opacity: 0, y: 30 }}
//       animate={{ opacity: 1, y: 0 }}
//       exit={{ opacity: 0, y: 30 }}
//       className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5
//         px-5 py-3 rounded-2xl shadow-2xl border text-sm font-medium
//         ${ok
//           ? "bg-emerald-900/80 border-emerald-500/30 text-emerald-300"
//           : "bg-red-900/80    border-red-500/30    text-red-300"}`}
//     >
//       {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
//       {msg}
//     </motion.div>
//   );
// }

// // ── Confirm modal ────────────────────────────────────────────────────────────
// function ConfirmModal({ title, desc, confirmLabel, confirmCls, loading, onConfirm, onClose, children }) {
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
//       <motion.div
//         initial={{ opacity: 0, scale: 0.95 }}
//         animate={{ opacity: 1, scale: 1 }}
//         className="w-full max-w-sm bg-[#0C1220] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
//       >
//         <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
//           <span className="text-sm font-bold text-white">{title}</span>
//           <button onClick={onClose} className="text-gray-500 hover:text-white">
//             <X className="w-4 h-4" />
//           </button>
//         </div>
//         <div className="p-6 space-y-4">
//           {desc && <p className="text-sm text-gray-400">{desc}</p>}
//           {children}
//           <div className="flex gap-3 pt-1">
//             <button
//               onClick={onClose}
//               className="flex-1 py-2.5 rounded-xl border border-white/8 text-sm text-gray-400 hover:text-white"
//             >Cancel</button>
//             <button
//               onClick={onConfirm}
//               disabled={loading}
//               className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${confirmCls}`}
//             >
//               {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
//               {confirmLabel}
//             </button>
//           </div>
//         </div>
//       </motion.div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  AdminUserDetail
// // ─────────────────────────────────────────────────────────────────────────────
// export function AdminUserDetail() {
//   const { userId } = useParams();
//   const navigate   = useNavigate();

//   // ── Data states ────────────────────────────────────────────────────────────
//   const [userData,     setUserData]     = useState(null);
//   const [profile,      setProfile]      = useState(null);
//   const [portfolio,    setPortfolio]    = useState(null);
//   const [holdings,     setHoldings]     = useState([]);
//   const [perfHistory,  setPerfHistory]  = useState([]);
//   const [wallet,       setWallet]       = useState(null);
//   const [kyc,          setKyc]          = useState(null);
//   const [subscription, setSubscription] = useState(null);
//   const [sessions,     setSessions]     = useState([]);
//   const [plans,        setPlans]        = useState([]);

//   const [pageLoading, setPageLoading] = useState(true);
//   const [pageError,   setPageError]   = useState("");

//   // ── Toast ──────────────────────────────────────────────────────────────────
//   const [toast, setToast] = useState(null); // { msg, ok }
//   const showToast = (msg, ok = true) => setToast({ msg, ok });

//   // ── Modal states ───────────────────────────────────────────────────────────
//   const [modal,       setModal]       = useState(null); // null | string key
//   const [modalInput,  setModalInput]  = useState("");
//   const [modalLoading,setModalLoading]= useState(false);

//   // ── Tab ────────────────────────────────────────────────────────────────────
//   const [tab, setTab] = useState("overview"); // overview | holdings | wallet | sessions | kyc

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Fetch helpers
//   // ─────────────────────────────────────────────────────────────────────────
//   const apiFetch = useCallback(async (url, options = {}) => {
//     const res  = await fetch(url, { headers: authHdr(), ...options });
//     const data = await res.json();
//     if (res.status === 401 || res.status === 403) {
//       navigate("/signin?role=admin");
//     }
//     return data;
//   }, [navigate]);

//   const loadUser = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/users/${userId}`);
//     if (data.bool) setUserData(data.response);
//     else setPageError(data.response?.message || "Failed to load user.");
//   }, [userId, apiFetch]);

//   const loadProfile = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/user_profiles/${userId}`);
//     if (data.bool) setProfile(data.response);
//   }, [userId, apiFetch]);

//   const loadPortfolio = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/portfolios/admin/all?user_id=${userId}&per_page=1`);
//     if (data.bool && data.response?.portfolios?.length > 0) {
//       const p = data.response.portfolios[0];
//       setPortfolio(p);
//       // Load holdings for that portfolio
//       const hData = await apiFetch(`${API_BASE}/portfolios/${p.portfolio_id}`);
//       if (hData.bool) {
//         setHoldings(hData.response?.holdings || []);
//         // Performance history
//         const perfData = await apiFetch(
//           `${API_BASE}/portfolios/${p.portfolio_id}/performance?interval=DAILY&limit=60`
//         );
//         if (perfData.bool) setPerfHistory(perfData.response?.data || []);
//       }
//     }
//   }, [userId, apiFetch]);

//   const loadWallet = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}`);
//     if (data.bool) setWallet(data.response);
//   }, [userId, apiFetch]);

//   const loadKyc = useCallback(async () => {
//     // List KYC and find this user
//     const data = await apiFetch(`${API_BASE}/kyc/admin/list?per_page=100`);
//     if (data.bool) {
//       const found = (data.response?.kyc_submissions || []).find(
//         (k) => String(k.user_id) === String(userId)
//       );
//       setKyc(found || null);
//     }
//   }, [userId, apiFetch]);

//   const loadSubscription = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/subscriptions/admin/all?user_id=${userId}&status=ACTIVE&per_page=1`);
//     if (data.bool && data.response?.subscriptions?.length > 0) {
//       setSubscription(data.response.subscriptions[0]);
//     }
//   }, [userId, apiFetch]);

//   const loadSessions = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/users/${userId}/sessions`);
//     if (data.bool) setSessions(data.response?.sessions || []);
//   }, [userId, apiFetch]);

//   const loadPlans = useCallback(async () => {
//     const data = await apiFetch(`${API_BASE}/subscriptions/plans`);
//     if (data.bool) setPlans(data.response?.plans || []);
//   }, [apiFetch]);

//   const loadAll = useCallback(async () => {
//     setPageLoading(true);
//     setPageError("");
//     await Promise.allSettled([
//       loadUser(), loadProfile(), loadPortfolio(),
//       loadWallet(), loadKyc(), loadSubscription(),
//       loadSessions(), loadPlans(),
//     ]);
//     setPageLoading(false);
//   }, [loadUser, loadProfile, loadPortfolio, loadWallet, loadKyc, loadSubscription, loadSessions, loadPlans]);

//   useEffect(() => { loadAll(); }, [loadAll]);

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Admin Actions
//   // ─────────────────────────────────────────────────────────────────────────

//   // POST /users/<id>/suspend
//   const handleSuspend = async () => {
//     if (!modalInput.trim()) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/suspend`, {
//       method: "POST",
//       body:   JSON.stringify({ reason: modalInput }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("User suspended."); loadUser(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // PUT /users/<id>/status — ACTIVE
//   const handleActivate = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/status`, {
//       method: "PUT",
//       body:   JSON.stringify({ status: "ACTIVE", reason: "Admin reinstated account" }),
//     });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("Account activated."); loadUser(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // PUT /users/<id>/status — BANNED
//   const handleBan = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/status`, {
//       method: "PUT",
//       body:   JSON.stringify({ status: "BANNED", reason: modalInput || "Policy violation" }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("User banned."); loadUser(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // POST /users/<id>/reset_password
//   const handleResetPassword = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/reset_password`, {
//       method: "POST",
//     });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) {
//       showToast(`Temp password: ${data.response?.temp_password || "Sent to user"}`);
//     } else showToast(data.response?.message || "Failed.", false);
//   };

//   // POST /subscriptions/admin/upgrade
//   const handleUpgradePlan = async () => {
//     const planId = modalInput;
//     if (!planId) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/subscriptions/admin/upgrade`, {
//       method: "POST",
//       body:   JSON.stringify({
//         user_id:       parseInt(userId),
//         plan_id:       parseInt(planId),
//         billing_cycle: "MONTHLY",
//         note:          "Admin upgrade",
//       }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("Plan upgraded."); loadSubscription(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // POST /wallets/admin/<id>/freeze
//   const handleFreezeWallet = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}/freeze`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("Wallet frozen."); loadWallet(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // POST /wallets/admin/<id>/unfreeze
//   const handleUnfreezeWallet = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/wallets/admin/${userId}/unfreeze`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("Wallet unfrozen."); loadWallet(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // POST /users/<id>/revoke_sessions
//   const handleRevokeSessions = async () => {
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/users/${userId}/revoke_sessions`, { method: "POST" });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("All sessions revoked."); loadSessions(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // POST /kyc/admin/<kyc_id>/review  APPROVE
//   const handleApproveKyc = async () => {
//     if (!kyc) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/kyc/admin/${kyc.kyc_id}/review`, {
//       method: "POST",
//       body:   JSON.stringify({ action: "APPROVE", admin_notes: "Documents verified" }),
//     });
//     setModalLoading(false);
//     setModal(null);
//     if (data.bool) { showToast("KYC approved."); loadKyc(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // POST /kyc/admin/<kyc_id>/review  REJECT
//   const handleRejectKyc = async () => {
//     if (!kyc) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/kyc/admin/${kyc.kyc_id}/review`, {
//       method: "POST",
//       body:   JSON.stringify({ action: "REJECT", rejection_reason: modalInput || "Documents unclear" }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) { showToast("KYC rejected."); loadKyc(); }
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // POST /notifications/admin/send
//   const handleSendMessage = async () => {
//     if (!modalInput.trim()) return;
//     setModalLoading(true);
//     const data = await apiFetch(`${API_BASE}/notifications/admin/send`, {
//       method: "POST",
//       body:   JSON.stringify({
//         user_id:          parseInt(userId),
//         broadcast:        false,
//         notification_type:"ADMIN_MESSAGE",
//         title:            "Message from Admin",
//         body:             modalInput,
//         priority:         "MEDIUM",
//       }),
//     });
//     setModalLoading(false);
//     setModal(null); setModalInput("");
//     if (data.bool) showToast("Message sent.");
//     else showToast(data.response?.message || "Failed.", false);
//   };

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Sector allocation derived from holdings
//   // ─────────────────────────────────────────────────────────────────────────
//   const sectorData = (() => {
//     if (!holdings.length) return [];
//     const totalVal = holdings.reduce((a, h) => a + (h.current_value || 0), 0) || 1;
//     const buckets  = {};
//     holdings.forEach((h) => {
//       const s = h.sector || "Other";
//       buckets[s] = (buckets[s] || 0) + (h.current_value || 0);
//     });
//     return Object.entries(buckets)
//       .map(([name, value], i) => ({
//         name,
//         value: parseFloat(((value / totalVal) * 100).toFixed(1)),
//         color: SECTOR_COLORS[i % SECTOR_COLORS.length],
//       }))
//       .sort((a, b) => b.value - a.value);
//   })();

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Derived display values
//   // ─────────────────────────────────────────────────────────────────────────
//   const displayName   = userData?.full_name   || profile?.display_name || "—";
//   const displayEmail  = userData?.email        || "—";
//   const displayAvatar = (displayName).slice(0, 2).toUpperCase();
//   const displayStatus = userData?.status       || "—";
//   const displayPlan   = subscription?.plan?.plan_name || "Free";
//   const displayCountry= profile?.country       || userData?.country || "—";
//   const displayJoined = userData?.created_on
//     ? new Date(userData.created_on).toLocaleDateString()   : "—";
//   const displayLastLogin = userData?.last_login
//     ? new Date(userData.last_login).toLocaleDateString()   : "—";

//   const totalPortfolioValue = portfolio?.current_value   || 0;
//   const totalReturn         = portfolio?.total_return     || 0;
//   const totalReturnPct      = portfolio?.total_return_percent || 0;
//   const totalHoldings       = portfolio?.total_holdings_count || holdings.length;
//   const up                  = totalReturnPct >= 0;

//   // Chart data — use perf history or fallback to empty
//   const chartData = perfHistory.map((p) => ({
//     date:  p.date?.slice(5) || "",   // MM-DD
//     close: parseFloat(p.total_value || 0),
//   }));

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Loading / error states
//   // ─────────────────────────────────────────────────────────────────────────
//   if (pageLoading) {
//     return (
//       <div className="flex items-center justify-center h-full min-h-[400px]">
//         <div className="flex flex-col items-center gap-3">
//           <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
//           <p className="text-sm text-gray-500">Loading user details…</p>
//         </div>
//       </div>
//     );
//   }

//   if (pageError) {
//     return (
//       <div className="flex items-center justify-center h-full min-h-[400px]">
//         <div className="text-center space-y-3">
//           <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
//           <p className="text-sm text-red-400">{pageError}</p>
//           <button
//             onClick={() => navigate("/admin/users")}
//             className="text-xs text-gray-500 hover:text-white underline"
//           >← Back to Users</button>
//         </div>
//       </div>
//     );
//   }

//   // ─────────────────────────────────────────────────────────────────────────
//   //  Render
//   // ─────────────────────────────────────────────────────────────────────────
//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto">

//       {/* Toast */}
//       <AnimatePresence>
//         {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
//       </AnimatePresence>

//       {/* ── Modals ── */}
//       <AnimatePresence>
//         {/* Suspend */}
//         {modal === "suspend" && (
//           <ConfirmModal
//             title="Suspend Account"
//             desc="This will immediately revoke all sessions. Enter a reason:"
//             confirmLabel="Suspend"
//             confirmCls="bg-red-600 hover:bg-red-500"
//             loading={modalLoading}
//             onConfirm={handleSuspend}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Reason for suspension…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}

//         {/* Ban */}
//         {modal === "ban" && (
//           <ConfirmModal
//             title="Ban Account"
//             desc="Permanently ban this user. Enter reason:"
//             confirmLabel="Ban User"
//             confirmCls="bg-red-800 hover:bg-red-700"
//             loading={modalLoading}
//             onConfirm={handleBan}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Reason for ban…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}

//         {/* Activate */}
//         {modal === "activate" && (
//           <ConfirmModal
//             title="Activate Account"
//             desc="Restore this account to ACTIVE status?"
//             confirmLabel="Activate"
//             confirmCls="bg-emerald-600 hover:bg-emerald-500"
//             loading={modalLoading}
//             onConfirm={handleActivate}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {/* Reset Password */}
//         {modal === "reset_pw" && (
//           <ConfirmModal
//             title="Force Reset Password"
//             desc="A temporary password will be generated. The user must change it on next login."
//             confirmLabel="Reset Password"
//             confirmCls="bg-cyan-600 hover:bg-cyan-500"
//             loading={modalLoading}
//             onConfirm={handleResetPassword}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {/* Upgrade Plan */}
//         {modal === "upgrade" && (
//           <ConfirmModal
//             title="Upgrade Subscription Plan"
//             desc="Select a plan to assign to this user:"
//             confirmLabel="Upgrade"
//             confirmCls="bg-violet-600 hover:bg-violet-500"
//             loading={modalLoading}
//             onConfirm={handleUpgradePlan}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <div className="relative">
//               <select
//                 value={modalInput}
//                 onChange={(e) => setModalInput(e.target.value)}
//                 className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-white/20 appearance-none"
//               >
//                 <option value="">— Select a plan —</option>
//                 {plans.map((p) => (
//                   <option key={p.plan_id} value={p.plan_id}>
//                     {p.plan_name} — ${p.price_monthly}/mo
//                   </option>
//                 ))}
//               </select>
//               <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
//             </div>
//           </ConfirmModal>
//         )}

//         {/* Freeze Wallet */}
//         {modal === "freeze_wallet" && (
//           <ConfirmModal
//             title="Freeze Wallet"
//             desc="The user will not be able to deposit, withdraw or trade until unfrozen."
//             confirmLabel="Freeze"
//             confirmCls="bg-red-600 hover:bg-red-500"
//             loading={modalLoading}
//             onConfirm={handleFreezeWallet}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {/* Unfreeze Wallet */}
//         {modal === "unfreeze_wallet" && (
//           <ConfirmModal
//             title="Unfreeze Wallet"
//             desc="Restore full wallet access for this user?"
//             confirmLabel="Unfreeze"
//             confirmCls="bg-emerald-600 hover:bg-emerald-500"
//             loading={modalLoading}
//             onConfirm={handleUnfreezeWallet}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {/* Revoke Sessions */}
//         {modal === "revoke_sessions" && (
//           <ConfirmModal
//             title="Revoke All Sessions"
//             desc="All active sessions for this user will be immediately terminated."
//             confirmLabel="Revoke All"
//             confirmCls="bg-amber-600 hover:bg-amber-500"
//             loading={modalLoading}
//             onConfirm={handleRevokeSessions}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {/* Approve KYC */}
//         {modal === "kyc_approve" && (
//           <ConfirmModal
//             title="Approve KYC"
//             desc="Mark this user's identity verification as approved?"
//             confirmLabel="Approve KYC"
//             confirmCls="bg-emerald-600 hover:bg-emerald-500"
//             loading={modalLoading}
//             onConfirm={handleApproveKyc}
//             onClose={() => setModal(null)}
//           />
//         )}

//         {/* Reject KYC */}
//         {modal === "kyc_reject" && (
//           <ConfirmModal
//             title="Reject KYC"
//             desc="Enter a reason for rejection:"
//             confirmLabel="Reject KYC"
//             confirmCls="bg-red-600 hover:bg-red-500"
//             loading={modalLoading}
//             onConfirm={handleRejectKyc}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Rejection reason…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}

//         {/* Send Message */}
//         {modal === "message" && (
//           <ConfirmModal
//             title="Send Admin Message"
//             desc="This will appear as a notification in the user's account:"
//             confirmLabel="Send Message"
//             confirmCls="bg-violet-600 hover:bg-violet-500"
//             loading={modalLoading}
//             onConfirm={handleSendMessage}
//             onClose={() => { setModal(null); setModalInput(""); }}
//           >
//             <textarea
//               value={modalInput}
//               onChange={(e) => setModalInput(e.target.value)}
//               placeholder="Type your message…"
//               rows={3}
//               className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 resize-none"
//             />
//           </ConfirmModal>
//         )}
//       </AnimatePresence>

//       {/* ── Back + Refresh ── */}
//       <div className="flex items-center justify-between mb-5">
//         <button
//           onClick={() => navigate("/admin/users")}
//           className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
//         >
//           <ArrowLeft className="w-4 h-4" /> Back to Users
//         </button>
//         <button
//           onClick={loadAll}
//           className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
//         >
//           <RefreshCw className="w-4 h-4" />
//         </button>
//       </div>

//       {/* ── User header card ── */}
//       <div className="bg-gradient-to-br from-[#0F1530] to-[#0C1220] border border-violet-500/15 rounded-2xl p-6 mb-6">
//         <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">

//           {/* Avatar */}
//           <div className="relative">
//             <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-2xl font-black text-white shadow-xl shadow-violet-500/20">
//               {displayAvatar}
//             </div>
//             <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0C1220]
//               ${displayStatus === "ACTIVE" || displayStatus === "Active" ? "bg-emerald-400" : "bg-gray-500"}`}
//             />
//           </div>

//           {/* Info */}
//           <div className="flex-1">
//             <div className="flex flex-wrap items-center gap-3 mb-1">
//               <h1 className="text-2xl font-bold text-white">{displayName}</h1>
//               <span className={`text-xs px-2.5 py-1 rounded-full border ${statusCls[displayStatus] || statusCls.Inactive}`}>
//                 {displayStatus}
//               </span>
//               <span className={`text-xs px-2.5 py-1 rounded-full ${planCls(displayPlan)}`}>
//                 {displayPlan} Plan
//               </span>
//               {userData?.is_email_verified && (
//                 <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
//                   ✓ Verified
//                 </span>
//               )}
//             </div>
//             <div className="flex flex-wrap gap-4 text-sm text-gray-500">
//               <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{displayEmail}</div>
//               <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />{displayCountry}</div>
//               <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined {displayJoined}</div>
//               <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Last login {displayLastLogin}</div>
//             </div>
//           </div>

//           {/* Quick action buttons */}
//           <div className="flex flex-wrap gap-2">
//             <button
//               onClick={() => setModal("message")}
//               className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm text-violet-300 hover:bg-violet-500/20 transition-all"
//             >
//               <Mail className="w-4 h-4" /> Message
//             </button>
//             {(displayStatus === "SUSPENDED" || displayStatus === "BANNED") ? (
//               <button
//                 onClick={() => setModal("activate")}
//                 className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-300 hover:bg-emerald-500/20 transition-all"
//               >
//                 <CheckCircle2 className="w-4 h-4" /> Activate
//               </button>
//             ) : (
//               <button
//                 onClick={() => setModal("suspend")}
//                 className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 hover:bg-red-500/20 transition-all"
//               >
//                 <Ban className="w-4 h-4" /> Suspend
//               </button>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* ── Stats row ── */}
//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
//         {[
//           { label: "Portfolio Value",  value: `$${totalPortfolioValue.toLocaleString("en",{maximumFractionDigits:0})}`, up: null },
//           { label: "Total Return",     value: `${up?"+":""}${Number(totalReturnPct).toFixed(1)}%`, up },
//           { label: "Total P&L",        value: `${up?"+":"-"}$${Math.abs(totalReturn).toLocaleString("en",{maximumFractionDigits:0})}`, up },
//           { label: "Holdings",         value: `${totalHoldings} stocks`, up: null },
//         ].map((s, i) => (
//           <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
//             <div className="text-xs text-gray-500 mb-1">{s.label}</div>
//             <div className={`text-xl font-bold ${s.up === true ? "text-emerald-400" : s.up === false ? "text-red-400" : "text-white"}`}>
//               {s.value}
//             </div>
//           </div>
//         ))}
//       </div>

//       {/* ── Tabs ── */}
//       <div className="flex gap-1 p-1 bg-[#0C1220] border border-white/5 rounded-2xl mb-6 overflow-x-auto">
//         {[
//           { key: "overview",  label: "Overview",  icon: Eye },
//           { key: "holdings",  label: "Holdings",  icon: BarChart2 },
//           { key: "wallet",    label: "Wallet",     icon: Wallet },
//           { key: "sessions",  label: "Sessions",   icon: Activity },
//           { key: "kyc",       label: "KYC",        icon: ShieldCheck },
//         ].map(({ key, label, icon: Icon }) => (
//           <button
//             key={key}
//             onClick={() => setTab(key)}
//             className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
//               tab === key
//                 ? "bg-violet-600/20 text-violet-300 border border-violet-500/20"
//                 : "text-gray-500 hover:text-white"
//             }`}
//           >
//             <Icon className="w-3.5 h-3.5" />{label}
//           </button>
//         ))}
//       </div>

//       {/* ──────────────────────────────────────────────────────────── */}
//       {/* TAB: OVERVIEW */}
//       {/* ──────────────────────────────────────────────────────────── */}
//       {tab === "overview" && (
//         <div className="grid lg:grid-cols-3 gap-6">

//           {/* Left: chart + recent holdings */}
//           <div className="lg:col-span-2 space-y-5">

//             {/* Performance chart */}
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//               <div className="flex items-center justify-between mb-5">
//                 <div>
//                   <div className="text-xs text-gray-500 mb-0.5">Portfolio Performance</div>
//                   <div className="text-2xl font-bold text-white">
//                     ${totalPortfolioValue.toLocaleString("en",{maximumFractionDigits:0})}
//                   </div>
//                   <div className={`flex items-center gap-1 mt-0.5 text-sm ${up?"text-emerald-400":"text-red-400"}`}>
//                     {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
//                     {up?"+":""}{Number(totalReturnPct).toFixed(1)}% all-time
//                   </div>
//                 </div>
//                 <div className="px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg">
//                   <span className="text-xs text-violet-300 flex items-center gap-1">
//                     <Eye className="w-3 h-3" /> Admin View
//                   </span>
//                 </div>
//               </div>
//               <div className="h-52">
//                 {chartData.length > 0 ? (
//                   <ResponsiveContainer width="100%" height="100%">
//                     <AreaChart data={chartData}>
//                       <defs>
//                         <linearGradient id="udGrad" x1="0" y1="0" x2="0" y2="1">
//                           <stop offset="5%"  stopColor={up?"#10B981":"#EF4444"} stopOpacity={0.25} />
//                           <stop offset="95%" stopColor={up?"#10B981":"#EF4444"} stopOpacity={0} />
//                         </linearGradient>
//                       </defs>
//                       <XAxis dataKey="date" tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} interval="preserveStartEnd" />
//                       <YAxis tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} tickFormatter={(v)=>`$${(v/1000).toFixed(0)}k`} />
//                       <Tooltip
//                         contentStyle={{background:"#0C1220",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,fontSize:11}}
//                         formatter={(v)=>[`$${Number(v).toLocaleString()}`,"Value"]}
//                       />
//                       <Area type="monotone" dataKey="close" stroke={up?"#10B981":"#EF4444"} strokeWidth={2} fill="url(#udGrad)" dot={false} />
//                     </AreaChart>
//                   </ResponsiveContainer>
//                 ) : (
//                   <div className="flex items-center justify-center h-full text-sm text-gray-600">No performance data yet</div>
//                 )}
//               </div>
//             </div>

//             {/* Account detail grid */}
//             <div className="grid sm:grid-cols-2 gap-4">
//               {/* Profile info */}
//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="text-sm font-medium text-white mb-4">Account Details</div>
//                 {[
//                   { label: "User ID",       value: userData?.user_id || userId },
//                   { label: "Username",      value: userData?.username || "—" },
//                   { label: "Role",          value: userData?.role || "USER" },
//                   { label: "Plan",          value: displayPlan },
//                   { label: "Status",        value: displayStatus },
//                   { label: "Country",       value: displayCountry },
//                   { label: "Phone",         value: profile?.phone_number || "—" },
//                   { label: "Joined",        value: displayJoined },
//                   { label: "Last Login",    value: displayLastLogin },
//                   { label: "Email Verified",value: userData?.is_email_verified ? "Yes ✓" : "No" },
//                 ].map((item, i) => (
//                   <div key={i} className="flex justify-between py-2 border-b border-white/5 last:border-0">
//                     <span className="text-xs text-gray-600">{item.label}</span>
//                     <span className="text-xs text-white font-medium">{String(item.value)}</span>
//                   </div>
//                 ))}
//               </div>

//               {/* KYC + Subscription quick view */}
//               <div className="space-y-4">
//                 {/* KYC status */}
//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                   <div className="text-sm font-medium text-white mb-3">KYC Status</div>
//                   <div className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 mb-3 ${
//                     kyc?.kyc_status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
//                     : kyc?.kyc_status === "REJECTED" ? "bg-red-500/10 text-red-400 border-red-500/20"
//                     : kyc?.kyc_status === "PENDING" || kyc?.kyc_status === "UNDER_REVIEW"
//                       ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
//                     : "bg-gray-500/10 text-gray-500 border-gray-500/20"
//                   }`}>
//                     {kyc?.kyc_status || "NOT STARTED"}
//                   </div>
//                   {kyc && kyc.kyc_status !== "APPROVED" && (
//                     <div className="flex gap-2">
//                       <button onClick={()=>setModal("kyc_approve")} className="flex-1 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">Approve</button>
//                       <button onClick={()=>setModal("kyc_reject")}  className="flex-1 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">Reject</button>
//                     </div>
//                   )}
//                 </div>

//                 {/* Subscription */}
//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                   <div className="text-sm font-medium text-white mb-3">Subscription</div>
//                   {[
//                     { label: "Plan",          value: displayPlan },
//                     { label: "Status",        value: subscription?.status || "FREE" },
//                     { label: "Billing",       value: subscription?.billing_cycle || "—" },
//                     { label: "Period End",    value: subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—" },
//                   ].map((item, i) => (
//                     <div key={i} className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
//                       <span className="text-xs text-gray-600">{item.label}</span>
//                       <span className="text-xs text-white">{item.value}</span>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           </div>

//           {/* Right sidebar */}
//           <div className="space-y-5">

//             {/* Sector allocation */}
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//               <div className="text-sm font-medium text-white mb-4">Sector Allocation</div>
//               {sectorData.length > 0 ? (
//                 <>
//                   <div className="h-36 mb-4">
//                     <ResponsiveContainer width="100%" height="100%">
//                       <PieChart>
//                         <Pie data={sectorData} cx="50%" cy="50%" innerRadius={36} outerRadius={62} dataKey="value" paddingAngle={4}>
//                           {sectorData.map((e, i) => <Cell key={i} fill={e.color} />)}
//                         </Pie>
//                         <Tooltip
//                           contentStyle={{background:"#0C1220",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,fontSize:11}}
//                           formatter={(v)=>[`${v}%`,""]}
//                         />
//                       </PieChart>
//                     </ResponsiveContainer>
//                   </div>
//                   {sectorData.map((s, i) => (
//                     <div key={i} className="flex items-center justify-between mb-2">
//                       <div className="flex items-center gap-2">
//                         <div className="w-2 h-2 rounded-full" style={{background:s.color}} />
//                         <span className="text-xs text-gray-400">{s.name}</span>
//                       </div>
//                       <span className="text-xs text-white">{s.value}%</span>
//                     </div>
//                   ))}
//                 </>
//               ) : (
//                 <div className="text-xs text-gray-600 text-center py-4">No holdings data</div>
//               )}
//             </div>

//             {/* Admin Actions */}
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//               <div className="text-sm font-medium text-white mb-4">Admin Actions</div>
//               <div className="space-y-2">
//                 <button onClick={()=>setModal("upgrade")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20 transition-all">
//                   <Crown className="w-3.5 h-3.5" /> Upgrade Plan
//                 </button>
//                 <button onClick={()=>setModal("reset_pw")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-all">
//                   <KeyRound className="w-3.5 h-3.5" /> Reset Password
//                 </button>
//                 <button onClick={()=>setModal("message")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-all">
//                   <MessageSquare className="w-3.5 h-3.5" /> Send Warning
//                 </button>
//                 <button onClick={()=>setModal("revoke_sessions")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-all">
//                   <ShieldX className="w-3.5 h-3.5" /> Revoke Sessions
//                 </button>
//                 {wallet?.status === "FROZEN" ? (
//                   <button onClick={()=>setModal("unfreeze_wallet")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all">
//                     <Wallet className="w-3.5 h-3.5" /> Unfreeze Wallet
//                   </button>
//                 ) : (
//                   <button onClick={()=>setModal("freeze_wallet")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-orange-500/10 border-orange-500/20 text-orange-300 hover:bg-orange-500/20 transition-all">
//                     <Wallet className="w-3.5 h-3.5" /> Freeze Wallet
//                   </button>
//                 )}
//                 {displayStatus === "ACTIVE" ? (
//                   <button onClick={()=>setModal("suspend")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
//                     <Ban className="w-3.5 h-3.5" /> Suspend Account
//                   </button>
//                 ) : (
//                   <button onClick={()=>setModal("activate")}
//                     className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all">
//                     <CheckCircle2 className="w-3.5 h-3.5" /> Activate Account
//                   </button>
//                 )}
//                 <button onClick={()=>setModal("ban")}
//                   className="w-full py-2.5 flex items-center gap-2 justify-center rounded-xl text-sm border bg-red-900/20 border-red-900/30 text-red-500 hover:bg-red-900/40 transition-all">
//                   <ShieldX className="w-3.5 h-3.5" /> Ban Account
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ──────────────────────────────────────────────────────────── */}
//       {/* TAB: HOLDINGS */}
//       {/* ──────────────────────────────────────────────────────────── */}
//       {tab === "holdings" && (
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//             <div className="flex items-center gap-2">
//               <BarChart2 className="w-4 h-4 text-violet-400" />
//               <span className="text-sm font-medium text-white">All Holdings — Admin View</span>
//             </div>
//             <span className="text-xs text-violet-300 px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded-full">
//               {holdings.length} positions
//             </span>
//           </div>
//           {holdings.length > 0 ? (
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["Symbol","Company","Sector","Shares","Avg Cost","Current Price","Market Value","Unrealized P&L","Return","Allocation"].map((h)=>(
//                       <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {holdings.map((h, i) => {
//                     const pnl = h.unrealized_pnl || 0;
//                     const pct = h.unrealized_pnl_percent || 0;
//                     const hUp = pnl >= 0;
//                     return (
//                       <motion.tr key={h.holding_id || i} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.03}}
//                         className="border-b border-white/5 hover:bg-white/5 transition-colors">
//                         <td className="px-5 py-3">
//                           <div className="text-sm font-bold text-white">{h.ticker_symbol || "—"}</div>
//                         </td>
//                         <td className="px-5 py-3 text-sm text-gray-400 max-w-[120px] truncate">{h.company_name || "—"}</td>
//                         <td className="px-5 py-3"><span className="text-xs text-gray-500 px-2 py-0.5 bg-white/5 rounded-full">{h.sector || "—"}</span></td>
//                         <td className="px-5 py-3 text-sm text-gray-300">{parseFloat(h.quantity||0).toFixed(2)}</td>
//                         <td className="px-5 py-3 text-sm text-gray-300">${parseFloat(h.average_buy_price||0).toFixed(2)}</td>
//                         <td className="px-5 py-3 text-sm text-white">${parseFloat(h.current_price||0).toFixed(2)}</td>
//                         <td className="px-5 py-3 text-sm font-semibold text-white">
//                           ${parseFloat(h.current_value||0).toLocaleString("en",{maximumFractionDigits:0})}
//                         </td>
//                         <td className={`px-5 py-3 text-sm ${hUp?"text-emerald-400":"text-red-400"}`}>
//                           {hUp?"+":"-"}${Math.abs(pnl).toLocaleString("en",{maximumFractionDigits:0})}
//                         </td>
//                         <td className={`px-5 py-3 text-sm ${hUp?"text-emerald-400":"text-red-400"}`}>
//                           {hUp?"+":""}{parseFloat(pct).toFixed(1)}%
//                         </td>
//                         <td className="px-5 py-3 text-sm text-gray-400">
//                           {parseFloat(h.allocation_percent||0).toFixed(1)}%
//                         </td>
//                       </motion.tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           ) : (
//             <div className="py-16 text-center text-gray-600 text-sm">No holdings found for this user.</div>
//           )}
//         </div>
//       )}

//       {/* ──────────────────────────────────────────────────────────── */}
//       {/* TAB: WALLET */}
//       {/* ──────────────────────────────────────────────────────────── */}
//       {tab === "wallet" && (
//         <div className="space-y-5">
//           {wallet ? (
//             <>
//               {/* Wallet summary cards */}
//               <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//                 {[
//                   { label:"Balance",           value:`$${parseFloat(wallet.balance||0).toLocaleString()}`,            color:"text-white" },
//                   { label:"Available",         value:`$${parseFloat(wallet.available_balance||0).toLocaleString()}`,  color:"text-emerald-400" },
//                   { label:"Locked",            value:`$${parseFloat(wallet.locked_balance||0).toLocaleString()}`,     color:"text-amber-400" },
//                   { label:"Status",            value: wallet.status || "ACTIVE",                                      color: wallet.status==="FROZEN"?"text-red-400":"text-emerald-400" },
//                 ].map((s,i)=>(
//                   <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
//                     <div className="text-xs text-gray-500 mb-1">{s.label}</div>
//                     <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
//                   </div>
//                 ))}
//               </div>

//               {/* Wallet details */}
//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="flex items-center justify-between mb-4">
//                   <div className="text-sm font-medium text-white">Wallet Details</div>
//                   <div className="flex gap-2">
//                     {wallet.status === "FROZEN" ? (
//                       <button onClick={()=>setModal("unfreeze_wallet")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
//                         Unfreeze Wallet
//                       </button>
//                     ) : (
//                       <button onClick={()=>setModal("freeze_wallet")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
//                         Freeze Wallet
//                       </button>
//                     )}
//                   </div>
//                 </div>
//                 <div className="grid sm:grid-cols-2 gap-3">
//                   {[
//                     { label:"Wallet ID",        value:wallet.wallet_id },
//                     { label:"Currency",         value:wallet.currency || "USD" },
//                     { label:"Total Deposited",  value:`$${parseFloat(wallet.total_deposited||0).toLocaleString()}` },
//                     { label:"Total Withdrawn",  value:`$${parseFloat(wallet.total_withdrawn||0).toLocaleString()}` },
//                     { label:"Total Invested",   value:`$${parseFloat(wallet.total_invested||0).toLocaleString()}` },
//                     { label:"Last Transaction", value:wallet.last_transaction_at ? new Date(wallet.last_transaction_at).toLocaleString() : "—" },
//                   ].map((item,i)=>(
//                     <div key={i} className="flex justify-between py-2 border-b border-white/5">
//                       <span className="text-xs text-gray-600">{item.label}</span>
//                       <span className="text-xs text-white font-medium">{String(item.value)}</span>
//                     </div>
//                   ))}
//                 </div>
//               </div>

//               {/* Recent wallet transactions */}
//               {wallet.recent_transactions?.length > 0 && (
//                 <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//                   <div className="px-5 py-4 border-b border-white/5">
//                     <span className="text-sm font-medium text-white">Recent Transactions</span>
//                   </div>
//                   <div className="overflow-x-auto">
//                     <table className="w-full">
//                       <thead>
//                         <tr className="border-b border-white/5">
//                           {["Type","Amount","Fee","Net","Status","Date"].map(h=>(
//                             <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium">{h}</th>
//                           ))}
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {wallet.recent_transactions.map((t,i)=>(
//                           <tr key={i} className="border-b border-white/5 hover:bg-white/5">
//                             <td className="px-5 py-3 text-xs text-gray-300">{t.transaction_type}</td>
//                             <td className="px-5 py-3 text-sm text-white">${parseFloat(t.amount||0).toLocaleString()}</td>
//                             <td className="px-5 py-3 text-xs text-gray-500">${parseFloat(t.fee||0).toFixed(2)}</td>
//                             <td className="px-5 py-3 text-sm text-emerald-400">${parseFloat(t.net_amount||0).toLocaleString()}</td>
//                             <td className="px-5 py-3">
//                               <span className={`text-xs px-2 py-0.5 rounded-full ${t.status==="COMPLETED"?"bg-emerald-500/10 text-emerald-400":"bg-amber-500/10 text-amber-400"}`}>
//                                 {t.status}
//                               </span>
//                             </td>
//                             <td className="px-5 py-3 text-xs text-gray-600">{t.created_on ? new Date(t.created_on).toLocaleDateString() : "—"}</td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 </div>
//               )}
//             </>
//           ) : (
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center text-gray-600 text-sm">
//               No wallet found for this user.
//             </div>
//           )}
//         </div>
//       )}

//       {/* ──────────────────────────────────────────────────────────── */}
//       {/* TAB: SESSIONS */}
//       {/* ──────────────────────────────────────────────────────────── */}
//       {tab === "sessions" && (
//         <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//             <span className="text-sm font-medium text-white">Active Sessions ({sessions.length})</span>
//             <button onClick={()=>setModal("revoke_sessions")}
//               className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
//               Revoke All Sessions
//             </button>
//           </div>
//           {sessions.length > 0 ? (
//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["Device","Browser / OS","IP Address","Location","Status","Last Active","Created"].map(h=>(
//                       <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {sessions.map((s, i) => (
//                     <tr key={s.session_id || i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
//                       <td className="px-5 py-3 text-sm text-gray-300">{s.device_type || "—"}</td>
//                       <td className="px-5 py-3 text-xs text-gray-500">{s.browser} / {s.os || "—"}</td>
//                       <td className="px-5 py-3 text-xs font-mono text-gray-400">{s.ip_address || "—"}</td>
//                       <td className="px-5 py-3 text-xs text-gray-500">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</td>
//                       <td className="px-5 py-3">
//                         <span className={`text-xs px-2 py-0.5 rounded-full ${
//                           s.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400"
//                           : s.status === "REVOKED" ? "bg-red-500/10 text-red-400"
//                           : "bg-gray-500/10 text-gray-500"
//                         }`}>{s.status}</span>
//                       </td>
//                       <td className="px-5 py-3 text-xs text-gray-600">{s.last_activity ? new Date(s.last_activity).toLocaleString() : "—"}</td>
//                       <td className="px-5 py-3 text-xs text-gray-600">{s.created_on ? new Date(s.created_on).toLocaleDateString() : "—"}</td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           ) : (
//             <div className="py-16 text-center text-gray-600 text-sm">No sessions found.</div>
//           )}
//         </div>
//       )}

//       {/* ──────────────────────────────────────────────────────────── */}
//       {/* TAB: KYC */}
//       {/* ──────────────────────────────────────────────────────────── */}
//       {tab === "kyc" && (
//         <div className="space-y-5">
//           {kyc ? (
//             <>
//               {/* KYC status card */}
//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="flex items-center justify-between mb-4">
//                   <div className="text-sm font-medium text-white">KYC Verification</div>
//                   <div className="flex gap-2">
//                     {kyc.kyc_status !== "APPROVED" && (
//                       <button onClick={()=>setModal("kyc_approve")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
//                         Approve
//                       </button>
//                     )}
//                     {kyc.kyc_status !== "REJECTED" && (
//                       <button onClick={()=>setModal("kyc_reject")}
//                         className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20">
//                         Reject
//                       </button>
//                     )}
//                   </div>
//                 </div>

//                 <div className="grid sm:grid-cols-2 gap-4">
//                   {[
//                     { label:"KYC ID",             value:kyc.kyc_id },
//                     { label:"Status",             value:kyc.kyc_status },
//                     { label:"Legal Name",         value:`${kyc.legal_first_name||""} ${kyc.legal_last_name||""}`.trim() || "—" },
//                     { label:"Date of Birth",      value:kyc.date_of_birth || "—" },
//                     { label:"Nationality",        value:kyc.nationality || "—" },
//                     { label:"Country of Residence",value:kyc.country_of_residence || "—" },
//                     { label:"ID Document Type",   value:kyc.id_document_type || "—" },
//                     { label:"ID Expiry",          value:kyc.id_document_expiry || "—" },
//                     { label:"Liveness Check",     value:kyc.liveness_check_passed === true ? "Passed ✓" : kyc.liveness_check_passed === false ? "Failed ✗" : "Not done" },
//                     { label:"Submitted At",       value:kyc.submitted_at ? new Date(kyc.submitted_at).toLocaleString() : "—" },
//                     { label:"Approved At",        value:kyc.approved_at ? new Date(kyc.approved_at).toLocaleString() : "—" },
//                     { label:"Expires At",         value:kyc.expires_at ? new Date(kyc.expires_at).toLocaleDateString() : "—" },
//                   ].map((item,i)=>(
//                     <div key={i} className="flex justify-between py-2 border-b border-white/5">
//                       <span className="text-xs text-gray-600">{item.label}</span>
//                       <span className={`text-xs font-medium ${
//                         item.label === "Status" && kyc.kyc_status === "APPROVED" ? "text-emerald-400"
//                         : item.label === "Status" && kyc.kyc_status === "REJECTED" ? "text-red-400"
//                         : "text-white"
//                       }`}>{String(item.value)}</span>
//                     </div>
//                   ))}
//                 </div>

//                 {kyc.rejection_reason && (
//                   <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
//                     <div className="text-xs text-red-400 font-medium mb-1">Rejection Reason</div>
//                     <div className="text-xs text-red-300">{kyc.rejection_reason}</div>
//                   </div>
//                 )}
//                 {kyc.admin_notes && (
//                   <div className="mt-3 p-3 bg-white/5 border border-white/8 rounded-xl">
//                     <div className="text-xs text-gray-500 font-medium mb-1">Admin Notes</div>
//                     <div className="text-xs text-gray-300">{kyc.admin_notes}</div>
//                   </div>
//                 )}
//               </div>

//               {/* Document preview links */}
//               <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                 <div className="text-sm font-medium text-white mb-4">Submitted Documents</div>
//                 <div className="grid sm:grid-cols-2 gap-3">
//                   {[
//                     { label:"ID Front",       url:kyc.id_document_front_url },
//                     { label:"ID Back",        url:kyc.id_document_back_url },
//                     { label:"Selfie",         url:kyc.selfie_url },
//                     { label:"Address Proof",  url:kyc.address_document_url },
//                   ].map((doc, i) => (
//                     <div key={i} className="flex items-center justify-between p-3 bg-white/3 border border-white/5 rounded-xl">
//                       <div className="flex items-center gap-2">
//                         <FileText className="w-4 h-4 text-gray-500" />
//                         <span className="text-xs text-gray-400">{doc.label}</span>
//                       </div>
//                       {doc.url ? (
//                         <a href={doc.url} target="_blank" rel="noopener noreferrer"
//                           className="text-xs text-cyan-400 hover:underline">View</a>
//                       ) : (
//                         <span className="text-xs text-gray-700">Not uploaded</span>
//                       )}
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </>
//           ) : (
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center">
//               <ShieldCheck className="w-10 h-10 text-gray-700 mx-auto mb-3" />
//               <p className="text-sm text-gray-600">KYC not yet started for this user.</p>
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }





















