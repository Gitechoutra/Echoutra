import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Wallet, Plus, Trash2, ArrowDownToLine, Loader2, X, CheckCircle2,
  AlertCircle, Star, Building2, Smartphone, RefreshCw, Lock, ArrowUpRight,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

const fmtINR = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METHOD_META = {
  UPI:          { label: "UPI",          icon: Smartphone },
  BANK_ACCOUNT: { label: "Bank account", icon: Building2 },
  NET_BANKING:  { label: "Net banking",  icon: Building2 },
};

const fmtDate = (s) => {
  try { return new Date(s).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
};

export function UserWallet() {
  const [wallet,   setWallet]   = useState(null);
  const [methods,  setMethods]  = useState([]);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [toast,    setToast]    = useState(null);           // { type, text }

  const [showAdd,      setShowAdd]      = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const showToast = useCallback((type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    if (!getToken()) return;
    setError("");
    try {
      const [wRes, mRes, hRes] = await Promise.all([
        fetch(`${API_BASE}/wallets/me`, { headers: authHdr() }),
        fetch(`${API_BASE}/wallets/payout_methods`, { headers: authHdr() }),
        fetch(`${API_BASE}/wallets/transactions?type=WITHDRAWAL&per_page=15`, { headers: authHdr() }),
      ]);
      const wd = await wRes.json();
      if (wd?.bool) setWallet(wd.response);
      else if (wd?.status === 404) setWallet({ balance: 0, available_balance: 0, locked_balance: 0, total_withdrawn: 0, currency: "INR", status: "ACTIVE" });

      const md = await mRes.json();
      if (md?.bool) setMethods(md.response?.payout_methods || []);

      const hd = await hRes.json();
      if (hd?.bool) setHistory(hd.response?.transactions || []);
    } catch {
      setError("Could not load your wallet. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const balanceCards = [
    { label: "Available to withdraw", value: wallet?.available_balance, icon: Wallet,        accent: "text-cyan-400",   ring: "border-cyan-500/20",   big: true },
    { label: "Total balance",         value: wallet?.balance,           icon: Wallet,        accent: "text-white",      ring: "border-white/8" },
    { label: "Locked (in orders)",    value: wallet?.locked_balance,    icon: Lock,          accent: "text-amber-400",  ring: "border-amber-500/15" },
    { label: "Total withdrawn",       value: wallet?.total_withdrawn,   icon: ArrowUpRight,  accent: "text-violet-400", ring: "border-violet-500/15" },
  ];

  const walletFrozen = wallet?.status && wallet.status !== "ACTIVE";

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-cyan-400" /> Wallet
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your balance, payout methods and withdrawals</p>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {walletFrozen && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm text-amber-300">
          <Lock className="w-4 h-4 flex-shrink-0" /> Your wallet is currently {wallet.status.toLowerCase()}. Withdrawals are disabled — contact support.
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {balanceCards.map((c, i) => (
          <div key={i} className={`bg-[#0C1220] border ${c.ring} rounded-2xl p-4 ${c.big ? "col-span-2 lg:col-span-1" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.accent}`} />
            </div>
            <div className={`font-bold text-white ${c.big ? "text-2xl lg:text-3xl" : "text-xl"}`}>
              {loading ? <span className="text-gray-700 animate-pulse">…</span> : fmtINR(c.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Primary action */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setShowWithdraw(true)}
          disabled={walletFrozen || loading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <ArrowDownToLine className="w-4 h-4" /> Withdraw funds
        </button>
        <button
          onClick={() => setShowAdd(true)}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-gray-200 font-medium hover:bg-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add payout method
        </button>
      </div>

      {/* Payout methods */}
      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5 text-sm font-medium text-white">
          Payout methods
        </div>
        {methods.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-600">
            No payout methods yet. Add a UPI ID or bank account to withdraw.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {methods.map((m) => {
              const Meta = METHOD_META[m.method_type] || METHOD_META.BANK_ACCOUNT;
              return (
                <PayoutRow
                  key={m.payout_method_id}
                  method={m}
                  Icon={Meta.icon}
                  onChanged={load}
                  showToast={showToast}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Withdrawal history */}
      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5 text-sm font-medium text-white">
          Recent withdrawals
        </div>
        {history.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-600">No withdrawals yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Date", "Description", "Amount", "Fee", "Net", "Status"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((t) => (
                  <tr key={t.wallet_txn_id} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(t.created_on)}</td>
                    <td className="px-5 py-3 text-sm text-gray-300">{t.description || "Withdrawal"}</td>
                    <td className="px-5 py-3 text-sm text-white whitespace-nowrap">{fmtINR(t.amount)}</td>
                    <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtINR(t.fee)}</td>
                    <td className="px-5 py-3 text-sm text-cyan-400 whitespace-nowrap">{fmtINR(t.net_amount)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${
                        t.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/15"
                        : t.status === "PENDING" ? "bg-amber-500/10 text-amber-400 border-amber-500/15"
                        : "bg-red-500/10 text-red-400 border-red-500/15"}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAdd && (
          <AddPayoutModal
            onClose={() => setShowAdd(false)}
            onAdded={() => { setShowAdd(false); load(); showToast("success", "Payout method added."); }}
            showToast={showToast}
          />
        )}
        {showWithdraw && (
          <WithdrawModal
            wallet={wallet}
            methods={methods}
            onClose={() => setShowWithdraw(false)}
            onDone={(msg) => { setShowWithdraw(false); load(); showToast("success", msg); }}
            onNeedMethod={() => { setShowWithdraw(false); setShowAdd(true); }}
            showToast={showToast}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className={`fixed bottom-6 right-6 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm ${
              toast.type === "success"
                ? "bg-[#0C1220] border-emerald-500/30 text-emerald-300"
                : "bg-[#0C1220] border-red-500/30 text-red-300"}`}
          >
            {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── One payout-method row ─────────────────────────────────────────────────── */
function PayoutRow({ method: m, Icon, onChanged, showToast }) {
  const [busy, setBusy] = useState(false);

  const setPrimary = async () => {
    if (m.is_primary || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/wallets/payout_methods/${m.payout_method_id}/primary`, {
        method: "POST", headers: authHdr(),
      });
      const d = await res.json();
      if (d?.bool) onChanged(); else showToast("error", d?.response?.message || "Could not update.");
    } catch { showToast("error", "Network error."); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (busy) return;
    if (!window.confirm(`Remove ${m.display_name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/wallets/payout_methods/${m.payout_method_id}`, {
        method: "DELETE", headers: authHdr(),
      });
      const d = await res.json();
      if (d?.bool) { onChanged(); showToast("success", "Payout method removed."); }
      else showToast("error", d?.response?.message || "Could not remove.");
    } catch { showToast("error", "Network error."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-cyan-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{m.display_name}</span>
          {m.is_primary && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-current" /> Primary
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {(METHOD_META[m.method_type]?.label || m.method_type)}{m.display_detail ? ` · ${m.display_detail}` : ""}
        </div>
      </div>
      {!m.is_primary && (
        <button onClick={setPrimary} disabled={busy}
          className="text-xs text-gray-400 hover:text-cyan-400 transition-colors disabled:opacity-40 whitespace-nowrap">
          Set primary
        </button>
      )}
      <button onClick={remove} disabled={busy}
        className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors disabled:opacity-40">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );
}

/* ── Add payout method modal ───────────────────────────────────────────────── */
function AddPayoutModal({ onClose, onAdded, showToast }) {
  const [type,   setType]   = useState("UPI");
  const [form,   setForm]   = useState({ label: "", upi_id: "", account_holder: "", bank_name: "", account_number: "", ifsc: "", is_primary: false });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr("");
    // client-side validation mirrors the backend guards
    if (type === "UPI") {
      if (!/^[\w.\-]{2,}@[\w]{2,}$/.test(form.upi_id.trim())) { setErr("Enter a valid UPI ID (e.g. name@bank)."); return; }
    } else {
      if (!form.account_holder.trim()) { setErr("Account holder name is required."); return; }
      if (!form.bank_name.trim())      { setErr("Bank name is required."); return; }
      if (!/^\d{6,18}$/.test(form.account_number.trim())) { setErr("Enter a valid account number."); return; }
      if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(form.ifsc.trim())) { setErr("Enter a valid IFSC code."); return; }
    }
    setSaving(true);
    try {
      const body = { method_type: type, label: form.label.trim() || undefined, is_primary: form.is_primary };
      if (type === "UPI") body.upi_id = form.upi_id.trim();
      else Object.assign(body, {
        account_holder: form.account_holder.trim(),
        bank_name:      form.bank_name.trim(),
        account_number: form.account_number.trim(),
        ifsc:           form.ifsc.trim().toUpperCase(),
      });
      const res = await fetch(`${API_BASE}/wallets/payout_methods`, {
        method: "POST", headers: authHdr(), body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d?.bool) onAdded();
      else setErr(d?.response?.message || "Could not add payout method.");
    } catch { setErr("Network error. Please try again."); }
    finally { setSaving(false); }
  };

  const field = "w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-colors";

  return (
    <ModalShell title="Add payout method" onClose={onClose}>
      <div className="flex gap-2 mb-4">
        {["UPI", "BANK_ACCOUNT", "NET_BANKING"].map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 px-3 py-2 text-xs rounded-xl border transition-all ${
              type === t ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300" : "border-white/8 text-gray-500 hover:text-white"}`}>
            {METHOD_META[t].label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {type === "UPI" ? (
          <input className={field} placeholder="UPI ID (e.g. name@okhdfc)" value={form.upi_id}
            onChange={(e) => set("upi_id", e.target.value)} />
        ) : (
          <>
            <input className={field} placeholder="Account holder name" value={form.account_holder}
              onChange={(e) => set("account_holder", e.target.value)} />
            <input className={field} placeholder="Bank name" value={form.bank_name}
              onChange={(e) => set("bank_name", e.target.value)} />
            <input className={field} placeholder="Account number" value={form.account_number}
              onChange={(e) => set("account_number", e.target.value.replace(/\D/g, ""))} />
            <input className={field} placeholder="IFSC code" value={form.ifsc}
              onChange={(e) => set("ifsc", e.target.value.toUpperCase())} />
          </>
        )}
        <input className={field} placeholder="Nickname (optional, e.g. Salary account)" value={form.label}
          onChange={(e) => set("label", e.target.value)} />
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={form.is_primary} onChange={(e) => set("is_primary", e.target.checked)}
            className="accent-cyan-500" />
          Set as primary (default) payout method
        </label>
      </div>

      {err && <div className="mt-3 text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {err}</div>}

      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-colors">Cancel</button>
        <button onClick={submit} disabled={saving}
          className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add method
        </button>
      </div>
    </ModalShell>
  );
}

/* ── Withdraw modal ────────────────────────────────────────────────────────── */
function WithdrawModal({ wallet, methods, onClose, onDone, onNeedMethod, showToast }) {
  const primary = methods.find((m) => m.is_primary) || methods[0];
  const [methodId, setMethodId] = useState(primary?.payout_method_id || "");
  const [amount,   setAmount]   = useState("");
  const [quote,    setQuote]    = useState(null);
  const [quoting,  setQuoting]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err,      setErr]      = useState("");
  const quoteTimer = useRef(null);

  const available = Number(wallet?.available_balance || 0);
  const amt = parseFloat(amount);
  const amountValid = !isNaN(amt) && amt > 0 && amt <= available;

  // Live fee quote (debounced) whenever amount/method change and are valid.
  useEffect(() => {
    setQuote(null);
    if (!methodId || !amountValid) return;
    clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await fetch(`${API_BASE}/wallets/withdraw/quote`, {
          method: "POST", headers: authHdr(),
          body: JSON.stringify({ amount: amt, payout_method_id: Number(methodId) }),
        });
        const d = await res.json();
        if (d?.bool) setQuote(d.response);
      } catch { /* ignore quote errors, submit still validates */ }
      finally { setQuoting(false); }
    }, 350);
    return () => clearTimeout(quoteTimer.current);
  }, [amt, methodId, amountValid]);

  const submit = async () => {
    setErr("");
    if (!methodId) { setErr("Select a payout method."); return; }
    if (isNaN(amt) || amt <= 0) { setErr("Enter a valid amount."); return; }
    if (amt > available) { setErr("Amount exceeds your available balance."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/wallets/withdraw`, {
        method: "POST", headers: authHdr(),
        body: JSON.stringify({ amount: amt, payout_method_id: Number(methodId) }),
      });
      const d = await res.json();
      if (d?.bool) {
        onDone(`Withdrawal of ${fmtINR(d.response.amount)} successful — ${fmtINR(d.response.net_amount)} paid out.`);
      } else {
        setErr(d?.response?.message || "Withdrawal failed.");
      }
    } catch { setErr("Network error. Please try again."); }
    finally { setSubmitting(false); }
  };

  if (methods.length === 0) {
    return (
      <ModalShell title="Withdraw funds" onClose={onClose}>
        <div className="text-center py-6">
          <ArrowDownToLine className="w-8 h-8 text-cyan-500/40 mx-auto mb-3" />
          <p className="text-sm text-gray-300">You need a payout method first.</p>
          <p className="text-xs text-gray-600 mt-1">Add a UPI ID or bank account to withdraw your funds.</p>
          <button onClick={onNeedMethod}
            className="mt-4 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-sm font-semibold text-white hover:opacity-90 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add payout method
          </button>
        </div>
      </ModalShell>
    );
  }

  const field = "w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-colors";

  return (
    <ModalShell title="Withdraw funds" onClose={onClose}>
      <div className="text-xs text-gray-500 mb-1">Available to withdraw</div>
      <div className="text-2xl font-bold text-cyan-400 mb-4">{fmtINR(available)}</div>

      <label className="block text-xs text-gray-500 mb-1.5">Amount (₹)</label>
      <input
        className={field} type="number" min="0" placeholder="0.00" value={amount}
        onChange={(e) => setAmount(e.target.value)} autoFocus
      />
      <div className="flex gap-2 mt-2">
        {[0.25, 0.5, 1].map((f) => (
          <button key={f} onClick={() => setAmount(String(Math.floor(available * f * 100) / 100))}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 border border-white/8 text-gray-400 hover:text-cyan-400 transition-colors">
            {f === 1 ? "Max" : `${f * 100}%`}
          </button>
        ))}
      </div>

      <label className="block text-xs text-gray-500 mb-1.5 mt-4">Payout to</label>
      <select className={field} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
        {methods.map((m) => (
          <option key={m.payout_method_id} value={m.payout_method_id} className="bg-[#141C30]">
            {m.display_name}{m.display_detail ? ` · ${m.display_detail}` : ""}{m.is_primary ? "  (primary)" : ""}
          </option>
        ))}
      </select>

      {/* Fee breakdown */}
      {amountValid && (
        <div className="mt-4 rounded-xl border border-white/8 bg-[#141C30] p-3 text-xs space-y-1.5">
          {quoting ? (
            <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating fees…</div>
          ) : quote ? (
            <>
              <Row label="Amount"        value={fmtINR(quote.amount)} />
              <Row label="Platform fee"  value={`− ${fmtINR(quote.platform_fee)}`} muted />
              <Row label="Gateway fee"   value={`− ${fmtINR(quote.gateway_fee)}`} muted />
              <div className="border-t border-white/8 my-1" />
              <Row label="You receive"   value={fmtINR(quote.net_amount)} strong />
            </>
          ) : (
            <div className="text-gray-600">Enter an amount to see fees.</div>
          )}
        </div>
      )}
      {amount !== "" && !amountValid && (
        <div className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {amt > available ? "Amount exceeds your available balance." : "Enter a valid amount."}
        </div>
      )}

      {err && <div className="mt-3 text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {err}</div>}

      <p className="mt-3 text-[11px] text-gray-600">Payouts are processed to your selected method. Fees are set by the platform and shown above before you confirm.</p>

      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-colors">Cancel</button>
        <button onClick={submit} disabled={submitting || !amountValid || !methodId}
          className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />} Confirm withdrawal
        </button>
      </div>
    </ModalShell>
  );
}

function Row({ label, value, muted, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-gray-500" : "text-gray-400"}>{label}</span>
      <span className={strong ? "text-cyan-400 font-semibold text-sm" : muted ? "text-gray-500" : "text-gray-200"}>{value}</span>
    </div>
  );
}

/* ── Shared modal shell ────────────────────────────────────────────────────── */
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0C1220] border border-cyan-500/20 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}
