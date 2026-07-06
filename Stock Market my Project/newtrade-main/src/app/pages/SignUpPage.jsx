import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { motion } from "motion/react";
import {
  BarChart2,
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  ArrowRight,
  Check,
  ChevronLeft,
  AlertCircle,
  CreditCard,
  Building,
  Smartphone,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

const steps = [
  { label: "Account",     icon: "01" },
  { label: "Preferences", icon: "02" },
  { label: "Payment",     icon: "03" },
  { label: "Verify",      icon: "04" },
];

const plans = [
  {
    id:      "free",
    tierId:  "FREE",
    name:    "Starter",
    price:   "Free",
    monthly: 0,
    perks:   ["10 stocks watchlist", "15-min delayed data", "Basic charts"],
  },
  {
    id:      "pro",
    tierId:  "PRO",
    name:    "Pro",
    price:   "₹1,599/mo",
    monthly: 1599,
    perks:   ["Unlimited watchlist", "Real-time data", "AI insights", "Priority support"],
    popular: true,
  },
  {
    id:      "elite",
    tierId:  "PREMIUM",
    name:    "Elite",
    price:   "₹3,999/mo",
    monthly: 3999,
    perks:   ["Everything in Pro", "API access", "Dark-pool data", "Dedicated manager"],
  },
];

const interests = ["US Stocks", "ETFs", "Options", "Crypto", "Forex", "Commodities", "REITs", "Bonds"];

export function SignUpPage() {
  const navigate  = useNavigate();
  const { login } = useAuth();

  /* ── Core state ── */
  const [step,       setStep]       = useState(0);
  const [showPw,     setShowPw]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [plan,       setPlan]       = useState("pro");
  const [experience, setExperience] = useState("intermediate");
  const [tags,       setTags]       = useState(["US Stocks", "ETFs"]);
  const [form,       setForm]       = useState({ name: "", email: "", password: "" });
  const [otp,        setOtp]        = useState(Array(6).fill(""));

  /* ── Payment state ── */
  const [paymentMethod,         setPaymentMethod]         = useState(null);
  const [paymentLoading,        setPaymentLoading]        = useState(false);
  const [paymentSuccess,        setPaymentSuccess]        = useState(false);
  const [isPaymentOtpSent,      setIsPaymentOtpSent]      = useState(false);
  const [paymentOtp,            setPaymentOtp]            = useState(Array(6).fill(""));
  const [isRedirecting,         setIsRedirecting]         = useState(false);
  const [redirectTarget,        setRedirectTarget]        = useState("");
  const [isPendingConfirmation, setIsPendingConfirmation] = useState(false);
  const [selectedUpiApp,        setSelectedUpiApp]        = useState(null);
  const [showUpiBottomSheet,    setShowUpiBottomSheet]    = useState(false);
  const [selectedUpiBank,       setSelectedUpiBank]       = useState("recommended");
  const [isUpiAppsExpanded,     setIsUpiAppsExpanded]     = useState(false);
  const [razorpayOrderId,       setRazorpayOrderId]       = useState(null);

  const [cardForm, setCardForm] = useState({
    number: "", expiry: "", cvv: "", name: "", mobile: "", saveCard: false,
  });
  const [cardErrors, setCardErrors] = useState({});

  const [netbankingForm, setNetbankingForm] = useState({
    bank: "", userId: "", password: "", mobile: "",
  });
  const [netbankingErrors, setNetbankingErrors] = useState({});

  const [upiId,    setUpiId]    = useState("");
  const [upiError, setUpiError] = useState("");

  const selectedPlanObj = plans.find((p) => p.id === plan) || plans[1];

  /* ── Helpers ── */
  const toggleTag = (t) =>
    setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const pwStrength =
    form.password.length >= 8 ? 4
    : form.password.length >= 6 ? 3
    : form.password.length >= 4 ? 2
    : form.password.length > 0  ? 1 : 0;

  /* ── OTP input handlers ── */
  const handleOtp = (v, i) => {
    const val = v.replace(/\D/g, "");
    if (!val && v !== "") return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) setTimeout(() => document.getElementById(`otp-${i + 1}`)?.focus(), 10);
  };
  const handleOtpKeyDown = (e, i) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) document.getElementById(`otp-${i - 1}`)?.focus();
  };
  const handlePaymentOtp = (v, i) => {
    const val = v.replace(/\D/g, "");
    if (!val && v !== "") return;
    const next = [...paymentOtp];
    next[i] = val.slice(-1);
    setPaymentOtp(next);
    if (val && i < 5) setTimeout(() => document.getElementById(`pay-otp-${i + 1}`)?.focus(), 10);
  };
  const handlePaymentOtpKeyDown = (e, i) => {
    if (e.key === "Backspace" && !paymentOtp[i] && i > 0) document.getElementById(`pay-otp-${i - 1}`)?.focus();
  };

  /* ── Card field handlers ── */
  const handleCardNumberChange = (e) => {
    let val = e.target.value.replace(/\D/g, "").slice(0, 16);
    setCardForm({ ...cardForm, number: val.replace(/(\d{4})(?=\d)/g, "$1 ") });
    if (cardErrors.number) setCardErrors({ ...cardErrors, number: "" });
  };
  const handleExpiryChange = (e) => {
    let val = e.target.value.replace(/\D/g, "").slice(0, 4);
    setCardForm({ ...cardForm, expiry: val.length > 2 ? val.slice(0, 2) + " / " + val.slice(2) : val });
    if (cardErrors.expiry) setCardErrors({ ...cardErrors, expiry: "" });
  };
  const handleCvvChange = (e) => {
    setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, "").slice(0, 3) });
    if (cardErrors.cvv) setCardErrors({ ...cardErrors, cvv: "" });
  };
  const handleCardMobileChange = (e) => {
    setCardForm({ ...cardForm, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) });
    if (cardErrors.mobile) setCardErrors({ ...cardErrors, mobile: "" });
  };

  /* ── Validation ── */
  const validateCardForm = () => {
    const errors = {};
    if (cardForm.number.replace(/\s/g, "").length !== 16) errors.number = "Card number must be 16 digits";
    const ex = cardForm.expiry.replace(/\s/g, "");
    if (ex.length !== 5 || !ex.includes("/")) errors.expiry = "Expiry must be MM / YY";
    else { const m = parseInt(ex.split("/")[0].trim(), 10); if (m < 1 || m > 12) errors.expiry = "Invalid month"; }
    if (cardForm.cvv.length !== 3)        errors.cvv    = "CVV must be 3 digits";
    if (!cardForm.name.trim())            errors.name   = "Name on card is required";
    if (cardForm.mobile.length !== 10)    errors.mobile = "Mobile number must be 10 digits";
    setCardErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const validateNetBankingForm = () => {
    const errors = {};
    if (!netbankingForm.bank)                 errors.bank     = "Please select a bank";
    if (!netbankingForm.userId.trim())        errors.userId   = "User ID / Customer ID is required";
    if (!netbankingForm.password)             errors.password = "Password is required";
    if (netbankingForm.mobile.length !== 10)  errors.mobile   = "Mobile number must be 10 digits";
    setNetbankingErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* ══════════════════════════════════════════════════════════════
     API CALLS
  ══════════════════════════════════════════════════════════════ */

  /* Step 0 — Register */
  const doRegister = async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`${API_BASE}/authentication/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.name.trim(),
          username:  form.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") + "_" + Date.now().toString().slice(-4),
          email:     form.email.trim().toLowerCase(),
          password:  form.password,
          role_name: "USER",
        }),
      });
      const data = await res.json();
      if (!data.bool) { setError(data.response?.message || "Registration failed."); return; }
      localStorage.setItem("access_token",  data.response.access_token);
      localStorage.setItem("refresh_token", data.response.refresh_token || "");
      setStep(1);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* After payment — save preferences & subscribe */
  const doSavePreferencesAndSubscribe = async () => {
    const token = getToken();
    if (!token) return;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    /* Save preferences */
    try {
      await fetch(`${API_BASE}/user_preferences/me`, {
        method:  "PUT",
        headers,
        body: JSON.stringify({
          experience_level:      experience.toUpperCase(),
          investment_interests:  tags,
        }),
      });
    } catch {}

    /* Subscribe — only for paid plans */
    if (plan !== "free") {
      try {
        /* Fetch plans to get plan_id */
        const plansRes  = await fetch(`${API_BASE}/subscriptions/plans`, { headers });
        const plansData = await plansRes.json();
        if (plansData.bool) {
          const plansList = plansData.response?.plans || plansData.response || [];
          const match     = plansList.find(
            (p) => (p.plan_tier || "").toUpperCase() === selectedPlanObj.tierId
          );
          if (match) {
            await fetch(`${API_BASE}/subscriptions/subscribe`, {
              method:  "POST",
              headers,
              body: JSON.stringify({
                plan_id:       match.plan_id || match.id,
                billing_cycle: "MONTHLY",
                payment_method: paymentMethod === "card" ? "CARD"
                  : paymentMethod === "netbanking" ? "BANK_TRANSFER"
                  : "UPI",
                gateway_transaction_id: razorpayOrderId || `TXN_${Date.now()}`,
              }),
            });
          }
        }
      } catch {}
    }
  };

  /* Step 3 — Verify OTP */
  const doVerifyOtp = async () => {
    setLoading(true);
    setError("");
    const token = getToken();
    if (!token) { setError("Session expired. Please sign up again."); setLoading(false); return; }
    try {
      const res  = await fetch(`${API_BASE}/authentication/verify_otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ otp_code: otp.join(""), purpose: "EMAIL_VERIFICATION" }),
      });
      const data = await res.json();
      if (!data.bool) { setError(data.response?.message || "Invalid OTP."); return; }
      navigate("/user");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* Resend OTP */
  const doResendOtp = async () => {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/authentication/resend_otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ purpose: "EMAIL_VERIFICATION" }),
      });
    } catch {}
  };

  /* ── Payment handlers ── */
  const handleCardPay = (e) => {
    e.preventDefault();
    if (!validateCardForm()) return;
    setPaymentLoading(true);
    setTimeout(() => {
      setPaymentLoading(false);
      setIsPaymentOtpSent(true);
      setPaymentOtp(Array(6).fill(""));
    }, 1000);
  };

  const handleNetBankingPay = (e) => {
    e.preventDefault();
    if (!validateNetBankingForm()) return;
    setPaymentLoading(true);
    setTimeout(() => {
      setPaymentLoading(false);
      setIsPaymentOtpSent(true);
      setPaymentOtp(Array(6).fill(""));
    }, 1000);
  };

  const handleUpiPay = (e) => {
    e.preventDefault();
    if (!upiId.includes("@") || upiId.length < 3) {
      setUpiError("Please enter a valid UPI ID (e.g. username@upi)");
      return;
    }
    setPaymentLoading(true);
    setTimeout(() => { setPaymentLoading(false); setIsPendingConfirmation(true); }, 1000);
  };

  const handleVerifyPaymentOtp = () => {
    setPaymentLoading(true);
    setTimeout(() => { setPaymentLoading(false); handlePaymentComplete(); }, 1200);
  };

  const handlePaymentComplete = async () => {
    setPaymentSuccess(true);
    setRazorpayOrderId(`RZP_${Date.now()}`);
    await doSavePreferencesAndSubscribe();
  };

  /* ── Submit per step ── */
  const submit = async () => {
    setError("");
    if (step === 0) { await doRegister(); return; }
    if (step === 1) { setStep(2); return; }
    if (step === 3) { await doVerifyOtp(); return; }
  };

  /* ════════════════════════════════════════════════════════════════
     PAYMENT RENDER HELPERS
  ════════════════════════════════════════════════════════════════ */

  const renderPlanDetailsHeader = () => (
    <div className="mb-6 bg-[#141C30] border border-white/8 rounded-xl p-4 flex items-center justify-between">
      <div>
        <div className="text-xs text-gray-500 mb-0.5">Selected Plan</div>
        <div className="text-base font-bold text-white flex items-center gap-1.5">
          {selectedPlanObj.name} Plan
          {selectedPlanObj.popular && (
            <span className="px-1.5 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-md text-[10px] font-medium text-white">
              Popular
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-gray-500 mb-0.5">Total Amount</div>
        <div className="text-lg font-black text-cyan-400">{selectedPlanObj.price}</div>
      </div>
    </div>
  );

  const renderPaymentOptionsView = () => {
    if (plan === "free") {
      return (
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-cyan-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Payment Required</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
            You selected the Starter plan which is completely free.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">Back</button>
            <button
              onClick={async () => { await doSavePreferencesAndSubscribe(); setStep(3); }}
              className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              Proceed to Verification <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    const methods = [
      { id: "card",       label: "Debit / Credit Card",  icon: CreditCard,  subtitle: "Visa, Mastercard, RuPay" },
      { id: "netbanking", label: "Internet Banking",      icon: Building,    subtitle: "All major banks supported" },
      { id: "upi_apps",   label: "UPI Apps",              icon: Smartphone,  subtitle: "PhonePe, Google Pay, Paytm" },
      { id: "upi_id",     label: "UPI ID",                icon: Plus,        subtitle: "Pay using any UPI ID" },
    ];

    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Choose Payment Option</h3>
        <div className="space-y-3 mb-6">
          {methods.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.id} className="border border-white/8 rounded-xl bg-[#141C30] overflow-hidden transition-all">
                <div
                  onClick={() => {
                    if (m.id === "upi_apps") { setIsUpiAppsExpanded(!isUpiAppsExpanded); setPaymentMethod(null); }
                    else { setPaymentMethod(m.id); setIsUpiAppsExpanded(false); }
                  }}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#1b253d] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-cyan-500/10 transition-colors">
                      <Icon className="w-5 h-5 text-gray-400 group-hover:text-cyan-400 transition-colors" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{m.label}</div>
                      <div className="text-xs text-gray-500">{m.subtitle}</div>
                    </div>
                  </div>
                  <div className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center group-hover:border-cyan-500/50 transition-colors">
                    <div className={`w-2.5 h-2.5 rounded-full bg-cyan-400 transition-transform ${(m.id === "upi_apps" && isUpiAppsExpanded) || paymentMethod === m.id ? "scale-100" : "scale-0"}`} />
                  </div>
                </div>

                {/* UPI Apps sub-options */}
                {m.id === "upi_apps" && isUpiAppsExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-white/5 bg-[#0C1220] space-y-3">
                    {[
                      { val: "phonepe", label: "PhonePe",    badge: "text-violet-400 bg-violet-500/10" },
                      { val: "gpay",    label: "Google Pay", badge: "text-blue-400 bg-blue-500/10" },
                      { val: "paytm",   label: "Paytm",      badge: "text-cyan-400 bg-cyan-500/10" },
                    ].map((app) => (
                      <label key={app.val} className="flex flex-col p-3 border border-white/5 rounded-lg bg-[#141C30]/50 hover:bg-[#141C30] cursor-pointer transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <input type="radio" name="upi_app" value={app.val} checked={selectedUpiApp === app.val} onChange={() => setSelectedUpiApp(app.val)} className="accent-cyan-400 w-4 h-4 cursor-pointer" />
                            <span className="text-sm font-medium text-white">{app.label}</span>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${app.badge}`}>UPI</span>
                        </div>
                        {selectedUpiApp === app.val && (
                          <div className="mt-3">
                            <button type="button" onClick={() => setShowUpiBottomSheet(true)} className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-xs font-bold text-white hover:opacity-95 transition-opacity">
                              Pay {selectedPlanObj.price}
                            </button>
                          </div>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={() => setStep(1)} className="w-full py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">Back</button>
      </div>
    );
  };

  const renderCardFormView = () => (
    <form onSubmit={handleCardPay}>
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Card Payment Details</h3>
      <div className="space-y-4 mb-6">
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Card Number</label>
          <div className="relative">
            <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input type="text" placeholder="4111 2222 3333 4444" value={cardForm.number} onChange={handleCardNumberChange}
              className={`w-full bg-[#141C30] border rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors ${cardErrors.number ? "border-red-500/50" : "border-white/8"}`} />
          </div>
          {cardErrors.number && <span className="text-[11px] text-red-400 mt-1 block">{cardErrors.number}</span>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Expiry Date</label>
            <input type="text" placeholder="MM / YY" value={cardForm.expiry} onChange={handleExpiryChange}
              className={`w-full bg-[#141C30] border rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors ${cardErrors.expiry ? "border-red-500/50" : "border-white/8"}`} />
            {cardErrors.expiry && <span className="text-[11px] text-red-400 mt-1 block">{cardErrors.expiry}</span>}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">CVV</label>
            <input type="password" placeholder="123" value={cardForm.cvv} onChange={handleCvvChange}
              className={`w-full bg-[#141C30] border rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors ${cardErrors.cvv ? "border-red-500/50" : "border-white/8"}`} />
            {cardErrors.cvv && <span className="text-[11px] text-red-400 mt-1 block">{cardErrors.cvv}</span>}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Name on Card</label>
          <input type="text" placeholder="John Doe" value={cardForm.name} onChange={(e) => { setCardForm({ ...cardForm, name: e.target.value }); if (cardErrors.name) setCardErrors({ ...cardErrors, name: "" }); }}
            className={`w-full bg-[#141C30] border rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors ${cardErrors.name ? "border-red-500/50" : "border-white/8"}`} />
          {cardErrors.name && <span className="text-[11px] text-red-400 mt-1 block">{cardErrors.name}</span>}
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Mobile Number</label>
          <div className="relative">
            <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input type="text" placeholder="9876543210" value={cardForm.mobile} onChange={handleCardMobileChange}
              className={`w-full bg-[#141C30] border rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors ${cardErrors.mobile ? "border-red-500/50" : "border-white/8"}`} />
          </div>
          {cardErrors.mobile && <span className="text-[11px] text-red-400 mt-1 block">{cardErrors.mobile}</span>}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <input type="checkbox" id="saveCard" checked={cardForm.saveCard} onChange={(e) => setCardForm({ ...cardForm, saveCard: e.target.checked })} className="accent-cyan-500 w-4 h-4" />
          <label htmlFor="saveCard" className="text-xs text-gray-500 cursor-pointer select-none">Save card for future checkout</label>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => setPaymentMethod(null)} className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">Back</button>
        <button type="submit" disabled={paymentLoading} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
          {paymentLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</> : <>Pay Now <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </form>
  );

  const renderNetBankingFormView = () => (
    <form onSubmit={handleNetBankingPay}>
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Internet Banking Details</h3>
      <div className="space-y-4 mb-6">
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Select Bank</label>
          <div className="relative">
            <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
            <select value={netbankingForm.bank} onChange={(e) => { setNetbankingForm({ ...netbankingForm, bank: e.target.value }); if (netbankingErrors.bank) setNetbankingErrors({ ...netbankingErrors, bank: "" }); }}
              className={`w-full bg-[#141C30] border rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-white/20 transition-colors ${netbankingErrors.bank ? "border-red-500/50" : "border-white/8"}`}>
              <option value="">-- Choose a Bank --</option>
              <option value="sbi">State Bank of India</option>
              <option value="hdfc">HDFC Bank</option>
              <option value="icici">ICICI Bank</option>
              <option value="axis">Axis Bank</option>
              <option value="kotak">Kotak Mahindra Bank</option>
            </select>
          </div>
          {netbankingErrors.bank && <span className="text-[11px] text-red-400 mt-1 block">{netbankingErrors.bank}</span>}
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">User ID / Customer ID</label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
            <input type="text" placeholder="Enter User ID" value={netbankingForm.userId}
              onChange={(e) => { setNetbankingForm({ ...netbankingForm, userId: e.target.value }); if (netbankingErrors.userId) setNetbankingErrors({ ...netbankingErrors, userId: "" }); }}
              className={`w-full bg-[#141C30] border rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors ${netbankingErrors.userId ? "border-red-500/50" : "border-white/8"}`} />
          </div>
          {netbankingErrors.userId && <span className="text-[11px] text-red-400 mt-1 block">{netbankingErrors.userId}</span>}
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
            <input type="password" placeholder="Enter Password" value={netbankingForm.password}
              onChange={(e) => { setNetbankingForm({ ...netbankingForm, password: e.target.value }); if (netbankingErrors.password) setNetbankingErrors({ ...netbankingErrors, password: "" }); }}
              className={`w-full bg-[#141C30] border rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors ${netbankingErrors.password ? "border-red-500/50" : "border-white/8"}`} />
          </div>
          {netbankingErrors.password && <span className="text-[11px] text-red-400 mt-1 block">{netbankingErrors.password}</span>}
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Registered Mobile Number</label>
          <div className="relative">
            <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
            <input type="text" placeholder="9876543210" value={netbankingForm.mobile}
              onChange={(e) => { let v = e.target.value.replace(/\D/g, "").slice(0, 10); setNetbankingForm({ ...netbankingForm, mobile: v }); if (netbankingErrors.mobile) setNetbankingErrors({ ...netbankingErrors, mobile: "" }); }}
              className={`w-full bg-[#141C30] border rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors ${netbankingErrors.mobile ? "border-red-500/50" : "border-white/8"}`} />
          </div>
          {netbankingErrors.mobile && <span className="text-[11px] text-red-400 mt-1 block">{netbankingErrors.mobile}</span>}
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => setPaymentMethod(null)} className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">Back</button>
        <button type="submit" disabled={paymentLoading} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
          {paymentLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</> : <>Pay Now <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </form>
  );

  const renderUpiIdFormView = () => (
    <form onSubmit={handleUpiPay}>
      <h3 className="text-sm font-semibold text-gray-400 mb-4">UPI ID Payment</h3>
      <div className="space-y-4 mb-6">
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">UPI ID</label>
          <div className="relative">
            <Plus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
            <input type="text" placeholder="username@upi" value={upiId}
              onChange={(e) => { setUpiId(e.target.value); if (upiError) setUpiError(""); }}
              className={`w-full bg-[#141C30] border rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors ${upiError ? "border-red-500/50" : "border-white/8"}`} />
          </div>
          {upiError && <span className="text-[11px] text-red-400 mt-1 block">{upiError}</span>}
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => setPaymentMethod(null)} className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">Back</button>
        <button type="submit" disabled={paymentLoading} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
          {paymentLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</> : <>Pay Now <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </form>
  );

  const renderPaymentOtpView = () => {
    const mobileNum      = paymentMethod === "card" ? cardForm.mobile : netbankingForm.mobile;
    const formattedMobile = mobileNum ? `${mobileNum.slice(0, 3)}***${mobileNum.slice(-4)}` : "your registered number";
    return (
      <div className="text-center py-4">
        <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto mb-5">
          <Smartphone className="w-7 h-7 text-cyan-400 animate-pulse" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">OTP Verification</h2>
        <p className="text-sm text-gray-400 mb-1">OTP sent to your registered mobile number</p>
        <p className="text-sm text-cyan-400 font-medium mb-7">+91 {formattedMobile}</p>
        <div className="flex justify-center gap-2.5 mb-7">
          {paymentOtp.map((d, i) => (
            <input key={i} id={`pay-otp-${i}`} type="text" inputMode="numeric" pattern="\d*" maxLength={1} value={d}
              onChange={(e) => handlePaymentOtp(e.target.value, i)}
              onKeyDown={(e) => handlePaymentOtpKeyDown(e, i)}
              className="w-11 h-13 text-center text-lg font-bold bg-[#141C30] border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 transition-colors" />
          ))}
        </div>
        <div className="text-sm text-gray-600 mb-6">Didn't receive it? <button type="button" className="text-cyan-400 hover:underline">Resend OTP</button></div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setIsPaymentOtpSent(false)} className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">Back</button>
          <button type="button" onClick={handleVerifyPaymentOtp} disabled={paymentLoading || paymentOtp.join("").length !== 6}
            className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
            {paymentLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying...</> : <>Verify & Pay <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    );
  };

  const renderRedirectView = () => (
    <div className="text-center py-12 flex flex-col items-center justify-center">
      <div className="relative w-16 h-16 mb-6">
        <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin absolute top-0 left-0" />
        <div className="w-16 h-16 flex items-center justify-center absolute top-0 left-0">
          <Smartphone className="w-6 h-6 text-cyan-400 animate-pulse" />
        </div>
      </div>
      <h3 className="text-lg font-bold text-white mb-2">Redirecting to {redirectTarget}...</h3>
      <p className="text-sm text-gray-500">Please do not close this window or click back.</p>
    </div>
  );

  const renderPendingConfirmationView = () => (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto mb-5">
        <Smartphone className="w-8 h-8 text-cyan-400 animate-pulse" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Payment Request Sent</h2>
      <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
        Please approve the payment request on your {paymentMethod === "upi_id" ? "UPI app" : redirectTarget}.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={() => { setIsPendingConfirmation(false); setPaymentMethod(null); }} className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">Cancel</button>
        <button type="button" onClick={handlePaymentComplete} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all flex items-center justify-center gap-2">
          I have completed payment <Check className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const renderPaymentSuccessView = () => (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
        <ShieldCheck className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
      <p className="text-sm text-gray-400 mb-2">Your TradeFlow {selectedPlanObj.name} subscription is now active.</p>
      <p className="text-xs text-gray-600 mb-6">Subscription saved · Preferences updated</p>
      <button onClick={() => setStep(3)} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all flex items-center justify-center gap-2">
        Continue to Email Verification <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );

  const renderUpiBottomSheet = () => {
    if (!showUpiBottomSheet) return null;
    const appName = { phonepe: "PhonePe", gpay: "Google Pay", paytm: "Paytm" }[selectedUpiApp] || "UPI App";
    return (
      <div className="absolute inset-0 bg-[#07091A]/80 backdrop-blur-sm z-50 flex items-end justify-center">
        <div className="w-full bg-[#0C1220] border-t border-white/10 rounded-t-3xl p-6 shadow-2xl text-left">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2"><Smartphone className="w-5 h-5 text-cyan-400" /> Pay via {appName}</h3>
            <button type="button" onClick={() => setShowUpiBottomSheet(false)} className="text-gray-500 hover:text-white text-sm px-2 py-1 bg-white/5 rounded-lg transition-colors">Cancel</button>
          </div>
          <div className="bg-[#141C30] border border-white/8 rounded-xl p-4 mb-5 flex justify-between items-center">
            <div><span className="text-xs text-gray-500 block mb-0.5">Total Payable</span><span className="text-sm font-semibold text-white">TradeFlow {selectedPlanObj.name} Plan</span></div>
            <span className="text-xl font-black text-cyan-400">{selectedPlanObj.price}</span>
          </div>
          <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
            <div>
              <h4 className="text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Recommended Bank Account</h4>
              <label className="flex items-center justify-between p-3.5 bg-[#141C30] border border-cyan-500/30 rounded-xl cursor-pointer hover:bg-[#1b253d] transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center"><Building className="w-5 h-5 text-cyan-400" /></div>
                  <div><div className="text-sm font-semibold text-white">HDFC Bank Savings A/C</div><div className="text-xs text-gray-400">A/C No: *******1234</div></div>
                </div>
                <input type="radio" name="bottom_bank" value="recommended" checked={selectedUpiBank === "recommended"} onChange={() => setSelectedUpiBank("recommended")} className="accent-cyan-400 w-4 h-4 cursor-pointer" />
              </label>
            </div>
            <div className="space-y-2.5">
              <h4 className="text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Other Bank Accounts</h4>
              {[
                { val: "sbi",   name: "State Bank of India", acc: "*******5678" },
                { val: "icici", name: "ICICI Bank Savings A/C", acc: "*******9012" },
              ].map((b) => (
                <label key={b.val} className="flex items-center justify-between p-3 bg-[#141C30]/50 border border-white/5 rounded-xl cursor-pointer hover:bg-[#1b253d] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center"><Building className="w-4 h-4 text-gray-400" /></div>
                    <div><div className="text-sm font-medium text-white">{b.name}</div><div className="text-xs text-gray-500">A/C No: {b.acc}</div></div>
                  </div>
                  <input type="radio" name="bottom_bank" value={b.val} checked={selectedUpiBank === b.val} onChange={() => setSelectedUpiBank(b.val)} className="accent-cyan-400 w-4 h-4 cursor-pointer" />
                </label>
              ))}
            </div>
            <div className="border-t border-white/5 pt-3 space-y-2">
              <button type="button" className="flex items-center w-full p-2 hover:bg-white/5 rounded-lg transition-colors gap-1.5 text-xs font-semibold text-gray-400 hover:text-white">
                <Plus className="w-3.5 h-3.5 text-cyan-400" /> Add Bank Account
              </button>
              <button type="button" className="flex items-center w-full p-2 hover:bg-white/5 rounded-lg transition-colors gap-1.5 text-xs font-semibold text-gray-400 hover:text-white">
                <Plus className="w-3.5 h-3.5 text-cyan-400" /> Add credit line on UPI
              </button>
            </div>
          </div>
          <div className="mt-6">
            <button type="button" onClick={() => { setShowUpiBottomSheet(false); handlePaymentComplete(); }}
              className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20">
              Pay {selectedPlanObj.price} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#07091A] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-cyan-500/6 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-violet-500/6 rounded-full blur-3xl pointer-events-none" />

      <Link to="/" className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors z-10">
        <ChevronLeft className="w-4 h-4" /> Back
      </Link>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg relative z-10">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight">TradeFlow</span>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  i < step ? "bg-emerald-500 text-white"
                  : i === step ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30"
                  : "bg-[#141C30] text-gray-600 border border-white/10"
                }`}>
                  {i < step ? <Check className="w-4 h-4" /> : s.icon}
                </div>
                <span className={`text-xs hidden sm:block transition-colors ${i === step ? "text-white" : "text-gray-600"}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-14 sm:w-20 h-px mx-2 mb-4 transition-all duration-500 ${i < step ? "bg-emerald-500" : "bg-white/8"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-[#0C1220] border border-white/8 rounded-2xl overflow-hidden shadow-2xl relative">

          {/* ── Step 0: Account ── */}
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-7">
              <h2 className="text-xl font-bold text-white mb-1">Create your account</h2>
              <p className="text-sm text-gray-500 mb-6">Join 2.4M+ traders on TradeFlow</p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Johnson"
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com"
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type={showPw ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters"
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-10 pr-11 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.password && (
                    <div className="flex gap-1 mt-2">
                      {[1,2,3,4].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${pwStrength >= i ? (pwStrength >= 4 ? "bg-emerald-500" : pwStrength >= 3 ? "bg-amber-500" : "bg-red-500") : "bg-white/8"}`} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2 pt-1">
                  <input type="checkbox" id="terms" className="mt-0.5 accent-cyan-500" required />
                  <label htmlFor="terms" className="text-xs text-gray-500">
                    I agree to the <span className="text-cyan-400">Terms of Service</span> and{" "}
                    <span className="text-cyan-400">Privacy Policy</span>
                  </label>
                </div>
                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Step 1: Preferences ── */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-7">
              <h2 className="text-xl font-bold text-white mb-1">Set your preferences</h2>
              <p className="text-sm text-gray-500 mb-5">Personalise your trading experience</p>
              <div className="mb-5">
                <div className="text-xs text-gray-500 mb-2.5">Choose a plan</div>
                <div className="grid grid-cols-3 gap-2">
                  {plans.map((p) => (
                    <div key={p.id} onClick={() => setPlan(p.id)}
                      className={`relative rounded-xl p-3 cursor-pointer border transition-all ${plan === p.id ? "border-cyan-500/50 bg-cyan-500/5" : "border-white/8 bg-[#141C30] hover:border-white/15"}`}>
                      {p.popular && <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full text-xs font-medium">Popular</div>}
                      <div className="text-sm font-semibold text-white mb-0.5">{p.name}</div>
                      <div className="text-xs text-cyan-400 mb-2">{p.price}</div>
                      {p.perks.slice(0, 2).map((f) => (
                        <div key={f} className="text-xs text-gray-600 flex items-center gap-1 mb-0.5">
                          <Check className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" />
                          {f.split(" ").slice(0, 3).join(" ")}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-5">
                <div className="text-xs text-gray-500 mb-2.5">Trading experience</div>
                <div className="flex gap-2">
                  {["Beginner", "Intermediate", "Expert"].map((l) => (
                    <button key={l} onClick={() => setExperience(l.toLowerCase())}
                      className={`flex-1 py-2.5 rounded-xl text-xs border transition-all ${experience === l.toLowerCase() ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400" : "border-white/8 bg-[#141C30] text-gray-500 hover:text-white"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-2.5">Investment interests</div>
                <div className="flex flex-wrap gap-2">
                  {interests.map((t) => (
                    <button key={t} onClick={() => toggleTag(t)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-all ${tags.includes(t) ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400" : "border-white/8 text-gray-600 hover:text-white"}`}>
                      {tags.includes(t) && <Check className="w-2.5 h-2.5 inline mr-1" />}{t}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Payment ── */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-7">
              {renderPlanDetailsHeader()}
              {paymentSuccess          ? renderPaymentSuccessView()
               : isRedirecting          ? renderRedirectView()
               : isPendingConfirmation  ? renderPendingConfirmationView()
               : isPaymentOtpSent       ? renderPaymentOtpView()
               : paymentMethod === "card"        ? renderCardFormView()
               : paymentMethod === "netbanking"  ? renderNetBankingFormView()
               : paymentMethod === "upi_id"      ? renderUpiIdFormView()
               :                                   renderPaymentOptionsView()}
            </motion.div>
          )}

          {/* ── Step 3: Verify Email ── */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-7 text-center">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto mb-5">
                <Mail className="w-8 h-8 text-cyan-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Verify your email</h2>
              <p className="text-sm text-gray-500 mb-1">We sent a 6-digit code to</p>
              <p className="text-sm text-white font-medium mb-7">{form.email || "you@example.com"}</p>
              <div className="flex justify-center gap-2.5 mb-7">
                {otp.map((d, i) => (
                  <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" pattern="\d*" maxLength={1} value={d}
                    onChange={(e) => handleOtp(e.target.value, i)} onKeyDown={(e) => handleOtpKeyDown(e, i)}
                    className="w-11 h-13 text-center text-lg font-bold bg-[#141C30] border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 transition-colors" />
                ))}
              </div>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 mb-4">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
                </div>
              )}
              <div className="text-sm text-gray-600 mb-4">
                Didn't receive it?{" "}
                <button className="text-cyan-400 hover:underline" onClick={doResendOtp}>Resend</button>
              </div>
            </motion.div>
          )}

          {/* ── Actions footer (not shown on payment step) ── */}
          {step !== 2 && (
            <div className="flex gap-3 px-7 pb-7">
              {step > 0 && (
                <button onClick={() => { setError(""); setStep((s) => s - 1); }}
                  className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
                  Back
                </button>
              )}
              <button onClick={submit} disabled={loading || (step === 3 && otp.join("").length !== 6)}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {step === 0 ? "Creating account..." : "Verifying..."}</>
                ) : step === 3 ? <>Launch Dashboard <ArrowRight className="w-4 h-4" /></>
                : <>Continue <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          )}

          {renderUpiBottomSheet()}
        </div>

        <p className="text-center mt-5 text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/signin" className="text-cyan-400 hover:underline">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}













