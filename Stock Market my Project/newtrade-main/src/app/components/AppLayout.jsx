import { useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router";
import {
  LayoutDashboard,
  TrendingUp,
  Briefcase,
  Star,
  ArrowLeftRight,
  Newspaper,
  Settings,
  Bell,
  Search,
  ChevronDown,
  LogOut,
  Receipt,
  Menu,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { marketIndices } from "../data/mockData";

const navItems = [
  { path: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/app/market", label: "Markets", icon: TrendingUp },
  { path: "/app/portfolio", label: "Portfolio", icon: Briefcase },
  { path: "/app/watchlist", label: "Watchlist", icon: Star },
  { path: "/app/trade", label: "Trade", icon: ArrowLeftRight },
  { path: "/app/news", label: "News", icon: Newspaper },
  { path: "/app/transactions", label: "Transactions", icon: Receipt },
  { path: "/app/settings", label: "Settings", icon: Settings },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);

  const isActive = (path, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-[#060B18] text-white overflow-hidden">
      {/* Ticker Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0A0E1A] border-b border-[#1E2D4A] h-8 overflow-hidden">
        <div className="flex items-center h-full animate-ticker-move">
          {[...marketIndices, ...marketIndices].map((idx, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-6 whitespace-nowrap"
            >
              <span className="text-xs text-gray-400">{idx.name}</span>
              <span className="text-xs text-white">{idx.value}</span>
              <span
                className={`text-xs ${idx.up ? "text-emerald-400" : "text-red-400"}`}
              >
                {idx.change}
              </span>
              <span className="text-[#1E2D4A]">|</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        <motion.aside
          initial={false}
          animate={{ x: sidebarOpen || window.innerWidth >= 1024 ? 0 : -280 }}
          className={`fixed lg:relative top-8 left-0 bottom-0 w-[240px] bg-[#080C18] border-r border-[#1E2D4A] z-40 flex flex-col
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            transition-transform duration-300 lg:transition-none`}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-[#1E2D4A]">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-wide">
                STOCKPULSE
              </div>
              <div className="text-xs text-gray-500">Pro Trading</div>
            </div>
            <button
              className="ml-auto lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <div className="text-xs text-gray-600 uppercase tracking-widest px-3 mb-2">
              Main Menu
            </div>
            {navItems.map((item) => {
              const active = isActive(item.path, item.exact);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-all duration-200 group
                    ${
                      active
                        ? "bg-gradient-to-r from-cyan-500/20 to-blue-600/10 text-cyan-400 border border-cyan-500/20"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`}
                >
                  <item.icon
                    className={`w-4 h-4 ${active ? "text-cyan-400" : "text-gray-500 group-hover:text-white"}`}
                  />
                  <span className="text-sm">{item.label}</span>
                  {item.path === "/app/trade" && (
                    <span className="ml-auto text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">
                      New
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User */}
          <div className="p-4 border-t border-[#1E2D4A]">
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold">
                AJ
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">Alex Johnson</div>
                <div className="text-xs text-gray-500 truncate">Pro Member</div>
              </div>
              <button
                onClick={() => navigate("/")}
                className="text-gray-500 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.aside>
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 mt-8">
        {/* Header */}
        <header className="bg-[#0A0E1A] border-b border-[#1E2D4A] px-4 lg:px-6 py-3 flex items-center gap-4">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5 text-gray-400" />
          </button>

          {/* Search */}
          <div className="flex-1 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search stocks, ETFs..."
              className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg pl-9 pr-4 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400">Markets Open</span>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-lg bg-[#1A2235] border border-[#1E2D4A] text-gray-400 hover:text-white transition-colors"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[#0F1629] border border-[#1E2D4A] rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1E2D4A]">
                    <div className="text-sm font-medium text-white">
                      Notifications
                    </div>
                  </div>
                  {[
                    {
                      icon: "🟢",
                      text: "AAPL crossed $190 target",
                      time: "2m ago",
                    },
                    {
                      icon: "🔴",
                      text: "TSLA down 3.27% today",
                      time: "15m ago",
                    },
                    {
                      icon: "📊",
                      text: "Portfolio up 2.4% this week",
                      time: "1h ago",
                    },
                  ].map((n, i) => (
                    <div
                      key={i}
                      className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-[#1E2D4A] last:border-0"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-base">{n.icon}</span>
                        <div>
                          <div className="text-sm text-gray-300">{n.text}</div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {n.time}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Profile */}
            <div className="flex items-center gap-2 cursor-pointer p-1.5 pr-3 rounded-lg hover:bg-white/5 transition-colors">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold">
                AJ
              </div>
              <span className="text-sm text-gray-300 hidden sm:block">
                Alex
              </span>
              <ChevronDown className="w-3 h-3 text-gray-500" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-[#060B18]">
          <Outlet />
        </main>
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker-move {
          animation: ticker 30s linear infinite;
        }
      `}</style>
    </div>
  );
}
