import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart2, Eye, EyeOff, Mail, Lock,
  ArrowRight, Shield, Users, TrendingUp,
  ChevronLeft, AlertCircle, CheckCircle2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  filterEmail, filterDigits,
  validateEmail, validateOtp, validatePassword, validateConfirmPassword,
  LIMITS,
} from "../utils/validation";

const API_BASE = "http://127.0.0.1:5050/v1";

// ─────────────────────────────────────────────────────────────────────────────
//  Forgot Password Modal  (3 sub-steps: email → otp → new password)
// ─────────────────────────────────────────────────────────────────────────────
function ForgotPasswordModal({ onClose }) {
  const [fpStep, setFpStep]       = useState(0); // 0=email, 1=otp, 2=new-pw, 3=done
  const [fpEmail, setFpEmail]     = useState("");
  const [fpOtp, setFpOtp]         = useState("");
  const [fpNewPw, setFpNewPw]     = useState("");
  const [fpConfirm, setFpConfirm] = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError]     = useState("");
  const [showPw, setShowPw]       = useState(false);

  // Step 0 — request OTP via forgot_password
  const handleSendOtp = async (e) => {
    e.preventDefault();
    const emailError = validateEmail(fpEmail);
    if (emailError) { setFpError(emailError); return; }
    setFpError("");
    setFpLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/authentication/forgot_password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: fpEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!data.bool) {
        setFpError(data.response?.message || "Request failed.");
        return;
      }
      setFpStep(1);
    } catch {
      setFpError("Network error. Please try again.");
    } finally {
      setFpLoading(false);
    }
  };

  // Step 1 → 2 — just advance (OTP typed, move to new-password screen)
  const handleOtpNext = (e) => {
    e.preventDefault();
    const otpError = validateOtp(fpOtp, 6);
    if (otpError) { setFpError(otpError); return; }
    setFpError("");
    setFpStep(2);
  };

  // Step 2 — call reset_password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setFpError("");
    // Full complexity rules here — this flow previously allowed 6 characters,
    // which let a reset silently downgrade a password below the signup bar.
    const pwError = validatePassword(fpNewPw) || validateConfirmPassword(fpNewPw, fpConfirm);
    if (pwError) { setFpError(pwError); return; }
    setFpLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/authentication/reset_password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          email:        fpEmail.trim().toLowerCase(),
          otp_code:     fpOtp.trim(),
          new_password: fpNewPw,
        }),
      });
      const data = await res.json();
      if (!data.bool) {
        setFpError(data.response?.message || "Reset failed.");
        return;
      }
      setFpStep(3);
    } catch {
      setFpError("Network error. Please try again.");
    } finally {
      setFpLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm bg-[#0C1220] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-bold text-white">
            {fpStep === 3 ? "Password Reset!" : "Reset Password"}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="p-6">
          {/* ── Step 0: Enter Email ── */}
          {fpStep === 0 && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <p className="text-xs text-gray-500">
                Enter your registered email and we'll send a 6-digit OTP.
              </p>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type="email" required inputMode="email" maxLength={LIMITS.EMAIL_MAX}
                    value={fpEmail}
                    onChange={(e) => setFpEmail(filterEmail(e.target.value))}
                    placeholder="you@example.com"
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20"
                  />
                </div>
              </div>
              {fpError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{fpError}
                </div>
              )}
              <button
                type="submit" disabled={fpLoading}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {fpLoading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</>
                  : <>Send OTP <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {/* ── Step 1: Enter OTP ── */}
          {fpStep === 1 && (
            <form onSubmit={handleOtpNext} className="space-y-4">
              <p className="text-xs text-gray-500">
                Enter the 6-digit OTP sent to <span className="text-white">{fpEmail}</span>.
              </p>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">OTP Code</label>
                <input
                  type="text" required maxLength={6} inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code"
                  value={fpOtp}
                  onChange={(e) => setFpOtp(filterDigits(e.target.value, 6))}
                  placeholder="Enter 6-digit OTP"
                  className="w-full bg-[#141C30] border border-white/8 rounded-xl px-4 py-3 text-sm text-center tracking-widest text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 text-lg font-bold"
                />
              </div>
              {fpError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{fpError}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setFpStep(0); setFpError(""); }}
                  className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white"
                >Back</button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 flex items-center justify-center gap-2"
                >
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleSendOtp}
                className="w-full text-xs text-cyan-400 hover:underline"
              >Resend OTP</button>
            </form>
          )}

          {/* ── Step 2: New Password ── */}
          {fpStep === 2 && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-xs text-gray-500">Set a new strong password.</p>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type={showPw ? "text" : "password"} required
                    value={fpNewPw}
                    onChange={(e) => setFpNewPw(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-10 pr-11 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type={showPw ? "text" : "password"} required
                    value={fpConfirm}
                    onChange={(e) => setFpConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20"
                  />
                </div>
              </div>
              {fpError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{fpError}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setFpStep(1); setFpError(""); }}
                  className="flex-1 py-3 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white"
                >Back</button>
                <button
                  type="submit" disabled={fpLoading}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {fpLoading
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Resetting...</>
                    : "Reset Password"}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: Success ── */}
          {fpStep === 3 && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="text-sm text-gray-300">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SignInPage
// ─────────────────────────────────────────────────────────────────────────────
export function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();

  const [role, setRole]               = useState(params.get("role") || "user");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [showForgot, setShowForgot]   = useState(false);

  // ── POST /authentication/login ───────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Email format only. Password complexity is deliberately NOT checked on
    // sign-in: accounts created before that rule existed would be unable to
    // log in to their own accounts. The server agrees (see routes.py::Login).
    const emailError = validateEmail(email);
    if (emailError) { setError(emailError); return; }
    if (!password) { setError("Password is required."); return; }
    setError("");
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/authentication/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!data.bool) {
        setError(data.response?.message || "Invalid credentials.");
        return;
      }

      const { access_token, refresh_token, role: userRole } = data.response;

      // Persist tokens
      localStorage.setItem("access_token",  access_token);
      if (refresh_token) localStorage.setItem("refresh_token", refresh_token);

      // Validate the account's real role matches the selected login. This must
      // be enforced BOTH ways: admin credentials cannot sign in through User
      // Login, and user credentials cannot sign in through Admin Login. Without
      // the symmetric check an admin could enter via the User tab (and vice
      // versa) since routing was previously driven only by the server role.
      const actualRole = (userRole || "USER").toLowerCase();
      if (actualRole !== role) {
        setError(
          role === "admin"
            ? "This account does not have admin access. Use User Login instead."
            : "This is an admin account. Please use Admin Login."
        );
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        return;
      }

      // Fetch full user profile via GET /authentication/me
      let userData = null;
      try {
        const meRes  = await fetch(`${API_BASE}/authentication/me`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const meData = await meRes.json();
        if (meData.bool) userData = meData.response;
      } catch { /* non-fatal */ }

      login(email, password, actualRole, userData);
      navigate(actualRole === "admin" ? "/admin" : "/user");

    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const adminConfig = {
    gradient: "from-violet-600 to-purple-700",
    border:   "border-violet-500/30",
    accent:   "text-violet-400",
    bg:       "bg-violet-500/10",
    hint:     "Use admin credentials to sign in",
    icon:     Users,
    label:    "Administrator Portal",
    desc:     "Full platform access — manage users, view all portfolios.",
  };
  const userConfig = {
    gradient: "from-cyan-500 to-blue-600",
    border:   "border-cyan-500/30",
    accent:   "text-cyan-400",
    bg:       "bg-cyan-500/10",
    hint:     "Use your registered email & password",
    icon:     TrendingUp,
    label:    "Investor Portal",
    desc:     "Access your personal portfolio, trades and market data.",
  };
  const cfg = role === "admin" ? adminConfig : userConfig;

  return (
    <div className="min-h-screen bg-[#07091A] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className={`absolute top-1/4 ${role === "admin" ? "left-1/4" : "right-1/4"} w-96 h-96 ${role === "admin" ? "bg-violet-600/8" : "bg-cyan-500/8"} rounded-full blur-3xl transition-all duration-700`} />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Forgot Password Modal */}
      <AnimatePresence>
        {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
      </AnimatePresence>

      <Link to="/" className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight">TradeFlow</span>
        </div>

        {/* Role Toggle */}
        <div className="flex gap-2 p-1 bg-[#0C1220] border border-white/5 rounded-2xl mb-6">
          {["user", "admin"].map((r) => {
            const Icon   = r === "admin" ? Users : TrendingUp;
            const active = role === r;
            return (
              <button
                key={r}
                onClick={() => { setRole(r); setError(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                  active
                    ? r === "admin"
                      ? "bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-lg"
                      : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {r === "admin" ? "Admin Login" : "User Login"}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={role}
            initial={{ opacity: 0, x: role === "admin" ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`bg-[#0C1220] border ${cfg.border} rounded-2xl overflow-hidden shadow-2xl`}
          >
            {/* Card header */}
            <div className={`px-6 py-5 bg-gradient-to-br ${cfg.gradient} bg-opacity-10 border-b border-white/5`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <cfg.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-base font-bold text-white">{cfg.label}</div>
                  <div className="text-xs text-white/60">{cfg.desc}</div>
                </div>
              </div>
            </div>

            <div className="p-6">
              {params.get("verified") === "1" && (
                <div className="flex items-center gap-2 px-3 py-2.5 mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> Email verified! Please sign in with your credentials.
                </div>
              )}
              {/* ── Login Form ── */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type="email" required inputMode="email" autoComplete="email" maxLength={LIMITS.EMAIL_MAX}
                      value={email}
                      onChange={(e) => setEmail(filterEmail(e.target.value))}
                      placeholder="you@example.com"
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-500">Password</label>
                    {/* ── Forgot Password Button ── */}
                    <button
                      type="button"
                      onClick={() => setShowForgot(true)}
                      className={`text-xs ${cfg.accent} hover:underline transition-colors`}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type={showPassword ? "text" : "password"} required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-10 pr-11 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400"
                    >
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <button
                  type="submit" disabled={loading}
                  className={`w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${cfg.gradient} hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2 mt-2`}
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
                  ) : (
                    <>{role === "admin" ? "Enter Admin Portal" : "Sign In"} <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <div className={`mt-4 p-3 ${cfg.bg} border ${cfg.border} rounded-xl`}>
                <div className="flex items-center gap-2">
                  <Shield className={`w-3.5 h-3.5 ${cfg.accent} flex-shrink-0`} />
                  <span className={`text-xs ${cfg.accent}`}>{cfg.hint}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="text-center mt-5">
          <span className="text-sm text-gray-600">Don't have an account? </span>
          <Link to="/signup" className={`text-sm ${cfg.accent} hover:underline transition-colors`}>
            Create one free
          </Link>
        </div>
      </motion.div>
    </div>
  );
}













