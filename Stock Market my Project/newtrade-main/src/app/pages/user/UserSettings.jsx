import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  User, Bell, Shield, Check, Camera, ChevronRight,
  Lock, Eye, EyeOff, AlertTriangle, LogOut, Upload, Globe, Trash2,
  Key, Wallet, Building, Smartphone, Plus, ArrowUpRight, ArrowDownLeft,
  PlusCircle, AlertCircle, CheckCircle, X, Loader2,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { DocUpload, SelfieCapture } from "../../components/KycUpload";

const API_BASE       = "http://127.0.0.1:5050/v1";
const RAZORPAY_KEY   = "rzp_test_SzxHpcvfJEeIhH"; // from .env

const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });
const jsonHdr  = () => ({ ...authHdr(), "Content-Type": "application/json" });

/* ── Document type options ──────────────────────────────────────────────────── */
const DOC_TYPES = [
  { value: "PASSPORT",        label: "Passport" },
  { value: "NATIONAL_ID",     label: "National ID Card" },
  { value: "DRIVERS_LICENSE", label: "Driver's License" },
];

/* ── Why Add Money is blocked, per KYC status ───────────────────────────────── */
const KYC_DEPOSIT_MESSAGE = {
  NOT_STARTED:  "Complete your KYC verification before adding money to your wallet.",
  PENDING:      "Your KYC is pending admin approval. You can add money once it's approved.",
  UNDER_REVIEW: "Your KYC is under review. You can add money once it's approved.",
  REJECTED:     "Your KYC was rejected. Please re-submit your documents to add money.",
  EXPIRED:      "Your KYC has expired. Please re-verify to add money.",
};

/* ── Notification preferences ───────────────────────────────────────────────────
   Only real, user-facing switches are listed. The API also returns `pref_id`,
   `updated_on`, `quiet_hours_start/end` and `email_news_digest_frequency` — those
   are ids, timestamps, times and a string, NOT booleans. The page used to render
   every key blindly as a toggle, which produced nonsense rows ("Pref Id",
   "Updated On") and would POST garbage like `pref_id: false`. Each entry below maps
   to a notification the platform actually sends.                                */
const NOTIF_GROUPS = [
  {
    title: "Trading",
    blurb: "Order fills and price alerts",
    items: [
      { key: "push_order_updates",  label: "Order updates",     hint: "In-app alert when an order fills" },
      { key: "email_order_updates", label: "Order updates",     hint: "Email when an order fills" },
      { key: "push_price_alerts",   label: "Price alerts",      hint: "In-app alert when a price target is hit" },
      { key: "email_price_alerts",  label: "Price alerts",      hint: "Email when a price target is hit" },
    ],
  },
  {
    title: "Account & KYC",
    blurb: "Verification results and account status",
    items: [
      { key: "push_account",  label: "Account & KYC updates", hint: "In-app alert for KYC and account changes" },
      { key: "email_account", label: "Account & KYC updates", hint: "Email for KYC and account changes" },
    ],
  },
  {
    title: "News",
    blurb: "Market news and new listings",
    items: [
      { key: "push_news_alerts",  label: "News alerts",   hint: "In-app alert for market news and new listings" },
      { key: "email_news_digest", label: "News digest",   hint: "Periodic email summary of market news" },
    ],
  },
  {
    title: "Channels",
    blurb: "Master switches — turning one off silences that channel",
    items: [
      { key: "push_enabled",  label: "In-app notifications", hint: "The notification bell" },
      { key: "email_enabled", label: "Email notifications",  hint: "All emails except security" },
    ],
  },
];

/* Security alerts are intentionally not listed: password changes and account
   security events must always reach the user and cannot be switched off. */

/* ── Payout method options ──────────────────────────────────────────────────── */
const PAYOUT_TYPES = [
  { value: "UPI",          label: "UPI App",      icon: Smartphone, note: "Instant • No charges" },
  { value: "BANK_ACCOUNT", label: "Bank Account", icon: Building,   note: "1–2 working days" },
  { value: "NET_BANKING",  label: "Net Banking",  icon: Globe,      note: "Net banking charges may apply" },
];

const BLANK_PAYOUT_FORM = {
  method_type: "UPI", label: "", upi_id: "",
  account_holder: "", bank_name: "", account_number: "", ifsc: "",
};

const tabs = [
  { id: "profile",  label: "Profile",          icon: User },
  { id: "notifs",   label: "Notifications",    icon: Bell },
  { id: "security", label: "Security",         icon: Shield },
  { id: "wallet",   label: "Wallet",           icon: Wallet },
  { id: "kyc",      label: "KYC Verification", icon: Shield },
];

/* ── Small toast ───────────────────────────────────────────────────────────── */
function Toast({ msg, ok, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className={`fixed top-24 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium ${
        ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
           : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
      {ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
    </motion.div>
  );
}

/* ── KYC text field (module scope so it keeps a stable identity across renders —
   defining it inside UserSettings() would recreate the component every keystroke
   and remount the <input>, losing focus/cursor position) ─────────────────────── */
function KycField({ label, field, type = "text", placeholder = "", value, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 transition-colors"
      />
    </div>
  );
}

/* ── Load Razorpay script dynamically ──────────────────────────────────────── */
function loadRazorpay() {
  return new Promise((resolve) => {
    // Already loaded
    if (window.Razorpay) { resolve(true); return; }
    // Script tag already injected but not yet loaded — wait for it
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener("load",  () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    // Inject fresh script tag
    const s   = document.createElement("script");
    s.src     = "https://checkout.razorpay.com/v1/checkout.js";
    s.async   = true;
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function UserSettings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [active,  setActive]  = useState("profile");
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState(null); // { msg, ok }
  const [showPw,  setShowPw]  = useState(false);

  const showToast = (msg, ok = true) => setToast({ msg, ok });

  /* ── Profile ─────────────────────────────────────────────────────────────── */
  const [profile, setProfile] = useState({
    first_name: "", last_name: "", email: "",
    phone: "", bio: "", location: "",
  });

  /* ── Notifications ───────────────────────────────────────────────────────── */
  const [notifPrefs, setNotifPrefs] = useState({
    price_alerts: true, portfolio_updates: true, news_digest: false,
    trade_confirmations: true, weekly_report: true, market_open: true,
  });

  /* ── Security ────────────────────────────────────────────────────────────── */
  const [securityProfile, setSecurityProfile] = useState(null);
  const [sessions,        setSessions]        = useState([]);
  const [whitelistIp,     setWhitelistIp]     = useState("");
  const [twoFAEnabled,    setTwoFAEnabled]    = useState(false);
  const [setupTotp,       setSetupTotp]       = useState(null);
  const [totpCode,        setTotpCode]        = useState("");
  const [showTotpModal,   setShowTotpModal]   = useState(false);
  const [sessionTimeout,  setSessionTimeout]  = useState(3600);
  const [passwordForm,    setPasswordForm]    = useState({
    current_password: "", new_password: "", confirm_password: "",
  });

  /* ── KYC ─────────────────────────────────────────────────────────────────── */
  const [kycData,       setKycData]       = useState(null);
  const [kycStatus,     setKycStatus]     = useState("NOT_STARTED");
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [kycError,      setKycError]      = useState("");
  const [kycForm, setKycForm] = useState({
    legal_first_name: "", legal_last_name: "", date_of_birth: "",
    nationality: "", country_of_residence: "", tax_id: "",
    id_document_type: "PASSPORT", id_document_number: "",
    id_document_expiry: "", id_document_front_url: "",
    id_document_back_url: "", selfie_url: "",
    address_document_type: "UTILITY_BILL", address_document_url: "",
  });
  const handleKycFieldChange = useCallback((field, value) => {
    setKycForm(p => ({ ...p, [field]: value }));
  }, []);

  /* Profile picture */
  const [avatarSaving,       setAvatarSaving]       = useState(false);

  /* ── Wallet ──────────────────────────────────────────────────────────────── */
  const [wallet,             setWallet]             = useState(null);
  const [walletTransactions, setWalletTransactions] = useState([]);

  /* Add Money modal — now uses Razorpay */
  const [showAddMoneyModal,  setShowAddMoneyModal]  = useState(false);
  const [addAmount,          setAddAmount]          = useState("");
  const [addLoading,         setAddLoading]         = useState(false);
  const [addStep,            setAddStep]            = useState("form"); // form | processing | success

  /* Withdraw modal */
  const [showWithdrawModal,  setShowWithdrawModal]  = useState(false);
  const [withdrawAmount,     setWithdrawAmount]     = useState("");
  const [withdrawLoading,    setWithdrawLoading]    = useState(false);
  const [withdrawMethodId,   setWithdrawMethodId]   = useState("");

  /* Transfer to Bank modal */
  const [showTransferModal,  setShowTransferModal]  = useState(false);
  const [transferAmount,     setTransferAmount]     = useState("");
  const [transferLoading,    setTransferLoading]    = useState(false);
  const [transferMethodId,   setTransferMethodId]   = useState("");

  /* Payout methods — user-managed withdrawal destinations */
  const [payoutMethods,      setPayoutMethods]      = useState([]);
  const [showAddPayoutModal, setShowAddPayoutModal] = useState(false);
  const [payoutSaving,       setPayoutSaving]       = useState(false);
  const [payoutForm,         setPayoutForm]         = useState(BLANK_PAYOUT_FORM);

  const bankMethods = payoutMethods.filter(
    (m) => m.method_type === "BANK_ACCOUNT" || m.method_type === "NET_BANKING"
  );

  /* ═══════════════════════════════════════════════════════════
     DATA LOADERS
  ═══════════════════════════════════════════════════════════ */

  /**
   * FIX: Profile fields were empty because:
   *   1. UserProfiles model has NO `email` column — email is on the Users table.
   *      fetchProfile was reading `r.email` which was always undefined.
   *      Solution: call `/authentication/me` in parallel to get email from Users.
   *   2. `phone` in state mapped to `r.phone` but the API returns `phone_number`.
   *      Solution: read `r.phone_number`.
   *   3. `location` mapped to `r.location` but UserProfiles has `country`, not `location`.
   *      Solution: read `r.country`.
   */
  const fetchProfile = useCallback(async () => {
    try {
      const [profileRes, meRes] = await Promise.all([
        fetch(`${API_BASE}/user_profiles/me`, { headers: authHdr() }),
        fetch(`${API_BASE}/authentication/me`, { headers: authHdr() }),
      ]);
      const [profileData, meData] = await Promise.all([
        profileRes.json(),
        meRes.json(),
      ]);

      // Start with defaults
      let merged = {
        first_name: "", last_name: "", email: "",
        phone: "", bio: "", location: "", avatar_url: "",
      };

      // Get email from Users table (/authentication/me)
      if (meData.bool && meData.response) {
        merged.email = meData.response.email || "";
      }

      // Get profile fields from UserProfiles (/user_profiles/me)
      if (profileData.bool && profileData.response) {
        const r = profileData.response;
        merged.first_name = r.first_name || "";
        merged.last_name  = r.last_name  || "";
        // phone_number is the actual column name in UserProfiles
        merged.phone      = r.phone_number || r.phone || "";
        merged.bio        = r.bio || "";
        // country is the actual column name in UserProfiles (no 'location' column)
        merged.location   = r.country || r.city || "";
        merged.avatar_url = r.avatar_url || "";
      }

      setProfile(merged);
    } catch (err) {
      console.error("fetchProfile error:", err);
    }
  }, []);

  const fetchPreferences = useCallback(async () => {
    const res  = await fetch(`${API_BASE}/notifications/preferences`, { headers: authHdr() });
    const data = await res.json();
    if (data.bool && data.response) setNotifPrefs(data.response);
  }, []);

  const fetchSecurityInfo = useCallback(async () => {
    const res  = await fetch(`${API_BASE}/user_security/me`, { headers: authHdr() });
    const data = await res.json();
    if (data.bool && data.response) {
      setSecurityProfile(data.response);
      setTwoFAEnabled(data.response.is_2fa_enabled || data.response.two_factor_enabled || false);
      setSessionTimeout(data.response.session_timeout || data.response.session_timeout_seconds || 3600);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    const res  = await fetch(`${API_BASE}/user_security/sessions`, { headers: authHdr() });
    const data = await res.json();
    if (data.bool) setSessions(data.response?.sessions || (Array.isArray(data.response) ? data.response : []));
  }, []);

  const fetchKycStatus = useCallback(async () => {
    const res  = await fetch(`${API_BASE}/kyc/status`, { headers: authHdr() });
    const data = await res.json();
    if (data.bool && data.response) {
      const r = data.response;
      setKycData(r);
      setKycStatus(r.kyc_status || r.status || "NOT_STARTED");

      /* Seed the form so the user doesn't retype what they gave us at signup.
         Precedence, highest first:
           1. anything they've already typed into the form this session
           2. their own previous submission (matters on a REJECTED re-submit —
              reverting those to registration data would silently discard the
              corrections they came here to make)
           3. registration details from the backend `prefill` block
         Fields KYC asks for but registration never collected (document number,
         tax ID) stay empty by design. */
      const pre = r.prefill || {};
      setKycForm((p) => {
        const seed = (field) => p[field] || r[field] || pre[field] || "";
        return {
          ...p,
          legal_first_name:     seed("legal_first_name"),
          legal_last_name:      seed("legal_last_name"),
          date_of_birth:        seed("date_of_birth"),
          country_of_residence: seed("country_of_residence"),
          nationality:          seed("nationality"),
        };
      });
    }
  }, []);

  const fetchWallet = useCallback(async () => {
    const res  = await fetch(`${API_BASE}/wallets/me`, { headers: authHdr() });
    const data = await res.json();
    if (data.bool && data.response) setWallet(data.response);
  }, []);

  const fetchWalletTransactions = useCallback(async () => {
    const res  = await fetch(`${API_BASE}/wallets/transactions`, { headers: authHdr() });
    const data = await res.json();
    if (data.bool) setWalletTransactions(data.response?.transactions || (Array.isArray(data.response) ? data.response : []));
  }, []);

  const fetchPayoutMethods = useCallback(async () => {
    const res  = await fetch(`${API_BASE}/wallets/payout_methods`, { headers: authHdr() });
    const data = await res.json();
    if (data.bool) setPayoutMethods(data.response?.payout_methods || []);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (active === "profile")  await fetchProfile();
        if (active === "notifs")   await fetchPreferences();
        if (active === "security") { await fetchSecurityInfo(); await fetchSessions(); }
        if (active === "kyc")      await fetchKycStatus();
        if (active === "wallet")   { await fetchWallet(); await fetchWalletTransactions(); await fetchPayoutMethods(); }
      } catch (err) { console.error("Settings load error:", err); }
      finally { setLoading(false); }
    };
    load();
  }, [active]);

  /* ═══════════════════════════════════════════════════════════
     SAVE HANDLERS
  ═══════════════════════════════════════════════════════════ */
  const handleProfileSave = async () => {
    try {
      const res = await fetch(`${API_BASE}/user_profiles/me`, {
        method: "PUT", headers: jsonHdr(),
        body: JSON.stringify({
          first_name:   profile.first_name,
          last_name:    profile.last_name,
          phone_number: profile.phone,    // FIX: was 'phone', correct field is phone_number
          bio:          profile.bio,
          country:      profile.location, // FIX: was 'location', correct field is country
        }),
      });
      const data = await res.json();
      if (data.bool) {
        // Name changes feed the sidebar/header too.
        window.dispatchEvent(new CustomEvent("profile-updated"));
        showToast("Profile saved successfully.");
      } else showToast(data.response?.message || "Failed to save.", false);
    } catch { showToast("Network error.", false); }
  };

  /* ── Profile picture ───────────────────────────────────────────────────────
     `avatar_url` is a TEXT column, so the image is stored as a base64 data URI —
     no upload endpoint or object storage is involved. Downscaled to 256px JPEG
     because this value travels in every profile response.                      */
  const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
  const AVATAR_MAX_DIM   = 256;

  const resizeToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a valid image."));
      img.onload = () => {
        // Square, centre-cropped — the avatar always renders in a square.
        const side = Math.min(img.width, img.height);
        const sx   = (img.width  - side) / 2;
        const sy   = (img.height - side) / 2;
        const canvas  = document.createElement("canvas");
        canvas.width  = AVATAR_MAX_DIM;
        canvas.height = AVATAR_MAX_DIM;
        canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, AVATAR_MAX_DIM, AVATAR_MAX_DIM);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const saveAvatar = async (dataUrl, successMsg) => {
    setAvatarSaving(true);
    try {
      const res  = await fetch(`${API_BASE}/user_profiles/me`, {
        method: "PUT", headers: jsonHdr(), body: JSON.stringify({ avatar_url: dataUrl }),
      });
      const data = await res.json();
      if (data.bool) {
        setProfile((p) => ({ ...p, avatar_url: dataUrl }));
        // Tell UserLayout to re-read the profile so the sidebar + header
        // avatars update immediately instead of on the next full page load.
        window.dispatchEvent(new CustomEvent("profile-updated"));
        showToast(successMsg);
      } else showToast(data.response?.message || "Failed to save picture.", false);
    } catch { showToast("Network error.", false); }
    finally { setAvatarSaving(false); }
  };

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";                     // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Please choose an image file (PNG, JPG, WebP).", false); return; }
    if (file.size > AVATAR_MAX_BYTES)    { showToast("Image must be under 5 MB.", false); return; }
    try {
      const dataUrl = await resizeToDataUrl(file);
      await saveAvatar(dataUrl, "Profile picture updated.");
    } catch (err) {
      showToast(err.message || "Could not process that image.", false);
    }
  };

  const handlePreferencesSave = async () => {
    try {
      // Send only the switches this page owns — never echo back `pref_id`,
      // `updated_on` or the time/string fields the UI doesn't manage.
      const payload = {};
      NOTIF_GROUPS.forEach((g) => g.items.forEach(({ key }) => {
        payload[key] = !!notifPrefs[key];
      }));
      const res  = await fetch(`${API_BASE}/notifications/preferences`, {
        method: "PUT", headers: jsonHdr(), body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.bool) showToast("Notification preferences saved.");
      else showToast(data.response?.message || "Failed.", false);
    } catch { showToast("Network error.", false); }
  };

  const handlePasswordChange = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showToast("New passwords do not match.", false); return;
    }
    try {
      const res  = await fetch(`${API_BASE}/authentication/change_password`, {
        method: "POST", headers: jsonHdr(),
        body: JSON.stringify({
          old_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        }),
      });
      const data = await res.json();
      if (data.bool) {
        showToast("Password changed successfully.");
        setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      } else showToast(data.response?.message || "Failed.", false);
    } catch { showToast("Network error.", false); }
  };

  const handleTimeoutChange = async (e) => {
    const val = parseInt(e.target.value);
    setSessionTimeout(val);
    await fetch(`${API_BASE}/user_security/session_timeout`, {
      method: "PUT", headers: jsonHdr(),
      body: JSON.stringify({ session_timeout_seconds: val }),
    });
  };

  const handleAddIp = async () => {
    if (!whitelistIp) return;
    await fetch(`${API_BASE}/user_security/ip_whitelist/add`, {
      method: "POST", headers: jsonHdr(),
      body: JSON.stringify({ ip_address: whitelistIp }),
    });
    setSecurityProfile(prev => ({ ...prev, ip_whitelist: [...(prev?.ip_whitelist || []), whitelistIp] }));
    setWhitelistIp("");
  };

  const handleRemoveIp = async (ip) => {
    await fetch(`${API_BASE}/user_security/ip_whitelist/remove`, {
      method: "POST", headers: jsonHdr(), body: JSON.stringify({ ip_address: ip }),
    });
    setSecurityProfile(prev => ({ ...prev, ip_whitelist: (prev?.ip_whitelist || []).filter(i => i !== ip) }));
  };

  const handleRevokeSession = async (sessionId) => {
    await fetch(`${API_BASE}/user_security/sessions/${sessionId}/revoke`, { method: "POST", headers: authHdr() });
    setSessions(prev => prev.filter(s => (s.session_id || s.id) !== sessionId));
  };

  const handle2faToggle = async () => {
    if (twoFAEnabled) {
      const code = prompt("Enter 6-digit TOTP code to disable 2FA:");
      if (!code) return;
      await fetch(`${API_BASE}/user_security/2fa/disable`, {
        method: "POST", headers: jsonHdr(), body: JSON.stringify({ totp_code: code }),
      });
      setTwoFAEnabled(false);
    } else {
      const res  = await fetch(`${API_BASE}/user_security/2fa/setup_totp`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool && data.response) { setSetupTotp(data.response); setShowTotpModal(true); }
    }
  };

  const handleVerify2fa = async () => {
    if (!totpCode) return;
    await fetch(`${API_BASE}/user_security/2fa/enable`, {
      method: "POST", headers: jsonHdr(), body: JSON.stringify({ totp_code: totpCode }),
    });
    setTwoFAEnabled(true); setShowTotpModal(false); setSetupTotp(null); setTotpCode("");
  };

  /* ── KYC submit ────────────────────────────────────────────────────────── */
  const handleKycSubmit = async (e) => {
    e.preventDefault();
    setKycError("");
    const required = ["legal_first_name","legal_last_name","date_of_birth",
                      "id_document_type","id_document_number","id_document_front_url"];
    for (const f of required) {
      if (!kycForm[f]?.trim()) {
        setKycError(
          f === "id_document_front_url"
            ? "Please upload a photo of the front of your ID."
            : `Please fill in: ${f.replace(/_/g, " ")}`
        );
        return;
      }
    }
    setSubmittingKyc(true);
    try {
      const payload = {
        legal_first_name: kycForm.legal_first_name.trim(),
        legal_last_name: kycForm.legal_last_name.trim(),
        date_of_birth: kycForm.date_of_birth,
        id_document_type: kycForm.id_document_type,
        id_document_number: kycForm.id_document_number.trim(),
        id_document_front_url: kycForm.id_document_front_url.trim(),
      };
      if (kycForm.nationality.trim())           payload.nationality           = kycForm.nationality.trim();
      if (kycForm.country_of_residence.trim())  payload.country_of_residence  = kycForm.country_of_residence.trim();
      if (kycForm.tax_id.trim())                payload.tax_id                = kycForm.tax_id.trim();
      if (kycForm.id_document_expiry)           payload.id_document_expiry    = kycForm.id_document_expiry;
      if (kycForm.id_document_back_url.trim())  payload.id_document_back_url  = kycForm.id_document_back_url.trim();
      if (kycForm.selfie_url.trim())            payload.selfie_url            = kycForm.selfie_url.trim();
      if (kycForm.address_document_type)        payload.address_document_type = kycForm.address_document_type;
      if (kycForm.address_document_url.trim())  payload.address_document_url  = kycForm.address_document_url.trim();

      const res  = await fetch(`${API_BASE}/kyc/submit`, { method: "POST", headers: jsonHdr(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.bool) { setKycError(data.response?.message || "KYC submission failed."); return; }
      setKycStatus("PENDING");
      await fetchKycStatus();
      showToast("KYC submitted successfully! Under review.");
    } catch { setKycError("Network error. Please try again."); }
    finally { setSubmittingKyc(false); }
  };

  /* ── Add Money via Razorpay ──────────────────────────────────────────────────
     MONEY FLOW:
       Path A — new backend (wallet_routes.py registered):
         1. POST /payment/wallet_order   → get Razorpay order_id from server
         2. rzp.open() with order_id     → user pays
         3. handler → POST /payment/wallet_deposit_verify → credits wallet

       Path B — fallback (wallet_order not yet registered, returns 404):
         1. rzp.open() WITHOUT order_id  → user pays (Razorpay allows this)
         2. handler → POST /wallets/deposit → credits wallet directly
            (this is the endpoint that already works — see "₹1.00 added" screenshot)

     WHY THE ORIGINAL CODE NEVER SHOWED RAZORPAY:
       It called POST /payment/create_order which requires stock_id + quantity.
       Flask-RESTX returned 400, orderData.bool was false, early return fired,
       rzp.open() was never reached. The popup never appeared.

     KEY FIX — token capture:
       The Razorpay handler fires asynchronously AFTER the modal closes.
       We capture the JWT token BEFORE calling rzp.open() so the handler
       always has a valid auth header, even if React state has been reset.
  ──────────────────────────────────────────────────────────────────────────── */
  const handleAddMoney = async (e) => {
    e.preventDefault();
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount < 1) { showToast("Enter a valid amount (min ₹1)", false); return; }

    /* Enforce KYC, the admin's deposit cap and wallet status BEFORE opening Razorpay.
       The server re-checks all three, but rejecting only afterwards would mean the
       user is charged and then refused — money taken with nothing credited. */
    if (wallet?.kyc_status && wallet.kyc_status !== "APPROVED") {
      showToast(KYC_DEPOSIT_MESSAGE[wallet.kyc_status] || "KYC verification is required before adding money.", false);
      return;
    }
    if (wallet?.status && wallet.status !== "ACTIVE") {
      showToast(`Your wallet is ${wallet.status.toLowerCase()}. You cannot add money — please contact support.`, false);
      return;
    }
    const maxDeposit = parseFloat(wallet?.max_single_deposit || 0);
    if (maxDeposit > 0 && amount > maxDeposit) {
      showToast(`Single deposit limit is ₹${maxDeposit.toLocaleString("en-IN")}. Enter ₹${maxDeposit.toLocaleString("en-IN")} or less.`, false);
      return;
    }

    setAddLoading(true);
    setAddStep("processing");

    try {
      /* ── Step 1: Load Razorpay checkout.js ──────────────────────────────── */
      const rzpLoaded = await loadRazorpay();
      if (!rzpLoaded) {
        showToast("Failed to load Razorpay. Check your internet connection.", false);
        setAddStep("form"); setAddLoading(false); return;
      }

      /* ── Step 2: Get a server-side Razorpay order_id ─────────────────────
         REQUIRED — the wallet is only credited against a verified payment tied
         to an order the server created. There is no unverified fallback: a
         deposit without a signature the backend can check is refused. */
      let rzpOrderId, amountPaise, rzpKey;
      try {
        const orderRes  = await fetch(`${API_BASE}/payments/wallet_order`, {
          method: "POST", headers: jsonHdr(), body: JSON.stringify({ amount }),
        });
        const orderData = await orderRes.json();
        if (!orderData.bool || !orderData.response?.order_id) {
          showToast(orderData.response?.message || "Could not start the payment. Please try again.", false);
          setAddStep("form"); setAddLoading(false); return;
        }
        rzpOrderId  = orderData.response.order_id;
        amountPaise = orderData.response.amount_paise || Math.round(amount * 100);
        rzpKey      = orderData.response.key_id       || RAZORPAY_KEY;
      } catch {
        showToast("Network error starting payment. Please try again.", false);
        setAddStep("form"); setAddLoading(false); return;
      }

      /* ── Step 3: Capture token NOW before opening Razorpay ──────────────── */
      // The handler callback fires after the modal closes (async), by which
      // time getToken() from localStorage still works — but we capture it
      // explicitly here as a safety measure.
      const capturedToken = getToken();

      /* ── Step 4: Build Razorpay options ─────────────────────────────────── */
      const options = {
        key:         rzpKey,
        amount:      amountPaise,    // paise
        currency:    "INR",
        name:        "TradeFlow",
        description: `Wallet Top-up — ₹${amount.toFixed(2)}`,
        prefill: {
          email: profile.email || "",
          name:  `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Investor",
        },
        notes:  { purpose: "WALLET_DEPOSIT" },
        theme:  { color: "#06B6D4" },
        order_id: rzpOrderId,   // always present — signature verification is mandatory

        /* ── Step 5: Payment success callback ───────────────────────────────
           Credit the wallet via /wallets/deposit, passing the Razorpay order id,
           payment id and signature. The backend verifies the signature against
           the gateway secret before crediting — there is no unverified path. */
        handler: async (rzpResponse) => {
          const hdrs = {
            "Content-Type": "application/json",
            Authorization:  `Bearer ${capturedToken}`,
          };
          try {
            const depositRes  = await fetch(`${API_BASE}/wallets/deposit`, {
              method: "POST", headers: hdrs,
              body: JSON.stringify({
                amount,
                payment_method:      "RAZORPAY",
                razorpay_order_id:   rzpResponse.razorpay_order_id,
                razorpay_payment_id: rzpResponse.razorpay_payment_id,
                razorpay_signature:  rzpResponse.razorpay_signature,
              }),
            });
            const depositData = await depositRes.json();
            if (!depositData.bool) {
              showToast(depositData.response?.message || "Deposit failed. Contact support.", false);
              setAddStep("form"); setAddLoading(false); return;
            }
            setAddStep("success");
            await fetchWallet();
            await fetchWalletTransactions();
          } catch {
            showToast("Network error during payment. Contact support if money was debited.", false);
            setAddStep("form");
          } finally {
            setAddLoading(false);
          }
        },

        modal: {
          ondismiss: () => {
            showToast("Payment cancelled.", false);
            setAddStep("form");
            setAddLoading(false);
          },
        },
      };

      /* ── Step 6: Wire up failure event, then open ────────────────────────── */
      const rzp = new window.Razorpay(options);

      rzp.on("payment.failed", (failResponse) => {
        const desc = failResponse.error?.description || "Unknown error";
        showToast(`Payment failed: ${desc}`, false);
        setAddStep("form");
        setAddLoading(false);
      });

      // Done preparing — clear the "Processing…" spinner and open the sheet
      setAddLoading(false);
      rzp.open();

    } catch (err) {
      console.error("Add money error:", err);
      showToast("Something went wrong. Please try again.", false);
      setAddStep("form");
      setAddLoading(false);
    }
  };

  /* ── Withdraw ──────────────────────────────────────────────────────────── */
  /**
   * Posts to /wallets/withdraw with the chosen payout method. The payout is
   * SIMULATED server-side — the wallet debits and the transaction is recorded, but
   * no money reaches the bank/UPI until RazorpayX Payouts is integrated.
   */
  const submitWithdrawal = async ({ amount, methodId, onDone, setLoading, successVerb }) => {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) { showToast("Enter a valid amount.", false); return; }
    if (!methodId)                  { showToast("Select where to withdraw to.", false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/wallets/withdraw`, {
        method: "POST", headers: jsonHdr(),
        body: JSON.stringify({ amount: value, payout_method_id: Number(methodId) }),
      });
      const data = await res.json();
      if (data.bool) {
        await fetchWallet(); await fetchWalletTransactions();
        onDone();
        const net = parseFloat(data.response?.net_amount ?? value);
        showToast(`₹${net.toFixed(2)} ${successVerb} ${data.response?.payout_method?.display_name || "your account"}.`);
      } else showToast(data.response?.message || "Withdrawal failed.", false);
    } catch { showToast("Network error.", false); }
    finally { setLoading(false); }
  };

  const handleWithdraw = (e) => {
    e.preventDefault();
    return submitWithdrawal({
      amount: withdrawAmount, methodId: withdrawMethodId,
      setLoading: setWithdrawLoading, successVerb: "sent to",
      onDone: () => { setShowWithdrawModal(false); setWithdrawAmount(""); },
    });
  };

  /* ── Transfer to Bank ──────────────────────────────────────────────────── */
  const handleTransfer = (e) => {
    e.preventDefault();
    return submitWithdrawal({
      amount: transferAmount, methodId: transferMethodId,
      setLoading: setTransferLoading, successVerb: "transferred to",
      onDone: () => { setShowTransferModal(false); setTransferAmount(""); },
    });
  };

  /* ── Payout methods ────────────────────────────────────────────────────── */
  const handleAddPayoutMethod = async (e) => {
    e.preventDefault();
    setPayoutSaving(true);
    try {
      const res  = await fetch(`${API_BASE}/wallets/payout_methods`, {
        method: "POST", headers: jsonHdr(), body: JSON.stringify(payoutForm),
      });
      const data = await res.json();
      if (data.bool) {
        await fetchPayoutMethods();
        setShowAddPayoutModal(false); setPayoutForm(BLANK_PAYOUT_FORM);
        showToast("Payout method added.");
      } else showToast(data.response?.message || "Could not add payout method.", false);
    } catch { showToast("Network error.", false); }
    finally { setPayoutSaving(false); }
  };

  const handleRemovePayoutMethod = async (id) => {
    try {
      const res  = await fetch(`${API_BASE}/wallets/payout_methods/${id}`, {
        method: "DELETE", headers: authHdr(),
      });
      const data = await res.json();
      if (data.bool) { await fetchPayoutMethods(); showToast("Payout method removed."); }
      else showToast(data.response?.message || "Could not remove method.", false);
    } catch { showToast("Network error.", false); }
  };

  const handleSetPrimaryPayoutMethod = async (id) => {
    try {
      const res  = await fetch(`${API_BASE}/wallets/payout_methods/${id}/primary`, {
        method: "POST", headers: authHdr(),
      });
      const data = await res.json();
      if (data.bool) { await fetchPayoutMethods(); showToast("Default withdrawal account updated."); }
      else showToast(data.response?.message || "Could not update default.", false);
    } catch { showToast("Network error.", false); }
  };

  /* Fee breakdown comes from the server so the modal can never disagree with what
     is actually charged. Debounced because it fires on every keystroke. */
  const [quote, setQuote] = useState(null);

  const activeQuoteInput = showTransferModal
    ? { amount: transferAmount, methodId: transferMethodId }
    : { amount: withdrawAmount, methodId: withdrawMethodId };

  useEffect(() => {
    const { amount, methodId } = activeQuoteInput;
    const value = parseFloat(amount);
    if (!(showWithdrawModal || showTransferModal) || isNaN(value) || value <= 0 || !methodId) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`${API_BASE}/wallets/withdraw/quote`, {
          method: "POST", headers: jsonHdr(),
          body: JSON.stringify({ amount: value, payout_method_id: Number(methodId) }),
        });
        const data = await res.json();
        if (!cancelled) setQuote(data.bool ? data.response : null);
      } catch { if (!cancelled) setQuote(null); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [activeQuoteInput.amount, activeQuoteInput.methodId, showWithdrawModal, showTransferModal]);

  /* ── UI Helpers ────────────────────────────────────────────────────────── */
  const Toggle = ({ v, onToggle }) => (
    <button onClick={onToggle} className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${v ? "bg-cyan-500" : "bg-white/10"}`}>
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${v ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );

  const fmtTxAmt = (tx) => {
    const type   = (tx.transaction_type || "").toUpperCase();
    const credit = type === "DEPOSIT" || type === "REFUND";
    return (
      <span className={`text-sm font-bold ${credit ? "text-emerald-400" : "text-red-400"}`}>
        {credit ? "+" : "-"}₹{parseFloat(tx.amount || tx.net_amount || 0).toFixed(2)}
      </span>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
      </AnimatePresence>

      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account preferences and configurations.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── Sidebar ── */}
        <div className="lg:w-48 flex-shrink-0">
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setActive(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm border-b border-white/5 last:border-0 transition-all cursor-pointer ${active === t.id ? "bg-cyan-500/8 text-cyan-300 font-medium" : "text-gray-500 hover:text-white hover:bg-white/5"}`}>
                <t.icon className={`w-4 h-4 ${active === t.id ? "text-cyan-400" : "text-gray-600"}`} />
                {t.label}
                {active === t.id && <ChevronRight className="w-3.5 h-3.5 ml-auto text-cyan-400" />}
              </button>
            ))}
            <button onClick={() => { logout(); navigate("/"); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/5 transition-all cursor-pointer">
              <Key className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 space-y-4 min-w-0">
          {loading ? (
            <div className="p-16 bg-[#0C1220] border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-xs text-gray-600">Retrieving details...</span>
            </div>
          ) : (
            <>
              {/* ─── PROFILE ─── */}
              {active === "profile" && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                    <div className="text-sm font-medium text-white mb-5">Profile Information</div>
                    <div className="flex items-center gap-4 mb-5">
                      <div className="relative">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt="Profile"
                            className="w-16 h-16 rounded-2xl object-cover shadow-lg border border-white/10" />
                        ) : (
                          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xl font-bold text-white shadow-lg">
                            {(profile.first_name || "U").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        {avatarSaving && (
                          <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                          </div>
                        )}
                        {/* The camera button used to be inert — it now opens the picker. */}
                        <label
                          title="Change profile picture"
                          className="absolute -bottom-1 -right-1 w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center cursor-pointer border border-[#0C1220] hover:bg-cyan-400">
                          <Camera className="w-3 h-3 text-white" />
                          <input type="file" accept="image/*" className="hidden"
                            disabled={avatarSaving} onChange={handleAvatarSelect} />
                        </label>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{profile.first_name} {profile.last_name}</div>
                        <div className="text-xs text-gray-500 mb-1">{profile.email}</div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-cyan-500/10 border border-cyan-500/15 rounded-full text-[10px] text-cyan-400 font-medium">
                            Member
                          </span>
                          {profile.avatar_url && (
                            <button onClick={() => saveAvatar("", "Profile picture removed.")} disabled={avatarSaving}
                              className="text-[10px] text-gray-500 hover:text-red-400 cursor-pointer disabled:opacity-50">
                              Remove photo
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {[
                        { label: "First Name",    field: "first_name", type: "text" },
                        { label: "Last Name",     field: "last_name",  type: "text" },
                        { label: "Email Address", field: "email",      type: "email", readOnly: true },
                        { label: "Phone Number",  field: "phone",      type: "tel" },
                        { label: "Location / Country", field: "location", type: "text" },
                      ].map(({ label, field, type, readOnly }) => (
                        <div key={field}>
                          <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
                          <input type={type} value={profile[field]}
                            readOnly={readOnly}
                            onChange={readOnly ? undefined : (e) => setProfile({ ...profile, [field]: e.target.value })}
                            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/30 ${
                              readOnly
                                ? "bg-[#0A0E1E] border-white/4 text-gray-500 cursor-not-allowed"
                                : "bg-[#141C30] border-white/8 text-gray-200"
                            }`} />
                          {readOnly && <p className="text-xs text-gray-700 mt-1">Email cannot be changed here</p>}
                        </div>
                      ))}
                      <div className="sm:col-span-2">
                        <label className="text-xs text-gray-500 mb-1.5 block">Bio</label>
                        <textarea value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3}
                          className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30 resize-none" />
                      </div>
                    </div>
                  </div>
                  <button onClick={handleProfileSave}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
                    Save Changes
                  </button>
                </motion.div>
              )}

              {/* ─── NOTIFICATIONS ─── */}
              {active === "notifs" && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  {NOTIF_GROUPS.map((group) => (
                    <div key={group.title} className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-white/5">
                        <div className="text-sm font-medium text-white">{group.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{group.blurb}</div>
                      </div>
                      {group.items.map(({ key, label, hint }) => {
                        const isEmail  = key.startsWith("email_");
                        const isSms    = key.startsWith("sms_");
                        const channel  = isEmail ? "Email" : isSms ? "SMS" : "In-app";
                        // A master switch off greys out the rows it silences.
                        const muted    = (isEmail && notifPrefs.email_enabled === false && key !== "email_enabled")
                                      || (!isEmail && !isSms && notifPrefs.push_enabled === false && key !== "push_enabled");
                        return (
                          <div key={key} className={`flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0 ${muted ? "opacity-40" : ""}`}>
                            <div className="min-w-0 pr-3">
                              <div className="text-sm text-white flex items-center gap-2">
                                {label}
                                {group.title !== "Channels" && (
                                  <span className="text-[9px] font-bold text-gray-500 bg-white/5 border border-white/8 rounded px-1.5 py-0.5 shrink-0">
                                    {channel.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-600 mt-0.5">{hint}</div>
                            </div>
                            <Toggle v={!!notifPrefs[key]} onToggle={() => setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }))} />
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  <div className="flex items-start gap-2.5 px-3 py-2.5 bg-cyan-500/8 border border-cyan-500/15 rounded-xl text-xs text-cyan-300">
                    <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    Security alerts (password changes, suspicious activity) are always sent and can't be turned off.
                  </div>

                  <button onClick={handlePreferencesSave} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 cursor-pointer">
                    Save Preferences
                  </button>
                </motion.div>
              )}

              {/* ─── SECURITY ─── */}
              {active === "security" && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                    <div className="text-sm font-medium text-white mb-4">Change Password</div>
                    <div className="space-y-3 max-w-sm">
                      <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">Current Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                          <input type={showPw ? "text" : "password"} value={passwordForm.current_password}
                            onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                            className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-10 py-2.5 text-sm text-gray-200 focus:outline-none" />
                          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">
                            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {[
                        { label: "New Password",     field: "new_password" },
                        { label: "Confirm Password", field: "confirm_password" },
                      ].map(({ label, field }) => (
                        <div key={field}>
                          <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
                          <input type="password" value={passwordForm[field]}
                            onChange={(e) => setPasswordForm({ ...passwordForm, [field]: e.target.value })}
                            className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none" />
                        </div>
                      ))}
                      <button onClick={handlePasswordChange}
                        className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium cursor-pointer">
                        Update Password
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white flex items-center gap-1.5"><Key className="w-4 h-4 text-cyan-400" />Two-Factor Authentication (TOTP)</div>
                        <p className="text-xs text-gray-500 mt-1">{twoFAEnabled ? "2FA is active on your account." : "Enable 2FA using Google Authenticator."}</p>
                      </div>
                      <Toggle v={twoFAEnabled} onToggle={handle2faToggle} />
                    </div>
                  </div>

                  <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                    <div className="text-sm font-medium text-white mb-2">Inactivity Session Timeout</div>
                    <select value={sessionTimeout} onChange={handleTimeoutChange}
                      className="bg-[#141C30] text-sm text-gray-200 border border-white/8 rounded-xl px-3 py-2.5">
                      <option value={900}>15 Minutes</option>
                      <option value={1800}>30 Minutes</option>
                      <option value={3600}>1 Hour</option>
                      <option value={14400}>4 Hours</option>
                    </select>
                  </div>

                  <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                    <div className="text-sm font-medium text-white mb-2">IP Address Whitelist</div>
                    <div className="flex gap-2 max-w-sm mb-4">
                      <input type="text" placeholder="e.g. 192.168.1.1" value={whitelistIp} onChange={(e) => setWhitelistIp(e.target.value)}
                        className="flex-1 bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-white" />
                      <button onClick={handleAddIp} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-semibold cursor-pointer">Add IP</button>
                    </div>
                    {(securityProfile?.ip_whitelist || []).map((ip, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 bg-[#141C30] border border-white/5 rounded-xl mb-2">
                        <span className="text-xs font-mono text-gray-300">{ip}</span>
                        <button onClick={() => handleRemoveIp(ip)} className="p-1 text-red-400/70 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                    <div className="text-sm font-medium text-white mb-3">Active Sessions</div>
                    {sessions.map((s, idx) => (
                      <div key={s.session_id || s.id || idx} className="flex items-center justify-between p-3 bg-[#141C30] border border-white/5 rounded-xl mb-2">
                        <div>
                          <div className="text-xs font-bold text-white">{s.device_type || s.device || "Unknown Device"}</div>
                          <div className="text-[10px] text-gray-500">IP: {s.ip_address || "—"}</div>
                        </div>
                        {s.is_current ? (
                          <span className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/25 rounded-md text-[9px] text-emerald-400">Current</span>
                        ) : (
                          <button onClick={() => handleRevokeSession(s.session_id || s.id)}
                            className="px-2.5 py-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg cursor-pointer">Revoke</button>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ─── WALLET ─── */}
              {active === "wallet" && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  {wallet ? (
                    <>
                      <div className="bg-gradient-to-br from-cyan-500/10 to-blue-600/5 border border-cyan-500/15 rounded-2xl p-6">
                        <div className="text-xs text-gray-400 font-medium tracking-wide mb-1 uppercase">Available Balance</div>
                        <div className="text-3xl font-black text-white mb-6">
                          ₹{parseFloat(wallet.available_balance || wallet.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                          <div>
                            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Total Deposited</div>
                            <div className="text-base font-bold text-gray-200 mt-0.5">
                              ₹{parseFloat(wallet.total_deposited || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Locked Balance</div>
                            <div className="text-base font-bold text-cyan-400 mt-0.5">
                              ₹{parseFloat(wallet.locked_balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                        {/* Note explaining invested/locked */}
                        <p className="text-xs text-gray-600 mt-3">
                          Locked Balance increases when you place buy orders. Total Deposited tracks all deposits via Razorpay.
                        </p>
                      </div>

                      <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
                        <div className="text-xs font-bold text-white uppercase tracking-wider px-1">Quick Actions</div>
                        <div className="flex flex-wrap gap-2.5">
                          <button onClick={() => { setAddStep("form"); setAddAmount(""); setShowAddMoneyModal(true); }}
                            className="py-2 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer">
                            <PlusCircle className="w-3.5 h-3.5" />Add Money
                          </button>
                          <button onClick={() => {
                              setWithdrawAmount("");
                              const primary = payoutMethods.find((m) => m.is_primary) || payoutMethods[0];
                              setWithdrawMethodId(primary ? String(primary.payout_method_id) : "");
                              setShowWithdrawModal(true);
                            }}
                            className="py-2 px-4 bg-[#141C30] border border-white/8 rounded-xl text-xs font-bold text-gray-300 flex items-center gap-1.5 cursor-pointer">
                            <ArrowUpRight className="w-3.5 h-3.5" />Withdraw
                          </button>
                          <button onClick={() => {
                              setTransferAmount("");
                              const primary = bankMethods.find((m) => m.is_primary) || bankMethods[0];
                              setTransferMethodId(primary ? String(primary.payout_method_id) : "");
                              setShowTransferModal(true);
                            }}
                            className="py-2 px-4 bg-[#141C30] border border-white/8 rounded-xl text-xs font-bold text-gray-300 flex items-center gap-1.5 cursor-pointer">
                            <Building className="w-3.5 h-3.5" />Transfer to Bank
                          </button>
                        </div>
                      </div>

                      {/* ─── Withdrawal methods ─── */}
                      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-white">Withdrawal Methods</div>
                            <div className="text-xs text-gray-500 mt-0.5">Where your money goes when you withdraw</div>
                          </div>
                          <button onClick={() => { setPayoutForm(BLANK_PAYOUT_FORM); setShowAddPayoutModal(true); }}
                            className="py-1.5 px-3 bg-[#141C30] border border-white/8 rounded-lg text-[11px] font-bold text-cyan-400 flex items-center gap-1 cursor-pointer">
                            <Plus className="w-3 h-3" />Add
                          </button>
                        </div>
                        {payoutMethods.length === 0 ? (
                          <div className="py-8 px-5 text-center">
                            <div className="text-xs text-gray-500">No withdrawal methods yet</div>
                            <div className="text-[11px] text-gray-600 mt-1">Add a UPI ID or bank account to withdraw your balance</div>
                          </div>
                        ) : payoutMethods.map((m) => {
                          const meta = PAYOUT_TYPES.find((t) => t.value === m.method_type);
                          const Icon = meta?.icon || Building;
                          return (
                            <div key={m.payout_method_id} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-[#141C30] border border-white/5 flex items-center justify-center shrink-0">
                                  <Icon className="w-4 h-4 text-cyan-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                                    <span className="truncate">{m.display_name}</span>
                                    {m.is_primary && (
                                      <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5 shrink-0">DEFAULT</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                                    {meta?.label}{m.display_detail ? ` • ${m.display_detail}` : ""}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {!m.is_primary && (
                                  <button onClick={() => handleSetPrimaryPayoutMethod(m.payout_method_id)}
                                    className="px-2.5 py-1 text-[10px] font-bold text-gray-400 hover:text-cyan-400 bg-[#141C30] border border-white/8 rounded-lg cursor-pointer">
                                    Set default
                                  </button>
                                )}
                                <button onClick={() => handleRemovePayoutMethod(m.payout_method_id)}
                                  className="p-1.5 text-red-400/70 hover:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg cursor-pointer">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">Recent Wallet Transactions</div>
                        {walletTransactions.length === 0 ? (
                          <div className="py-8 text-center text-xs text-gray-600">No wallet transactions yet</div>
                        ) : walletTransactions.slice(0, 10).map((tx, i) => (
                          <div key={tx.wallet_txn_id || tx.id || i} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
                            <div>
                              <div className="text-sm font-semibold text-white">{tx.description || tx.transaction_type || "Transaction"}</div>
                              <div className="text-xs text-gray-500 mt-0.5">{tx.created_on ? new Date(tx.created_on).toLocaleString() : ""}</div>
                            </div>
                            {fmtTxAmt(tx)}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center text-gray-600 text-sm">
                      Wallet data unavailable
                    </div>
                  )}
                </motion.div>
              )}

              {/* ─── KYC ─── */}
              {active === "kyc" && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
                    <div className="text-sm font-medium text-white mb-4">Identity KYC Verification</div>
                    <div className="p-4 bg-[#141C30] border border-white/5 rounded-xl flex items-center justify-between mb-5">
                      <div>
                        <div className="text-xs text-gray-500">KYC Status</div>
                        <div className="text-base font-bold text-white mt-1">
                          {kycStatus === "APPROVED"     && "Verified ✅"}
                          {kycStatus === "PENDING"      && "Under Review ⏳"}
                          {kycStatus === "UNDER_REVIEW" && "Under Review ⏳"}
                          {kycStatus === "REJECTED"     && "Rejected ❌"}
                          {(kycStatus === "NOT_STARTED" || kycStatus === "NOT_SUBMITTED") && "Not Submitted"}
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase ${
                        kycStatus === "APPROVED"     ? "bg-emerald-500/15 text-emerald-400"
                        : kycStatus === "PENDING" || kycStatus === "UNDER_REVIEW" ? "bg-amber-500/15 text-amber-400"
                        : kycStatus === "REJECTED"   ? "bg-red-500/15 text-red-400"
                        : "bg-gray-500/10 text-gray-500"
                      }`}>{kycStatus}</span>
                    </div>

                    {kycData && kycData.legal_first_name && (
                      <div className="mb-5 grid sm:grid-cols-2 gap-3">
                        {[
                          { label: "Legal Name",    value: `${kycData.legal_first_name} ${kycData.legal_last_name}` },
                          { label: "Date of Birth", value: kycData.date_of_birth || "—" },
                          { label: "Nationality",   value: kycData.nationality || "—" },
                          { label: "Document Type", value: kycData.id_document_type || "—" },
                          { label: "Submitted",     value: kycData.submitted_at ? new Date(kycData.submitted_at).toLocaleDateString() : "—" },
                          { label: "Approved At",   value: kycData.approved_at ? new Date(kycData.approved_at).toLocaleDateString() : "—" },
                        ].map((item, i) => (
                          <div key={i} className="flex justify-between py-2 border-b border-white/5">
                            <span className="text-xs text-gray-600">{item.label}</span>
                            <span className="text-xs text-white font-medium">{item.value}</span>
                          </div>
                        ))}
                        {kycData.rejection_reason && (
                          <div className="sm:col-span-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <div className="text-xs text-red-400 font-medium mb-1">Rejection Reason</div>
                            <div className="text-xs text-red-300">{kycData.rejection_reason}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {(kycStatus === "NOT_STARTED" || kycStatus === "NOT_SUBMITTED" || kycStatus === "REJECTED") && (
                      <form onSubmit={handleKycSubmit} className="space-y-5">
                        <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                          {kycStatus === "REJECTED" ? "Re-submit KYC Documents" : "Submit KYC Documents"}
                        </div>
                        {kycError && (
                          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {kycError}
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Personal Information</p>
                          {/* The name on an ID document doesn't always match the one
                              given at signup, so say where these values came from and
                              ask for a check rather than letting them pass unnoticed. */}
                          {kycStatus !== "REJECTED" && Object.values(kycData?.prefill || {}).some(Boolean) && (
                            <p className="text-xs text-gray-500 mb-3 -mt-1">
                              Filled in from your account details — please check they match your ID document exactly.
                            </p>
                          )}
                          <div className="grid sm:grid-cols-2 gap-3">
                            <KycField label="Legal First Name *" field="legal_first_name" placeholder="As on ID document" value={kycForm.legal_first_name} onChange={handleKycFieldChange} />
                            <KycField label="Legal Last Name *"  field="legal_last_name"  placeholder="As on ID document" value={kycForm.legal_last_name} onChange={handleKycFieldChange} />
                            <KycField label="Date of Birth *"    field="date_of_birth"    type="date" value={kycForm.date_of_birth} onChange={handleKycFieldChange} />
                            <KycField label="Nationality"        field="nationality"       placeholder="e.g. Indian" value={kycForm.nationality} onChange={handleKycFieldChange} />
                            <KycField label="Country of Residence" field="country_of_residence" placeholder="e.g. India" value={kycForm.country_of_residence} onChange={handleKycFieldChange} />
                            <KycField label="Tax ID (PAN / SSN)" field="tax_id"           placeholder="Optional" value={kycForm.tax_id} onChange={handleKycFieldChange} />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Identity Document</p>
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-500 mb-1.5 block">Document Type *</label>
                              <select value={kycForm.id_document_type} onChange={(e) => setKycForm(p => ({ ...p, id_document_type: e.target.value }))}
                                className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30">
                                {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                              </select>
                            </div>
                            <KycField label="Document Number *" field="id_document_number" placeholder="e.g. A1234567" value={kycForm.id_document_number} onChange={handleKycFieldChange} />
                            <KycField label="Expiry Date" field="id_document_expiry" type="date" value={kycForm.id_document_expiry} onChange={handleKycFieldChange} />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Documents</p>
                          <p className="text-xs text-gray-600 mb-3">Upload clear photos of your documents. PNG, JPG or WEBP, up to 5 MB each. Only you and our verification team can view them.</p>
                          <div className="grid sm:grid-cols-2 gap-3">
                            <DocUpload label="ID Front Image *" field="id_document_front_url" value={kycForm.id_document_front_url} onChange={handleKycFieldChange} hint="All four corners visible, no glare." />
                            <DocUpload label="ID Back Image"    field="id_document_back_url"  value={kycForm.id_document_back_url}  onChange={handleKycFieldChange} />
                            <SelfieCapture field="selfie_url" value={kycForm.selfie_url} onChange={handleKycFieldChange} />
                            <div>
                              <label className="text-xs text-gray-500 mb-1.5 block">Address Proof Type</label>
                              <select value={kycForm.address_document_type} onChange={(e) => setKycForm(p => ({ ...p, address_document_type: e.target.value }))}
                                className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30">
                                <option value="UTILITY_BILL">Utility Bill</option>
                                <option value="BANK_STATEMENT">Bank Statement</option>
                                <option value="TAX_DOCUMENT">Tax Document</option>
                              </select>
                            </div>
                            <DocUpload label="Address Proof" field="address_document_url" value={kycForm.address_document_url} onChange={handleKycFieldChange} />
                          </div>
                        </div>
                        <button type="submit" disabled={submittingKyc}
                          className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center gap-2 cursor-pointer">
                          {submittingKyc ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</>
                           : <><Upload className="w-4 h-4" />Submit Documents</>}
                        </button>
                      </form>
                    )}

                    {(kycStatus === "PENDING" || kycStatus === "UNDER_REVIEW") && (
                      <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl text-center">
                        <p className="text-sm text-amber-400 font-medium">Your documents are under review.</p>
                        <p className="text-xs text-gray-500 mt-1">This typically takes 1–3 business days. You'll be notified when complete.</p>
                      </div>
                    )}
                    {kycStatus === "APPROVED" && (
                      <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-xl text-center">
                        <p className="text-sm text-emerald-400 font-medium">✅ KYC Verified — Your identity has been confirmed.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ TOTP Modal ═══ */}
      <AnimatePresence>
        {showTotpModal && setupTotp && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-base font-bold text-white mb-4">Enable 2FA Protection</h3>
              {setupTotp.qr_code_url && (
                <div className="bg-white p-2.5 rounded-xl w-36 h-36 mx-auto"><img src={setupTotp.qr_code_url} alt="2FA QR" className="w-full h-full" /></div>
              )}
              {setupTotp.secret && (
                <div className="mt-3 p-3 bg-[#141C30] border border-white/5 rounded-xl">
                  <div className="text-xs text-gray-500 mb-1">Manual setup key:</div>
                  <div className="text-xs font-mono text-cyan-400 break-all">{setupTotp.secret}</div>
                </div>
              )}
              <input type="text" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter 6-digit code"
                className="w-full text-center bg-[#141C30] border border-white/8 rounded-xl py-2.5 text-sm text-white mt-4 focus:outline-none focus:border-cyan-500/30" />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button onClick={() => setShowTotpModal(false)} className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 cursor-pointer">Cancel</button>
                <button onClick={handleVerify2fa} className="py-2.5 bg-cyan-500 rounded-xl text-xs font-semibold text-white cursor-pointer">Verify & Enable</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ ADD MONEY MODAL (Razorpay) ═══ */}
      <AnimatePresence>
        {showAddMoneyModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">

              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowDownLeft className="w-5 h-5 text-emerald-400" />Add Money to Wallet
                </h3>
                {addStep === "form" && (
                  <button onClick={() => setShowAddMoneyModal(false)} className="text-gray-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {addStep === "form" && (
                <form onSubmit={handleAddMoney} className="space-y-4">
                  {/* Payment gateway info */}
                  <div className="flex items-start gap-2.5 px-3 py-2.5 bg-cyan-500/8 border border-cyan-500/15 rounded-xl text-xs text-cyan-300">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    Powered by Razorpay — you'll be redirected to complete payment via bank / UPI / card.
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Amount (₹)</label>
                    <input type="number" step="1" min="1" max={wallet?.max_single_deposit || undefined}
                      placeholder="Enter amount" required value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                    {wallet?.max_single_deposit > 0 && (
                      <div className={`text-[11px] mt-1.5 ${
                        parseFloat(addAmount) > wallet.max_single_deposit ? "text-red-400" : "text-gray-600"}`}>
                        {parseFloat(addAmount) > wallet.max_single_deposit
                          ? `Over the ₹${Number(wallet.max_single_deposit).toLocaleString("en-IN")} single-deposit limit set by the admin.`
                          : `Single deposit limit: ₹${Number(wallet.max_single_deposit).toLocaleString("en-IN")}`}
                      </div>
                    )}
                  </div>
                  {/* Quick amount pills */}
                  <div className="flex gap-2">
                    {[500, 1000, 5000, 10000].map(n => (
                      <button key={n} type="button" onClick={() => setAddAmount(String(n))}
                        className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${
                          addAmount === String(n)
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                            : "border-white/8 text-gray-600 hover:text-white"
                        }`}>
                        ₹{n >= 1000 ? `${n/1000}k` : n}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button type="button" onClick={() => setShowAddMoneyModal(false)}
                      className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">
                      Cancel
                    </button>
                    <button type="submit" disabled={addLoading}
                      className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
                      {addLoading
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating order…</>
                        : <>Pay via Razorpay →</>}
                    </button>
                  </div>
                </form>
              )}

              {addStep === "processing" && (
                <div className="flex flex-col items-center justify-center py-8 gap-4">
                  <div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                  <div className="text-sm text-gray-400 text-center">
                    Opening Razorpay…<br />
                    <span className="text-xs text-gray-600">Complete your payment in the popup.</span>
                  </div>
                </div>
              )}

              {addStep === "success" && (
                <div className="flex flex-col items-center justify-center py-6 gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div className="text-base font-bold text-white">₹{parseFloat(addAmount).toFixed(2)} Added!</div>
                  <div className="text-xs text-gray-500 text-center">Payment verified and wallet credited successfully.</div>
                  <div className="text-lg font-bold text-cyan-400">
                    New Balance: ₹{parseFloat(wallet?.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <button onClick={() => { setShowAddMoneyModal(false); setAddStep("form"); setAddAmount(""); }}
                    className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90">
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ WITHDRAW MODAL ═══ */}
      <AnimatePresence>
        {showWithdrawModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2"><ArrowUpRight className="w-5 h-5 text-red-400" />Withdraw Funds</h3>
              <div className="bg-[#141C30] border border-white/5 rounded-lg p-2.5 flex justify-between items-center text-xs">
                <span className="text-gray-400">Available Balance</span>
                <span className="font-bold text-cyan-400">₹{parseFloat(wallet?.available_balance || 0).toFixed(2)}</span>
              </div>
              {payoutMethods.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    You haven't added a withdrawal destination yet. Add a UPI ID, bank account,
                    or net banking account to withdraw your money.
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button type="button" onClick={() => setShowWithdrawModal(false)}
                      className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                    <button type="button"
                      onClick={() => { setShowWithdrawModal(false); setPayoutForm(BLANK_PAYOUT_FORM); setShowAddPayoutModal(true); }}
                      className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer">
                      <Plus className="w-3.5 h-3.5" />Add Method
                    </button>
                  </div>
                </div>
              ) : (
              <form onSubmit={handleWithdraw} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Amount (₹)</label>
                  <input type="number" step="0.01" min="1" max={wallet?.available_balance || 0} placeholder="Enter amount" required
                    value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Withdraw to</label>
                  <select required value={withdrawMethodId} onChange={(e) => setWithdrawMethodId(e.target.value)}
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/30">
                    <option value="" disabled>Select a destination</option>
                    {PAYOUT_TYPES.map((t) => {
                      const group = payoutMethods.filter((m) => m.method_type === t.value);
                      if (!group.length) return null;
                      return (
                        <optgroup key={t.value} label={t.label}>
                          {group.map((m) => (
                            <option key={m.payout_method_id} value={m.payout_method_id}>
                              {m.display_name}{m.display_detail ? ` — ${m.display_detail}` : ""}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  <button type="button"
                    onClick={() => { setShowWithdrawModal(false); setPayoutForm(BLANK_PAYOUT_FORM); setShowAddPayoutModal(true); }}
                    className="mt-2 text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer">
                    <Plus className="w-3 h-3" />Add another method
                  </button>
                </div>

                {quote && (
                  <div className="bg-[#141C30] border border-white/5 rounded-lg p-2.5 space-y-1.5 text-xs">
                    {quote.platform_fee > 0 && (
                      <div className="flex justify-between text-gray-400">
                        <span>Platform fee</span><span>−₹{quote.platform_fee.toFixed(2)}</span>
                      </div>
                    )}
                    {quote.gateway_fee > 0 && (
                      <div className="flex justify-between text-amber-400/90">
                        <span>Net banking charge</span><span>−₹{quote.gateway_fee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-white pt-1 border-t border-white/5">
                      <span>You receive</span><span className="text-emerald-400">₹{quote.net_amount.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button type="button" onClick={() => setShowWithdrawModal(false)}
                    className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                  <button type="submit" disabled={withdrawLoading}
                    className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer">
                    {withdrawLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing...</> : "Withdraw Funds"}
                  </button>
                </div>
              </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ TRANSFER TO BANK MODAL ═══ */}
      <AnimatePresence>
        {showTransferModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2"><Building className="w-5 h-5 text-cyan-400" />Transfer to Bank</h3>
              <div className="bg-[#141C30] border border-white/5 rounded-lg p-2.5 flex justify-between items-center text-xs">
                <span className="text-gray-400">Available Balance</span>
                <span className="font-bold text-cyan-400">₹{parseFloat(wallet?.available_balance || 0).toFixed(2)}</span>
              </div>
              {bankMethods.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    No bank account linked yet. Add a bank account or net banking method to transfer funds.
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button type="button" onClick={() => setShowTransferModal(false)}
                      className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                    <button type="button"
                      onClick={() => { setShowTransferModal(false); setPayoutForm({ ...BLANK_PAYOUT_FORM, method_type: "BANK_ACCOUNT" }); setShowAddPayoutModal(true); }}
                      className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer">
                      <Plus className="w-3.5 h-3.5" />Add Bank
                    </button>
                  </div>
                </div>
              ) : (
              <form onSubmit={handleTransfer} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Amount (₹)</label>
                  <input type="number" step="0.01" min="1" max={wallet?.available_balance || 0} placeholder="Enter amount" required
                    value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)}
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Target Bank Account</label>
                  <select required value={transferMethodId} onChange={(e) => setTransferMethodId(e.target.value)}
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/30">
                    <option value="" disabled>Select a bank account</option>
                    {bankMethods.map((m) => (
                      <option key={m.payout_method_id} value={m.payout_method_id}>
                        {m.display_name}{m.display_detail ? ` — ${m.display_detail}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {quote && (
                  <div className="bg-[#141C30] border border-white/5 rounded-lg p-2.5 space-y-1.5 text-xs">
                    {quote.platform_fee > 0 && (
                      <div className="flex justify-between text-gray-400">
                        <span>Platform fee</span><span>−₹{quote.platform_fee.toFixed(2)}</span>
                      </div>
                    )}
                    {quote.gateway_fee > 0 && (
                      <div className="flex justify-between text-amber-400/90">
                        <span>Net banking charge</span><span>−₹{quote.gateway_fee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-white pt-1 border-t border-white/5">
                      <span>You receive</span><span className="text-emerald-400">₹{quote.net_amount.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button type="button" onClick={() => setShowTransferModal(false)}
                    className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                  <button type="submit" disabled={transferLoading}
                    className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer">
                    {transferLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing...</> : "Confirm Transfer"}
                  </button>
                </div>
              </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ ADD PAYOUT METHOD MODAL ═══ */}
      <AnimatePresence>
        {showAddPayoutModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />Add Withdrawal Method
              </h3>

              <form onSubmit={handleAddPayoutMethod} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Method type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYOUT_TYPES.map((t) => {
                      const Icon     = t.icon;
                      const selected = payoutForm.method_type === t.value;
                      return (
                        <button key={t.value} type="button"
                          onClick={() => setPayoutForm({ ...payoutForm, method_type: t.value })}
                          className={`p-2.5 rounded-xl border text-[10px] font-bold flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                            selected ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                                     : "bg-[#141C30] border-white/8 text-gray-400 hover:text-white"}`}>
                          <Icon className="w-4 h-4" />{t.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {PAYOUT_TYPES.find((t) => t.value === payoutForm.method_type)?.note}
                  </p>
                </div>

                {payoutForm.method_type === "UPI" ? (
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">UPI ID</label>
                    <input type="text" placeholder="name@okhdfcbank" required
                      value={payoutForm.upi_id} onChange={(e) => setPayoutForm({ ...payoutForm, upi_id: e.target.value })}
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">Account holder name</label>
                      <input type="text" placeholder="As per bank records" required
                        value={payoutForm.account_holder} onChange={(e) => setPayoutForm({ ...payoutForm, account_holder: e.target.value })}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">Bank name</label>
                      <input type="text" placeholder="e.g. HDFC Bank" required
                        value={payoutForm.bank_name} onChange={(e) => setPayoutForm({ ...payoutForm, bank_name: e.target.value })}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">Account number</label>
                      <input type="text" inputMode="numeric" placeholder="9–18 digits" required
                        value={payoutForm.account_number} onChange={(e) => setPayoutForm({ ...payoutForm, account_number: e.target.value.replace(/\D/g, "") })}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">IFSC code</label>
                      <input type="text" placeholder="HDFC0001234" required
                        value={payoutForm.ifsc} onChange={(e) => setPayoutForm({ ...payoutForm, ifsc: e.target.value.toUpperCase() })}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Nickname <span className="text-gray-600">(optional)</span></label>
                  <input type="text" placeholder="e.g. Salary account"
                    value={payoutForm.label} onChange={(e) => setPayoutForm({ ...payoutForm, label: e.target.value })}
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddPayoutModal(false)}
                    className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                  <button type="submit" disabled={payoutSaving}
                    className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer">
                    {payoutSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving...</> : "Save Method"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
















// import { useState, useEffect, useCallback } from "react";
// import { motion, AnimatePresence } from "motion/react";
// import {
//   User, Bell, Shield, CreditCard, Check, Camera, ChevronRight,
//   Lock, Eye, EyeOff, AlertTriangle, LogOut, Upload, Trash2,
//   Key, Wallet, Building, Smartphone, Plus, ArrowUpRight, ArrowDownLeft,
//   PlusCircle, AlertCircle, CheckCircle, X, Loader2,
// } from "lucide-react";
// import { useNavigate } from "react-router";
// import { useAuth } from "../../context/AuthContext";

// const API_BASE     = "http://127.0.0.1:5050/v1";
// const RAZORPAY_KEY = import.meta.env?.VITE_RAZORPAY_KEY_ID || "rzp_test_SzxHpcvfJEeIhH";

// const getToken = () => localStorage.getItem("access_token");
// const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });
// const jsonHdr  = () => ({ ...authHdr(), "Content-Type": "application/json" });

// const DOC_TYPES = [
//   { value: "PASSPORT",        label: "Passport" },
//   { value: "NATIONAL_ID",     label: "National ID Card" },
//   { value: "DRIVERS_LICENSE", label: "Driver's License" },
// ];

// const tabs = [
//   { id: "profile",  label: "Profile",          icon: User },
//   { id: "notifs",   label: "Notifications",    icon: Bell },
//   { id: "security", label: "Security",         icon: Shield },
//   { id: "billing",  label: "Billing",          icon: CreditCard },
//   { id: "wallet",   label: "Wallet",           icon: Wallet },
//   { id: "kyc",      label: "KYC Verification", icon: Shield },
// ];


// const currSym = () => "₹";

// const KycInput = ({ label, field, type = "text", placeholder = "", value, onChange }) => (
//   <div>
//     <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
//     <input type={type} value={value}
//       onChange={(e) => onChange(field, e.target.value)}
//       placeholder={placeholder}
//       className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 transition-colors" />
//   </div>
// );

// /* ── Toast ── */
// function Toast({ msg, ok, onClose }) {
//   useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
//   return (
//     <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
//       className={`fixed top-24 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium ${
//         ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
//            : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
//       {ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
//       {msg}
//       <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
//     </motion.div>
//   );
// }


// function loadRazorpay() {
//   return new Promise((resolve) => {
//     if (window.Razorpay) { resolve(true); return; }
//     const s   = document.createElement("script");
//     s.src     = "https://checkout.razorpay.com/v1/checkout.js";
//     s.async   = true;
//     s.onload  = () => resolve(true);
//     s.onerror = () => resolve(false);
//     document.body.appendChild(s);
//   });
// }

// export function UserSettings() {
//   const navigate = useNavigate();
//   const { logout } = useAuth();

//   const [active,  setActive]  = useState("profile");
//   const [loading, setLoading] = useState(false);
//   const [toast,   setToast]   = useState(null);
//   const [showPw,  setShowPw]  = useState(false);

//   const showToast = (msg, ok = true) => setToast({ msg, ok });

//   /* ── Profile ── */
//   const [profile, setProfile] = useState({
//     first_name: "", last_name: "", email: "",
//     phone: "", bio: "", location: "",
//   });

//   /* ── Notifications ── */
//   const [notifPrefs, setNotifPrefs] = useState({
//     price_alerts: true, portfolio_updates: true, news_digest: false,
//     trade_confirmations: true, weekly_report: true, market_open: true,
//   });

//   /* ── Security ── */
//   const [securityProfile, setSecurityProfile] = useState(null);
//   const [sessions,        setSessions]        = useState([]);
//   const [whitelistIp,     setWhitelistIp]     = useState("");
//   const [twoFAEnabled,    setTwoFAEnabled]    = useState(false);
//   const [setupTotp,       setSetupTotp]       = useState(null);
//   const [totpCode,        setTotpCode]        = useState("");
//   const [showTotpModal,   setShowTotpModal]   = useState(false);
//   const [sessionTimeout,  setSessionTimeout]  = useState(3600);
//   const [passwordForm,    setPasswordForm]    = useState({
//     current_password: "", new_password: "", confirm_password: "",
//   });

//   /* ── Billing ── */
//   const [plans,          setPlans]          = useState([]);
//   const [mySub,          setMySub]          = useState(null);
//   const [billingHistory, setBillingHistory] = useState([]);

//   /* ── KYC ── */
//   const [kycData,       setKycData]       = useState(null);
//   const [kycStatus,     setKycStatus]     = useState("NOT_STARTED");
//   const [submittingKyc, setSubmittingKyc] = useState(false);
//   const [kycError,      setKycError]      = useState("");
//   const [kycForm, setKycForm] = useState({
//     legal_first_name: "", legal_last_name: "", date_of_birth: "",
//     nationality: "", country_of_residence: "", tax_id: "",
//     id_document_type: "PASSPORT", id_document_number: "",
//     id_document_expiry: "", id_document_front_url: "",
//     id_document_back_url: "", selfie_url: "",
//     address_document_type: "UTILITY_BILL", address_document_url: "",
//   });

//   /* ── Wallet ── */
//   const [wallet,             setWallet]             = useState(null);
//   const [walletTransactions, setWalletTransactions] = useState([]);

//   /* Add Money — Razorpay flow */
//   const [showAddMoneyModal, setShowAddMoneyModal] = useState(false);
//   const [addAmount,         setAddAmount]         = useState("");
//   const [addLoading,        setAddLoading]        = useState(false);
//   const [addStep,           setAddStep]           = useState("form"); // form | processing | success

//   /* Withdraw / Transfer */
//   const [showWithdrawModal,  setShowWithdrawModal]  = useState(false);
//   const [withdrawAmount,     setWithdrawAmount]     = useState("");
//   const [withdrawLoading,    setWithdrawLoading]    = useState(false);
//   const [showTransferModal,  setShowTransferModal]  = useState(false);
//   const [transferAmount,     setTransferAmount]     = useState("");
//   const [transferLoading,    setTransferLoading]    = useState(false);

//   /* Subscribe via Razorpay — payment step */
//   const [subPayingPlanId, setSubPayingPlanId] = useState(null); // which plan is mid-payment

//   const linkedMethods = [
//     { id: "bank", type: "Bank Account", name: "HDFC Bank Savings A/C" },
//     { id: "upi",  type: "UPI ID",       name: "john@okhdfcbank" },
//     { id: "card", type: "Card",         name: "Visa Debit **** 4444" },
//   ];

//   /* ════════════════════════════════════════════════════
//      DATA LOADERS
//   ════════════════════════════════════════════════════ */

//   /*
//    FIX — Profile fields were blank because:
//    1. `email` lives on Users table, NOT UserProfiles.  → fetch /authentication/me
//    2. `phone_number` is the column name in UserProfiles (not `phone`).
//    3. `country`  is the column name in UserProfiles (not `location`).
//   */
//   const fetchProfile = useCallback(async () => {
//     try {
//       const [profRes, meRes] = await Promise.all([
//         fetch(`${API_BASE}/user_profiles/me`, { headers: authHdr() }),
//         fetch(`${API_BASE}/authentication/me`, { headers: authHdr() }),
//       ]);
//       const [profData, meData] = await Promise.all([profRes.json(), meRes.json()]);

//       let merged = { first_name: "", last_name: "", email: "", phone: "", bio: "", location: "" };

//       if (meData.bool && meData.response) {
//         merged.email = meData.response.email || "";
//       }
//       if (profData.bool && profData.response) {
//         const r = profData.response;
//         merged.first_name = r.first_name        || "";
//         merged.last_name  = r.last_name         || "";
//         merged.phone      = r.phone_number      || ""; // ← correct column
//         merged.bio        = r.bio               || "";
//         merged.location   = r.country           || r.city || ""; // ← correct column
//       }
//       setProfile(merged);
//     } catch {}
//   }, []);

//   const fetchPreferences = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/notifications/preferences`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) setNotifPrefs(data.response);
//     } catch {}
//   }, []);

//   const fetchSecurityInfo = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/user_security/me`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) {
//         setSecurityProfile(data.response);
//         setTwoFAEnabled(data.response.is_2fa_enabled || data.response.two_factor_enabled || false);
//         setSessionTimeout(data.response.session_timeout || data.response.session_timeout_seconds || 3600);
//       }
//     } catch {}
//   }, []);

//   const fetchSessions = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/user_security/sessions`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) setSessions(data.response?.sessions || (Array.isArray(data.response) ? data.response : []));
//     } catch {}
//   }, []);

//   const fetchPlans = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/subscriptions/plans`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) setPlans(data.response?.plans || (Array.isArray(data.response) ? data.response : []));
//     } catch {}
//   }, []);

//   const fetchSubscription = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/subscriptions/my`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) setMySub(data.response?.subscription || data.response);
//     } catch {}
//   }, []);

//   const fetchBillingHistory = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/subscriptions/billing_history`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) setBillingHistory(
//         data.response?.history || data.response?.transactions || (Array.isArray(data.response) ? data.response : [])
//       );
//     } catch {}
//   }, []);

//   const fetchKycStatus = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/kyc/status`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) {
//         setKycData(data.response);
//         setKycStatus(data.response.kyc_status || data.response.status || "NOT_STARTED");
//       }
//     } catch {}
//   }, []);

//   const fetchWallet = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/wallets/me`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) setWallet(data.response);
//     } catch {}
//   }, []);

//   const fetchWalletTxns = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/wallets/transactions`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) setWalletTransactions(
//         data.response?.transactions || (Array.isArray(data.response) ? data.response : [])
//       );
//     } catch {}
//   }, []);

//   useEffect(() => {
//     const load = async () => {
//       setLoading(true);
//       try {
//         if (active === "profile")  await fetchProfile();
//         if (active === "notifs")   await fetchPreferences();
//         if (active === "security") { await fetchSecurityInfo(); await fetchSessions(); }
//         if (active === "billing")  { await fetchPlans(); await fetchSubscription(); await fetchBillingHistory(); }
//         if (active === "kyc")      await fetchKycStatus();
//         if (active === "wallet")   { await fetchWallet(); await fetchWalletTxns(); }
//       } catch {}
//       setLoading(false);
//     };
//     load();
//   }, [active]);

//   /* ════════════════════════════════════════════════════
//      SAVE HANDLERS
//   ════════════════════════════════════════════════════ */

//   /* FIX: send correct backend field names — phone_number, country */
//   const handleProfileSave = async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/user_profiles/me`, {
//         method: "PUT", headers: jsonHdr(),
//         body: JSON.stringify({
//           first_name:   profile.first_name,
//           last_name:    profile.last_name,
//           phone_number: profile.phone,    // ← correct column: phone_number
//           bio:          profile.bio,
//           country:      profile.location, // ← correct column: country
//         }),
//       });
//       const data = await res.json();
//       if (data.bool) showToast("Profile saved successfully.");
//       else showToast(data.response?.message || "Failed to save.", false);
//     } catch { showToast("Network error.", false); }
//   };

//   const handlePreferencesSave = async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/notifications/preferences`, {
//         method: "PUT", headers: jsonHdr(), body: JSON.stringify(notifPrefs),
//       });
//       const data = await res.json();
//       if (data.bool) showToast("Notification preferences saved.");
//       else showToast(data.response?.message || "Failed.", false);
//     } catch { showToast("Network error.", false); }
//   };

//   const handlePasswordChange = async () => {
//     if (passwordForm.new_password !== passwordForm.confirm_password) {
//       showToast("New passwords do not match.", false); return;
//     }
//     try {
//       const res  = await fetch(`${API_BASE}/authentication/change_password`, {
//         method: "POST", headers: jsonHdr(),
//         body: JSON.stringify({
//           old_password: passwordForm.current_password,
//           new_password: passwordForm.new_password,
//         }),
//       });
//       const data = await res.json();
//       if (data.bool) {
//         showToast("Password changed successfully.");
//         setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
//       } else showToast(data.response?.message || "Failed.", false);
//     } catch { showToast("Network error.", false); }
//   };

//   const handleTimeoutChange = async (e) => {
//     const val = parseInt(e.target.value);
//     setSessionTimeout(val);
//     try {
//       await fetch(`${API_BASE}/user_security/session_timeout`, {
//         method: "PUT", headers: jsonHdr(),
//         body: JSON.stringify({ session_timeout_seconds: val }),
//       });
//     } catch {}
//   };

//   const handleAddIp = async () => {
//     if (!whitelistIp) return;
//     try {
//       await fetch(`${API_BASE}/user_security/ip_whitelist/add`, {
//         method: "POST", headers: jsonHdr(), body: JSON.stringify({ ip_address: whitelistIp }),
//       });
//       setSecurityProfile(prev => ({ ...prev, ip_whitelist: [...(prev?.ip_whitelist || []), whitelistIp] }));
//       setWhitelistIp("");
//     } catch {}
//   };

//   const handleRemoveIp = async (ip) => {
//     try {
//       await fetch(`${API_BASE}/user_security/ip_whitelist/remove`, {
//         method: "POST", headers: jsonHdr(), body: JSON.stringify({ ip_address: ip }),
//       });
//       setSecurityProfile(prev => ({ ...prev, ip_whitelist: (prev?.ip_whitelist || []).filter(i => i !== ip) }));
//     } catch {}
//   };

//   const handleRevokeSession = async (sessionId) => {
//     try {
//       await fetch(`${API_BASE}/user_security/sessions/${sessionId}/revoke`, { method: "POST", headers: authHdr() });
//       setSessions(prev => prev.filter(s => (s.session_id || s.id) !== sessionId));
//     } catch {}
//   };

//   const handle2faToggle = async () => {
//     if (twoFAEnabled) {
//       const code = prompt("Enter 6-digit TOTP code to disable 2FA:");
//       if (!code) return;
//       try {
//         await fetch(`${API_BASE}/user_security/2fa/disable`, {
//           method: "POST", headers: jsonHdr(), body: JSON.stringify({ totp_code: code }),
//         });
//         setTwoFAEnabled(false);
//       } catch {}
//     } else {
//       try {
//         const res  = await fetch(`${API_BASE}/user_security/2fa/setup_totp`, { headers: authHdr() });
//         const data = await res.json();
//         if (data.bool && data.response) { setSetupTotp(data.response); setShowTotpModal(true); }
//       } catch {}
//     }
//   };

//   const handleVerify2fa = async () => {
//     if (!totpCode) return;
//     try {
//       await fetch(`${API_BASE}/user_security/2fa/enable`, {
//         method: "POST", headers: jsonHdr(), body: JSON.stringify({ totp_code: totpCode }),
//       });
//       setTwoFAEnabled(true); setShowTotpModal(false); setSetupTotp(null); setTotpCode("");
//     } catch {}
//   };

//   /*
//     FIX — "Choose Plan" previously called POST /subscriptions/subscribe
//     directly with no payment step at all, so the user never saw Razorpay
//     (no bank/UPI/card screen) and just got an immediate "Subscribed
//     successfully" toast.

//     NEW FLOW (mirrors the Wallet "Add Money" Razorpay flow):
//     1. Load Razorpay SDK
//     2. POST /payment/create_order to get a razorpay order_id (falls back
//        to opening Razorpay without an order_id if that route 404s, same
//        as wallet deposits — Razorpay still shows all payment options)
//     3. Open Razorpay checkout with amount = plan's monthly price
//     4. On successful payment → POST /payment/verify (if we have an order_id)
//     5. Only THEN call POST /subscriptions/subscribe to activate the plan
//   */
//   const handleSubscribe = async (planId) => {
//     const plan = plans.find(p => (p.plan_id || p.id) === planId);
//     if (!plan) { showToast("Plan not found.", false); return; }

//     const amount = parseFloat(plan.price_monthly || plan.price || 0);

//     /* Free plan — no payment needed, subscribe directly */
//     if (!amount || amount <= 0) {
//       try {
//         const res  = await fetch(`${API_BASE}/subscriptions/subscribe`, {
//           method: "POST", headers: jsonHdr(),
//           body: JSON.stringify({ plan_id: planId, billing_cycle: "MONTHLY" }),
//         });
//         const data = await res.json();
//         if (data.bool) { await fetchSubscription(); showToast("Subscribed successfully!"); }
//         else showToast(data.response?.message || "Subscription failed.", false);
//       } catch { showToast("Network error.", false); }
//       return;
//     }

//     setSubPayingPlanId(planId);

//     try {
//       /* Step 1: Load Razorpay SDK */
//       const rzpLoaded = await loadRazorpay();
//       if (!rzpLoaded) {
//         showToast("Failed to load Razorpay. Check your internet connection.", false);
//         setSubPayingPlanId(null); return;
//       }

//       /* Step 2: Try to create a server-side order (optional, improves security) */
//       let rzpOrderId = null;
//       let rzpKeyId   = RAZORPAY_KEY;

//       try {
//         const orderRes = await fetch(`${API_BASE}/payment/create_order`, {
//           method:  "POST",
//           headers: jsonHdr(),
//           body:    JSON.stringify({
//             amount:   Math.round(amount * 100), // paise
//             currency: "INR",
//             purpose:  "SUBSCRIPTION",
//             plan_id:  planId,
//           }),
//         });
//         if (orderRes.ok) {
//           const orderData = await orderRes.json();
//           if (orderData.bool && orderData.response?.order_id) {
//             rzpOrderId = orderData.response.order_id || orderData.response.razorpay_order_id;
//             rzpKeyId   = orderData.response.key_id   || RAZORPAY_KEY;
//           }
//         }
//         /* 404/any error → continue without order_id; Razorpay still shows
//            Bank Transfer, UPI, and Card options regardless */
//       } catch { /* network error creating order — continue without order_id */ }

//       /* Step 3: Open Razorpay checkout */
//       const rzpOptions = {
//         key:         rzpKeyId,
//         amount:      Math.round(amount * 100),
//         currency:    "INR",
//         name:        "TradeFlow",
//         description: `${plan.plan_name || plan.name} Plan — Monthly Subscription`,
//         prefill: {
//           name:  `${profile.first_name} ${profile.last_name}`.trim() || "Investor",
//           email: profile.email || "",
//         },
//         theme: { color: "#06B6D4" },
//         ...(rzpOrderId ? { order_id: rzpOrderId } : {}),

//         handler: async (rzpResponse) => {
//           try {
//             /* Step 4: Verify signature if we have an order_id */
//             if (rzpOrderId) {
//               const verifyRes  = await fetch(`${API_BASE}/payment/verify`, {
//                 method:  "POST",
//                 headers: jsonHdr(),
//                 body:    JSON.stringify({
//                   razorpay_order_id:   rzpResponse.razorpay_order_id,
//                   razorpay_payment_id: rzpResponse.razorpay_payment_id,
//                   razorpay_signature:  rzpResponse.razorpay_signature,
//                   purpose:             "SUBSCRIPTION",
//                   amount:              amount,
//                   plan_id:             planId,
//                 }),
//               });
//               const verifyData = await verifyRes.json();
//               if (!verifyData.bool) {
//                 showToast("Payment verification failed. Contact support.", false);
//                 setSubPayingPlanId(null); return;
//               }
//             }

//             /* Step 5: Activate the subscription only after payment succeeds */
//             const subRes  = await fetch(`${API_BASE}/subscriptions/subscribe`, {
//               method: "POST", headers: jsonHdr(),
//               body: JSON.stringify({
//                 plan_id:                planId,
//                 billing_cycle:          "MONTHLY",
//                 payment_method:         "RAZORPAY",
//                 gateway_transaction_id: rzpResponse.razorpay_payment_id,
//                 ...(rzpOrderId ? { gateway_order_id: rzpResponse.razorpay_order_id } : {}),
//               }),
//             });
//             const subData = await subRes.json();
//             if (subData.bool) {
//               await fetchSubscription();
//               await fetchBillingHistory();
//               showToast(`Payment successful — subscribed to ${plan.plan_name || plan.name}!`);
//             } else {
//               showToast(subData.response?.message || "Payment succeeded but subscription failed. Contact support.", false);
//             }
//           } catch {
//             showToast("Network error finalizing subscription.", false);
//           } finally {
//             setSubPayingPlanId(null);
//           }
//         },

//         modal: {
//           ondismiss: () => { setSubPayingPlanId(null); },
//         },
//       };

//       const rzp = new window.Razorpay(rzpOptions);
//       rzp.on("payment.failed", (resp) => {
//         showToast(`Payment failed: ${resp.error?.description || "Unknown error"}`, false);
//         setSubPayingPlanId(null);
//       });
//       rzp.open();

//     } catch {
//       showToast("Something went wrong. Please try again.", false);
//       setSubPayingPlanId(null);
//     }
//   };

//   const handleCancelSub = async () => {
//     if (!window.confirm("Cancel subscription?")) return;
//     try {
//       const res  = await fetch(`${API_BASE}/subscriptions/cancel`, { method: "POST", headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) { await fetchSubscription(); showToast("Subscription cancelled."); }
//     } catch {}
//   };

//   /* KYC submit — JSON body (backend submit_parser location='json') */
//   const handleKycSubmit = async (e) => {
//     e.preventDefault();
//     setKycError("");
//     const required = ["legal_first_name","legal_last_name","date_of_birth",
//                       "id_document_type","id_document_number","id_document_front_url"];
//     for (const f of required) {
//       if (!kycForm[f]?.trim()) { setKycError(`Please fill in: ${f.replace(/_/g," ")}`); return; }
//     }
//     setSubmittingKyc(true);
//     try {
//       const payload = {
//         legal_first_name:      kycForm.legal_first_name.trim(),
//         legal_last_name:       kycForm.legal_last_name.trim(),
//         date_of_birth:         kycForm.date_of_birth,
//         id_document_type:      kycForm.id_document_type,
//         id_document_number:    kycForm.id_document_number.trim(),
//         id_document_front_url: kycForm.id_document_front_url.trim(),
//       };
//       if (kycForm.nationality.trim())           payload.nationality           = kycForm.nationality.trim();
//       if (kycForm.country_of_residence.trim())  payload.country_of_residence  = kycForm.country_of_residence.trim();
//       if (kycForm.tax_id.trim())                payload.tax_id                = kycForm.tax_id.trim();
//       if (kycForm.id_document_expiry)           payload.id_document_expiry    = kycForm.id_document_expiry;
//       if (kycForm.id_document_back_url.trim())  payload.id_document_back_url  = kycForm.id_document_back_url.trim();
//       if (kycForm.selfie_url.trim())            payload.selfie_url            = kycForm.selfie_url.trim();
//       if (kycForm.address_document_type)        payload.address_document_type = kycForm.address_document_type;
//       if (kycForm.address_document_url.trim())  payload.address_document_url  = kycForm.address_document_url.trim();

//       const res  = await fetch(`${API_BASE}/kyc/submit`, { method: "POST", headers: jsonHdr(), body: JSON.stringify(payload) });
//       const data = await res.json();
//       if (!data.bool) { setKycError(data.response?.message || "KYC submission failed."); return; }
//       setKycStatus("PENDING");
//       await fetchKycStatus();
//       showToast("KYC submitted! Under review.");
//     } catch { setKycError("Network error. Please try again."); }
//     finally { setSubmittingKyc(false); }
//   };

//   /* ════════════════════════════════════════════════════
//      ADD MONEY via Razorpay
//      ────────────────────────────────────────────────────
//      FIX — Root cause of 404 on OPTIONS /payment/create_order:
     
//      The existing payment/routes.py requires `stock_id` and `quantity`
//      (it was designed for trade order payment, not wallet deposits).
//      For wallet deposits we only need `amount` + `purpose`.
     
//      SOLUTION:
//      1. Send a simplified body: { amount, currency, purpose }
//         to POST /payment/create_order
//      2. The backend wallet deposit endpoint (/wallets/deposit) is called
//         ONLY after Razorpay confirms payment via the verify endpoint.
//      3. The verify endpoint at /payment/verify handles signature check
//         then credits the wallet.
     
//      If the backend payment/create_order still returns 404 (route not
//      registered in Flask app factory), we fall back to a direct deposit
//      with a mock transaction ID — this lets the UI work while the
//      backend route is being wired up.
//   ════════════════════════════════════════════════════ */
//   const handleAddMoney = async (e) => {
//     e.preventDefault();
//     const amount = parseFloat(addAmount);
//     if (isNaN(amount) || amount < 1) {
//       showToast("Enter a valid amount (min ₹1)", false); return;
//     }

//     setAddLoading(true);
//     setAddStep("processing");

//     try {
//       /* Step 1: Load Razorpay JS — required before calling new window.Razorpay() */
//       const rzpLoaded = await loadRazorpay();
//       if (!rzpLoaded) {
//         showToast("Failed to load Razorpay. Check your internet connection.", false);
//         setAddStep("form"); setAddLoading(false); return;
//       }

//       /* Step 2: Create Razorpay order on backend
//          Send minimal body — no stock_id/quantity needed for wallet deposits */
//       let rzpOrderId  = null;
//       let rzpKeyId    = RAZORPAY_KEY;
//       let useFallback = false;

//       try {
//         const orderRes  = await fetch(`${API_BASE}/payment/create_order`, {
//           method:  "POST",
//           headers: jsonHdr(),               /* ← NO credentials:'include' — avoids CORS preflight 404 */
//           body:    JSON.stringify({
//             amount:   Math.round(amount * 100), // paise
//             currency: "INR",
//             purpose:  "WALLET_DEPOSIT",
//           }),
//         });

//         if (orderRes.status === 404) {
//           /* Route not yet registered in Flask — use direct deposit fallback */
//           useFallback = true;
//         } else {
//           const orderData = await orderRes.json();
//           if (!orderData.bool) {
//             showToast(orderData.response?.message || "Failed to create payment order.", false);
//             setAddStep("form"); setAddLoading(false); return;
//           }
//           rzpOrderId = orderData.response?.order_id || orderData.response?.razorpay_order_id;
//           rzpKeyId   = orderData.response?.key_id   || RAZORPAY_KEY;
//         }
//       } catch {
//         /* Network error creating order — fall back to direct deposit */
//         useFallback = true;
//       }

//       if (useFallback) {
//         /* ─── FALLBACK: direct /wallets/deposit (for dev / when payment route is 404) ─── */
//         const depositRes  = await fetch(`${API_BASE}/wallets/deposit`, {
//           method:  "POST",
//           headers: jsonHdr(),
//           body:    JSON.stringify({
//             amount:         amount,
//             payment_method: "BANK_TRANSFER",
//             notes:          "Direct deposit (payment gateway not configured)",
//           }),
//         });
//         const depositData = await depositRes.json();
//         if (depositData.bool) {
//           setAddStep("success");
//           await fetchWallet();
//           await fetchWalletTxns();
//         } else {
//           showToast(depositData.response?.message || "Deposit failed.", false);
//           setAddStep("form");
//         }
//         setAddLoading(false);
//         return;
//       }

//       /* Step 3: Open Razorpay checkout */
//       const options = {
//         key:         rzpKeyId,
//         amount:      Math.round(amount * 100),
//         currency:    "INR",
//         name:        "TradeFlow",
//         description: `Wallet Deposit — ₹${amount.toFixed(2)}`,
//         order_id:    rzpOrderId,
//         prefill: {
//           email: profile.email || "",
//           name:  `${profile.first_name} ${profile.last_name}`.trim() || "Investor",
//         },
//         theme: { color: "#06B6D4" },

//         handler: async (rzpResponse) => {
//           /* Step 4a: Verify signature */
//           try {
//             const verifyRes  = await fetch(`${API_BASE}/payment/verify`, {
//               method:  "POST",
//               headers: jsonHdr(),
//               body:    JSON.stringify({
//                 razorpay_order_id:   rzpResponse.razorpay_order_id,
//                 razorpay_payment_id: rzpResponse.razorpay_payment_id,
//                 razorpay_signature:  rzpResponse.razorpay_signature,
//                 purpose:             "WALLET_DEPOSIT",
//                 amount:              amount,
//               }),
//             });
//             const verifyData = await verifyRes.json();

//             if (!verifyData.bool) {
//               showToast("Payment verification failed. Contact support.", false);
//               setAddStep("form"); setAddLoading(false); return;
//             }

//             /* Step 4b: Credit wallet after verified */
//             const depositRes  = await fetch(`${API_BASE}/wallets/deposit`, {
//               method:  "POST",
//               headers: jsonHdr(),
//               body:    JSON.stringify({
//                 amount:              amount,
//                 payment_method:      "RAZORPAY",
//                 razorpay_payment_id: rzpResponse.razorpay_payment_id,
//                 razorpay_order_id:   rzpResponse.razorpay_order_id,
//                 notes:               `Razorpay — ${rzpResponse.razorpay_payment_id}`,
//               }),
//             });
//             const depositData = await depositRes.json();

//             if (depositData.bool) {
//               setAddStep("success");
//               await fetchWallet();
//               await fetchWalletTxns();
//             } else {
//               showToast(depositData.response?.message || "Deposit record failed.", false);
//               setAddStep("form");
//             }
//           } catch {
//             showToast("Network error during verification.", false);
//             setAddStep("form");
//           } finally {
//             setAddLoading(false);
//           }
//         },

//         modal: {
//           ondismiss: () => {
//             setAddStep("form");
//             setAddLoading(false);
//           },
//         },
//       };

//       const rzp = new window.Razorpay(options);
//       rzp.on("payment.failed", (resp) => {
//         showToast(`Payment failed: ${resp.error?.description || "Unknown error"}`, false);
//         setAddStep("form");
//         setAddLoading(false);
//       });
//       rzp.open();

//     } catch (err) {
//       showToast("Something went wrong. Please try again.", false);
//       setAddStep("form");
//       setAddLoading(false);
//     }
//   };

//   const handleWithdraw = async (e) => {
//     e.preventDefault();
//     const amount = parseFloat(withdrawAmount);
//     if (isNaN(amount) || amount <= 0) { showToast("Enter a valid amount.", false); return; }
//     setWithdrawLoading(true);
//     try {
//       const res  = await fetch(`${API_BASE}/wallets/withdraw`, {
//         method: "POST", headers: jsonHdr(),
//         body: JSON.stringify({ amount, payment_method: "BANK_TRANSFER" }),
//       });
//       const data = await res.json();
//       if (data.bool) {
//         await fetchWallet(); await fetchWalletTxns();
//         setShowWithdrawModal(false); setWithdrawAmount("");
//         showToast(`₹${amount.toFixed(2)} withdrawal initiated.`);
//       } else showToast(data.response?.message || "Withdrawal failed.", false);
//     } catch { showToast("Network error.", false); }
//     finally { setWithdrawLoading(false); }
//   };

//   const handleTransfer = async (e) => {
//     e.preventDefault();
//     const amount = parseFloat(transferAmount);
//     if (isNaN(amount) || amount <= 0) { showToast("Enter a valid amount.", false); return; }
//     setTransferLoading(true);
//     try {
//       const res  = await fetch(`${API_BASE}/wallets/withdraw`, {
//         method: "POST", headers: jsonHdr(),
//         body: JSON.stringify({ amount, payment_method: "BANK_TRANSFER" }),
//       });
//       const data = await res.json();
//       if (data.bool) {
//         await fetchWallet(); await fetchWalletTxns();
//         setShowTransferModal(false); setTransferAmount("");
//         showToast(`₹${amount.toFixed(2)} transferred to bank.`);
//       } else showToast(data.response?.message || "Transfer failed.", false);
//     } catch { showToast("Network error.", false); }
//     finally { setTransferLoading(false); }
//   };

//   /* ── UI helpers ── */
//   const Toggle = ({ v, onToggle }) => (
//     <button onClick={onToggle}
//       className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${v ? "bg-cyan-500" : "bg-white/10"}`}>
//       <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${v ? "translate-x-6" : "translate-x-1"}`} />
//     </button>
//   );

//   /* Stable callback passed to module-scope KycInput — keeps input identity fixed */
//   const handleKycFieldChange = (field, value) => setKycForm(p => ({ ...p, [field]: value }));

//   const fmtTxAmt = (tx) => {
//     const type   = (tx.transaction_type || "").toUpperCase();
//     const credit = type === "DEPOSIT" || type === "REFUND" || type === "CREDIT";
//     return (
//       <span className={`text-sm font-bold ${credit ? "text-emerald-400" : "text-red-400"}`}>
//         {credit ? "+" : "-"}₹{parseFloat(tx.amount || tx.net_amount || 0).toFixed(2)}
//       </span>
//     );
//   };

//   /* ════════════════════════════════════════════════════
//      RENDER
//   ════════════════════════════════════════════════════ */
//   return (
//     <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">
//       <AnimatePresence>
//         {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
//       </AnimatePresence>

//       <div>
//         <h1 className="text-xl font-bold text-white">Settings</h1>
//         <p className="text-sm text-gray-500 mt-0.5">Manage your account preferences, configurations and subscription tiers.</p>
//       </div>

//       <div className="flex flex-col lg:flex-row gap-5">

//         {/* ── Sidebar ── */}
//         <div className="lg:w-48 flex-shrink-0">
//           <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//             {tabs.map((t) => (
//               <button key={t.id} onClick={() => setActive(t.id)}
//                 className={`w-full flex items-center gap-3 px-4 py-3 text-sm border-b border-white/5 last:border-0 transition-all cursor-pointer ${active === t.id ? "bg-cyan-500/8 text-cyan-300 font-medium" : "text-gray-500 hover:text-white hover:bg-white/5"}`}>
//                 <t.icon className={`w-4 h-4 ${active === t.id ? "text-cyan-400" : "text-gray-600"}`} />
//                 {t.label}
//                 {active === t.id && <ChevronRight className="w-3.5 h-3.5 ml-auto text-cyan-400" />}
//               </button>
//             ))}
//             <button onClick={() => { logout(); navigate("/"); }}
//               className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/5 transition-all cursor-pointer">
//               <Key className="w-4 h-4" /> Sign Out
//             </button>
//           </div>
//         </div>

//         {/* ── Content ── */}
//         <div className="flex-1 space-y-4 min-w-0">
//           {loading ? (
//             <div className="p-16 bg-[#0C1220] border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3">
//               <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
//               <span className="text-xs text-gray-600">Retrieving details...</span>
//             </div>
//           ) : (
//             <>
//               {/* ─── PROFILE ─── */}
//               {active === "profile" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-5">Profile Information</div>
//                     <div className="flex items-center gap-4 mb-5">
//                       <div className="relative">
//                         <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xl font-bold text-white shadow-lg">
//                           {((profile.first_name || "U").slice(0,1) + (profile.last_name || "").slice(0,1)).toUpperCase() || "U"}
//                         </div>
//                         <button className="absolute -bottom-1 -right-1 w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center cursor-pointer border border-[#0C1220]">
//                           <Camera className="w-3 h-3 text-white" />
//                         </button>
//                       </div>
//                       <div>
//                         <div className="text-sm font-medium text-white">{profile.first_name} {profile.last_name}</div>
//                         <div className="text-xs text-gray-500 mb-1">{profile.email}</div>
//                         <span className="px-2.5 py-0.5 bg-cyan-500/10 border border-cyan-500/15 rounded-full text-[10px] text-cyan-400 font-medium">
//                           {mySub?.plan?.plan_name || mySub?.plan_name || "Free"} Member
//                         </span>
//                       </div>
//                     </div>
//                     <div className="grid sm:grid-cols-2 gap-4">
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">First Name</label>
//                         <input type="text" value={profile.first_name}
//                           onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30" />
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Last Name</label>
//                         <input type="text" value={profile.last_name}
//                           onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30" />
//                       </div>
//                       <div>
//                         {/* Email read-only — lives on Users table, not UserProfiles */}
//                         <label className="text-xs text-gray-500 mb-1.5 block">Email Address</label>
//                         <input type="email" value={profile.email} readOnly
//                           className="w-full bg-[#141C30]/50 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed" />
//                         <p className="text-[10px] text-gray-700 mt-1">Email cannot be changed here</p>
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Phone Number</label>
//                         <input type="tel" value={profile.phone}
//                           onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
//                           placeholder="+91 9876543210"
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30" />
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Country</label>
//                         <input type="text" value={profile.location}
//                           onChange={(e) => setProfile({ ...profile, location: e.target.value })}
//                           placeholder="India"
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30" />
//                       </div>
//                       <div className="sm:col-span-2">
//                         <label className="text-xs text-gray-500 mb-1.5 block">Bio</label>
//                         <textarea value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30 resize-none" />
//                       </div>
//                     </div>
//                   </div>
//                   <button onClick={handleProfileSave}
//                     className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 cursor-pointer">
//                     Save Changes
//                   </button>
//                 </motion.div>
//               )}

//               {/* ─── NOTIFICATIONS ─── */}
//               {active === "notifs" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//                     <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">Notification Preferences</div>
//                     {Object.entries(notifPrefs).map(([key, value]) => (
//                       <div key={key} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
//                         <div className="text-sm text-white capitalize">{key.replace(/_/g, " ")}</div>
//                         <Toggle v={value} onToggle={() => setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }))} />
//                       </div>
//                     ))}
//                   </div>
//                   <button onClick={handlePreferencesSave}
//                     className="mt-4 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 cursor-pointer">
//                     Save Preferences
//                   </button>
//                 </motion.div>
//               )}

//               {/* ─── SECURITY ─── */}
//               {active === "security" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-4">Change Password</div>
//                     <div className="space-y-3 max-w-sm">
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Current Password</label>
//                         <div className="relative">
//                           <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
//                           <input type={showPw ? "text" : "password"} value={passwordForm.current_password}
//                             onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-10 py-2.5 text-sm text-gray-200 focus:outline-none" />
//                           <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">
//                             {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
//                           </button>
//                         </div>
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">New Password</label>
//                         <input type="password" value={passwordForm.new_password}
//                           onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none" />
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Confirm Password</label>
//                         <input type="password" value={passwordForm.confirm_password}
//                           onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none" />
//                       </div>
//                       <button onClick={handlePasswordChange}
//                         className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium cursor-pointer">
//                         Update Password
//                       </button>
//                     </div>
//                   </div>

//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="flex items-center justify-between">
//                       <div>
//                         <div className="text-sm font-medium text-white flex items-center gap-1.5"><Key className="w-4 h-4 text-cyan-400" />Two-Factor Authentication</div>
//                         <p className="text-xs text-gray-500 mt-1">{twoFAEnabled ? "2FA is active." : "Enable via Google Authenticator."}</p>
//                       </div>
//                       <Toggle v={twoFAEnabled} onToggle={handle2faToggle} />
//                     </div>
//                   </div>

//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-2">Session Timeout</div>
//                     <select value={sessionTimeout} onChange={handleTimeoutChange}
//                       className="bg-[#141C30] text-sm text-gray-200 border border-white/8 rounded-xl px-3 py-2.5">
//                       <option value={900}>15 Minutes</option>
//                       <option value={1800}>30 Minutes</option>
//                       <option value={3600}>1 Hour</option>
//                       <option value={14400}>4 Hours</option>
//                     </select>
//                   </div>

//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-2">IP Address Whitelist</div>
//                     <div className="flex gap-2 max-w-sm mb-4">
//                       <input type="text" placeholder="e.g. 192.168.1.1" value={whitelistIp} onChange={(e) => setWhitelistIp(e.target.value)}
//                         className="flex-1 bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-white" />
//                       <button onClick={handleAddIp} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-semibold cursor-pointer">Add</button>
//                     </div>
//                     {(securityProfile?.ip_whitelist || []).map((ip, i) => (
//                       <div key={i} className="flex items-center justify-between p-2.5 bg-[#141C30] border border-white/5 rounded-xl mb-2">
//                         <span className="text-xs font-mono text-gray-300">{ip}</span>
//                         <button onClick={() => handleRemoveIp(ip)} className="p-1 text-red-400/70 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
//                       </div>
//                     ))}
//                   </div>

//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-3">Active Sessions</div>
//                     {sessions.length === 0 ? (
//                       <p className="text-xs text-gray-600">No active sessions found.</p>
//                     ) : sessions.map((s, idx) => (
//                       <div key={s.session_id || s.id || idx} className="flex items-center justify-between p-3 bg-[#141C30] border border-white/5 rounded-xl mb-2">
//                         <div>
//                           <div className="text-xs font-bold text-white">{s.device_type || "Unknown Device"}</div>
//                           <div className="text-[10px] text-gray-500">IP: {s.ip_address || "—"}</div>
//                         </div>
//                         {s.is_current ? (
//                           <span className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/25 rounded-md text-[9px] text-emerald-400">Current</span>
//                         ) : (
//                           <button onClick={() => handleRevokeSession(s.session_id || s.id)}
//                             className="px-2.5 py-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg cursor-pointer">Revoke</button>
//                         )}
//                       </div>
//                     ))}
//                   </div>
//                 </motion.div>
//               )}

//               {/* ─── BILLING ─── */}
//               {active === "billing" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   <div className="bg-gradient-to-br from-cyan-500/8 to-blue-600/5 border border-cyan-500/15 rounded-2xl p-5">
//                     <div className="flex items-center justify-between">
//                       <div>
//                         <div className="text-xs text-gray-500">Active Plan</div>
//                         <div className="text-2xl font-bold text-white">{mySub?.plan?.plan_name || mySub?.plan_name || "Free"} Plan</div>
//                         <div className="text-sm text-cyan-400 mt-1">{mySub?.amount_paid ? `${currSym()}${mySub.amount_paid}/month` : "Free tier"}</div>
//                       </div>
//                       <span className="px-3 py-1.5 bg-cyan-500/15 border border-cyan-500/25 rounded-xl text-sm text-cyan-400">{mySub?.status || "Active"}</span>
//                     </div>
//                     {mySub?.status === "ACTIVE" && (
//                       <button onClick={handleCancelSub} className="mt-4 px-4 py-2 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel Plan</button>
//                     )}
//                   </div>
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-2">Available Plans</div>
//                     <div className="flex items-start gap-2.5 px-3 py-2.5 mb-4 bg-cyan-500/8 border border-cyan-500/15 rounded-xl text-xs text-cyan-300">
//                       <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
//                       Choosing a paid plan opens Razorpay — pay via Bank Transfer, UPI, or Card.
//                     </div>
//                     <div className="grid md:grid-cols-2 gap-4">
//                       {plans.map((p) => (
//                         <div key={p.plan_id || p.id}
//                           className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${mySub?.plan_id === (p.plan_id || p.id) ? "border-cyan-500/30 bg-cyan-500/5" : "border-white/5 bg-[#141C30]"}`}>
//                           <div>
//                             <div className="text-sm font-bold text-white">{p.plan_name || p.name}</div>
//                             <div className="text-cyan-400 font-bold text-lg mt-1">
//                               {currSym()}{p.price_monthly || p.price}/mo
//                             </div>
//                             <p className="text-xs text-gray-500 mt-1">{p.description || p.tagline}</p>
//                           </div>
//                           <button onClick={() => handleSubscribe(p.plan_id || p.id)}
//                             disabled={mySub?.plan_id === (p.plan_id || p.id) || subPayingPlanId === (p.plan_id || p.id)}
//                             className={`w-full py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${mySub?.plan_id === (p.plan_id || p.id) ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25" : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white"} disabled:opacity-70 disabled:cursor-not-allowed`}>
//                             {subPayingPlanId === (p.plan_id || p.id)
//                               ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Opening Razorpay...</>
//                               : mySub?.plan_id === (p.plan_id || p.id) ? "Current Plan" : "Choose Plan"}
//                           </button>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//                     <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">Billing History</div>
//                     {billingHistory.length === 0 ? (
//                       <div className="py-8 text-center text-xs text-gray-600">No billing history yet</div>
//                     ) : billingHistory.map((b, i) => (
//                       <div key={b.transaction_id || b.id || i} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
//                         <div>
//                           <div className="text-sm text-white font-medium">{b.transaction_type || b.plan_name || "Subscription"}</div>
//                           <div className="text-xs text-gray-600 mt-0.5">{b.created_on ? new Date(b.created_on).toLocaleDateString() : ""}</div>
//                         </div>
//                         <div>
//                           <span className="text-sm text-white font-semibold">₹{parseFloat(b.total_amount || b.amount || 0).toFixed(2)}</span>
//                           <span className="ml-3 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">{b.status || "Paid"}</span>
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 </motion.div>
//               )}

//               {/* ─── WALLET ─── */}
//               {active === "wallet" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   {wallet ? (
//                     <>
//                       <div className="bg-gradient-to-br from-cyan-500/10 to-blue-600/5 border border-cyan-500/15 rounded-2xl p-6">
//                         <div className="text-xs text-gray-400 font-medium tracking-wide mb-1 uppercase">Available Balance</div>
//                         <div className="text-3xl font-black text-white mb-6">
//                           ₹{parseFloat(wallet.available_balance || wallet.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
//                         </div>
//                         <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
//                           <div>
//                             <div className="text-[10px] text-gray-500 font-semibold uppercase">Total Deposited</div>
//                             <div className="text-base font-bold text-gray-200 mt-0.5">
//                               ₹{parseFloat(wallet.total_deposited || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
//                             </div>
//                           </div>
//                           <div>
//                             <div className="text-[10px] text-gray-500 font-semibold uppercase">
//                               Locked Balance
//                               <span className="ml-1 text-gray-700 normal-case font-normal">(in pending orders)</span>
//                             </div>
//                             <div className="text-base font-bold text-cyan-400 mt-0.5">
//                               ₹{parseFloat(wallet.locked_balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
//                             </div>
//                           </div>
//                         </div>
//                         <p className="text-xs text-gray-700 mt-3">
//                           Locked balance is held for pending buy orders and releases once orders are filled or cancelled.
//                         </p>
//                       </div>

//                       <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
//                         <div className="text-xs font-bold text-white uppercase tracking-wider">Quick Actions</div>
//                         <div className="flex flex-wrap gap-2.5">
//                           <button onClick={() => { setAddStep("form"); setAddAmount(""); setShowAddMoneyModal(true); }}
//                             className="py-2 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer">
//                             <PlusCircle className="w-3.5 h-3.5" />Add Money
//                           </button>
//                           <button onClick={() => { setWithdrawAmount(""); setShowWithdrawModal(true); }}
//                             className="py-2 px-4 bg-[#141C30] border border-white/8 rounded-xl text-xs font-bold text-gray-300 flex items-center gap-1.5 cursor-pointer">
//                             <ArrowUpRight className="w-3.5 h-3.5" />Withdraw
//                           </button>
//                           <button onClick={() => { setTransferAmount(""); setShowTransferModal(true); }}
//                             className="py-2 px-4 bg-[#141C30] border border-white/8 rounded-xl text-xs font-bold text-gray-300 flex items-center gap-1.5 cursor-pointer">
//                             <Building className="w-3.5 h-3.5" />Transfer to Bank
//                           </button>
//                         </div>
//                       </div>

//                       <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//                         <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">Recent Wallet Transactions</div>
//                         {walletTransactions.length === 0 ? (
//                           <div className="py-8 text-center text-xs text-gray-600">No wallet transactions yet</div>
//                         ) : walletTransactions.slice(0, 10).map((tx, i) => (
//                           <div key={tx.wallet_txn_id || tx.id || i} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
//                             <div>
//                               <div className="text-sm font-semibold text-white">{tx.description || tx.transaction_type || "Transaction"}</div>
//                               <div className="text-xs text-gray-500 mt-0.5">{(tx.created_on || tx.created_at) ? new Date(tx.created_on || tx.created_at).toLocaleString() : ""}</div>
//                             </div>
//                             {fmtTxAmt(tx)}
//                           </div>
//                         ))}
//                       </div>
//                     </>
//                   ) : (
//                     <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center text-gray-600 text-sm">Wallet data unavailable</div>
//                   )}
//                 </motion.div>
//               )}

//               {/* ─── KYC ─── */}
//               {active === "kyc" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-4">Identity KYC Verification</div>
//                     <div className="p-4 bg-[#141C30] border border-white/5 rounded-xl flex items-center justify-between mb-5">
//                       <div>
//                         <div className="text-xs text-gray-500">KYC Status</div>
//                         <div className="text-base font-bold text-white mt-1">
//                           {kycStatus === "APPROVED"     && "Verified ✅"}
//                           {kycStatus === "PENDING"      && "Under Review ⏳"}
//                           {kycStatus === "UNDER_REVIEW" && "Under Review ⏳"}
//                           {kycStatus === "REJECTED"     && "Rejected ❌"}
//                           {(kycStatus === "NOT_STARTED" || kycStatus === "NOT_SUBMITTED") && "Not Submitted"}
//                         </div>
//                       </div>
//                       <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase ${
//                         kycStatus === "APPROVED"     ? "bg-emerald-500/15 text-emerald-400"
//                         : kycStatus === "PENDING" || kycStatus === "UNDER_REVIEW" ? "bg-amber-500/15 text-amber-400"
//                         : kycStatus === "REJECTED"   ? "bg-red-500/15 text-red-400"
//                         : "bg-gray-500/10 text-gray-500"
//                       }`}>{kycStatus}</span>
//                     </div>

//                     {kycData && kycData.legal_first_name && (
//                       <div className="mb-5 grid sm:grid-cols-2 gap-3">
//                         {[
//                           { label: "Legal Name",    value: `${kycData.legal_first_name} ${kycData.legal_last_name}` },
//                           { label: "Date of Birth", value: kycData.date_of_birth || "—" },
//                           { label: "Nationality",   value: kycData.nationality || "—" },
//                           { label: "Document Type", value: kycData.id_document_type || "—" },
//                           { label: "Submitted",     value: kycData.submitted_at ? new Date(kycData.submitted_at).toLocaleDateString() : "—" },
//                           { label: "Approved At",   value: kycData.approved_at ? new Date(kycData.approved_at).toLocaleDateString() : "—" },
//                         ].map((item, i) => (
//                           <div key={i} className="flex justify-between py-2 border-b border-white/5">
//                             <span className="text-xs text-gray-600">{item.label}</span>
//                             <span className="text-xs text-white font-medium">{item.value}</span>
//                           </div>
//                         ))}
//                         {kycData.rejection_reason && (
//                           <div className="sm:col-span-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
//                             <div className="text-xs text-red-400 font-medium mb-1">Rejection Reason</div>
//                             <div className="text-xs text-red-300">{kycData.rejection_reason}</div>
//                           </div>
//                         )}
//                       </div>
//                     )}

//                     {(kycStatus === "NOT_STARTED" || kycStatus === "NOT_SUBMITTED" || kycStatus === "REJECTED") && (
//                       <form onSubmit={handleKycSubmit} className="space-y-5">
//                         <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
//                           {kycStatus === "REJECTED" ? "Re-submit KYC Documents" : "Submit KYC Documents"}
//                         </div>
//                         {kycError && (
//                           <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
//                             <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {kycError}
//                           </div>
//                         )}
//                         <div>
//                           <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Personal Information</p>
//                           <div className="grid sm:grid-cols-2 gap-3">
//                             <KycInput label="Legal First Name *" field="legal_first_name" placeholder="As on ID" value={kycForm.legal_first_name} onChange={handleKycFieldChange} />
//                             <KycInput label="Legal Last Name *"  field="legal_last_name"  placeholder="As on ID" value={kycForm.legal_last_name} onChange={handleKycFieldChange} />
//                             <KycInput label="Date of Birth *"    field="date_of_birth"    type="date" value={kycForm.date_of_birth} onChange={handleKycFieldChange} />
//                             <KycInput label="Nationality"        field="nationality"       placeholder="e.g. Indian" value={kycForm.nationality} onChange={handleKycFieldChange} />
//                             <KycInput label="Country of Residence" field="country_of_residence" placeholder="e.g. India" value={kycForm.country_of_residence} onChange={handleKycFieldChange} />
//                             <KycInput label="Tax ID (PAN / SSN)" field="tax_id"           placeholder="Optional" value={kycForm.tax_id} onChange={handleKycFieldChange} />
//                           </div>
//                         </div>
//                         <div>
//                           <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Identity Document</p>
//                           <div className="grid sm:grid-cols-2 gap-3">
//                             <div>
//                               <label className="text-xs text-gray-500 mb-1.5 block">Document Type *</label>
//                               <select value={kycForm.id_document_type}
//                                 onChange={(e) => setKycForm(p => ({ ...p, id_document_type: e.target.value }))}
//                                 className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30">
//                                 {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
//                               </select>
//                             </div>
//                             <KycInput label="Document Number *" field="id_document_number" placeholder="e.g. A1234567" value={kycForm.id_document_number} onChange={handleKycFieldChange} />
//                             <KycInput label="Expiry Date" field="id_document_expiry" type="date" value={kycForm.id_document_expiry} onChange={handleKycFieldChange} />
//                           </div>
//                         </div>
//                         <div>
//                           <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Document URLs</p>
//                           <p className="text-xs text-gray-600 mb-3">Upload files to Google Drive / Dropbox and paste the public URL below.</p>
//                           <div className="grid sm:grid-cols-2 gap-3">
//                             <KycInput label="ID Front URL *"  field="id_document_front_url" placeholder="https://..." value={kycForm.id_document_front_url} onChange={handleKycFieldChange} />
//                             <KycInput label="ID Back URL"     field="id_document_back_url"  placeholder="https://..." value={kycForm.id_document_back_url} onChange={handleKycFieldChange} />
//                             <KycInput label="Selfie URL"      field="selfie_url"            placeholder="https://..." value={kycForm.selfie_url} onChange={handleKycFieldChange} />
//                             <div>
//                               <label className="text-xs text-gray-500 mb-1.5 block">Address Proof Type</label>
//                               <select value={kycForm.address_document_type}
//                                 onChange={(e) => setKycForm(p => ({ ...p, address_document_type: e.target.value }))}
//                                 className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30">
//                                 <option value="UTILITY_BILL">Utility Bill</option>
//                                 <option value="BANK_STATEMENT">Bank Statement</option>
//                                 <option value="TAX_DOCUMENT">Tax Document</option>
//                               </select>
//                             </div>
//                             <KycInput label="Address Proof URL" field="address_document_url" placeholder="https://..." value={kycForm.address_document_url} onChange={handleKycFieldChange} />
//                           </div>
//                         </div>
//                         <button type="submit" disabled={submittingKyc}
//                           className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center gap-2 cursor-pointer">
//                           {submittingKyc
//                             ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</>
//                             : <><Upload className="w-4 h-4" />Submit Documents</>
//                           }
//                         </button>
//                       </form>
//                     )}

//                     {(kycStatus === "PENDING" || kycStatus === "UNDER_REVIEW") && (
//                       <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl text-center">
//                         <p className="text-sm text-amber-400 font-medium">Documents are under review.</p>
//                         <p className="text-xs text-gray-500 mt-1">This typically takes 1–3 business days.</p>
//                       </div>
//                     )}
//                     {kycStatus === "APPROVED" && (
//                       <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-xl text-center">
//                         <p className="text-sm text-emerald-400 font-medium">✅ KYC Verified — Identity confirmed.</p>
//                       </div>
//                     )}
//                   </div>
//                 </motion.div>
//               )}
//             </>
//           )}
//         </div>
//       </div>

//       {/* ═══ TOTP Modal ═══ */}
//       <AnimatePresence>
//         {showTotpModal && setupTotp && (
//           <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
//               className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
//               <h3 className="text-base font-bold text-white mb-2">Enable 2FA Protection</h3>

//               {/* FIX: previously there was no explanation of where the 6-digit
//                   code comes from — users had no idea how to proceed. */}
//               <p className="text-xs text-gray-500 mb-4 leading-relaxed">
//                 Install an authenticator app (Google Authenticator, Authy, or Microsoft
//                 Authenticator) on your phone, then {setupTotp.qr_code_url ? "scan the QR code" : "manually add the key"} below.
//                 The app generates a new 6-digit code every 30 seconds — enter that code here to finish setup.
//               </p>

//               {setupTotp.qr_code_url && (
//                 <>
//                   <div className="bg-white p-2.5 rounded-xl w-36 h-36 mx-auto mb-1">
//                     <img src={setupTotp.qr_code_url} alt="2FA QR" className="w-full h-full" />
//                   </div>
//                   <p className="text-[10px] text-gray-600 text-center mb-3">
//                     Open your authenticator app → "Scan QR code" → point your camera here
//                   </p>
//                 </>
//               )}

//               {setupTotp.secret && (
//                 <div className="mt-1 p-3 bg-[#141C30] border border-white/5 rounded-xl">
//                   <div className="text-xs text-gray-500 mb-1 flex items-center justify-between">
//                     <span>{setupTotp.qr_code_url ? "Or enter this key manually:" : "Manual setup key:"}</span>
//                     <button type="button"
//                       onClick={() => { navigator.clipboard?.writeText(setupTotp.secret); showToast("Key copied to clipboard."); }}
//                       className="text-cyan-400 hover:underline cursor-pointer">Copy</button>
//                   </div>
//                   <div className="text-xs font-mono text-cyan-400 break-all">{setupTotp.secret}</div>
//                   <p className="text-[10px] text-gray-700 mt-1.5">
//                     In your authenticator app choose "Enter a setup key" → paste this code → account name "TradeFlow"
//                   </p>
//                 </div>
//               )}

//               <label className="text-xs text-gray-500 mt-4 mb-1.5 block">
//                 Enter the 6-digit code from your authenticator app
//               </label>
//               <input type="text" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g,""))}
//                 placeholder="000000"
//                 className="w-full text-center bg-[#141C30] border border-white/8 rounded-xl py-2.5 text-lg tracking-[0.3em] font-mono text-white focus:outline-none focus:border-cyan-500/30" />
//               <div className="grid grid-cols-2 gap-3 mt-4">
//                 <button onClick={() => setShowTotpModal(false)} className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 cursor-pointer">Cancel</button>
//                 <button onClick={handleVerify2fa} disabled={totpCode.length !== 6}
//                   className="py-2.5 bg-cyan-500 rounded-xl text-xs font-semibold text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
//                   Verify & Enable
//                 </button>
//               </div>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>

//       {/* ═══ ADD MONEY MODAL (Razorpay) ═══ */}
//       <AnimatePresence>
//         {showAddMoneyModal && (
//           <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
//               className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
//               <div className="flex items-center justify-between mb-5">
//                 <h3 className="text-base font-bold text-white flex items-center gap-2">
//                   <ArrowDownLeft className="w-5 h-5 text-emerald-400" />Add Money to Wallet
//                 </h3>
//                 {addStep === "form" && (
//                   <button onClick={() => setShowAddMoneyModal(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
//                 )}
//               </div>

//               {addStep === "form" && (
//                 <form onSubmit={handleAddMoney} className="space-y-4">
//                   <div className="flex items-start gap-2.5 px-3 py-2.5 bg-cyan-500/8 border border-cyan-500/15 rounded-xl text-xs text-cyan-300">
//                     <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
//                     Powered by Razorpay — you'll be redirected to complete payment via bank / UPI / card.
//                   </div>
//                   <div>
//                     <label className="text-xs text-gray-500 mb-1.5 block">Amount (₹)</label>
//                     <input type="number" step="1" min="1" placeholder="Enter amount" required value={addAmount}
//                       onChange={(e) => setAddAmount(e.target.value)}
//                       className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
//                   </div>
//                   <div className="flex gap-2">
//                     {[500, 1000, 5000, 10000].map(n => (
//                       <button key={n} type="button" onClick={() => setAddAmount(String(n))}
//                         className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${
//                           addAmount === String(n)
//                             ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
//                             : "border-white/8 text-gray-600 hover:text-white"
//                         }`}>
//                         ₹{n >= 1000 ? `${n/1000}k` : n}
//                       </button>
//                     ))}
//                   </div>
//                   <div className="grid grid-cols-2 gap-3 pt-2">
//                     <button type="button" onClick={() => setShowAddMoneyModal(false)}
//                       className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
//                     <button type="submit" disabled={addLoading}
//                       className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
//                       {addLoading
//                         ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Opening Payment...</>
//                         : "Pay via Razorpay →"}
//                     </button>
//                   </div>
//                 </form>
//               )}

//               {addStep === "processing" && (
//                 <div className="flex flex-col items-center py-8 gap-4">
//                   <div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
//                   <div className="text-sm text-gray-400 text-center">
//                     Creating payment order…<br />
//                     <span className="text-xs text-gray-600">Razorpay checkout will open shortly.</span>
//                   </div>
//                 </div>
//               )}

//               {addStep === "success" && (
//                 <div className="flex flex-col items-center py-6 gap-4">
//                   <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
//                     <CheckCircle className="w-7 h-7 text-emerald-400" />
//                   </div>
//                   <div className="text-base font-bold text-white">₹{parseFloat(addAmount).toFixed(2)} Added!</div>
//                   <div className="text-xs text-gray-500 text-center">Payment verified and wallet credited.</div>
//                   <div className="text-lg font-bold text-cyan-400">
//                     New Balance: ₹{parseFloat(wallet?.available_balance || wallet?.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
//                   </div>
//                   <button onClick={() => { setShowAddMoneyModal(false); setAddStep("form"); setAddAmount(""); }}
//                     className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90">
//                     Done
//                   </button>
//                 </div>
//               )}
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>

//       {/* ═══ WITHDRAW MODAL ═══ */}
//       <AnimatePresence>
//         {showWithdrawModal && (
//           <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
//               className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
//               <h3 className="text-base font-bold text-white flex items-center gap-2"><ArrowUpRight className="w-5 h-5 text-red-400" />Withdraw Funds</h3>
//               <div className="bg-[#141C30] border border-white/5 rounded-lg p-2.5 flex justify-between text-xs">
//                 <span className="text-gray-400">Available Balance</span>
//                 <span className="font-bold text-cyan-400">₹{parseFloat(wallet?.available_balance || 0).toFixed(2)}</span>
//               </div>
//               <form onSubmit={handleWithdraw} className="space-y-4">
//                 <div>
//                   <label className="text-xs text-gray-500 mb-1.5 block">Amount (₹)</label>
//                   <input type="number" step="0.01" min="1" placeholder="Enter amount" required value={withdrawAmount}
//                     onChange={(e) => setWithdrawAmount(e.target.value)}
//                     className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none" />
//                 </div>
//                 <div>
//                   <label className="text-xs text-gray-500 mb-1.5 block">Withdraw to</label>
//                   <select className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none">
//                     {linkedMethods.map(m => <option key={m.id} value={m.id}>{m.name} ({m.type})</option>)}
//                   </select>
//                 </div>
//                 <div className="grid grid-cols-2 gap-3">
//                   <button type="button" onClick={() => setShowWithdrawModal(false)}
//                     className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
//                   <button type="submit" disabled={withdrawLoading}
//                     className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer">
//                     {withdrawLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing...</> : "Withdraw Funds"}
//                   </button>
//                 </div>
//               </form>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>

//       {/* ═══ TRANSFER MODAL ═══ */}
//       <AnimatePresence>
//         {showTransferModal && (
//           <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
//               className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
//               <h3 className="text-base font-bold text-white flex items-center gap-2"><Building className="w-5 h-5 text-cyan-400" />Transfer to Bank</h3>
//               <div className="bg-[#141C30] border border-white/5 rounded-lg p-2.5 flex justify-between text-xs">
//                 <span className="text-gray-400">Available Balance</span>
//                 <span className="font-bold text-cyan-400">₹{parseFloat(wallet?.available_balance || 0).toFixed(2)}</span>
//               </div>
//               <form onSubmit={handleTransfer} className="space-y-4">
//                 <div>
//                   <label className="text-xs text-gray-500 mb-1.5 block">Amount (₹)</label>
//                   <input type="number" step="0.01" min="1" placeholder="Enter amount" required value={transferAmount}
//                     onChange={(e) => setTransferAmount(e.target.value)}
//                     className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none" />
//                 </div>
//                 <div>
//                   <label className="text-xs text-gray-500 mb-1.5 block">Target Bank Account</label>
//                   <select className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none">
//                     {linkedMethods.filter(m => m.type === "Bank Account").map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
//                   </select>
//                 </div>
//                 <div className="grid grid-cols-2 gap-3">
//                   <button type="button" onClick={() => setShowTransferModal(false)}
//                     className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
//                   <button type="submit" disabled={transferLoading}
//                     className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer">
//                     {transferLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing...</> : "Confirm Transfer"}
//                   </button>
//                 </div>
//               </form>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }
























// import { useState, useEffect, useCallback, useRef } from "react";
// import { motion, AnimatePresence } from "motion/react";
// import {
//   User, Bell, Shield, CreditCard, Check, Camera, ChevronRight,
//   Lock, Eye, EyeOff, AlertTriangle, Upload, Trash2,
//   Key, Wallet, Building, ArrowUpRight, ArrowDownLeft,
//   PlusCircle, AlertCircle, CheckCircle, X, Loader2, ImagePlus,
// } from "lucide-react";
// import { useNavigate } from "react-router";
// import { useAuth } from "../../context/AuthContext";

// const API_BASE     = "http://127.0.0.1:5050/v1";
// const RAZORPAY_KEY = "rzp_test_SzxHpcvfJEeIhH";

// const getToken = () => localStorage.getItem("access_token");
// const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });
// const jsonHdr  = () => ({ ...authHdr(), "Content-Type": "application/json" });

// const DOC_TYPES = [
//   { value: "PASSPORT",        label: "Passport" },
//   { value: "NATIONAL_ID",     label: "National ID Card" },
//   { value: "DRIVERS_LICENSE", label: "Driver's License" },
// ];

// const tabs = [
//   { id: "profile",  label: "Profile",          icon: User },
//   { id: "notifs",   label: "Notifications",    icon: Bell },
//   { id: "security", label: "Security",         icon: Shield },
//   { id: "billing",  label: "Billing",          icon: CreditCard },
//   { id: "wallet",   label: "Wallet",           icon: Wallet },
//   { id: "kyc",      label: "KYC Verification", icon: Shield },
// ];

// /* ── Toast ── */
// function Toast({ msg, ok, onClose }) {
//   useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
//   return (
//     <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
//       className={`fixed top-24 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium ${
//         ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
//            : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
//       {ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
//       {msg}
//       <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
//     </motion.div>
//   );
// }

// /* ── Load Razorpay script ── */
// function loadRazorpay() {
//   return new Promise((resolve) => {
//     if (window.Razorpay) { resolve(true); return; }
//     const s = document.createElement("script");
//     s.src     = "https://checkout.razorpay.com/v1/checkout.js";
//     s.async   = true;
//     s.onload  = () => resolve(true);
//     s.onerror = () => resolve(false);
//     document.body.appendChild(s);
//   });
// }

// /* ── Avatar upload modal ── */
// function AvatarUploadModal({ currentAvatar, displayName, onClose, onSave }) {
//   const [preview,     setPreview]     = useState(currentAvatar || null);
//   const [uploading,   setUploading]   = useState(false);
//   const [uploadError, setUploadError] = useState("");
//   const fileRef = useRef(null);

//   const handleFile = (file) => {
//     if (!file) return;
//     if (!file.type.startsWith("image/")) { setUploadError("Please select an image file (PNG, JPG, WebP)."); return; }
//     if (file.size > 5 * 1024 * 1024)    { setUploadError("Image must be under 5 MB."); return; }
//     setUploadError("");
//     /* Convert to base64 for preview AND for saving via PUT /user_profiles/me */
//     const reader = new FileReader();
//     reader.onload = (e) => setPreview(e.target.result);
//     reader.readAsDataURL(file);
//   };

//   const handleDrop = (e) => {
//     e.preventDefault();
//     const file = e.dataTransfer.files[0];
//     if (file) handleFile(file);
//   };

//   const handleSave = async () => {
//     if (!preview || preview === currentAvatar) { onClose(); return; }
//     setUploading(true);
//     setUploadError("");
//     try {
//       /*
//         Direct approach: save base64 avatar_url via the existing
//         PUT /user_profiles/me endpoint.
//         The backend profile_parser already has:
//           profile_parser.add_argument('avatar_url', type=str, required=False, location='json')
//         so this works without any new backend route.
//       */
//       const res  = await fetch(`${API_BASE}/user_profiles/me`, {
//         method:  "PUT",
//         headers: jsonHdr(),
//         body:    JSON.stringify({ avatar_url: preview }),
//       });

//       if (!res.ok) {
//         const errText = await res.text().catch(() => "");
//         setUploadError(`Server error (${res.status}). Please try again.`);
//         return;
//       }

//       const data = await res.json();
//       if (data.bool) {
//         onSave(preview); /* pass base64 url back to parent */
//       } else {
//         setUploadError(data.response?.message || "Failed to save photo.");
//       }
//     } catch (err) {
//       console.error("Avatar save error:", err);
//       setUploadError("Network error. Please check your connection.");
//     } finally {
//       setUploading(false);
//     }
//   };

//   const initials = ((displayName || "U").slice(0, 2)).toUpperCase();

//   return (
//     <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//       <motion.div
//         initial={{ opacity: 0, scale: 0.95 }}
//         animate={{ opacity: 1, scale: 1 }}
//         exit={{ opacity: 0, scale: 0.95 }}
//         className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-5"
//       >
//         {/* Header */}
//         <div className="flex items-center justify-between">
//           <h3 className="text-base font-bold text-white flex items-center gap-2">
//             <Camera className="w-4 h-4 text-cyan-400" />Update Profile Photo
//           </h3>
//           <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
//             <X className="w-4 h-4" />
//           </button>
//         </div>

//         {/* Preview */}
//         <div className="flex justify-center">
//           <div className="relative w-24 h-24">
//             {preview ? (
//               <img
//                 src={preview}
//                 alt="avatar preview"
//                 className="w-24 h-24 rounded-2xl object-cover border-2 border-cyan-500/30 shadow-lg"
//               />
//             ) : (
//               <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
//                 {initials}
//               </div>
//             )}
//             {/* Clear button — only when a new image is selected */}
//             {preview && preview !== currentAvatar && (
//               <button
//                 onClick={() => {
//                   setPreview(currentAvatar || null);
//                   setUploadError("");
//                   if (fileRef.current) fileRef.current.value = "";
//                 }}
//                 className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-colors shadow-md"
//               >
//                 <X className="w-3 h-3 text-white" />
//               </button>
//             )}
//           </div>
//         </div>

//         {/* Drop zone */}
//         <div
//           onDrop={handleDrop}
//           onDragOver={(e) => e.preventDefault()}
//           onClick={() => fileRef.current?.click()}
//           className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all"
//         >
//           <ImagePlus className="w-8 h-8 text-gray-600 mx-auto mb-2" />
//           <div className="text-sm text-gray-400">Click to browse or drag &amp; drop</div>
//           <div className="text-xs text-gray-700 mt-1">PNG, JPG, WebP · Max 5 MB</div>
//           <input
//             ref={fileRef}
//             type="file"
//             accept="image/png,image/jpeg,image/jpg,image/webp"
//             className="hidden"
//             onChange={(e) => handleFile(e.target.files?.[0])}
//           />
//         </div>

//         {/* Error */}
//         {uploadError && (
//           <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
//             <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{uploadError}
//           </div>
//         )}

//         {/* Actions */}
//         <div className="grid grid-cols-2 gap-3">
//           <button
//             onClick={onClose}
//             className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer transition-colors"
//           >
//             Cancel
//           </button>
//           <button
//             onClick={handleSave}
//             disabled={uploading || !preview || preview === currentAvatar}
//             className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
//           >
//             {uploading
//               ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving...</>
//               : <><Check className="w-3.5 h-3.5" />Save Photo</>}
//           </button>
//         </div>
//       </motion.div>
//     </div>
//   );
// }
// export function UserSettings() {
//   const navigate = useNavigate();
//   const { logout } = useAuth();

//   const [active,  setActive]  = useState("profile");
//   const [loading, setLoading] = useState(false);
//   const [toast,   setToast]   = useState(null);
//   const [showPw,  setShowPw]  = useState(false);

//   const showToast = (msg, ok = true) => setToast({ msg, ok });

//   /* ── Avatar upload modal ── */
//   const [showAvatarModal, setShowAvatarModal] = useState(false);

//   /* ── Profile ── */
//   const [profile, setProfile] = useState({
//     first_name: "", last_name: "", email: "",
//     phone: "", bio: "", location: "", avatar_url: "",
//   });

//   /* ── Notifications ── */
//   const [notifPrefs, setNotifPrefs] = useState({
//     price_alerts: true, portfolio_updates: true, news_digest: false,
//     trade_confirmations: true, weekly_report: true, market_open: true,
//   });

//   /* ── Security ── */
//   const [securityProfile, setSecurityProfile] = useState(null);
//   const [sessions,        setSessions]        = useState([]);
//   const [whitelistIp,     setWhitelistIp]     = useState("");
//   const [twoFAEnabled,    setTwoFAEnabled]    = useState(false);
//   const [setupTotp,       setSetupTotp]       = useState(null);
//   const [totpCode,        setTotpCode]        = useState("");
//   const [showTotpModal,   setShowTotpModal]   = useState(false);
//   const [sessionTimeout,  setSessionTimeout]  = useState(3600);
//   const [passwordForm,    setPasswordForm]    = useState({
//     current_password: "", new_password: "", confirm_password: "",
//   });

//   /* ── Billing ── */
//   const [plans,          setPlans]          = useState([]);
//   const [mySub,          setMySub]          = useState(null);
//   const [billingHistory, setBillingHistory] = useState([]);

//   /* ── KYC ── */
//   const [kycData,       setKycData]       = useState(null);
//   const [kycStatus,     setKycStatus]     = useState("NOT_STARTED");
//   const [submittingKyc, setSubmittingKyc] = useState(false);
//   const [kycError,      setKycError]      = useState("");
//   const [kycForm, setKycForm] = useState({
//     legal_first_name: "", legal_last_name: "", date_of_birth: "",
//     nationality: "", country_of_residence: "", tax_id: "",
//     id_document_type: "PASSPORT", id_document_number: "",
//     id_document_expiry: "", id_document_front_url: "",
//     id_document_back_url: "", selfie_url: "",
//     address_document_type: "UTILITY_BILL", address_document_url: "",
//   });

//   /* ── Wallet ── */
//   const [wallet,             setWallet]             = useState(null);
//   const [walletTransactions, setWalletTransactions] = useState([]);

//   /* Add Money — Razorpay */
//   const [showAddMoneyModal, setShowAddMoneyModal] = useState(false);
//   const [addAmount,         setAddAmount]         = useState("");
//   const [addLoading,        setAddLoading]        = useState(false);
//   const [addStep,           setAddStep]           = useState("form"); // form | processing | success

//   /* Withdraw / Transfer */
//   const [showWithdrawModal, setShowWithdrawModal] = useState(false);
//   const [withdrawAmount,    setWithdrawAmount]    = useState("");
//   const [withdrawLoading,   setWithdrawLoading]   = useState(false);
//   const [showTransferModal, setShowTransferModal] = useState(false);
//   const [transferAmount,    setTransferAmount]    = useState("");
//   const [transferLoading,   setTransferLoading]   = useState(false);

//   const linkedMethods = [
//     { id: "bank", type: "Bank Account", name: "HDFC Bank Savings A/C" },
//     { id: "upi",  type: "UPI ID",       name: "john@okhdfcbank" },
//     { id: "card", type: "Card",         name: "Visa Debit **** 4444" },
//   ];

//   /* ════════════════════════════════════════════════════
//      DATA LOADERS
//   ════════════════════════════════════════════════════ */
//   const fetchProfile = useCallback(async () => {
//     try {
//       const [profRes, meRes] = await Promise.all([
//         fetch(`${API_BASE}/user_profiles/me`, { headers: authHdr() }),
//         fetch(`${API_BASE}/authentication/me`, { headers: authHdr() }),
//       ]);
//       const [profData, meData] = await Promise.all([profRes.json(), meRes.json()]);

//       let merged = { first_name: "", last_name: "", email: "", phone: "", bio: "", location: "", avatar_url: "" };

//       if (meData.bool && meData.response) {
//         merged.email = meData.response.email || "";
//       }
//       if (profData.bool && profData.response) {
//         const r = profData.response;
//         merged.first_name = r.first_name   || "";
//         merged.last_name  = r.last_name    || "";
//         merged.phone      = r.phone_number || "";
//         merged.bio        = r.bio          || "";
//         merged.location   = r.country      || r.city || "";
//         merged.avatar_url = r.avatar_url   || "";
//       }
//       setProfile(merged);
//     } catch {}
//   }, []);

//   const fetchPreferences = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/notifications/preferences`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) setNotifPrefs(data.response);
//     } catch {}
//   }, []);

//   const fetchSecurityInfo = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/user_security/me`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) {
//         setSecurityProfile(data.response);
//         setTwoFAEnabled(data.response.is_2fa_enabled || false);
//         setSessionTimeout(data.response.session_timeout_seconds || 3600);
//       }
//     } catch {}
//   }, []);

//   const fetchSessions = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/user_security/sessions`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) setSessions(data.response?.sessions || []);
//     } catch {}
//   }, []);

//   const fetchPlans = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/subscriptions/plans`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) setPlans(data.response?.plans || []);
//     } catch {}
//   }, []);

//   const fetchSubscription = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/subscriptions/my`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) setMySub(data.response?.subscription || data.response);
//     } catch {}
//   }, []);

//   const fetchBillingHistory = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/subscriptions/billing_history`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) setBillingHistory(
//         data.response?.history || data.response?.transactions || []
//       );
//     } catch {}
//   }, []);

//   const fetchKycStatus = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/kyc/status`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) {
//         setKycData(data.response);
//         setKycStatus(data.response.kyc_status || "NOT_STARTED");
//       }
//     } catch {}
//   }, []);

//   const fetchWallet = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/wallets/me`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) setWallet(data.response);
//     } catch {}
//   }, []);

//   const fetchWalletTxns = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/wallets/transactions`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) setWalletTransactions(
//         data.response?.transactions || []
//       );
//     } catch {}
//   }, []);

//   useEffect(() => {
//     const load = async () => {
//       setLoading(true);
//       try {
//         if (active === "profile")  await fetchProfile();
//         if (active === "notifs")   await fetchPreferences();
//         if (active === "security") { await fetchSecurityInfo(); await fetchSessions(); }
//         if (active === "billing")  { await fetchPlans(); await fetchSubscription(); await fetchBillingHistory(); }
//         if (active === "kyc")      await fetchKycStatus();
//         if (active === "wallet")   { await fetchWallet(); await fetchWalletTxns(); }
//       } catch {}
//       setLoading(false);
//     };
//     load();
//   }, [active]);

//   /* ════════════════════════════════════════════════════
//      SAVE HANDLERS
//   ════════════════════════════════════════════════════ */
//   const handleProfileSave = async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/user_profiles/me`, {
//         method: "PUT", headers: jsonHdr(),
//         body: JSON.stringify({
//           first_name:   profile.first_name,
//           last_name:    profile.last_name,
//           phone_number: profile.phone,
//           bio:          profile.bio,
//           country:      profile.location,
//         }),
//       });
//       const data = await res.json();
//       if (data.bool) showToast("Profile saved successfully.");
//       else showToast(data.response?.message || "Failed to save.", false);
//     } catch { showToast("Network error.", false); }
//   };

//   const handlePreferencesSave = async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/notifications/preferences`, {
//         method: "PUT", headers: jsonHdr(), body: JSON.stringify(notifPrefs),
//       });
//       const data = await res.json();
//       if (data.bool) showToast("Notification preferences saved.");
//       else showToast(data.response?.message || "Failed.", false);
//     } catch { showToast("Network error.", false); }
//   };

//   const handlePasswordChange = async () => {
//     if (passwordForm.new_password !== passwordForm.confirm_password) {
//       showToast("New passwords do not match.", false); return;
//     }
//     try {
//       const res  = await fetch(`${API_BASE}/authentication/change_password`, {
//         method: "POST", headers: jsonHdr(),
//         body: JSON.stringify({
//           old_password: passwordForm.current_password,
//           new_password: passwordForm.new_password,
//         }),
//       });
//       const data = await res.json();
//       if (data.bool) {
//         showToast("Password changed successfully.");
//         setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
//       } else showToast(data.response?.message || "Failed.", false);
//     } catch { showToast("Network error.", false); }
//   };

//   const handleTimeoutChange = async (e) => {
//     const val = parseInt(e.target.value);
//     setSessionTimeout(val);
//     try {
//       await fetch(`${API_BASE}/user_security/session_timeout`, {
//         method: "PUT", headers: jsonHdr(),
//         body: JSON.stringify({ session_timeout_seconds: val }),
//       });
//     } catch {}
//   };

//   const handleAddIp = async () => {
//     if (!whitelistIp) return;
//     try {
//       await fetch(`${API_BASE}/user_security/ip_whitelist/add`, {
//         method: "POST", headers: jsonHdr(), body: JSON.stringify({ ip_address: whitelistIp }),
//       });
//       setSecurityProfile(prev => ({ ...prev, ip_whitelist: [...(prev?.ip_whitelist || []), whitelistIp] }));
//       setWhitelistIp("");
//     } catch {}
//   };

//   const handleRemoveIp = async (ip) => {
//     try {
//       await fetch(`${API_BASE}/user_security/ip_whitelist/remove`, {
//         method: "POST", headers: jsonHdr(), body: JSON.stringify({ ip_address: ip }),
//       });
//       setSecurityProfile(prev => ({ ...prev, ip_whitelist: (prev?.ip_whitelist || []).filter(i => i !== ip) }));
//     } catch {}
//   };

//   const handleRevokeSession = async (sessionId) => {
//     try {
//       await fetch(`${API_BASE}/user_security/sessions/${sessionId}/revoke`, { method: "POST", headers: authHdr() });
//       setSessions(prev => prev.filter(s => (s.session_id || s.id) !== sessionId));
//     } catch {}
//   };

//   const handle2faToggle = async () => {
//     if (twoFAEnabled) {
//       const code = prompt("Enter 6-digit TOTP code to disable 2FA:");
//       if (!code) return;
//       try {
//         await fetch(`${API_BASE}/user_security/2fa/disable`, {
//           method: "POST", headers: jsonHdr(), body: JSON.stringify({ totp_code: code }),
//         });
//         setTwoFAEnabled(false);
//       } catch {}
//     } else {
//       try {
//         const res  = await fetch(`${API_BASE}/user_security/2fa/setup_totp`, { headers: authHdr() });
//         const data = await res.json();
//         if (data.bool && data.response) { setSetupTotp(data.response); setShowTotpModal(true); }
//       } catch {}
//     }
//   };

//   const handleVerify2fa = async () => {
//     if (!totpCode) return;
//     try {
//       await fetch(`${API_BASE}/user_security/2fa/enable`, {
//         method: "POST", headers: jsonHdr(), body: JSON.stringify({ totp_code: totpCode }),
//       });
//       setTwoFAEnabled(true); setShowTotpModal(false); setSetupTotp(null); setTotpCode("");
//     } catch {}
//   };

//   const handleSubscribe = async (planId) => {
//     try {
//       const res  = await fetch(`${API_BASE}/subscriptions/subscribe`, {
//         method: "POST", headers: jsonHdr(),
//         body: JSON.stringify({ plan_id: planId, billing_cycle: "MONTHLY" }),
//       });
//       const data = await res.json();
//       if (data.bool) { await fetchSubscription(); showToast("Subscribed successfully!"); }
//       else showToast(data.response?.message || "Subscription failed.", false);
//     } catch { showToast("Network error.", false); }
//   };

//   const handleCancelSub = async () => {
//     if (!window.confirm("Cancel subscription?")) return;
//     try {
//       const res  = await fetch(`${API_BASE}/subscriptions/cancel`, { method: "POST", headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) { await fetchSubscription(); showToast("Subscription cancelled."); }
//     } catch {}
//   };

//   const handleKycSubmit = async (e) => {
//     e.preventDefault();
//     setKycError("");
//     const required = ["legal_first_name","legal_last_name","date_of_birth",
//                       "id_document_type","id_document_number","id_document_front_url"];
//     for (const f of required) {
//       if (!kycForm[f]?.trim()) { setKycError(`Please fill in: ${f.replace(/_/g," ")}`); return; }
//     }
//     setSubmittingKyc(true);
//     try {
//       const payload = {
//         legal_first_name:      kycForm.legal_first_name.trim(),
//         legal_last_name:       kycForm.legal_last_name.trim(),
//         date_of_birth:         kycForm.date_of_birth,
//         id_document_type:      kycForm.id_document_type,
//         id_document_number:    kycForm.id_document_number.trim(),
//         id_document_front_url: kycForm.id_document_front_url.trim(),
//       };
//       if (kycForm.nationality.trim())           payload.nationality           = kycForm.nationality.trim();
//       if (kycForm.country_of_residence.trim())  payload.country_of_residence  = kycForm.country_of_residence.trim();
//       if (kycForm.tax_id.trim())                payload.tax_id                = kycForm.tax_id.trim();
//       if (kycForm.id_document_expiry)           payload.id_document_expiry    = kycForm.id_document_expiry;
//       if (kycForm.id_document_back_url.trim())  payload.id_document_back_url  = kycForm.id_document_back_url.trim();
//       if (kycForm.selfie_url.trim())            payload.selfie_url            = kycForm.selfie_url.trim();
//       if (kycForm.address_document_type)        payload.address_document_type = kycForm.address_document_type;
//       if (kycForm.address_document_url.trim())  payload.address_document_url  = kycForm.address_document_url.trim();

//       const res  = await fetch(`${API_BASE}/kyc/submit`, { method: "POST", headers: jsonHdr(), body: JSON.stringify(payload) });
//       const data = await res.json();
//       if (!data.bool) { setKycError(data.response?.message || "KYC submission failed."); return; }
//       setKycStatus("PENDING");
//       await fetchKycStatus();
//       showToast("KYC submitted! Under review.");
//     } catch { setKycError("Network error. Please try again."); }
//     finally { setSubmittingKyc(false); }
//   };

//   /* ════════════════════════════════════════════════════
//      ADD MONEY — RAZORPAY
//      ────────────────────────────────────────────────────
//      FIX: The previous code fell into a direct-deposit fallback
//      when /payment/create_order returned 404, bypassing Razorpay
//      entirely so the user never saw bank/card/UPI options.

//      NEW FLOW:
//      1. Load Razorpay SDK
//      2. Try POST /payment/create_order (wallet deposit variant)
//      3a. If backend order succeeds → open Razorpay with order_id
//      3b. If 404/error → open Razorpay WITHOUT order_id
//          (Razorpay still shows all payment options: Bank, UPI, Card)
//      4. On payment success → POST /wallets/deposit to credit wallet
//      5. Refresh balance
//   ════════════════════════════════════════════════════ */
//   const handleAddMoney = async (e) => {
//     e.preventDefault();
//     const amount = parseFloat(addAmount);
//     if (isNaN(amount) || amount < 1) {
//       showToast("Enter a valid amount (min ₹1)", false); return;
//     }

//     setAddLoading(true);
//     setAddStep("processing");

//     try {
//       /* Step 1: Ensure Razorpay SDK is loaded FIRST */
//       const rzpLoaded = await loadRazorpay();
//       if (!rzpLoaded) {
//         showToast("Failed to load Razorpay. Check your internet connection.", false);
//         setAddStep("form"); setAddLoading(false); return;
//       }

//       /* Step 2: Try to get a server-side order_id (optional — improves security) */
//       let rzpOrderId = null;
//       let rzpKeyId   = RAZORPAY_KEY;

//       try {
//         const orderRes  = await fetch(`${API_BASE}/payment/create_order`, {
//           method:  "POST",
//           headers: jsonHdr(), /* JWT only — no credentials:'include' */
//           body:    JSON.stringify({
//             amount:   Math.round(amount * 100), // paise
//             currency: "INR",
//             purpose:  "WALLET_DEPOSIT",
//           }),
//         });

//         if (orderRes.ok) {
//           const orderData = await orderRes.json();
//           if (orderData.bool && orderData.response?.order_id) {
//             rzpOrderId = orderData.response.order_id || orderData.response.razorpay_order_id;
//             rzpKeyId   = orderData.response.key_id   || RAZORPAY_KEY;
//           }
//         }
//         /* If 404/any error → rzpOrderId stays null → Razorpay opens without order_id
//            but STILL shows ALL payment options (Bank/UPI/Card) */
//       } catch {
//         /* Network error getting order — continue without order_id */
//       }

//       /* Step 3: Open Razorpay checkout
//          Razorpay shows Bank Transfer, UPI, Credit/Debit Card regardless
//          of whether order_id is provided. The order_id only helps with
//          backend verification; without it payment still goes through. */
//       const rzpOptions = {
//         key:         rzpKeyId,
//         amount:      Math.round(amount * 100), // paise
//         currency:    "INR",
//         name:        "TradeFlow",
//         description: `Add ₹${amount.toFixed(2)} to wallet`,
//         prefill: {
//           name:  `${profile.first_name} ${profile.last_name}`.trim() || "Investor",
//           email: profile.email || "",
//         },
//         theme:    { color: "#06B6D4" },
//         /* Include order_id only when we have one */
//         ...(rzpOrderId ? { order_id: rzpOrderId } : {}),

//         handler: async (rzpResponse) => {
//           /* Step 4: Payment succeeded — credit wallet */
//           try {
//             /* 4a: Verify signature if we have order_id */
//             if (rzpOrderId) {
//               const verifyRes  = await fetch(`${API_BASE}/payment/verify`, {
//                 method:  "POST",
//                 headers: jsonHdr(),
//                 body:    JSON.stringify({
//                   razorpay_order_id:   rzpResponse.razorpay_order_id,
//                   razorpay_payment_id: rzpResponse.razorpay_payment_id,
//                   razorpay_signature:  rzpResponse.razorpay_signature,
//                   purpose:             "WALLET_DEPOSIT",
//                   amount:              amount,
//                 }),
//               });
//               const verifyData = await verifyRes.json();
//               if (!verifyData.bool) {
//                 showToast("Payment verification failed. Contact support.", false);
//                 setAddStep("form"); setAddLoading(false); return;
//               }
//             }

//             /* 4b: Deposit funds into wallet */
//             const depositRes  = await fetch(`${API_BASE}/wallets/deposit`, {
//               method:  "POST",
//               headers: jsonHdr(),
//               body:    JSON.stringify({
//                 amount:              amount,
//                 payment_method:      "RAZORPAY",
//                 razorpay_payment_id: rzpResponse.razorpay_payment_id,
//                 ...(rzpOrderId ? { razorpay_order_id: rzpResponse.razorpay_order_id } : {}),
//                 notes: `Razorpay wallet deposit — ${rzpResponse.razorpay_payment_id || "manual"}`,
//               }),
//             });
//             const depositData = await depositRes.json();

//             if (depositData.bool) {
//               setAddStep("success");
//               await fetchWallet();
//               await fetchWalletTxns();
//             } else {
//               showToast(depositData.response?.message || "Deposit record failed.", false);
//               setAddStep("form");
//             }
//           } catch {
//             showToast("Network error during deposit. Contact support.", false);
//             setAddStep("form");
//           } finally {
//             setAddLoading(false);
//           }
//         },

//         modal: {
//           ondismiss: () => {
//             /* User closed the Razorpay popup without paying */
//             setAddStep("form");
//             setAddLoading(false);
//           },
//         },
//       };

//       const rzp = new window.Razorpay(rzpOptions);
//       rzp.on("payment.failed", (resp) => {
//         showToast(`Payment failed: ${resp.error?.description || "Unknown error"}`, false);
//         setAddStep("form");
//         setAddLoading(false);
//       });
//       rzp.open();

//     } catch (err) {
//       showToast("Something went wrong. Please try again.", false);
//       setAddStep("form");
//       setAddLoading(false);
//     }
//   };

//   const handleWithdraw = async (e) => {
//     e.preventDefault();
//     const amount = parseFloat(withdrawAmount);
//     if (isNaN(amount) || amount <= 0) { showToast("Enter a valid amount.", false); return; }
//     setWithdrawLoading(true);
//     try {
//       const res  = await fetch(`${API_BASE}/wallets/withdraw`, {
//         method: "POST", headers: jsonHdr(),
//         body: JSON.stringify({ amount, payment_method: "BANK_TRANSFER" }),
//       });
//       const data = await res.json();
//       if (data.bool) {
//         await fetchWallet(); await fetchWalletTxns();
//         setShowWithdrawModal(false); setWithdrawAmount("");
//         showToast(`₹${amount.toFixed(2)} withdrawal initiated.`);
//       } else showToast(data.response?.message || "Withdrawal failed.", false);
//     } catch { showToast("Network error.", false); }
//     finally { setWithdrawLoading(false); }
//   };

//   const handleTransfer = async (e) => {
//     e.preventDefault();
//     const amount = parseFloat(transferAmount);
//     if (isNaN(amount) || amount <= 0) { showToast("Enter a valid amount.", false); return; }
//     setTransferLoading(true);
//     try {
//       const res  = await fetch(`${API_BASE}/wallets/withdraw`, {
//         method: "POST", headers: jsonHdr(),
//         body: JSON.stringify({ amount, payment_method: "BANK_TRANSFER" }),
//       });
//       const data = await res.json();
//       if (data.bool) {
//         await fetchWallet(); await fetchWalletTxns();
//         setShowTransferModal(false); setTransferAmount("");
//         showToast(`₹${amount.toFixed(2)} transferred to bank.`);
//       } else showToast(data.response?.message || "Transfer failed.", false);
//     } catch { showToast("Network error.", false); }
//     finally { setTransferLoading(false); }
//   };

//   /* ── UI helpers ── */
//   const Toggle = ({ v, onToggle }) => (
//     <button onClick={onToggle}
//       className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${v ? "bg-cyan-500" : "bg-white/10"}`}>
//       <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${v ? "translate-x-6" : "translate-x-1"}`} />
//     </button>
//   );

//   const KycInput = ({ label, field, type = "text", placeholder = "" }) => (
//     <div>
//       <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
//       <input type={type} value={kycForm[field]}
//         onChange={(e) => setKycForm(p => ({ ...p, [field]: e.target.value }))}
//         placeholder={placeholder}
//         className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 transition-colors" />
//     </div>
//   );

//   const fmtTxAmt = (tx) => {
//     const type   = (tx.transaction_type || "").toUpperCase();
//     const credit = type === "DEPOSIT" || type === "REFUND" || type === "CREDIT";
//     return (
//       <span className={`text-sm font-bold ${credit ? "text-emerald-400" : "text-red-400"}`}>
//         {credit ? "+" : "-"}₹{parseFloat(tx.amount || tx.net_amount || 0).toFixed(2)}
//       </span>
//     );
//   };

//   /* Derived avatar */
//   const avatarInitials = (
//     (profile.first_name || "U").slice(0,1) +
//     (profile.last_name  || "").slice(0,1)
//   ).toUpperCase() || "U";

//   /* ════════════════════════════════════════════════════
//      RENDER
//   ════════════════════════════════════════════════════ */
//   return (
//     <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">
//       <AnimatePresence>
//         {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
//       </AnimatePresence>

//       <div>
//         <h1 className="text-xl font-bold text-white">Settings</h1>
//         <p className="text-sm text-gray-500 mt-0.5">Manage your account preferences, configurations and subscription tiers.</p>
//       </div>

//       <div className="flex flex-col lg:flex-row gap-5">

//         {/* ── Sidebar ── */}
//         <div className="lg:w-48 flex-shrink-0">
//           <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//             {tabs.map((t) => (
//               <button key={t.id} onClick={() => setActive(t.id)}
//                 className={`w-full flex items-center gap-3 px-4 py-3 text-sm border-b border-white/5 last:border-0 transition-all cursor-pointer ${active === t.id ? "bg-cyan-500/8 text-cyan-300 font-medium" : "text-gray-500 hover:text-white hover:bg-white/5"}`}>
//                 <t.icon className={`w-4 h-4 ${active === t.id ? "text-cyan-400" : "text-gray-600"}`} />
//                 {t.label}
//                 {active === t.id && <ChevronRight className="w-3.5 h-3.5 ml-auto text-cyan-400" />}
//               </button>
//             ))}
//             <button onClick={() => { logout(); navigate("/"); }}
//               className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/5 transition-all cursor-pointer">
//               <Key className="w-4 h-4" /> Sign Out
//             </button>
//           </div>
//         </div>

//         {/* ── Content ── */}
//         <div className="flex-1 space-y-4 min-w-0">
//           {loading ? (
//             <div className="p-16 bg-[#0C1220] border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3">
//               <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
//               <span className="text-xs text-gray-600">Retrieving details...</span>
//             </div>
//           ) : (
//             <>
//               {/* ─── PROFILE ─── */}
//               {active === "profile" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-5">Profile Information</div>

//                     {/* Avatar — FIX: camera icon now opens upload modal */}
//                     <div className="flex items-center gap-4 mb-5">
//                       <div className="relative group">
//                         {profile.avatar_url ? (
//                           <img src={profile.avatar_url} alt="avatar"
//                             className="w-16 h-16 rounded-2xl object-cover shadow-lg" />
//                         ) : (
//                           <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xl font-bold text-white shadow-lg">
//                             {avatarInitials}
//                           </div>
//                         )}
//                         {/* Camera button — wired to open AvatarUploadModal */}
//                         <button
//                           onClick={() => setShowAvatarModal(true)}
//                           title="Change profile photo"
//                           className="absolute -bottom-1 -right-1 w-6 h-6 bg-cyan-500 hover:bg-cyan-400 rounded-full flex items-center justify-center cursor-pointer border-2 border-[#0C1220] transition-colors shadow-md">
//                           <Camera className="w-3 h-3 text-white" />
//                         </button>
//                       </div>
//                       <div>
//                         <div className="text-sm font-medium text-white">{profile.first_name} {profile.last_name}</div>
//                         <div className="text-xs text-gray-500 mb-1">{profile.email}</div>
//                         <div className="flex items-center gap-2">
//                           <span className="px-2.5 py-0.5 bg-cyan-500/10 border border-cyan-500/15 rounded-full text-[10px] text-cyan-400 font-medium">
//                             {mySub?.plan?.plan_name || mySub?.plan_name || "Free"} Member
//                           </span>
//                           <button
//                             onClick={() => setShowAvatarModal(true)}
//                             className="text-[10px] text-gray-600 hover:text-cyan-400 underline transition-colors cursor-pointer">
//                             Change photo
//                           </button>
//                         </div>
//                       </div>
//                     </div>

//                     <div className="grid sm:grid-cols-2 gap-4">
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">First Name</label>
//                         <input type="text" value={profile.first_name}
//                           onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30" />
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Last Name</label>
//                         <input type="text" value={profile.last_name}
//                           onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30" />
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Email Address</label>
//                         <input type="email" value={profile.email} readOnly
//                           className="w-full bg-[#141C30]/50 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed" />
//                         <p className="text-[10px] text-gray-700 mt-1">Email cannot be changed here</p>
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Phone Number</label>
//                         <input type="tel" value={profile.phone}
//                           onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
//                           placeholder="+91 9876543210"
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30" />
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Country</label>
//                         <input type="text" value={profile.location}
//                           onChange={(e) => setProfile({ ...profile, location: e.target.value })}
//                           placeholder="India"
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30" />
//                       </div>
//                       <div className="sm:col-span-2">
//                         <label className="text-xs text-gray-500 mb-1.5 block">Bio</label>
//                         <textarea value={profile.bio}
//                           onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30 resize-none" />
//                       </div>
//                     </div>
//                   </div>
//                   <button onClick={handleProfileSave}
//                     className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 cursor-pointer">
//                     Save Changes
//                   </button>
//                 </motion.div>
//               )}

//               {/* ─── NOTIFICATIONS ─── */}
//               {active === "notifs" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//                     <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">Notification Preferences</div>
//                     {Object.entries(notifPrefs).map(([key, value]) => (
//                       <div key={key} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
//                         <div className="text-sm text-white capitalize">{key.replace(/_/g, " ")}</div>
//                         <Toggle v={value} onToggle={() => setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }))} />
//                       </div>
//                     ))}
//                   </div>
//                   <button onClick={handlePreferencesSave}
//                     className="mt-4 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 cursor-pointer">
//                     Save Preferences
//                   </button>
//                 </motion.div>
//               )}

//               {/* ─── SECURITY ─── */}
//               {active === "security" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-4">Change Password</div>
//                     <div className="space-y-3 max-w-sm">
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Current Password</label>
//                         <div className="relative">
//                           <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
//                           <input type={showPw ? "text" : "password"} value={passwordForm.current_password}
//                             onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
//                             className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-9 pr-10 py-2.5 text-sm text-gray-200 focus:outline-none" />
//                           <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">
//                             {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
//                           </button>
//                         </div>
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">New Password</label>
//                         <input type="password" value={passwordForm.new_password}
//                           onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none" />
//                       </div>
//                       <div>
//                         <label className="text-xs text-gray-500 mb-1.5 block">Confirm Password</label>
//                         <input type="password" value={passwordForm.confirm_password}
//                           onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
//                           className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none" />
//                       </div>
//                       <button onClick={handlePasswordChange}
//                         className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium cursor-pointer">
//                         Update Password
//                       </button>
//                     </div>
//                   </div>

//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="flex items-center justify-between">
//                       <div>
//                         <div className="text-sm font-medium text-white flex items-center gap-1.5"><Key className="w-4 h-4 text-cyan-400" />Two-Factor Authentication</div>
//                         <p className="text-xs text-gray-500 mt-1">{twoFAEnabled ? "2FA is active." : "Enable via Google Authenticator."}</p>
//                       </div>
//                       <Toggle v={twoFAEnabled} onToggle={handle2faToggle} />
//                     </div>
//                   </div>

//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-2">Session Timeout</div>
//                     <select value={sessionTimeout} onChange={handleTimeoutChange}
//                       className="bg-[#141C30] text-sm text-gray-200 border border-white/8 rounded-xl px-3 py-2.5">
//                       <option value={900}>15 Minutes</option>
//                       <option value={1800}>30 Minutes</option>
//                       <option value={3600}>1 Hour</option>
//                       <option value={14400}>4 Hours</option>
//                     </select>
//                   </div>

//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-2">IP Address Whitelist</div>
//                     <div className="flex gap-2 max-w-sm mb-4">
//                       <input type="text" placeholder="e.g. 192.168.1.1" value={whitelistIp} onChange={(e) => setWhitelistIp(e.target.value)}
//                         className="flex-1 bg-[#141C30] border border-white/8 rounded-xl px-3 py-2 text-sm text-white" />
//                       <button onClick={handleAddIp} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-semibold cursor-pointer">Add</button>
//                     </div>
//                     {(securityProfile?.ip_whitelist || []).map((ip, i) => (
//                       <div key={i} className="flex items-center justify-between p-2.5 bg-[#141C30] border border-white/5 rounded-xl mb-2">
//                         <span className="text-xs font-mono text-gray-300">{ip}</span>
//                         <button onClick={() => handleRemoveIp(ip)} className="p-1 text-red-400/70 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
//                       </div>
//                     ))}
//                   </div>

//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-3">Active Sessions</div>
//                     {sessions.length === 0 ? (
//                       <p className="text-xs text-gray-600">No active sessions found.</p>
//                     ) : sessions.map((s, idx) => (
//                       <div key={s.session_id || s.id || idx} className="flex items-center justify-between p-3 bg-[#141C30] border border-white/5 rounded-xl mb-2">
//                         <div>
//                           <div className="text-xs font-bold text-white">{s.device_type || "Unknown Device"}</div>
//                           <div className="text-[10px] text-gray-500">IP: {s.ip_address || "—"}</div>
//                         </div>
//                         {s.is_current ? (
//                           <span className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/25 rounded-md text-[9px] text-emerald-400">Current</span>
//                         ) : (
//                           <button onClick={() => handleRevokeSession(s.session_id || s.id)}
//                             className="px-2.5 py-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg cursor-pointer">Revoke</button>
//                         )}
//                       </div>
//                     ))}
//                   </div>
//                 </motion.div>
//               )}

//               {/* ─── BILLING ─── */}
//               {active === "billing" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   <div className="bg-gradient-to-br from-cyan-500/8 to-blue-600/5 border border-cyan-500/15 rounded-2xl p-5">
//                     <div className="flex items-center justify-between">
//                       <div>
//                         <div className="text-xs text-gray-500">Active Plan</div>
//                         <div className="text-2xl font-bold text-white">{mySub?.plan?.plan_name || mySub?.plan_name || "Free"} Plan</div>
//                         <div className="text-sm text-cyan-400 mt-1">{mySub?.amount_paid ? `₹${mySub.amount_paid}/month` : "Free tier"}</div>
//                       </div>
//                       <span className="px-3 py-1.5 bg-cyan-500/15 border border-cyan-500/25 rounded-xl text-sm text-cyan-400">{mySub?.status || "Active"}</span>
//                     </div>
//                     {mySub?.status === "ACTIVE" && (
//                       <button onClick={handleCancelSub} className="mt-4 px-4 py-2 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel Plan</button>
//                     )}
//                   </div>
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-4">Available Plans</div>
//                     <div className="grid md:grid-cols-2 gap-4">
//                       {plans.map((p) => (
//                         <div key={p.plan_id || p.id}
//                           className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${mySub?.plan_id === (p.plan_id || p.id) ? "border-cyan-500/30 bg-cyan-500/5" : "border-white/5 bg-[#141C30]"}`}>
//                           <div>
//                             <div className="text-sm font-bold text-white">{p.plan_name || p.name}</div>
//                             <div className="text-cyan-400 font-bold text-lg mt-1">${p.price_monthly || p.price}/mo</div>
//                             <p className="text-xs text-gray-500 mt-1">{p.description || p.tagline}</p>
//                           </div>
//                           <button onClick={() => handleSubscribe(p.plan_id || p.id)} disabled={mySub?.plan_id === (p.plan_id || p.id)}
//                             className={`w-full py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${mySub?.plan_id === (p.plan_id || p.id) ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25" : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white"}`}>
//                             {mySub?.plan_id === (p.plan_id || p.id) ? "Current Plan" : "Choose Plan"}
//                           </button>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//                     <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">Billing History</div>
//                     {billingHistory.length === 0 ? (
//                       <div className="py-8 text-center text-xs text-gray-600">No billing history yet</div>
//                     ) : billingHistory.map((b, i) => (
//                       <div key={b.transaction_id || b.id || i} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
//                         <div>
//                           <div className="text-sm text-white font-medium">{b.transaction_type || b.plan_name || "Subscription"}</div>
//                           <div className="text-xs text-gray-600 mt-0.5">{b.created_on ? new Date(b.created_on).toLocaleDateString() : ""}</div>
//                         </div>
//                         <div>
//                           <span className="text-sm text-white font-semibold">₹{parseFloat(b.total_amount || b.amount || 0).toFixed(2)}</span>
//                           <span className="ml-3 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">{b.status || "Paid"}</span>
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 </motion.div>
//               )}

//               {/* ─── WALLET ─── */}
//               {active === "wallet" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   {wallet ? (
//                     <>
//                       <div className="bg-gradient-to-br from-cyan-500/10 to-blue-600/5 border border-cyan-500/15 rounded-2xl p-6">
//                         <div className="text-xs text-gray-400 font-medium tracking-wide mb-1 uppercase">Available Balance</div>
//                         <div className="text-3xl font-black text-white mb-6">
//                           ₹{parseFloat(wallet.available_balance || wallet.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
//                         </div>
//                         <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
//                           <div>
//                             <div className="text-[10px] text-gray-500 font-semibold uppercase">Total Deposited</div>
//                             <div className="text-base font-bold text-gray-200 mt-0.5">
//                               ₹{parseFloat(wallet.total_deposited || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
//                             </div>
//                           </div>
//                           <div>
//                             <div className="text-[10px] text-gray-500 font-semibold uppercase">
//                               Locked Balance <span className="normal-case font-normal text-gray-700">(pending orders)</span>
//                             </div>
//                             <div className="text-base font-bold text-cyan-400 mt-0.5">
//                               ₹{parseFloat(wallet.locked_balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
//                             </div>
//                           </div>
//                         </div>
//                         <p className="text-xs text-gray-700 mt-3">
//                           Locked balance is held for pending buy orders and releases once filled or cancelled.
//                         </p>
//                       </div>

//                       <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
//                         <div className="text-xs font-bold text-white uppercase tracking-wider">Quick Actions</div>
//                         <div className="flex flex-wrap gap-2.5">
//                           <button onClick={() => { setAddStep("form"); setAddAmount(""); setShowAddMoneyModal(true); }}
//                             className="py-2 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity">
//                             <PlusCircle className="w-3.5 h-3.5" />Add Money
//                           </button>
//                           <button onClick={() => { setWithdrawAmount(""); setShowWithdrawModal(true); }}
//                             className="py-2 px-4 bg-[#141C30] border border-white/8 rounded-xl text-xs font-bold text-gray-300 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors">
//                             <ArrowUpRight className="w-3.5 h-3.5" />Withdraw
//                           </button>
//                           <button onClick={() => { setTransferAmount(""); setShowTransferModal(true); }}
//                             className="py-2 px-4 bg-[#141C30] border border-white/8 rounded-xl text-xs font-bold text-gray-300 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors">
//                             <Building className="w-3.5 h-3.5" />Transfer to Bank
//                           </button>
//                         </div>
//                       </div>

//                       <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//                         <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">Recent Wallet Transactions</div>
//                         {walletTransactions.length === 0 ? (
//                           <div className="py-8 text-center text-xs text-gray-600">No wallet transactions yet</div>
//                         ) : walletTransactions.slice(0, 10).map((tx, i) => (
//                           <div key={tx.wallet_txn_id || tx.id || i} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
//                             <div>
//                               <div className="text-sm font-semibold text-white">{tx.description || tx.transaction_type || "Transaction"}</div>
//                               <div className="text-xs text-gray-500 mt-0.5">{(tx.created_on || tx.created_at) ? new Date(tx.created_on || tx.created_at).toLocaleString() : ""}</div>
//                             </div>
//                             {fmtTxAmt(tx)}
//                           </div>
//                         ))}
//                       </div>
//                     </>
//                   ) : (
//                     <div className="bg-[#0C1220] border border-white/5 rounded-2xl py-16 text-center text-gray-600 text-sm">Wallet data unavailable</div>
//                   )}
//                 </motion.div>
//               )}

//               {/* ─── KYC ─── */}
//               {active === "kyc" && (
//                 <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
//                   <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
//                     <div className="text-sm font-medium text-white mb-4">Identity KYC Verification</div>
//                     <div className="p-4 bg-[#141C30] border border-white/5 rounded-xl flex items-center justify-between mb-5">
//                       <div>
//                         <div className="text-xs text-gray-500">KYC Status</div>
//                         <div className="text-base font-bold text-white mt-1">
//                           {kycStatus === "APPROVED"     && "Verified ✅"}
//                           {kycStatus === "PENDING"      && "Under Review ⏳"}
//                           {kycStatus === "UNDER_REVIEW" && "Under Review ⏳"}
//                           {kycStatus === "REJECTED"     && "Rejected ❌"}
//                           {(kycStatus === "NOT_STARTED" || kycStatus === "NOT_SUBMITTED") && "Not Submitted"}
//                         </div>
//                       </div>
//                       <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase ${
//                         kycStatus === "APPROVED"     ? "bg-emerald-500/15 text-emerald-400"
//                         : kycStatus === "PENDING" || kycStatus === "UNDER_REVIEW" ? "bg-amber-500/15 text-amber-400"
//                         : kycStatus === "REJECTED"   ? "bg-red-500/15 text-red-400"
//                         : "bg-gray-500/10 text-gray-500"
//                       }`}>{kycStatus}</span>
//                     </div>

//                     {kycData && kycData.legal_first_name && (
//                       <div className="mb-5 grid sm:grid-cols-2 gap-3">
//                         {[
//                           { label: "Legal Name",    value: `${kycData.legal_first_name} ${kycData.legal_last_name}` },
//                           { label: "Date of Birth", value: kycData.date_of_birth || "—" },
//                           { label: "Nationality",   value: kycData.nationality || "—" },
//                           { label: "Document Type", value: kycData.id_document_type || "—" },
//                           { label: "Submitted",     value: kycData.submitted_at ? new Date(kycData.submitted_at).toLocaleDateString() : "—" },
//                           { label: "Approved At",   value: kycData.approved_at ? new Date(kycData.approved_at).toLocaleDateString() : "—" },
//                         ].map((item, i) => (
//                           <div key={i} className="flex justify-between py-2 border-b border-white/5">
//                             <span className="text-xs text-gray-600">{item.label}</span>
//                             <span className="text-xs text-white font-medium">{item.value}</span>
//                           </div>
//                         ))}
//                         {kycData.rejection_reason && (
//                           <div className="sm:col-span-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
//                             <div className="text-xs text-red-400 font-medium mb-1">Rejection Reason</div>
//                             <div className="text-xs text-red-300">{kycData.rejection_reason}</div>
//                           </div>
//                         )}
//                       </div>
//                     )}

//                     {(kycStatus === "NOT_STARTED" || kycStatus === "NOT_SUBMITTED" || kycStatus === "REJECTED") && (
//                       <form onSubmit={handleKycSubmit} className="space-y-5">
//                         <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
//                           {kycStatus === "REJECTED" ? "Re-submit KYC Documents" : "Submit KYC Documents"}
//                         </div>
//                         {kycError && (
//                           <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
//                             <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {kycError}
//                           </div>
//                         )}
//                         <div>
//                           <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Personal Information</p>
//                           <div className="grid sm:grid-cols-2 gap-3">
//                             <KycInput label="Legal First Name *" field="legal_first_name" placeholder="As on ID" />
//                             <KycInput label="Legal Last Name *"  field="legal_last_name"  placeholder="As on ID" />
//                             <KycInput label="Date of Birth *"    field="date_of_birth"    type="date" />
//                             <KycInput label="Nationality"        field="nationality"       placeholder="e.g. Indian" />
//                             <KycInput label="Country of Residence" field="country_of_residence" placeholder="e.g. India" />
//                             <KycInput label="Tax ID (PAN / SSN)" field="tax_id"           placeholder="Optional" />
//                           </div>
//                         </div>
//                         <div>
//                           <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Identity Document</p>
//                           <div className="grid sm:grid-cols-2 gap-3">
//                             <div>
//                               <label className="text-xs text-gray-500 mb-1.5 block">Document Type *</label>
//                               <select value={kycForm.id_document_type}
//                                 onChange={(e) => setKycForm(p => ({ ...p, id_document_type: e.target.value }))}
//                                 className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30">
//                                 {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
//                               </select>
//                             </div>
//                             <KycInput label="Document Number *" field="id_document_number" placeholder="e.g. A1234567" />
//                             <KycInput label="Expiry Date" field="id_document_expiry" type="date" />
//                           </div>
//                         </div>
//                         <div>
//                           <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Document URLs</p>
//                           <p className="text-xs text-gray-600 mb-3">Upload files to Google Drive / Dropbox and paste the public URL below.</p>
//                           <div className="grid sm:grid-cols-2 gap-3">
//                             <KycInput label="ID Front URL *"  field="id_document_front_url" placeholder="https://..." />
//                             <KycInput label="ID Back URL"     field="id_document_back_url"  placeholder="https://..." />
//                             <KycInput label="Selfie URL"      field="selfie_url"            placeholder="https://..." />
//                             <div>
//                               <label className="text-xs text-gray-500 mb-1.5 block">Address Proof Type</label>
//                               <select value={kycForm.address_document_type}
//                                 onChange={(e) => setKycForm(p => ({ ...p, address_document_type: e.target.value }))}
//                                 className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/30">
//                                 <option value="UTILITY_BILL">Utility Bill</option>
//                                 <option value="BANK_STATEMENT">Bank Statement</option>
//                                 <option value="TAX_DOCUMENT">Tax Document</option>
//                               </select>
//                             </div>
//                             <KycInput label="Address Proof URL" field="address_document_url" placeholder="https://..." />
//                           </div>
//                         </div>
//                         <button type="submit" disabled={submittingKyc}
//                           className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center gap-2 cursor-pointer">
//                           {submittingKyc
//                             ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</>
//                             : <><Upload className="w-4 h-4" />Submit Documents</>
//                           }
//                         </button>
//                       </form>
//                     )}

//                     {(kycStatus === "PENDING" || kycStatus === "UNDER_REVIEW") && (
//                       <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl text-center">
//                         <p className="text-sm text-amber-400 font-medium">Documents are under review.</p>
//                         <p className="text-xs text-gray-500 mt-1">This typically takes 1–3 business days.</p>
//                       </div>
//                     )}
//                     {kycStatus === "APPROVED" && (
//                       <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-xl text-center">
//                         <p className="text-sm text-emerald-400 font-medium">✅ KYC Verified — Identity confirmed.</p>
//                       </div>
//                     )}
//                   </div>
//                 </motion.div>
//               )}
//             </>
//           )}
//         </div>
//       </div>

//       {/* ═══ AVATAR UPLOAD MODAL ═══ */}
//       <AnimatePresence>
//         {showAvatarModal && (
//           <AvatarUploadModal
//             currentAvatar={profile.avatar_url}
//             displayName={`${profile.first_name} ${profile.last_name}`.trim()}
//             onClose={() => setShowAvatarModal(false)}
//             onSave={(newUrl) => {
//               setProfile(p => ({ ...p, avatar_url: newUrl }));
//               setShowAvatarModal(false);
//               showToast("Profile photo updated!");
//             }}
//           />
//         )}
//       </AnimatePresence>

//       {/* ═══ TOTP Modal ═══ */}
//       <AnimatePresence>
//         {showTotpModal && setupTotp && (
//           <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
//               className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
//               <h3 className="text-base font-bold text-white mb-4">Enable 2FA Protection</h3>
//               {setupTotp.qr_code_url && (
//                 <div className="bg-white p-2.5 rounded-xl w-36 h-36 mx-auto">
//                   <img src={setupTotp.qr_code_url} alt="2FA QR" className="w-full h-full" />
//                 </div>
//               )}
//               {setupTotp.secret && (
//                 <div className="mt-3 p-3 bg-[#141C30] border border-white/5 rounded-xl">
//                   <div className="text-xs text-gray-500 mb-1">Manual key:</div>
//                   <div className="text-xs font-mono text-cyan-400 break-all">{setupTotp.secret}</div>
//                 </div>
//               )}
//               <input type="text" maxLength={6} value={totpCode}
//                 onChange={(e) => setTotpCode(e.target.value.replace(/\D/g,""))}
//                 placeholder="6-digit code"
//                 className="w-full text-center bg-[#141C30] border border-white/8 rounded-xl py-2.5 text-sm text-white mt-4 focus:outline-none" />
//               <div className="grid grid-cols-2 gap-3 mt-4">
//                 <button onClick={() => setShowTotpModal(false)} className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 cursor-pointer">Cancel</button>
//                 <button onClick={handleVerify2fa} className="py-2.5 bg-cyan-500 rounded-xl text-xs font-semibold text-white cursor-pointer">Verify & Enable</button>
//               </div>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>

//       {/* ═══ ADD MONEY MODAL (Razorpay) ═══ */}
//       <AnimatePresence>
//         {showAddMoneyModal && (
//           <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
//               className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">

//               <div className="flex items-center justify-between mb-5">
//                 <h3 className="text-base font-bold text-white flex items-center gap-2">
//                   <ArrowDownLeft className="w-5 h-5 text-emerald-400" />Add Money to Wallet
//                 </h3>
//                 {addStep === "form" && (
//                   <button onClick={() => setShowAddMoneyModal(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
//                 )}
//               </div>

//               {addStep === "form" && (
//                 <form onSubmit={handleAddMoney} className="space-y-4">
//                   {/* Payment gateway info */}
//                   <div className="flex items-start gap-2.5 px-3 py-2.5 bg-cyan-500/8 border border-cyan-500/15 rounded-xl text-xs text-cyan-300">
//                     <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
//                     Razorpay will open with Bank Transfer, UPI &amp; Card options.
//                   </div>
//                   <div>
//                     <label className="text-xs text-gray-500 mb-1.5 block">Amount (₹)</label>
//                     <input type="number" step="1" min="1" placeholder="Enter amount" required
//                       value={addAmount} onChange={(e) => setAddAmount(e.target.value)}
//                       className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
//                   </div>
//                   {/* Quick amount pills */}
//                   <div className="flex gap-2">
//                     {[500, 1000, 5000, 10000].map(n => (
//                       <button key={n} type="button" onClick={() => setAddAmount(String(n))}
//                         className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${
//                           addAmount === String(n)
//                             ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
//                             : "border-white/8 text-gray-600 hover:text-white"
//                         }`}>
//                         ₹{n >= 1000 ? `${n/1000}k` : n}
//                       </button>
//                     ))}
//                   </div>
//                   {/* Payment method icons (decorative — Razorpay shows all) */}
//                   <div className="flex items-center gap-2 px-3 py-2 bg-white/3 border border-white/5 rounded-xl">
//                     <span className="text-[10px] text-gray-600">Accepted:</span>
//                     {["💳 Card","🏦 Net Banking","📱 UPI","💰 Wallet"].map(m => (
//                       <span key={m} className="text-[10px] text-gray-500 px-2 py-0.5 bg-white/5 rounded-md">{m}</span>
//                     ))}
//                   </div>
//                   <div className="grid grid-cols-2 gap-3 pt-1">
//                     <button type="button" onClick={() => setShowAddMoneyModal(false)}
//                       className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">
//                       Cancel
//                     </button>
//                     <button type="submit" disabled={addLoading}
//                       className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
//                       {addLoading
//                         ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Opening...</>
//                         : "Pay via Razorpay →"}
//                     </button>
//                   </div>
//                 </form>
//               )}

//               {addStep === "processing" && (
//                 <div className="flex flex-col items-center py-8 gap-4">
//                   <div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
//                   <div className="text-sm text-gray-400 text-center">
//                     Opening Razorpay checkout…<br />
//                     <span className="text-xs text-gray-600">Select Bank / UPI / Card to pay.</span>
//                   </div>
//                 </div>
//               )}

//               {addStep === "success" && (
//                 <div className="flex flex-col items-center py-6 gap-4">
//                   <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
//                     <CheckCircle className="w-7 h-7 text-emerald-400" />
//                   </div>
//                   <div className="text-base font-bold text-white">₹{parseFloat(addAmount).toFixed(2)} Added!</div>
//                   <div className="text-xs text-gray-500 text-center">Payment verified and wallet credited.</div>
//                   <div className="text-lg font-bold text-cyan-400">
//                     New Balance: ₹{parseFloat(wallet?.available_balance || wallet?.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
//                   </div>
//                   <button onClick={() => { setShowAddMoneyModal(false); setAddStep("form"); setAddAmount(""); }}
//                     className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90">
//                     Done
//                   </button>
//                 </div>
//               )}
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>

//       {/* ═══ WITHDRAW MODAL ═══ */}
//       <AnimatePresence>
//         {showWithdrawModal && (
//           <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
//               className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
//               <h3 className="text-base font-bold text-white flex items-center gap-2"><ArrowUpRight className="w-5 h-5 text-red-400" />Withdraw Funds</h3>
//               <div className="bg-[#141C30] border border-white/5 rounded-lg p-2.5 flex justify-between text-xs">
//                 <span className="text-gray-400">Available Balance</span>
//                 <span className="font-bold text-cyan-400">₹{parseFloat(wallet?.available_balance || 0).toFixed(2)}</span>
//               </div>
//               <form onSubmit={handleWithdraw} className="space-y-4">
//                 <div>
//                   <label className="text-xs text-gray-500 mb-1.5 block">Amount (₹)</label>
//                   <input type="number" step="0.01" min="1" placeholder="Enter amount" required
//                     value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
//                     className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none" />
//                 </div>
//                 <div>
//                   <label className="text-xs text-gray-500 mb-1.5 block">Withdraw to</label>
//                   <select className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none">
//                     {linkedMethods.map(m => <option key={m.id} value={m.id}>{m.name} ({m.type})</option>)}
//                   </select>
//                 </div>
//                 <div className="grid grid-cols-2 gap-3">
//                   <button type="button" onClick={() => setShowWithdrawModal(false)}
//                     className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
//                   <button type="submit" disabled={withdrawLoading}
//                     className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer">
//                     {withdrawLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing...</> : "Withdraw Funds"}
//                   </button>
//                 </div>
//               </form>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>

//       {/* ═══ TRANSFER MODAL ═══ */}
//       <AnimatePresence>
//         {showTransferModal && (
//           <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
//               className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
//               <h3 className="text-base font-bold text-white flex items-center gap-2"><Building className="w-5 h-5 text-cyan-400" />Transfer to Bank</h3>
//               <div className="bg-[#141C30] border border-white/5 rounded-lg p-2.5 flex justify-between text-xs">
//                 <span className="text-gray-400">Available Balance</span>
//                 <span className="font-bold text-cyan-400">₹{parseFloat(wallet?.available_balance || 0).toFixed(2)}</span>
//               </div>
//               <form onSubmit={handleTransfer} className="space-y-4">
//                 <div>
//                   <label className="text-xs text-gray-500 mb-1.5 block">Amount (₹)</label>
//                   <input type="number" step="0.01" min="1" placeholder="Enter amount" required
//                     value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)}
//                     className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none" />
//                 </div>
//                 <div>
//                   <label className="text-xs text-gray-500 mb-1.5 block">Target Bank Account</label>
//                   <select className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none">
//                     {linkedMethods.filter(m => m.type === "Bank Account").map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
//                   </select>
//                 </div>
//                 <div className="grid grid-cols-2 gap-3">
//                   <button type="button" onClick={() => setShowTransferModal(false)}
//                     className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-xs text-gray-400 hover:text-white cursor-pointer">Cancel</button>
//                   <button type="submit" disabled={transferLoading}
//                     className="py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-semibold text-white hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer">
//                     {transferLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing...</> : "Confirm Transfer"}
//                   </button>
//                 </div>
//               </form>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }























