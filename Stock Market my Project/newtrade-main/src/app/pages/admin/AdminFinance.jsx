import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Landmark, CreditCard, ReceiptText, Percent, Wallet, ArrowDownToLine,
  ArrowUpFromLine, FileBarChart, Lock, ShieldCheck, Eye, EyeOff,
  CheckCircle2, AlertCircle, X, Loader2, RefreshCw, ArrowLeft,
  TrendingUp, Landmark as Bank,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({
  "Content-Type": "application/json",
  Authorization:  `Bearer ${getToken()}`,
});

// ── tiny fetch wrapper → returns { ok, response, message } ──────────────────────
async function api(path, { method = "GET", body } = {}) {
  try {
    const res  = await fetch(`${API_BASE}${path}`, {
      method,
      headers: authHdr(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { ok: !!data.bool, response: data.response || {}, message: data.response?.message || "" };
  } catch (err) {
    return { ok: false, response: {}, message: String(err) };
  }
}

const inr = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

// ── Toast ───────────────────────────────────────────────────────────────────
function Toast({ msg, ok, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className={`fixed top-24 right-6 z-[60] flex items-center gap-2 px-4 py-2.5
        rounded-xl shadow-xl border text-sm font-medium
        ${ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
             : "bg-red-500/10 border-red-500/20 text-red-400"}`}
    >
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// ── reusable input ─────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = "text", secret = false }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-xs text-white/50">{label}</span>
      <div className="relative mt-1">
        <input
          type={secret && !show ? "password" : type}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                     placeholder-white/25 focus:outline-none focus:border-violet-500/60"
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </label>
  );
}

// ── section catalogue ──────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "bank_account",        title: "Company Bank Account", icon: Landmark,        kind: "config", color: "violet",  desc: "Settlement account for platform earnings" },
  { id: "payment_gateway",     title: "Payment Gateway",      icon: CreditCard,      kind: "config", color: "sky",     desc: "Razorpay / gateway credentials" },
  { id: "gst",                 title: "GST Details",          icon: ReceiptText,     kind: "config", color: "amber",   desc: "GSTIN & invoice details" },
  { id: "tax_settings",        title: "Tax Settings",         icon: Percent,         kind: "config", color: "rose",    desc: "Commission, fees & tax rates" },
  { id: "commission_report",   title: "Commission Report",    icon: FileBarChart,    kind: "report", color: "emerald", desc: "Commission collected per trade" },
  { id: "wallet_transactions", title: "Wallet Transactions",  icon: Wallet,          kind: "report", color: "indigo",  desc: "All wallet money movements" },
  { id: "deposits",            title: "Deposits",             icon: ArrowDownToLine, kind: "report", color: "teal",    desc: "User wallet deposits" },
  { id: "withdrawals",         title: "Withdrawals",          icon: ArrowUpFromLine, kind: "report", color: "orange",  desc: "User wallet withdrawals" },
];

const COLOR = {
  violet:  "from-violet-500/20 to-violet-500/5 text-violet-300 border-violet-500/20",
  sky:     "from-sky-500/20 to-sky-500/5 text-sky-300 border-sky-500/20",
  amber:   "from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/20",
  rose:    "from-rose-500/20 to-rose-500/5 text-rose-300 border-rose-500/20",
  emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/20",
  indigo:  "from-indigo-500/20 to-indigo-500/5 text-indigo-300 border-indigo-500/20",
  teal:    "from-teal-500/20 to-teal-500/5 text-teal-300 border-teal-500/20",
  orange:  "from-orange-500/20 to-orange-500/5 text-orange-300 border-orange-500/20",
};

// ── config field definitions per section ───────────────────────────────────────
const CONFIG_FIELDS = {
  bank_account: [
    { key: "account_holder", label: "Account Holder Name" },
    { key: "bank_name",      label: "Bank Name" },
    { key: "account_number", label: "Account Number", secret: true },
    { key: "ifsc",           label: "IFSC Code" },
    { key: "branch",         label: "Branch" },
    { key: "upi_id",         label: "UPI ID (optional)" },
  ],
  payment_gateway: [
    { key: "provider",       label: "Provider (e.g. RAZORPAY)" },
    { key: "mode",           label: "Mode (test / live)" },
    { key: "key_id",         label: "Key ID" },
    { key: "key_secret",     label: "Key Secret", secret: true },
    { key: "webhook_secret", label: "Webhook Secret", secret: true },
  ],
  gst: [
    { key: "gstin",       label: "GSTIN" },
    { key: "legal_name",  label: "Legal Name" },
    { key: "trade_name",  label: "Trade Name" },
    { key: "address",     label: "Registered Address" },
    { key: "state",       label: "State" },
    { key: "gst_rate",    label: "GST Rate (%)" },
  ],
  tax_settings: [
    { key: "commission_percent",     label: "Trading Commission (%)" },
    { key: "withdrawal_fee_percent", label: "Withdrawal Fee (%)" },
    { key: "tds_percent",            label: "TDS (%)" },
    { key: "gst_on_commission",      label: "GST on Commission (%)" },
  ],
};

const CONFIG_ENDPOINT = {
  bank_account:    "/admin/finance/bank_account",
  payment_gateway: "/admin/finance/payment_gateway",
  gst:             "/admin/finance/gst",
  tax_settings:    "/admin/finance/tax_settings",
};

const REPORT_ENDPOINT = {
  commission_report:   "/admin/finance/commission_report",
  wallet_transactions: "/admin/finance/wallet_transactions",
  deposits:            "/admin/finance/deposits",
  withdrawals:         "/admin/finance/withdrawals",
};

// ── Config editor panel ─────────────────────────────────────────────────────────
function ConfigPanel({ section, onToast }) {
  const fields = CONFIG_FIELDS[section.id];
  const [form, setForm]       = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [dirty, setDirty]     = useState({});   // keys the admin actually edited

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, response } = await api(CONFIG_ENDPOINT[section.id]);
    if (ok) setForm(response.data || {});
    setDirty({});
    setLoading(false);
  }, [section.id]);

  useEffect(() => { load(); }, [load]);

  const setVal = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty((d) => ({ ...d, [k]: true }));
  };

  const save = async () => {
    setSaving(true);
    // only send fields the admin actually changed (avoids re-saving masked placeholders)
    const body = {};
    Object.keys(dirty).forEach((k) => { body[k] = form[k]; });
    const { ok, response, message } = await api(CONFIG_ENDPOINT[section.id], { method: "PUT", body });
    if (ok) {
      if (response.data) setForm(response.data);
      setDirty({});
      onToast(message || "Saved", true);
    } else {
      onToast(message || "Save failed", false);
    }
    setSaving(false);
  };

  if (loading)
    return <div className="flex items-center justify-center py-16 text-white/40"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {section.id === "payment_gateway" && (
        <div className="flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Secrets are stored encrypted-at-rest and shown masked. Leave a masked field
            (••••) untouched to keep the current value. The backend prefers these over the .env file.</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            value={form[f.key]}
            secret={f.secret}
            onChange={(v) => setVal(f.key, v)}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving || Object.keys(dirty).length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600
                     disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Save changes
        </button>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm">
          <RefreshCw className="w-4 h-4" /> Reset
        </button>
      </div>
    </div>
  );
}

// ── Report table panel ───────────────────────────────────────────────────────────
const REPORT_COLUMNS = {
  commission_report: [
    { key: "transacted_at", label: "Date", render: (r) => fmtDate(r.transacted_at) },
    { key: "user_name",     label: "User",  render: (r) => r.user_name || r.user_email || `#${r.user_id}` },
    { key: "stock",         label: "Stock", render: (r) => r.stock || "—" },
    { key: "side",          label: "Side",  render: (r) => r.side },
    { key: "gross_amount",  label: "Trade Value", render: (r) => inr(r.gross_amount), align: "right" },
    { key: "commission",    label: "Commission",  render: (r) => <span className="text-emerald-400">{inr(r.commission)}</span>, align: "right" },
  ],
  wallet_transactions: [
    { key: "created_on",       label: "Date", render: (r) => fmtDate(r.created_on) },
    { key: "user_name",        label: "User", render: (r) => r.user_name || r.user_email || `#${r.user_id}` },
    { key: "transaction_type", label: "Type", render: (r) => r.transaction_type },
    { key: "status",           label: "Status", render: (r) => <StatusPill s={r.status} /> },
    { key: "amount",           label: "Amount", render: (r) => inr(r.amount), align: "right" },
    { key: "fee",              label: "Fee", render: (r) => inr(r.fee), align: "right" },
  ],
  deposits: [
    { key: "created_on", label: "Date", render: (r) => fmtDate(r.created_on) },
    { key: "user_name",  label: "User", render: (r) => r.user_name || r.user_email || `#${r.user_id}` },
    { key: "status",     label: "Status", render: (r) => <StatusPill s={r.status} /> },
    { key: "description",label: "Description", render: (r) => r.description || "—" },
    { key: "amount",     label: "Amount", render: (r) => <span className="text-teal-400">{inr(r.amount)}</span>, align: "right" },
  ],
  withdrawals: [
    { key: "created_on", label: "Date", render: (r) => fmtDate(r.created_on) },
    { key: "user_name",  label: "User", render: (r) => r.user_name || r.user_email || `#${r.user_id}` },
    { key: "status",     label: "Status", render: (r) => <StatusPill s={r.status} /> },
    { key: "description",label: "Description", render: (r) => r.description || "—" },
    { key: "amount",     label: "Amount", render: (r) => <span className="text-orange-400">{inr(r.amount)}</span>, align: "right" },
  ],
};

function StatusPill({ s }) {
  const map = {
    COMPLETED: "bg-emerald-500/10 text-emerald-400",
    PENDING:   "bg-amber-500/10 text-amber-400",
    FAILED:    "bg-red-500/10 text-red-400",
    REVERSED:  "bg-white/10 text-white/50",
  };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${map[s] || "bg-white/10 text-white/50"}`}>{s}</span>;
}

function ReportPanel({ section }) {
  const cols = REPORT_COLUMNS[section.id];
  const [rows, setRows]       = useState([]);
  const [meta, setMeta]       = useState({ total: 0, page: 1, total_pages: 1 });
  const [extra, setExtra]     = useState({});   // total_commission / total_amount
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);

  const load = useCallback(async (p) => {
    setLoading(true);
    const { ok, response } = await api(`${REPORT_ENDPOINT[section.id]}?page=${p}&per_page=15`);
    if (ok) {
      setRows(response.rows || []);
      setMeta({ total: response.total || 0, page: response.page || 1, total_pages: response.total_pages || 1 });
      setExtra({ total_commission: response.total_commission, total_amount: response.total_amount });
    }
    setLoading(false);
  }, [section.id]);

  useEffect(() => { load(page); }, [load, page]);

  const totalLabel =
    extra.total_commission != null ? `Total commission: ${inr(extra.total_commission)}` :
    extra.total_amount     != null ? `Total: ${inr(extra.total_amount)}` : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-white/50">{meta.total} record{meta.total === 1 ? "" : "s"}</div>
        {totalLabel && <div className="text-sm font-semibold text-white">{totalLabel}</div>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-white/50 text-left text-xs uppercase tracking-wide">
              {cols.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-medium ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-white/40">
                <Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-white/40">No records yet.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
                  {cols.map((c) => (
                    <td key={c.key} className={`px-4 py-3 text-white/80 ${c.align === "right" ? "text-right" : ""}`}>{c.render(r)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {meta.total_pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 disabled:opacity-30">Prev</button>
          <span className="text-white/50">Page {meta.page} / {meta.total_pages}</span>
          <button disabled={page >= meta.total_pages} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}

// ── Overview stat cards ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, tone = "violet" }) {
  const tones = {
    violet:  "text-violet-300",
    emerald: "text-emerald-300",
    sky:     "text-sky-300",
    teal:    "text-teal-300",
    orange:  "text-orange-300",
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/50">{label}</span>
        <Icon className={`w-4 h-4 ${tones[tone]}`} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function AdminFinance() {
  const [toast, setToast]     = useState(null);
  const [overview, setOverview] = useState(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // section object or null

  const showToast = useCallback((msg, ok = true) => setToast({ msg, ok }), []);

  const loadOverview = useCallback(async () => {
    setOvLoading(true);
    const { ok, response } = await api("/admin/finance/overview");
    if (ok) setOverview(response);
    setOvLoading(false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <AnimatePresence>
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold text-white">Finance</h1>
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10
                             border border-emerald-500/20 rounded-full px-2 py-0.5">
              <ShieldCheck className="w-3 h-3" /> Secured
            </span>
          </div>
          <p className="text-white/40 text-sm mt-1">
            Company accounts, gateway credentials, tax config and platform money flows.
          </p>
        </div>
        <button onClick={() => { loadOverview(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Overview ledger */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {ovLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 h-28 animate-pulse" />
          ))
        ) : (
          <>
            <StatCard label="Company Earnings (ledger)" value={inr(overview?.company_earnings)} icon={TrendingUp} tone="emerald"
              sub={overview?.settled_to?.configured ? `→ ${overview.settled_to.bank_name} ${overview.settled_to.account_number}` : "Bank account not set"} />
            <StatCard label="Commission Collected" value={inr(overview?.total_commission)} icon={Percent} tone="violet"
              sub={`${overview?.commission_count || 0} trades`} />
            {/* <StatCard label="Subscription Revenue" value={inr(overview?.total_subscription)} icon={CreditCard} tone="sky"
              sub={`${overview?.subscription_count || 0} payments`} /> */}
            <StatCard label="Deposits & Withdrawals" value={inr(overview?.total_deposits)} icon={Wallet} tone="teal"
              sub={`Withdrawn ${inr(overview?.total_withdrawals)}`} />
          </>
        )}
      </div>

      {/* Detail panel OR card grid */}
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div key="detail" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <button onClick={() => { setSelected(null); loadOverview(); }}
                  className="p-2 rounded-lg border border-white/10 text-white/60 hover:text-white">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <selected.icon className="w-5 h-5 text-white/70" />
                  <h2 className="text-lg font-semibold text-white">{selected.title}</h2>
                </div>
              </div>
              <span className="text-xs text-white/40">{selected.desc}</span>
            </div>
            {selected.kind === "config"
              ? <ConfigPanel section={selected} onToast={showToast} />
              : <ReportPanel section={selected} />}
          </motion.div>
        ) : (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {SECTIONS.map((s) => (
              <button key={s.id} onClick={() => setSelected(s)}
                className={`text-left rounded-2xl border bg-gradient-to-br p-5 transition hover:scale-[1.02]
                            hover:border-white/25 ${COLOR[s.color]}`}>
                <div className="flex items-center justify-between mb-4">
                  <s.icon className="w-6 h-6" />
                  <span className="text-[10px] uppercase tracking-wide opacity-70">
                    {s.kind === "config" ? "Configure" : "Report"}
                  </span>
                </div>
                <div className="text-white font-semibold">{s.title}</div>
                <div className="text-white/50 text-xs mt-1">{s.desc}</div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
