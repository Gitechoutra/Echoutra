import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield, Bell, Globe, Database, Check, AlertTriangle,
  Lock, AlertCircle, RefreshCw, Eye, EyeOff, CheckCircle2,
  Loader2, X,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({
  "Content-Type": "application/json",
  Authorization:  `Bearer ${getToken()}`,
});

// ── Mapping: UI field → exact setting_key stored by seed_admin_settings.py ──
//
//  seed_admin_settings stores keys like:
//    PLATFORM_NAME, PLATFORM_SUPPORT_EMAIL, PLATFORM_DEFAULT_CURRENCY,
//    PLATFORM_MAINTENANCE_MODE, TRADING_ENABLED,
//    SECURITY_FORCE_2FA_FOR_ADMINS, SECURITY_IP_BLOCKLIST,
//    NOTIFICATIONS_EMAIL_ENABLED, NOTIFICATIONS_SMS_ENABLED,
//    NOTIFICATIONS_PUSH_ENABLED
//
const SETTING_KEYS = {
  platform_name:     "PLATFORM_NAME",
  support_email:     "PLATFORM_SUPPORT_EMAIL",
  default_currency:  "PLATFORM_DEFAULT_CURRENCY",
  maintenance_mode:  "PLATFORM_MAINTENANCE_MODE",
  trading_enabled:   "TRADING_ENABLED",
  enforce_2fa:       "SECURITY_FORCE_2FA_FOR_ADMINS",
  ip_blocklist:      "SECURITY_IP_BLOCKLIST",
  email_notifs:      "NOTIFICATIONS_EMAIL_ENABLED",
  sms_notifs:        "NOTIFICATIONS_SMS_ENABLED",
  push_notifs:       "NOTIFICATIONS_PUSH_ENABLED",
  commission:        "TRADING_COMMISSION_PERCENT",
  withdrawal_fee:    "TRADING_WITHDRAWAL_FEE_PERCENT",
  max_deposit:       "TRADING_MAX_SINGLE_DEPOSIT",
  kyc_to_trade:      "KYC_REQUIRED_TO_TRADE",
  kyc_to_withdraw:   "KYC_REQUIRED_TO_WITHDRAW",
  otp_expiry:        "OTP_EXPIRY_MINUTES",
  session_timeout:   "SECURITY_SESSION_TIMEOUT_MINUTES",
  max_login_attempts:"SECURITY_MAX_LOGIN_ATTEMPTS",
};

const tabs = [
  { id: "platform", label: "Platform", icon: Globe },
  { id: "security", label: "Security",  icon: Shield },
  { id: "notifs",   label: "Alerts",    icon: Bell },
  { id: "system",   label: "System",    icon: Database },
];

// ── tiny Toast ────────────────────────────────────────────────────────────────
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
      className={`fixed top-24 right-6 z-50 flex items-center gap-2 px-4 py-2.5
        rounded-xl shadow-xl border text-sm font-medium
        ${ok
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : "bg-red-500/10    border-red-500/20    text-red-400"}`}
    >
      {ok
        ? <CheckCircle2 className="w-4 h-4" />
        : <AlertCircle  className="w-4 h-4" />}
      {msg}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// ── Toggle component ──────────────────────────────────────────────────────────
function Toggle({ v, onToggle, disabled = false }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors
        ${v ? "bg-violet-500" : "bg-white/10"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white
        transition-transform ${v ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function AdminSettings() {
  const [active,       setActive]       = useState("platform");
  const [toast,        setToast]        = useState(null);   // {msg, ok}
  const [saveError,    setSaveError]    = useState("");
  const [loading,      setLoading]      = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  // Raw settings map from API  { SETTING_KEY: value_string }
  const [settingsMap, setSettingsMap] = useState({});

  // ── Platform ────────────────────────────────────────────────────────────────
  const [platformName,    setPlatformName]    = useState("TradeFlow");
  const [supportEmail,    setSupportEmail]    = useState("support@tradeflow.io");
  const [defaultCurrency, setDefaultCurrency] = useState("INR");
  const [maintenance,     setMaint]           = useState(false);
  const [tradingEnabled,  setTradingEnabled]  = useState(true);
  const [commission,      setCommission]      = useState("0.1");
  const [withdrawalFee,   setWithdrawalFee]   = useState("0.1");
  const [maxDeposit,      setMaxDeposit]      = useState("100000");

  // ── Security ────────────────────────────────────────────────────────────────
  const [twoFA,           setTwoFA]           = useState(true);
  const [ipBlock,         setIpBlock]         = useState(false);
  const [sessionTimeout,  setSessionTimeout]  = useState("120");
  const [maxLoginAttempts,setMaxLoginAttempts]= useState("5");
  const [otpExpiry,       setOtpExpiry]       = useState("10");
  const [kycToTrade,      setKycToTrade]      = useState(false);
  const [kycToWithdraw,   setKycToWithdraw]   = useState(true);
  // Admin password change
  const [oldPw,    setOldPw]    = useState("");
  const [newPw,    setNewPw]    = useState("");
  const [confPw,   setConfPw]   = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [pwLoading,setPwLoading]= useState(false);

  // ── Notifications ────────────────────────────────────────────────────────────
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs,   setSmsNotifs]   = useState(false);
  const [pushNotifs,  setPushNotifs]  = useState(true);

  // ── System ───────────────────────────────────────────────────────────────────
  const [systemHealth,  setSystemHealth]  = useState([]);
  const [featureFlags,  setFeatureFlags]  = useState([]);
  const [flagLoading,   setFlagLoading]   = useState({});  // { flag_key: bool }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, ok = true) => setToast({ msg, ok }), []);

  // PUT /admin/settings/<KEY>  with body { setting_value: "..." }
  const putSetting = useCallback(async (uiKey, value) => {
    const key = SETTING_KEYS[uiKey];
    if (!key) return { ok: false, msg: `Unknown key: ${uiKey}` };
    const res  = await fetch(`${API_BASE}/admin/settings/${key}`, {
      method: "PUT",
      headers: authHdr(),
      body:   JSON.stringify({ setting_value: String(value) }),  // ← FIXED: was `value`
    });
    const data = await res.json();
    return { ok: data.bool, msg: data.response?.message || "" };
  }, []);

  // ── Fetch all settings on mount ──────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setFetchLoading(true);
    try {
      const [settingsRes, healthRes, flagsRes] = await Promise.all([
        fetch(`${API_BASE}/admin/settings`, { headers: authHdr() }),
        fetch(`${API_BASE}/admin/system_health`, { headers: authHdr() }),
        fetch(`${API_BASE}/admin/feature_flags`, { headers: authHdr() }),
      ]);
      const [settingsData, healthData, flagsData] = await Promise.all([
        settingsRes.json(),
        healthRes.json(),
        flagsRes.json(),
      ]);

      // ── Map settings array into { KEY: value } lookup ─────────────────────
      if (settingsData.bool) {
        const rawArr = settingsData.response?.settings || [];
        const map    = {};
        rawArr.forEach((s) => { map[s.setting_key] = s.setting_value; });
        setSettingsMap(map);

        // Hydrate state from exact keys
        if (map["PLATFORM_NAME"])                setPlatformName(map["PLATFORM_NAME"]);
        if (map["PLATFORM_SUPPORT_EMAIL"])        setSupportEmail(map["PLATFORM_SUPPORT_EMAIL"]);
        if (map["PLATFORM_DEFAULT_CURRENCY"])     setDefaultCurrency(map["PLATFORM_DEFAULT_CURRENCY"]);
        if (map["PLATFORM_MAINTENANCE_MODE"])     setMaint(map["PLATFORM_MAINTENANCE_MODE"] === "true");
        if (map["TRADING_ENABLED"])               setTradingEnabled(map["TRADING_ENABLED"] === "true");
        if (map["TRADING_COMMISSION_PERCENT"])    setCommission(map["TRADING_COMMISSION_PERCENT"]);
        if (map["TRADING_WITHDRAWAL_FEE_PERCENT"])setWithdrawalFee(map["TRADING_WITHDRAWAL_FEE_PERCENT"]);
        if (map["TRADING_MAX_SINGLE_DEPOSIT"])    setMaxDeposit(map["TRADING_MAX_SINGLE_DEPOSIT"]);
        if (map["SECURITY_FORCE_2FA_FOR_ADMINS"]) setTwoFA(map["SECURITY_FORCE_2FA_FOR_ADMINS"] === "true");
        if (map["SECURITY_IP_BLOCKLIST"])         setIpBlock(map["SECURITY_IP_BLOCKLIST"] !== "[]" && map["SECURITY_IP_BLOCKLIST"] !== "false");
        if (map["SECURITY_SESSION_TIMEOUT_MINUTES"]) setSessionTimeout(map["SECURITY_SESSION_TIMEOUT_MINUTES"]);
        if (map["SECURITY_MAX_LOGIN_ATTEMPTS"])   setMaxLoginAttempts(map["SECURITY_MAX_LOGIN_ATTEMPTS"]);
        if (map["OTP_EXPIRY_MINUTES"])            setOtpExpiry(map["OTP_EXPIRY_MINUTES"]);
        if (map["KYC_REQUIRED_TO_TRADE"])         setKycToTrade(map["KYC_REQUIRED_TO_TRADE"] === "true");
        if (map["KYC_REQUIRED_TO_WITHDRAW"])      setKycToWithdraw(map["KYC_REQUIRED_TO_WITHDRAW"] === "true");
        if (map["NOTIFICATIONS_EMAIL_ENABLED"])   setEmailNotifs(map["NOTIFICATIONS_EMAIL_ENABLED"] === "true");
        if (map["NOTIFICATIONS_SMS_ENABLED"])     setSmsNotifs(map["NOTIFICATIONS_SMS_ENABLED"] === "true");
        if (map["NOTIFICATIONS_PUSH_ENABLED"])    setPushNotifs(map["NOTIFICATIONS_PUSH_ENABLED"] === "true");
      }

      // ── System health ─────────────────────────────────────────────────────
      if (healthData.bool) {
        const raw = healthData.response?.services || [];
        setSystemHealth(raw);
      }

      // ── Feature flags ─────────────────────────────────────────────────────
      if (flagsData.bool) {
        const raw = flagsData.response?.flags || [];
        setFeatureFlags(raw);
      }
    } catch (err) {
      console.error("[Settings] fetchSettings error:", err);
    } finally {
      setFetchLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ── Save Platform Settings ───────────────────────────────────────────────────
  const savePlatformSettings = async () => {
    setLoading(true);
    setSaveError("");
    try {
      const tasks = [
        putSetting("platform_name",   platformName),
        putSetting("support_email",   supportEmail),
        putSetting("default_currency",defaultCurrency),
        putSetting("maintenance_mode",maintenance),
        putSetting("trading_enabled", tradingEnabled),
        putSetting("commission",      commission),
        putSetting("withdrawal_fee",  withdrawalFee),
        putSetting("max_deposit",     maxDeposit),
      ];
      const results = await Promise.all(tasks);
      const failed  = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setSaveError(`${failed.length} setting(s) failed to save.`);
        return;
      }
      showToast("Platform settings saved.");
    } catch {
      setSaveError("Network error saving settings.");
    } finally {
      setLoading(false);
    }
  };

  // ── Save Security Settings ────────────────────────────────────────────────────
  const saveSecuritySettings = async () => {
    setLoading(true);
    setSaveError("");
    try {
      const results = await Promise.all([
        putSetting("enforce_2fa",       twoFA),
        putSetting("session_timeout",   sessionTimeout),
        putSetting("max_login_attempts",maxLoginAttempts),
        putSetting("otp_expiry",        otpExpiry),
        putSetting("kyc_to_trade",      kycToTrade),
        putSetting("kyc_to_withdraw",   kycToWithdraw),
      ]);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setSaveError(`${failed.length} setting(s) failed to save.`);
        return;
      }
      showToast("Security settings saved.");
    } catch {
      setSaveError("Network error saving security settings.");
    } finally {
      setLoading(false);
    }
  };

  // ── Change Admin Password ──────────────────────────────────────────────────
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setSaveError("");
    if (!oldPw || !newPw || !confPw) {
      setSaveError("All password fields are required.");
      return;
    }
    if (newPw !== confPw) {
      setSaveError("New passwords do not match.");
      return;
    }
    if (newPw.length < 6) {
      setSaveError("New password must be at least 6 characters.");
      return;
    }
    setPwLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/authentication/change_password`, {
        method: "POST",
        headers: authHdr(),
        body:   JSON.stringify({
          old_password: oldPw,    // ← FIXED: was "current_password"
          new_password: newPw,
        }),
      });
      const data = await res.json();
      if (data.bool) {
        showToast("Password changed successfully.");
        setOldPw(""); setNewPw(""); setConfPw("");
      } else {
        setSaveError(data.response?.message || "Failed to change password.");
      }
    } catch {
      setSaveError("Network error changing password.");
    } finally {
      setPwLoading(false);
    }
  };

  // ── Save Notification Settings ────────────────────────────────────────────
  const saveNotifSettings = async () => {
    setLoading(true);
    setSaveError("");
    try {
      const results = await Promise.all([
        putSetting("email_notifs", emailNotifs),
        putSetting("sms_notifs",   smsNotifs),
        putSetting("push_notifs",  pushNotifs),
      ]);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setSaveError(`${failed.length} notification setting(s) failed.`);
        return;
      }
      showToast("Notification settings saved.");
    } catch {
      setSaveError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  // ── Toggle Feature Flag ────────────────────────────────────────────────────
  //    API: PUT /admin/feature_flags/<flag_key>  { is_enabled: bool }  ← FIXED
  const toggleFlag = async (flag, idx) => {
    const key     = flag.flag_key;
    const newVal  = !flag.is_enabled;
    setFlagLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res  = await fetch(`${API_BASE}/admin/feature_flags/${key}`, {
        method: "PUT",
        headers: authHdr(),
        body:   JSON.stringify({ is_enabled: newVal }),  // ← FIXED: was "enabled"
      });
      const data = await res.json();
      if (data.bool) {
        setFeatureFlags((prev) =>
          prev.map((f, i) => i === idx ? { ...f, is_enabled: newVal } : f)
        );
        showToast(`${flag.flag_name || key}: ${newVal ? "enabled" : "disabled"}`);
      } else {
        showToast(data.response?.message || "Failed to update flag.", false);
      }
    } catch {
      showToast("Network error updating flag.", false);
    } finally {
      setFlagLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // ── System action ──────────────────────────────────────────────────────────
  const handleSystemAction = async (action) => {
    try {
      await fetch(`${API_BASE}/admin/system_health`, {
        method:  "POST",
        headers: authHdr(),
        body:    JSON.stringify({
          service_name: "Admin Console",
          service_type: "API_SERVER",
          status:       "HEALTHY",
          status_message: `Admin action: ${action}`,
        }),
      });
      showToast(`Action "${action}" triggered.`);
    } catch {
      showToast("Action failed.", false);
    }
  };

  // ── Save dispatcher ────────────────────────────────────────────────────────
  const save = () => {
    setSaveError("");
    if (active === "platform") savePlatformSettings();
    else if (active === "security") saveSecuritySettings();
    else if (active === "notifs")   saveNotifSettings();
  };

  // ── Status color helper ────────────────────────────────────────────────────
  const statusColor = (s) => {
    const v = (s || "").toUpperCase();
    if (v === "HEALTHY")  return "text-emerald-400";
    if (v === "DEGRADED") return "text-amber-400";
    return "text-red-400";
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Admin Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure platform-wide options</p>
        </div>
        <button
          onClick={fetchSettings}
          disabled={fetchLoading}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${fetchLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Sidebar ── */}
        <div className="lg:w-48 flex-shrink-0">
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => { setActive(t.id); setSaveError(""); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm
                  border-b border-white/5 last:border-0 transition-all
                  ${active === t.id
                    ? "bg-violet-500/10 text-violet-300"
                    : "text-gray-500 hover:text-white hover:bg-white/5"}`}
              >
                <t.icon className={`w-4 h-4 ${active === t.id ? "text-violet-400" : "text-gray-600"}`} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 space-y-4 min-w-0">

          {/* Error banner */}
          {saveError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {saveError}
              <button onClick={() => setSaveError("")} className="ml-auto">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ── PLATFORM TAB ── */}
          {active === "platform" && (
            <motion.div key="plat" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">

              {/* Platform config */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-4">Platform Configuration</div>
                <div className="space-y-4">
                  {[
                    { label: "Platform Name",      val: platformName,    setter: setPlatformName,    type: "text",   placeholder: "TradeFlow" },
                    { label: "Support Email",       val: supportEmail,    setter: setSupportEmail,    type: "email",  placeholder: "support@tradeflow.io" },
                    { label: "Default Currency",    val: defaultCurrency, setter: setDefaultCurrency, type: "text",   placeholder: "INR" },
                  ].map((f, i) => (
                    <div key={i}>
                      <label className="text-xs text-gray-500 mb-1.5 block">{f.label}</label>
                      <input
                        type={f.type}
                        value={f.val}
                        onChange={(e) => f.setter(e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/30 transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Trading config */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-4">Trading Configuration</div>
                <div className="space-y-4">
                  {[
                    { label: "Commission % (e.g. 0.1)",    val: commission,    setter: setCommission,    placeholder: "0.1" },
                    { label: "Withdrawal Fee % (e.g. 0.1)",val: withdrawalFee, setter: setWithdrawalFee, placeholder: "0.1" },
                    { label: "Max Single Deposit (₹)",     val: maxDeposit,    setter: setMaxDeposit,    placeholder: "100000" },
                  ].map((f, i) => (
                    <div key={i}>
                      <label className="text-xs text-gray-500 mb-1.5 block">{f.label}</label>
                      <input
                        type="text"
                        value={f.val}
                        onChange={(e) => f.setter(e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/30 transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Platform toggles */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-4">Platform Toggles</div>
                <div className="space-y-1">
                  {[
                    { label: "Maintenance Mode",   desc: "Show maintenance page to all users",   v: maintenance,    set: setMaint },
                    { label: "Trading Enabled",    desc: "Master switch for all trades",          v: tradingEnabled, set: setTradingEnabled },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                      <div>
                        <div className="text-sm text-white">{s.label}</div>
                        <div className="text-xs text-gray-600">{s.desc}</div>
                      </div>
                      <Toggle v={s.v} onToggle={() => s.set(!s.v)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Feature Flags */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-4">
                  Feature Flags
                  <span className="ml-2 text-xs text-gray-600">({featureFlags.length} flags)</span>
                </div>
                {fetchLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading flags…
                  </div>
                ) : featureFlags.length === 0 ? (
                  <div className="text-xs text-gray-600 py-4">No feature flags found.</div>
                ) : (
                  <div className="space-y-1">
                    {featureFlags.map((flag, i) => {
                      const key         = flag.flag_key;
                      const isLoading   = flagLoading[key];
                      return (
                        <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="text-sm text-white">{flag.flag_name || key.replace(/_/g, " ")}</div>
                            <div className="text-xs text-gray-600 truncate">
                              {flag.description || key}
                              {flag.rollout_type && flag.rollout_type !== "ALL_USERS" && (
                                <span className="ml-2 text-violet-400">[{flag.rollout_type}]</span>
                              )}
                            </div>
                          </div>
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-violet-400 flex-shrink-0" />
                          ) : (
                            <Toggle
                              v={flag.is_enabled}
                              onToggle={() => toggleFlag(flag, i)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── SECURITY TAB ── */}
          {active === "security" && (
            <motion.div key="sec" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">

              {/* Security toggles */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-4">Security Controls</div>
                <div className="space-y-1">
                  {[
                    { label: "Force 2FA for all admins", desc: "Admin accounts must have 2FA enabled", v: twoFA,       set: setTwoFA },
                    { label: "Enable IP blocklist",      desc: "Block requests from blocked IPs",       v: ipBlock,     set: setIpBlock },
                    { label: "KYC required to trade",    desc: "Users must complete KYC before trading",v: kycToTrade,  set: setKycToTrade },
                    { label: "KYC required to withdraw", desc: "Users must complete KYC to withdraw",   v: kycToWithdraw,set: setKycToWithdraw },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                      <div>
                        <div className="text-sm text-white">{s.label}</div>
                        <div className="text-xs text-gray-600">{s.desc}</div>
                      </div>
                      <Toggle v={s.v} onToggle={() => s.set(!s.v)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Numeric security settings */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-4">Session & Auth Limits</div>
                <div className="space-y-4">
                  {[
                    { label: "Session Timeout (minutes)", val: sessionTimeout,   setter: setSessionTimeout },
                    { label: "Max Login Attempts",        val: maxLoginAttempts, setter: setMaxLoginAttempts },
                    { label: "OTP Expiry (minutes)",      val: otpExpiry,        setter: setOtpExpiry },
                  ].map((f, i) => (
                    <div key={i}>
                      <label className="text-xs text-gray-500 mb-1.5 block">{f.label}</label>
                      <input
                        type="number" min="1"
                        value={f.val}
                        onChange={(e) => f.setter(e.target.value)}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/30 transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Change password — separate form */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-4">Change Admin Password</div>
                <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
                  {[
                    { label: "Current Password",  val: oldPw,  setter: setOldPw },
                    { label: "New Password",      val: newPw,  setter: setNewPw },
                    { label: "Confirm Password",  val: confPw, setter: setConfPw },
                  ].map((f, i) => (
                    <div key={i}>
                      <label className="text-xs text-gray-500 mb-1.5 block">{f.label}</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                        <input
                          type={showPw ? "text" : "password"}
                          value={f.val}
                          onChange={(e) => f.setter(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-11 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/30 transition-colors"
                        />
                        {i === 2 && (
                          <button type="button" onClick={() => setShowPw(!showPw)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    type="submit"
                    disabled={pwLoading}
                    className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-sm text-cyan-300 hover:bg-cyan-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {pwLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Update Password
                  </button>
                </form>
              </div>

              {/* Danger zone */}
              <div className="bg-[#0C1220] border border-red-500/15 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <div className="text-sm font-medium text-red-400">Danger Zone</div>
                </div>
                <div className="flex gap-3">
                  <button className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 hover:bg-red-500/20 transition-all">
                    Reset Platform Data
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ALERTS TAB ── */}
          {active === "notifs" && (
            <motion.div key="notif" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">

              {/* Master notification toggles from admin_settings */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">
                  Notification Channels
                </div>
                {[
                  { label: "Email Notifications", desc: "Master switch for all outbound emails",        v: emailNotifs, set: setEmailNotifs },
                  { label: "SMS Notifications",   desc: "Master switch for all outbound SMS messages",  v: smsNotifs,   set: setSmsNotifs },
                  { label: "Push Notifications",  desc: "Browser and mobile push notifications",        v: pushNotifs,  set: setPushNotifs },
                ].map((n, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
                    <div>
                      <div className="text-sm text-white">{n.label}</div>
                      <div className="text-xs text-gray-600">{n.desc}</div>
                    </div>
                    <Toggle v={n.v} onToggle={() => n.set(!n.v)} />
                  </div>
                ))}
              </div>

              {/* Admin alert preferences — stored as feature flags */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">
                  Admin Alert Types
                </div>
                {[
                  { key: "new_signups",       label: "New user registrations", desc: "Alert on every new signup" },
                  { key: "suspicious_logins", label: "Suspicious login attempts", desc: "Multiple failed login alerts" },
                  { key: "large_trades",      label: "Large trades (>₹1,00,000)", desc: "Monitor whale activity" },
                  { key: "system_errors",     label: "System errors", desc: "Critical platform error notifications" },
                  { key: "daily_revenue",     label: "Daily revenue summary", desc: "End-of-day revenue report" },
                  { key: "weekly_analytics",  label: "Weekly analytics digest", desc: "Weekly KPI summary email" },
                ].map((n, i) => {
                  const flag = featureFlags.find((f) =>
                    (f.flag_key || "").toLowerCase().includes(n.key.toLowerCase())
                  );
                  const flagIdx = featureFlags.findIndex((f) =>
                    (f.flag_key || "").toLowerCase().includes(n.key.toLowerCase())
                  );
                  return (
                    <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
                      <div>
                        <div className="text-sm text-white">{n.label}</div>
                        <div className="text-xs text-gray-600">{n.desc}</div>
                      </div>
                      {flag ? (
                        <Toggle
                          v={flag.is_enabled}
                          onToggle={() => toggleFlag(flag, flagIdx)}
                          disabled={!!flagLoading[flag.flag_key]}
                        />
                      ) : (
                        <Toggle v={false} disabled />
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── SYSTEM TAB ── */}
          {active === "system" && (
            <motion.div key="sys" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">

              {/* Overall health badge */}
              <div className="flex items-center gap-3 px-5 py-3 bg-[#0C1220] border border-white/5 rounded-2xl">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  systemHealth.length === 0 ? "bg-gray-500"
                  : systemHealth.every((s) => s.status === "HEALTHY") ? "bg-emerald-400 animate-pulse"
                  : systemHealth.some((s) => s.status === "DOWN") ? "bg-red-400"
                  : "bg-amber-400"
                }`} />
                <span className="text-sm text-white font-medium">
                  {systemHealth.length === 0
                    ? "No health data recorded yet"
                    : systemHealth.every((s) => s.status === "HEALTHY")
                    ? "All systems operational"
                    : systemHealth.some((s) => s.status === "DOWN")
                    ? "One or more services are down"
                    : "Some services degraded"}
                </span>
                <span className="text-xs text-gray-500 ml-auto">{systemHealth.length} services</span>
              </div>

              {/* Service cards */}
              {systemHealth.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {systemHealth.map((s, i) => (
                    <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-500">{s.service_type || s.service_name}</div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          s.status === "HEALTHY"  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : s.status === "DEGRADED" ? "bg-amber-500/10  text-amber-400  border-amber-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}>{s.status}</span>
                      </div>
                      <div className="text-sm font-medium text-white mb-1">{s.service_name}</div>
                      {s.version && <div className="text-xs text-gray-600">v{s.version}</div>}
                      {s.response_time_ms != null && (
                        <div className="text-xs text-gray-500 mt-1">{s.response_time_ms}ms response</div>
                      )}
                      {s.cpu_usage_percent != null && (
                        <div className="text-xs text-gray-500">CPU: {s.cpu_usage_percent}%</div>
                      )}
                      {s.memory_usage_percent != null && (
                        <div className="text-xs text-gray-500">MEM: {s.memory_usage_percent}%</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { name: "Database",  type: "PostgreSQL", status: "UNKNOWN" },
                    { name: "Cache",     type: "Redis",      status: "UNKNOWN" },
                    { name: "Queue",     type: "RabbitMQ",   status: "UNKNOWN" },
                    { name: "CDN",       type: "Cloudflare", status: "UNKNOWN" },
                  ].map((s, i) => (
                    <div key={i} className="bg-[#0C1220] border border-white/5 rounded-2xl p-4">
                      <div className="text-xs text-gray-500 mb-1">{s.type}</div>
                      <div className="text-sm text-white mb-1">{s.name}</div>
                      <div className="text-xs text-gray-600">● No data yet</div>
                    </div>
                  ))}
                </div>
              )}

              {/* System actions */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-3">System Actions</div>
                <div className="flex gap-3 flex-wrap">
                  {[
                    { label: "Clear Cache",       action: "clear_cache" },
                    { label: "Export Logs",        action: "export_logs" },
                    { label: "Backup Database",    action: "backup_database" },
                    { label: "Restart Queue",      action: "restart_queue" },
                    { label: "Trigger Snapshot",   action: "trigger_snapshot" },
                  ].map((a) => (
                    <button
                      key={a.action}
                      onClick={a.action === "trigger_snapshot"
                        ? async () => {
                            try {
                              const res  = await fetch(`${API_BASE}/admin/platform_stats/snapshot`, {
                                method: "POST", headers: authHdr()
                              });
                              const data = await res.json();
                              showToast(data.bool ? "Snapshot triggered." : (data.response?.message || "Failed."), data.bool);
                            } catch { showToast("Network error.", false); }
                          }
                        : () => handleSystemAction(a.action)
                      }
                      className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Platform stats summary */}
              <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                <div className="text-sm font-medium text-white mb-3">Settings Summary</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {Object.entries(settingsMap)
                    .filter(([k]) => !["SECURITY_IP_BLOCKLIST"].includes(k))
                    .slice(0, 16)
                    .map(([key, val], i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-white/5 text-xs">
                      <span className="text-gray-600 truncate pr-2">{key.replace(/_/g, " ")}</span>
                      <span className={`font-medium flex-shrink-0 ${
                        val === "true"  ? "text-emerald-400"
                        : val === "false" ? "text-red-400"
                        : "text-gray-300"
                      }`}>
                        {val === "true" ? "ON" : val === "false" ? "OFF" : val || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Save button — not shown on system tab */}
          {active !== "system" && (
            <button
              onClick={save}
              disabled={loading}
              className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}





















