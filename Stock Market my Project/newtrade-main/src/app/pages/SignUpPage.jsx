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
  Phone,
  Calendar,
  MapPin,
  Globe,
  Gift,
  AtSign,
} from "lucide-react";
import {
  filterName, filterEmail, filterUsername, filterMobile,
  validateName, validateEmail, validateUsername, validateMobile,
  validateDob, validatePassword, validateConfirmPassword, validateOtp,
  passwordStrength, runValidators, LIMITS,
} from "../utils/validation";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");

const steps = [
  { label: "Account", icon: "01" },
  { label: "Verify",  icon: "02" },
];

/* Date-picker bounds for the 18-120 age window, as YYYY-MM-DD. */
const _shiftYears = (years) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().split("T")[0];
};
const DOB_MAX = _shiftYears(18);   // youngest allowed
const DOB_MIN = _shiftYears(120);  // oldest allowed

/* Mirrors validatePassword's clauses for the live checklist. */
const PW_RULES = [
  { label: "8+ characters",   test: (s) => s.length >= LIMITS.PASSWORD_MIN },
  { label: "Uppercase letter", test: (s) => /[A-Z]/.test(s) },
  { label: "Lowercase letter", test: (s) => /[a-z]/.test(s) },
  { label: "Number",           test: (s) => /\d/.test(s) },
  { label: "Special character",test: (s) => /[^A-Za-z0-9]/.test(s) },
];

export function SignUpPage() {
  const navigate = useNavigate();

  /* ── Core state ── */
  const [step,    setStep]    = useState(0);
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [form,    setForm]    = useState({
    firstName: "", lastName: "", email: "", mobile: "", dob: "",
    username: "", password: "", confirmPassword: "",
    country: "", state: "", city: "", referralCode: "", acceptTerms: false,
  });
  const [otp, setOtp] = useState(Array(6).fill(""));

  /* ── Per-field validation ── */
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

  /** Update a field, filtering keystrokes and re-checking it once touched. */
  const set = (key, value, filter) => {
    const v = filter ? filter(value) : value;
    const next = { ...form, [key]: v };
    setForm(next);
    if (!touched[key]) return;

    const checks = validators(next);
    setFieldErrors((e) => {
      const updated = { ...e, [key]: checks[key]?.() || "" };
      // Editing `password` changes whether `confirmPassword` still matches, so
      // re-check the partner field or its error goes stale.
      if (key === "password" && touched.confirmPassword) {
        updated.confirmPassword = checks.confirmPassword?.() || "";
      }
      return updated;
    });
  };

  const markTouched = (key) => {
    setTouched((t) => ({ ...t, [key]: true }));
    setFieldErrors((e) => ({ ...e, [key]: validators(form)[key]?.() || "" }));
  };

  /** Field -> validator. Built from a form snapshot so it can run on any state. */
  const validators = (f) => ({
    firstName: () => validateName(f.firstName, "First name"),
    lastName: () => validateName(f.lastName, "Last name"),
    email: () => validateEmail(f.email),
    mobile: () => validateMobile(f.mobile, "IN"),
    dob: () => validateDob(f.dob),
    username: () => validateUsername(f.username),
    password: () => validatePassword(f.password),
    confirmPassword: () => validateConfirmPassword(f.password, f.confirmPassword),
    country: () => validateName(f.country, "Country"),
    state: () => validateName(f.state, "State"),
    city: () => validateName(f.city, "City"),
    acceptTerms: () => (f.acceptTerms ? "" : "Please accept the Terms & Conditions."),
  });

  /* ── Helpers ── */
  const pwStrength = passwordStrength(form.password);

  /** Shared field shell: renders the inline error and reddens the border. */
  const errClass = (key) =>
    fieldErrors[key]
      ? "border-red-500/50 focus:border-red-500/50"
      : "border-white/8 focus:border-white/20";

  const FieldError = ({ name }) =>
    fieldErrors[name] ? (
      <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
        <AlertCircle className="w-3 h-3 flex-shrink-0" /> {fieldErrors[name]}
      </p>
    ) : null;

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

  /* ══════════════════════════════════════════════════════════════
     API CALLS
  ══════════════════════════════════════════════════════════════ */

  /* Step 0 — Register (creates the account + sends the email OTP) */
  const doRegister = async () => {
    // ── Client-side validation (mirrored server-side; see validators.py) ──
    const { errors, isValid, firstError } = runValidators(validators(form));
    setFieldErrors(errors);
    setTouched(Object.fromEntries(Object.keys(validators(form)).map((k) => [k, true])));
    if (!isValid) { setError(firstError); return; }

    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`${API_BASE}/authentication/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name:     form.firstName.trim(),
          last_name:      form.lastName.trim(),
          full_name:      `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
          username:       form.username.trim(),
          email:          form.email.trim().toLowerCase(),
          password:       form.password,
          mobile_number:  form.mobile.trim(),
          date_of_birth:  form.dob,               // YYYY-MM-DD from <input type="date">
          country:        form.country.trim(),
          state:          form.state.trim(),
          city:           form.city.trim(),
          referral_code:  form.referralCode.trim() || undefined,
          terms_accepted: form.acceptTerms,
          role_name:      "USER",
        }),
      });
      const data = await res.json();
      if (!data.bool) { setError(data.response?.message || "Registration failed."); return; }
      localStorage.setItem("access_token",  data.response.access_token);
      localStorage.setItem("refresh_token", data.response.refresh_token || "");
      setStep(1);   // → Verify OTP
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* Step 1 — Verify OTP (activates the account) */
  const doVerifyOtp = async () => {
    const otpError = validateOtp(otp.join(""), 6);
    if (otpError) { setError(otpError); return; }
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
      // Don't auto-sign-in after signup — clear the registration tokens and
      // require the user to log in explicitly with their credentials.
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      navigate("/signin?verified=1");
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

  /* ── Submit per step ── */
  const submit = async () => {
    setError("");
    if (step === 0) { await doRegister(); return; }
    if (step === 1) { await doVerifyOtp(); return; }
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
                {/* First + Last name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">First Name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                      <input type="text" value={form.firstName} inputMode="text" maxLength={LIMITS.NAME_MAX}
                        onChange={(e) => set("firstName", e.target.value, filterName)}
                        onBlur={() => markTouched("firstName")} placeholder="Alex"
                        className={`w-full bg-[#141C30] border ${errClass("firstName")} rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                    </div>
                    <FieldError name="firstName" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Last Name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                      <input type="text" value={form.lastName} inputMode="text" maxLength={LIMITS.NAME_MAX}
                        onChange={(e) => set("lastName", e.target.value, filterName)}
                        onBlur={() => markTouched("lastName")} placeholder="Johnson"
                        className={`w-full bg-[#141C30] border ${errClass("lastName")} rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                    </div>
                    <FieldError name="lastName" />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type="email" value={form.email} inputMode="email" autoComplete="email" maxLength={LIMITS.EMAIL_MAX}
                      onChange={(e) => set("email", e.target.value, filterEmail)}
                      onBlur={() => markTouched("email")} placeholder="you@example.com"
                      className={`w-full bg-[#141C30] border ${errClass("email")} rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                  </div>
                  <FieldError name="email" />
                </div>

                {/* Mobile + DOB */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Mobile Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                      <input type="tel" value={form.mobile} inputMode="tel" autoComplete="tel"
                        onChange={(e) => set("mobile", e.target.value, filterMobile)}
                        onBlur={() => markTouched("mobile")}
                        placeholder="9876543210"
                        className={`w-full bg-[#141C30] border ${errClass("mobile")} rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                    </div>
                    <FieldError name="mobile" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Date of Birth</label>
                    <div className="relative">
                      <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
                      {/* Picker clamped to the 18-120 age window; validateDob
                          re-checks it because min/max are trivially bypassed. */}
                      <input type="date" value={form.dob}
                        onChange={(e) => set("dob", e.target.value)}
                        onBlur={() => markTouched("dob")}
                        min={DOB_MIN} max={DOB_MAX}
                        className={`w-full bg-[#141C30] border ${errClass("dob")} rounded-xl pl-10 pr-3 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors [color-scheme:dark]`} />
                    </div>
                    <FieldError name="dob" />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Username</label>
                  <div className="relative">
                    <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type="text" value={form.username} autoComplete="username" maxLength={LIMITS.USERNAME_MAX}
                      onChange={(e) => set("username", e.target.value, filterUsername)}
                      onBlur={() => markTouched("username")}
                      placeholder="alex_johnson"
                      className={`w-full bg-[#141C30] border ${errClass("username")} rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                  </div>
                  <FieldError name="username" />
                </div>

                {/* Password + Confirm */}
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type={showPw ? "text" : "password"} value={form.password} autoComplete="new-password" maxLength={LIMITS.PASSWORD_MAX}
                      onChange={(e) => set("password", e.target.value)}
                      onBlur={() => markTouched("password")} placeholder="Min 8 characters"
                      className={`w-full bg-[#141C30] border ${errClass("password")} rounded-xl pl-10 pr-11 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.password && (
                    <>
                      <div className="flex gap-1 mt-2">
                        {[1,2,3,4].map((i) => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${pwStrength >= i ? (pwStrength >= 4 ? "bg-emerald-500" : pwStrength >= 3 ? "bg-amber-500" : "bg-red-500") : "bg-white/8"}`} />
                        ))}
                      </div>
                      {/* Live checklist — shows what's still missing rather than
                          revealing it one message at a time on submit. */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                        {PW_RULES.map((r) => {
                          const met = r.test(form.password);
                          return (
                            <div key={r.label} className={`flex items-center gap-1.5 text-[11px] transition-colors ${met ? "text-emerald-400" : "text-gray-600"}`}>
                              {met ? <Check className="w-3 h-3 flex-shrink-0" /> : <span className="w-3 h-3 flex-shrink-0 rounded-full border border-current inline-block" />}
                              {r.label}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <FieldError name="password" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type={showPw ? "text" : "password"} value={form.confirmPassword} autoComplete="new-password" maxLength={LIMITS.PASSWORD_MAX}
                      onChange={(e) => set("confirmPassword", e.target.value)}
                      onBlur={() => markTouched("confirmPassword")} placeholder="Re-enter your password"
                      className={`w-full bg-[#141C30] border ${errClass("confirmPassword")} rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                  </div>
                  {form.confirmPassword && form.password !== form.confirmPassword ? (
                    <p className="text-xs text-red-400 mt-1.5">Passwords do not match</p>
                  ) : form.confirmPassword && form.password === form.confirmPassword ? (
                    <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Passwords match
                    </p>
                  ) : null}
                </div>

                {/* Country + State + City */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Country</label>
                    <div className="relative">
                      <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                      <input type="text" value={form.country} maxLength={LIMITS.NAME_MAX}
                        onChange={(e) => set("country", e.target.value, filterName)}
                        onBlur={() => markTouched("country")} placeholder="India"
                        className={`w-full bg-[#141C30] border ${errClass("country")} rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                    </div>
                    <FieldError name="country" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">State</label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                      <input type="text" value={form.state} maxLength={LIMITS.NAME_MAX}
                        onChange={(e) => set("state", e.target.value, filterName)}
                        onBlur={() => markTouched("state")} placeholder="Telangana"
                        className={`w-full bg-[#141C30] border ${errClass("state")} rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                    </div>
                    <FieldError name="state" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">City</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type="text" value={form.city} maxLength={LIMITS.NAME_MAX}
                      onChange={(e) => set("city", e.target.value, filterName)}
                      onBlur={() => markTouched("city")} placeholder="Hyderabad"
                      className={`w-full bg-[#141C30] border ${errClass("city")} rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-colors`} />
                  </div>
                  <FieldError name="city" />
                </div>

                {/* Referral code (optional) */}
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Referral Code <span className="text-gray-700">(optional)</span></label>
                  <div className="relative">
                    <Gift className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type="text" value={form.referralCode}
                      onChange={(e) => setForm({ ...form, referralCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                      placeholder="e.g. ABCD1234"
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors" />
                  </div>
                </div>

                {/* Terms */}
                <div className="flex items-start gap-2 pt-1">
                  <input type="checkbox" id="terms" checked={form.acceptTerms}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, acceptTerms: e.target.checked }));
                      setFieldErrors((er) => ({ ...er, acceptTerms: "" }));
                    }}
                    className="mt-0.5 accent-cyan-500" />
                  <label htmlFor="terms" className="text-xs text-gray-500">
                    I accept the <span className="text-cyan-400">Terms &amp; Conditions</span>,{" "}
                    <span className="text-cyan-400">Terms of Service</span> and{" "}
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

          {/* ── Step 1: Verify Email ── */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-7 text-center">
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

          {/* ── Actions footer ── */}
          <div className="flex gap-3 px-7 pb-7">
            {step > 0 && (
              <button onClick={() => { setError(""); setStep((s) => s - 1); }}
                className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
                Back
              </button>
            )}
            <button onClick={submit} disabled={loading || (step === 1 && otp.join("").length !== 6)}
              className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {step === 0 ? "Creating account..." : "Verifying..."}</>
              ) : step === 1 ? <>Continue to Sign In <ArrowRight className="w-4 h-4" /></>
              : <>Continue <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>

        <p className="text-center mt-5 text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/signin" className="text-cyan-400 hover:underline">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
