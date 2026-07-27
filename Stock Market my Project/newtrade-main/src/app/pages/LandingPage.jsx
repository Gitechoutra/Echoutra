import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart2,
  TrendingUp,
  Shield,
  Zap,
  ArrowRight,
  Globe,
  Users,
  ChevronRight,
  Lock,
  LineChart,
  Menu,
  X,
  Activity,
  Wallet,
  Sparkles,
  Smartphone,
  PlayCircle,
  KeyRound,
  BadgeCheck,
  ShieldAlert,
  Eye,
  Quote,
  Handshake,
  Rocket,
  Mail,
  Phone,
  Facebook,
  Instagram,
  Twitter,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { generateChartData } from "../data/mockData";

const heroData = generateChartData(40, 150, 0.4);

const features = [
  {
    icon: LineChart,
    title: "Real-Time Charts",
    desc: "Live data with ms precision across 50+ global exchanges.",
    color: "from-violet-500 to-purple-600",
  },
  {
    icon: Shield,
    title: "Bank-Level Security",
    // Was "SIPC insurance up to $500K" — SIPC is a US scheme that does not cover
    // Indian investors, so the claim was dropped rather than re-priced in rupees.
    desc: "256-bit encryption with two-factor authentication.",
    color: "from-cyan-500 to-teal-600",
  },
  {
    icon: Zap,
    title: "Instant Execution",
    desc: "Sub-10ms order routing across all major venues.",
    color: "from-amber-500 to-orange-600",
  },
  {
    icon: Globe,
    title: "Global Markets",
    desc: "Trade stocks, ETFs, options, forex & crypto — all in one.",
    color: "from-emerald-500 to-green-600",
  },
];

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Security", href: "#security" },
  { label: "About", href: "#about" },
];

const featureHighlights = [
  {
    icon: Activity,
    title: "Live Market Data",
    desc: "Streaming quotes, depth & candles from 50+ global exchanges with ms-level precision.",
    color: "from-violet-500 to-purple-600",
  },
  {
    icon: Wallet,
    title: "Portfolio Tracking",
    desc: "Track holdings, P&L, allocation and performance across every account in real time.",
    color: "from-cyan-500 to-blue-600",
  },
  {
    icon: Sparkles,
    title: "AI Insights",
    desc: "Smart signals, trend detection and risk alerts powered by our AI engine.",
    color: "from-amber-500 to-orange-600",
  },
  {
    icon: Smartphone,
    title: "Mobile-Friendly Tools",
    desc: "A fully responsive experience — trade, monitor and manage from any device.",
    color: "from-emerald-500 to-green-600",
  },
  {
    icon: PlayCircle,
    title: "Demo Account",
    desc: "Practice risk-free with virtual funds before you commit real capital.",
    color: "from-pink-500 to-rose-600",
  },
];

const securityItems = [
  {
    icon: Lock,
    title: "Data Encryption",
    desc: "256-bit AES encryption in transit and at rest keeps your data private end to end.",
  },
  {
    icon: KeyRound,
    title: "Two-Factor Authentication",
    desc: "Add an extra layer of protection with app-based and OTP 2FA on every login.",
  },
  {
    icon: BadgeCheck,
    title: "Regulatory Compliance",
    desc: "Built to meet KYC, AML and market-regulator standards across the regions we serve.",
  },
  {
    icon: ShieldAlert,
    title: "Fraud Protection",
    desc: "Continuous monitoring and anomaly detection to catch suspicious activity early.",
  },
  {
    icon: Eye,
    title: "Transparency",
    desc: "Clear pricing, open audit trails and full visibility into every order and fee.",
  },
];

const testimonials = [
  {
    quote:
      "TradeFlow's real-time data and AI insights completely changed how I manage my portfolio.",
    name: "Ananya Rao",
    role: "Retail Investor",
  },
  {
    quote:
      "The demo account let my whole team onboard risk-free. Execution has been rock solid since.",
    name: "Marcus Lee",
    role: "Fund Manager",
  },
  {
    quote:
      "Security and transparency were my top concerns — TradeFlow delivered on both.",
    name: "Priya Nair",
    role: "Long-term Trader",
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#07091A] text-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#07091A]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="text-base sm:text-lg font-black tracking-tight">
              TradeFlow
            </span>
            <span className="hidden sm:inline-block px-2 py-0.5 bg-violet-500/15 border border-violet-500/25 rounded-full text-xs text-violet-300 font-medium">
              PRO
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="hover:text-white transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => navigate("/signin")}
              className="hidden sm:block text-xs sm:text-sm text-gray-400 hover:text-white transition-colors px-2 sm:px-3 py-2"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate("/signup")}
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-lg font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Get Started
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 text-gray-400 hover:text-white transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden overflow-hidden border-t border-white/5 bg-[#07091A]"
            >
              <div className="px-6 py-4 flex flex-col gap-4">
                {navLinks.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
                <div className="h-px bg-white/5 my-1" />
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate("/signin");
                  }}
                  className="sm:hidden text-sm font-medium text-left text-gray-400 hover:text-white transition-colors"
                >
                  Sign In
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        {/* BG blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-32 left-1/4 w-72 sm:w-[500px] h-72 sm:h-[500px] bg-violet-600/8 rounded-full blur-3xl" />
          <div className="absolute top-48 right-1/4 w-64 sm:w-[400px] h-64 sm:h-[400px] bg-cyan-500/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
        {/* Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.015)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative max-w-7xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 border border-white/10 rounded-full mb-6 sm:mb-8 text-xs sm:text-sm text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Markets Open · NYSE & NASDAQ
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-4 sm:mb-6 leading-tight sm:leading-none tracking-tight">
              The Smarter Way
              <br className="hidden sm:block" />{" "}
              <span className="bg-gradient-to-r from-violet-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                to Trade Markets
              </span>
            </h1>
            <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
              Professional-grade platform built for traders and institutions.
              Real-time data, AI insights, and complete admin visibility — all
              in one elegant interface.
            </p>
          </motion.div>

          {/* Mini chart preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="relative max-w-2xl mx-auto mb-20"
          >
            <div className="bg-[#0C1220]/80 backdrop-blur-sm border border-white/10 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs text-gray-500">Portfolio Value</div>
                  <div className="text-2xl font-bold">₹1,24,853.42</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">All Time</div>
                  <div className="text-lg text-emerald-400 font-bold">
                    +48.3%
                  </div>
                </div>
              </div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={heroData}>
                    <defs>
                      <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#8B5CF6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#8B5CF6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="close"
                      stroke="#8B5CF6"
                      strokeWidth={2}
                      fill="url(#hg)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Floating badges */}
            <div className="hidden sm:block absolute -top-3 -right-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">
                  +2.66% today
                </span>
              </div>
            </div>
            <div className="hidden sm:block absolute -bottom-3 -left-4 bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2 backdrop-blur-sm">
              <div className="text-xs text-violet-300 font-medium">
                NVDA +2.19%
              </div>
            </div>
          </motion.div>

          {/* Sign-in options */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mb-6"
          >
            <div className="text-sm text-gray-500 mb-6">
              Choose how you'd like to sign in
            </div>
            <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
              <button
                onClick={() => navigate("/signin?role=user")}
                className="group flex items-center gap-4 bg-[#0C1220] border border-cyan-500/30 rounded-2xl p-5 text-left hover:shadow-xl hover:shadow-cyan-500/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-bold text-white">
                    User Login
                  </div>
                  <div className="text-xs text-gray-500">
                    Investor / Trader portal
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-cyan-300 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => navigate("/signin?role=admin")}
                className="group flex items-center gap-4 bg-[#0C1220] border border-violet-500/30 rounded-2xl p-5 text-left hover:shadow-xl hover:shadow-violet-500/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg flex-shrink-0">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-bold text-white">
                    Admin Login
                  </div>
                  <div className="text-xs text-gray-500">
                    Platform administrator
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-violet-300 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 border-t border-white/5 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs text-violet-400 uppercase tracking-widest mb-3">
              Why TradeFlow
            </div>
            <h2 className="text-3xl font-bold text-white">
              Built for Serious Traders
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-[#0C1220] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all group"
              >
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4`}
                >
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <div className="text-sm font-semibold text-white mb-2">
                  {f.title}
                </div>
                <div className="text-xs text-gray-500 leading-relaxed">
                  {f.desc}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Feature highlights */}
          <div className="mt-16">
            <div className="text-center mb-10">
              <h3 className="text-2xl font-bold text-white mb-2">
                Everything you need to trade smarter
              </h3>
              <p className="text-sm text-gray-500 max-w-xl mx-auto">
                From live data to AI insights and a risk-free demo — a complete
                toolkit in one platform.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featureHighlights.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-[#0C1220] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all"
                >
                  <div
                    className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4`}
                  >
                    <f.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-base font-semibold text-white mb-2">
                    {f.title}
                  </div>
                  <div className="text-sm text-gray-500 leading-relaxed">
                    {f.desc}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section
        id="security"
        className="py-20 border-t border-white/5 scroll-mt-24 bg-gradient-to-b from-[#07091A] to-[#0C1220]"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs text-cyan-400 uppercase tracking-widest mb-3">
              Security & Trust
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">
              Your money & data, protected
            </h2>
            <p className="text-sm text-gray-500 max-w-xl mx-auto">
              Bank-level safeguards, regulatory compliance and full transparency
              at every layer.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {securityItems.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="bg-[#0C1220] border border-white/5 rounded-2xl p-6 hover:border-cyan-500/20 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
                  <s.icon className="w-5 h-5 text-cyan-300" />
                </div>
                <div className="text-base font-semibold text-white mb-2">
                  {s.title}
                </div>
                <div className="text-sm text-gray-500 leading-relaxed">
                  {s.desc}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-20 border-t border-white/5 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs text-violet-400 uppercase tracking-widest mb-3">
              About TradeFlow
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">
              Built by traders, for traders
            </h2>
          </div>

          {/* Story + reach */}
          <div className="grid lg:grid-cols-2 gap-6 mb-12">
            <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-7">
              <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Rocket className="w-5 h-5 text-violet-300" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Our Story
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                TradeFlow was founded in 2020 with a simple mission: make
                professional-grade trading tools accessible to everyone. What
                began as a small team frustrated by clunky, expensive platforms
                has grown into a trusted home for millions of traders worldwide.
              </p>
            </div>
            <div
              id="partnerships"
              className="bg-[#0C1220] border border-white/5 rounded-2xl p-7 scroll-mt-24"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <Globe className="w-5 h-5 text-emerald-300" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Global Reach & Partnerships
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Serving traders across 40+ countries and connected to 50+ global
                exchanges. We partner with leading market-data providers,
                clearing firms and financial institutions to deliver reliable,
                low-latency access wherever you are.
              </p>
            </div>
          </div>

          {/* Team */}
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <Users className="w-5 h-5 text-violet-300" />
              <h3 className="text-lg font-semibold text-white">
                Meet the Team
              </h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { name: "Aarav Sharma", role: "Founder & CEO", i: "AS" },
                { name: "Elena Petrova", role: "Chief Technology Officer", i: "EP" },
                { name: "David Kim", role: "Head of Product", i: "DK" },
                { name: "Sara Okafor", role: "Head of Security", i: "SO" },
              ].map((m) => (
                <div
                  key={m.name}
                  className="bg-[#0C1220] border border-white/5 rounded-2xl p-6 text-center"
                >
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center mx-auto mb-3 text-sm font-bold text-white">
                    {m.i}
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {m.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{m.role}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Testimonials */}
          <div id="testimonials" className="scroll-mt-24">
            <div className="flex items-center gap-2 mb-6">
              <Quote className="w-5 h-5 text-cyan-300" />
              <h3 className="text-lg font-semibold text-white">
                What our users say
              </h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {testimonials.map((t) => (
                <div
                  key={t.name}
                  className="bg-[#0C1220] border border-white/5 rounded-2xl p-6"
                >
                  <Quote className="w-6 h-6 text-violet-400/40 mb-3" />
                  <p className="text-sm text-gray-300 leading-relaxed mb-4">
                    “{t.quote}”
                  </p>
                  <div className="text-sm font-semibold text-white">
                    {t.name}
                  </div>
                  <div className="text-xs text-gray-500">{t.role}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-gradient-to-b from-[#0C1220] to-[#07091A]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {[
              { value: "2.4M+", label: "Active Traders" },
              { value: "₹4,000Cr+", label: "Assets Under Management" },
              { value: "99.99%", label: "Platform Uptime" },
              { value: "0ms", label: "Commission Fees" },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent mb-1 sm:mb-2">
                  {s.value}
                </div>
                <div className="text-xs sm:text-sm text-gray-500">
                  {s.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 pt-14 pb-8 bg-[#07091A]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid gap-10 md:grid-cols-6 mb-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                  <BarChart2 className="w-4 h-4 text-white" />
                </div>
                <span className="font-black text-base">TradeFlow</span>
                <span className="px-2 py-0.5 bg-violet-500/15 border border-violet-500/25 rounded-full text-xs text-violet-300 font-medium">
                  PRO
                </span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xs mb-4">
                Professional-grade trading for everyone — real-time data, AI
                insights and bank-level security in one elegant platform.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                Serving traders in 40+ countries
              </div>
            </div>

            {/* Product */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
                Product
              </div>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li>
                  <a href="#features" className="hover:text-white transition-colors">
                    Live Market Data
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-white transition-colors">
                    Portfolio Tracking
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-white transition-colors">
                    AI Insights
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-white transition-colors">
                    Demo Account
                  </a>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
                Company
              </div>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li>
                  <a
                    href="#partnerships"
                    className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                  >
                    <Handshake className="w-3.5 h-3.5" /> Partnerships
                  </a>
                </li>
                <li>
                  <a
                    href="#testimonials"
                    className="hover:text-white transition-colors"
                  >
                    Testimonials
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact Us */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
                Contact Us
              </div>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li>
                  <a
                    href="mailto:xxxxxx@gmail.com"
                    className="inline-flex items-center gap-2 hover:text-white transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" /> xxxxxx@gmail.com
                  </a>
                </li>
                <li>
                  <a
                    href="tel:+91XXXXXXXXX"
                    className="inline-flex items-center gap-2 hover:text-white transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" /> +91 XXXXXXXXX
                  </a>
                </li>
              </ul>
              <div className="flex items-center gap-3 mt-4">
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                >
                  <Facebook className="w-4 h-4" />
                </a>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                >
                  <Instagram className="w-4 h-4" />
                </a>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Twitter"
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                >
                  <Twitter className="w-4 h-4" />
                </a>
                <a
                  href="https://plus.google.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Google Plus"
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                >
                  G+
                </a>
              </div>
            </div>

            {/* Security */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
                Security
              </div>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li>
                  <a
                    href="#security"
                    className="hover:text-white transition-colors"
                  >
                    Data Encryption
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-gray-600 text-center sm:text-left">
              © 2026 TradeFlow Pro. Securities offered through TradeFlow
              Securities LLC. Member FINRA/SIPC.
            </div>
            <div className="flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-gray-600" />
              <span className="text-xs text-gray-600">256-bit encrypted</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
