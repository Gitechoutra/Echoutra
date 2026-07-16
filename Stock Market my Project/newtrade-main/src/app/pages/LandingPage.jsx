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

const roleCards = [
  {
    role: "Admin",
    label: "Platform Admin",
    path: "/signin?role=admin",
    icon: Users,
    color: "from-violet-600 to-purple-700",
    glow: "shadow-violet-500/20",
    border: "border-violet-500/30",
    bg: "bg-violet-500/10",
    iconColor: "text-violet-300",
    desc: "Full platform visibility. Manage all users, view every portfolio, access analytics & controls.",
    perks: [
      "View all user portfolios",
      "User management & KYC",
      "Platform-wide analytics",
      "System configuration",
    ],
  },
  {
    role: "User",
    label: "Investor / Trader",
    path: "/signin?role=user",
    icon: TrendingUp,
    color: "from-cyan-500 to-blue-600",
    glow: "shadow-cyan-500/20",
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/10",
    iconColor: "text-cyan-300",
    desc: "Your personal trading hub. See only your own investments, charts, and performance.",
    perks: [
      "Personal portfolio tracking",
      "Real-time market data",
      "Trade execution",
      "Personalized alerts",
    ],
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
            {["Features", "Pricing", "Security", "About"].map((l) => (
              <a
                key={l}
                href="#"
                className="hover:text-white transition-colors"
              >
                {l}
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
                {["Features", "Pricing", "Security", "About"].map((l) => (
                  <a
                    key={l}
                    href="#"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    {l}
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

          {/* Role selection cards */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mb-6"
          >
            <div className="text-sm text-gray-500 mb-6">
              Choose your access level
            </div>
            <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {roleCards.map((card) => (
                <motion.div
                  key={card.role}
                  whileHover={{ scale: 1.02, y: -4 }}
                  onClick={() => navigate(card.path)}
                  className={`relative cursor-pointer bg-[#0C1220] border ${card.border} rounded-2xl p-6 text-left hover:shadow-xl ${card.glow} transition-all duration-300 group`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 shadow-lg`}
                  >
                    <card.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="mb-1">
                    <div
                      className={`text-xs uppercase tracking-widest font-semibold ${card.iconColor} mb-1`}
                    >
                      {card.role}
                    </div>
                    <div className="text-lg font-bold text-white">
                      {card.label}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                    {card.desc}
                  </p>
                  <ul className="space-y-1.5 mb-5">
                    {card.perks.map((p) => (
                      <li
                        key={p}
                        className="flex items-center gap-2 text-xs text-gray-400"
                      >
                        <div
                          className={`w-1 h-1 rounded-full bg-gradient-to-r ${card.color}`}
                        />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <div
                    className={`flex items-center gap-2 text-sm font-medium bg-gradient-to-r ${card.color} bg-clip-text text-transparent group-hover:gap-3 transition-all`}
                  >
                    Enter as {card.role}
                    <ArrowRight className={`w-4 h-4 ${card.iconColor}`} />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-white/5">
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
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <BarChart2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm">TradeFlow</span>
          </div>
          <div className="text-xs text-gray-700">
            © 2026 TradeFlow Pro. Securities offered through TradeFlow
            Securities LLC. Member FINRA/SIPC.
          </div>
          <div className="flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-gray-700" />
            <span className="text-xs text-gray-700">256-bit encrypted</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
