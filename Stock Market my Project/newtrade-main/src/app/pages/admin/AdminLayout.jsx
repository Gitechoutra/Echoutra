import { useState, useEffect, useCallback, useRef } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  Users,
  LineChart,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  Shield,
  TrendingUp,
  Zap,
  ChevronDown,
  Newspaper,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken  = () => localStorage.getItem("access_token");

const authHdr = () => ({ Authorization: `Bearer ${getToken()}` });

const nav = [
  { path: "/admin",          label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/admin/users",    label: "All Users",  icon: Users },
  { path: "/admin/stocks",   label: "All Stocks", icon: TrendingUp },
  { path: "/admin/news",     label: "News",       icon: Newspaper },
  { path: "/admin/analytics",label: "Analytics",  icon: LineChart },
  { path: "/admin/settings", label: "Settings",   icon: Settings },
];

const FALLBACK_INDICES = [
  { name: "S&P 500", value: "5,248.49", change: "+0.87%", up: true  },
  { name: "NASDAQ",  value: "16,428.82",change: "+1.15%", up: true  },
  { name: "DOW",     value: "39,127.14",change: "+0.32%", up: true  },
  { name: "VIX",     value: "13.47",    change: "-2.34%", up: false },
  { name: "FTSE",    value: "8,127.63", change: "+0.55%", up: true  },
  { name: "NIKKEI",  value: "39,523.55",change: "+0.43%", up: true  },
];

/* ══════════════════════════════════════════════════════════════════════════ */
export function AdminLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuth();

  const [sidebar,       setSidebar]       = useState(false);
  const [notifs,        setNotifs]        = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifLoading,  setNotifLoading]  = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [sidebarMenu,   setSidebarMenu]   = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [marketIndices, setMarketIndices] = useState(FALLBACK_INDICES);
  const [userProfile,   setUserProfile]   = useState(null);

  const fetchNotifRef    = useRef(null);
  const notifIntervalRef = useRef(null);

  const fetchMarketTicker = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res  = await fetch(`${API_BASE}/admin/analytics/sector_performance`, {
        headers: authHdr(),
      });
      if (res.ok) {
        const data    = await res.json();
        const sectors = data?.response?.sectors || [];
        if (sectors.length > 0) {
          setMarketIndices(
            sectors.slice(0, 6).map((s) => {
              const chg = s.day_change_percent || 0;
              return {
                name:   s.sector_name || "—",
                value:  `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
                change: `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
                up:     chg >= 0,
              };
            })
          );
          return;
        }
      }

      const res2  = await fetch(`${API_BASE}/dashboard/admin/platform_summary`, {
        headers: authHdr(),
      });
      if (res2.ok) {
        const data2   = await res2.json();
        const sectors = data2?.response?.sectors || [];
        if (sectors.length > 0) {
          setMarketIndices(
            sectors.slice(0, 6).map((s) => {
              const chg = s.day_change_percent || 0;
              return {
                name:   s.sector_name || "—",
                value:  `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
                change: `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
                up:     chg >= 0,
              };
            })
          );
        }
      }
    } catch {
      /* Keep existing indices */
    }
  }, []);

  /*
     FIX — admin's own notification bell.
     Previously this had NO recurring poll, so admin alerts (e.g. KYC
     submissions, new user signups, system warnings) would only appear
     once at page load. Added the same 30-second poll pattern used in
     UserLayout.jsx for consistency across both portals.

     Also reads `n.message || n.body` (checking `message` FIRST) to match
     the field-name fix applied in AdminUserDetail.jsx's handleSendMessage —
     this keeps both directions of the admin↔user notification flow aligned
     to the same field-name convention.
  */
  const fetchNotifications = useCallback(async (showSpinner = false) => {
    const token = getToken();
    if (!token) return;
    if (showSpinner) setNotifLoading(true);
    try {
      const [nRes, uRes] = await Promise.all([
        fetch(`${API_BASE}/notifications/my`,           { headers: authHdr() }),
        fetch(`${API_BASE}/notifications/unread_count`, { headers: authHdr() }),
      ]);
      if (nRes.ok) {
        const nd = await nRes.json();
        if (nd?.bool) {
          setNotifications((nd.response?.notifications || nd.response || []).slice(0, 8));
        }
      }
      if (uRes.ok) {
        const ud = await uRes.json();
        if (ud?.bool) {
          setUnreadCount(ud.response?.unread_count || ud.response?.count || 0);
        }
      }
    } catch {
      /* keep last known notifications */
    } finally {
      if (showSpinner) setNotifLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifRef.current = fetchNotifications; }, [fetchNotifications]);

  /* ── Fetch the logged-in admin's profile (for display name/email) ─────── */
  const fetchUserProfile = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/user_profiles/me`, { headers: authHdr() });
      if (res.ok) {
        const data = await res.json();
        if (data?.bool && data.response) setUserProfile(data.response);
      }
    } catch {}
  }, []);

  /* ── One-time init + notification poll (empty dep array — runs once) ──── */
  useEffect(() => {
    fetchMarketTicker();
    fetchUserProfile();
    fetchNotifications();

    /* Poll admin notifications every 30 seconds — keeps the bell live
       without requiring a manual refresh, matching UserLayout.jsx */
    notifIntervalRef.current = setInterval(() => {
      if (getToken()) fetchNotifRef.current?.();
      else {
        clearInterval(notifIntervalRef.current);
        notifIntervalRef.current = null;
      }
    }, 30_000);

    return () => {
      clearInterval(notifIntervalRef.current);
      notifIntervalRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Refetch on route change — catches alerts that arrived mid-nav ────── */
  useEffect(() => {
    if (getToken()) fetchNotifRef.current?.();
  }, [location.pathname]);

  /* ── Debounced live search: users + stocks ───────────────────────────── */
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      try {
        const [usersRes, stocksRes] = await Promise.all([
          fetch(
            `${API_BASE}/users/list_users?search=${encodeURIComponent(searchQuery)}&per_page=5`,
            { headers: authHdr() }
          ),
          fetch(
            `${API_BASE}/stocks/list?search=${encodeURIComponent(searchQuery)}&per_page=5`,
            { headers: authHdr() }
          ),
        ]);

        const results = [];

        if (usersRes.ok) {
          const ud = await usersRes.json();
          if (ud?.bool) {
            const users = ud.response?.users || ud.response?.data || [];
            users.slice(0, 3).forEach((u) =>
              results.push({
                id:   u.user_id || u.id,
                name: u.full_name || u.name || u.username || "—",
                desc: u.email,
                type: "User",
              })
            );
          }
        }

        if (stocksRes.ok) {
          const sd = await stocksRes.json();
          if (sd?.bool) {
            const stocks = sd.response?.stocks || sd.response?.data || [];
            stocks.slice(0, 3).forEach((s) =>
              results.push({
                id:   s.stock_id || s.id,
                name: s.ticker_symbol || s.symbol || "—",
                desc: s.company_name  || s.name   || "",
                type: "Stock",
              })
            );
          }
        }

        setSearchResults(results.slice(0, 6));
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* ── Mark all read ───────────────────────────────────────────────────── */
  const markAllRead = async () => {
    try {
      await fetch(`${API_BASE}/notifications/mark_all_read`, {
        method:  "POST",
        headers: authHdr(),
      });
      setUnreadCount(0);
      setNotifications([]);
    } catch {}
  };

  /* ── Toggle bell — refetch fresh data every time opened ──────────────── */
  const toggleNotifs = () => {
    const next = !notifs;
    setNotifs(next);
    if (next) fetchNotifications(true);
  };

  /* ── Logout ──────────────────────────────────────────────────────────── */
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/authentication/logout`, {
        method:  "POST",
        headers: authHdr(),
      });
    } catch {}
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    logout();
    navigate("/");
  };

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  const isActive = (path, exact = false) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const timeAgo = (d) => {
    if (!d) return "";
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  /* Map a notification type to an icon — covers admin-side categories
     (KYC submissions, new signups, system alerts) plus the ADMIN_MESSAGE
     type so admins can also see replies/escalations in their own bell */
  const getNotifIcon = (type) => {
    const t = (type || "").toUpperCase();
    if (t === "KYC" || t === "KYC_SUBMITTED")     return "🪪";
    if (t === "NEW_USER" || t === "REGISTRATION") return "👤";
    if (t === "SYSTEM_ALERT" || t === "WARNING")  return "⚠️";
    if (t === "ADMIN_MESSAGE")                    return "📨";
    if (t === "WALLET" || t === "DEPOSIT")        return "💰";
    return "🔔";
  };

  const tickerItems = [...marketIndices, ...marketIndices];

  const adminName   = userProfile?.first_name
    ? `${userProfile.first_name} ${userProfile.last_name || ""}`.trim()
    : user?.full_name || user?.name || user?.username || "Admin";
  const adminAvatar = adminName.slice(0, 2).toUpperCase();
  const adminEmail  = userProfile?.email || user?.email || "";

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex h-screen bg-[#07091A] text-white overflow-hidden">

      {/* ── Ticker bar ── */}
      <div className="fixed top-0 left-0 right-0 z-50 h-7 bg-[#0A0C1E] border-b border-violet-500/10 overflow-hidden">
        <div
          className="flex items-center h-full whitespace-nowrap"
          style={{ animation: "ticker 32s linear infinite" }}
        >
          {tickerItems.map((m, i) => (
            <div key={i} className="flex items-center gap-2 px-5 whitespace-nowrap">
              <span className="text-xs text-gray-500">{m.name}</span>
              <span className="text-xs text-white">{m.value}</span>
              <span className={`text-xs ${m.up ? "text-emerald-400" : "text-red-400"}`}>{m.change}</span>
              <span className="text-violet-900 text-xs">|</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile overlay ── */}
      <AnimatePresence>
        {sidebar && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setSidebar(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <aside className={`fixed lg:relative top-7 left-0 bottom-0 w-[230px] bg-[#0A0C1E] border-r border-violet-500/10 z-40 flex flex-col pb-7 transition-transform duration-300 ${sidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>

        <div className="flex items-center gap-3 px-5 py-4 border-b border-violet-500/10">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white">TradeFlow</div>
            <div className="text-xs text-violet-400">Admin Console</div>
          </div>
          <button className="lg:hidden" onClick={() => setSidebar(false)}>
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="mx-4 my-3 px-3 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-xs text-violet-300 font-medium">Admin Access</span>
          <Zap className="w-3 h-3 text-violet-400 ml-auto" />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {nav.map((item) => {
            const active = isActive(item.path, item.exact);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebar(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all duration-200 group ${
                  active
                    ? "bg-gradient-to-r from-violet-600/20 to-purple-600/10 text-violet-300 border border-violet-500/20"
                    : "text-gray-500 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className={`w-4 h-4 ${active ? "text-violet-400" : "text-gray-600 group-hover:text-white"}`} />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-violet-500/10 relative">
          <div
            onClick={() => setSidebarMenu((v) => !v)}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white">
              {adminAvatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">{adminName}</div>
              <div className="text-xs text-gray-600 truncate">{adminEmail}</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${sidebarMenu ? "rotate-180" : ""}`} />
          </div>

          {sidebarMenu && (
            <>
              {/* Click-away backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setSidebarMenu(false)} />
              {/* Dropdown — opens upward since the row sits at the bottom */}
              <div className="absolute left-4 right-4 bottom-full mb-2 bg-[#0C1220] border border-violet-500/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-1">
                <div className="px-4 py-3 border-b border-white/5">
                  <div className="text-sm font-medium text-white truncate">{adminName}</div>
                  <div className="text-xs text-gray-500 truncate">{adminEmail}</div>
                  <div className="text-xs text-violet-400 mt-1">Administrator</div>
                </div>
                <button
                  onClick={() => { setSidebarMenu(false); navigate("/admin/settings"); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Platform Settings
                </button>
                <button
                  onClick={() => { setSidebarMenu(false); navigate("/admin/analytics"); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Analytics
                </button>
                <hr className="border-white/5 my-1" />
                <button
                  onClick={() => { setSidebarMenu(false); handleLogout(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 mt-7">

        <header className="bg-[#0A0C1E] border-b border-violet-500/10 px-4 lg:px-6 py-3 flex items-center gap-4">
          <button className="lg:hidden" onClick={() => setSidebar(true)}>
            <Menu className="w-5 h-5 text-gray-400" />
          </button>

          <div className="flex-1 max-w-xs relative z-50">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input
              type="text"
              placeholder="Search users, stocks…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              className="w-full bg-[#141C30] border border-violet-500/10 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500/30 transition-colors"
            />
            {searchOpen && searchQuery.length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#0C1220] border border-violet-500/10 rounded-2xl shadow-2xl overflow-hidden">
                {searchResults.length > 0 ? (
                  <div className="py-2">
                    <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Results</div>
                    {searchResults.map((res, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          if (res.type === "User")  navigate(`/admin/users/${res.id}`);
                          else                       navigate("/admin/stocks");
                          setSearchOpen(false);
                          setSearchQuery("");
                        }}
                        className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{res.name}</div>
                          <div className="text-xs text-gray-500 truncate">{res.desc}</div>
                        </div>
                        <div className={`text-xs px-2 py-1 rounded-md ml-3 flex-shrink-0 ${res.type === "User" ? "bg-violet-500/10 text-violet-400" : "bg-cyan-500/10 text-cyan-400"}`}>
                          {res.type}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-gray-500">
                    No results for "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/15 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400">Markets Open</span>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={toggleNotifs}
                className="relative p-2 rounded-xl bg-[#141C30] border border-violet-500/10 text-gray-500 hover:text-white transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-500" />
                )}
              </button>

              {notifs && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-[#0C1220] border border-violet-500/15 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <span className="text-sm font-medium text-white">Admin Alerts ({unreadCount} unread)</span>
                    {notifications.length > 0 && (
                      <button onClick={markAllRead} className="text-xs text-violet-400 hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifLoading ? (
                    <div className="px-4 py-6 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                    </div>
                  ) : notifications.length > 0 ? (
                    notifications.map((n, i) => (
                      <div key={n.notification_id || i} className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0">
                        <div className="flex items-start gap-2.5">
                          <span className="text-base mt-0.5">{getNotifIcon(n.notification_type || n.type)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{n.title || n.message}</div>
                            {/* FIX: read `message` FIRST, matching the field-name
                                convention now sent by AdminUserDetail.jsx and
                                whatever the backend persists to */}
                            <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.message || n.body || n.description || ""}</div>
                            <div className="text-xs text-gray-700 mt-1">{timeAgo(n.created_at || n.created_on)}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    /* Helpful fallback notices for admin when nothing in DB yet */
                    [
                      { t: "Dashboard updated",      s: "Check platform stats",  i: "📊" },
                      { t: "New user registrations", s: "Review users page",     i: "👤" },
                    ].map((n, i) => (
                      <div key={i} className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0">
                        <div className="flex items-start gap-2.5">
                          <span className="text-base">{n.i}</span>
                          <div>
                            <div className="text-sm text-white">{n.t}</div>
                            <div className="text-xs text-gray-600 mt-0.5">{n.s}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Profile dropdown */}
            <div className="relative">
              <div
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 cursor-pointer p-1.5 pr-3 rounded-xl hover:bg-white/5 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white">
                  {adminAvatar}
                </div>
                <span className="text-sm text-gray-300 hidden sm:block">{adminName}</span>
                <ChevronDown className="w-3 h-3 text-gray-500" />
              </div>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-52 bg-[#0C1220] border border-violet-500/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-1">
                    <div className="px-4 py-3 border-b border-white/5">
                      <div className="text-sm font-medium text-white">{adminName}</div>
                      <div className="text-xs text-gray-500 truncate">{adminEmail}</div>
                      <div className="text-xs text-violet-400 mt-1">Administrator</div>
                    </div>
                    <button
                      onClick={() => { setProfileOpen(false); navigate("/admin/settings"); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      Platform Settings
                    </button>
                    <button
                      onClick={() => { setProfileOpen(false); navigate("/admin/analytics"); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      Analytics
                    </button>
                    <hr className="border-white/5 my-1" />
                    <button
                      onClick={() => { setProfileOpen(false); handleLogout(); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-red-400 hover:bg-white/5 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-[#07091A]">
          <Outlet />
        </main>
      </div>

      <style>{`@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
    </div>
  );
}


























// import { useState, useEffect, useCallback, useRef } from "react";
// import { Outlet, useNavigate, useLocation, Link } from "react-router";
// import { motion, AnimatePresence } from "motion/react";
// import {
//   LayoutDashboard,
//   Users,
//   LineChart,
//   Settings,
//   Bell,
//   Search,
//   Menu,
//   X,
//   LogOut,
//   Shield,
//   TrendingUp,
//   Zap,
//   ChevronDown,
//   Newspaper,
// } from "lucide-react";
// import { useAuth } from "../../context/AuthContext";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken  = () => localStorage.getItem("access_token");

// /* No credentials:'include' — JWT Bearer only, avoids CORS preflight */
// const authHdr = () => ({ Authorization: `Bearer ${getToken()}` });

// const nav = [
//   { path: "/admin",          label: "Dashboard", icon: LayoutDashboard, exact: true },
//   { path: "/admin/users",    label: "All Users",  icon: Users },
//   { path: "/admin/stocks",   label: "All Stocks", icon: TrendingUp },
//   { path: "/admin/news",     label: "News",       icon: Newspaper },
//   { path: "/admin/analytics",label: "Analytics",  icon: LineChart },
//   { path: "/admin/settings", label: "Settings",   icon: Settings },
// ];

// /* Static fallback ticker indices for admin panel */
// const FALLBACK_INDICES = [
//   { name: "S&P 500", value: "5,248.49", change: "+0.87%", up: true  },
//   { name: "NASDAQ",  value: "16,428.82",change: "+1.15%", up: true  },
//   { name: "DOW",     value: "39,127.14",change: "+0.32%", up: true  },
//   { name: "VIX",     value: "13.47",    change: "-2.34%", up: false },
//   { name: "FTSE",    value: "8,127.63", change: "+0.55%", up: true  },
//   { name: "NIKKEI",  value: "39,523.55",change: "+0.43%", up: true  },
// ];

// /* ══════════════════════════════════════════════════════════════════════════ */
// export function AdminLayout() {
//   const navigate  = useNavigate();
//   const location  = useLocation();
//   const { user, logout } = useAuth();

//   const [sidebar,       setSidebar]       = useState(false);
//   const [notifs,        setNotifs]        = useState(false);
//   const [notifications, setNotifications] = useState([]);
//   const [unreadCount,   setUnreadCount]   = useState(0);
//   const [searchQuery,   setSearchQuery]   = useState("");
//   const [searchOpen,    setSearchOpen]    = useState(false);
//   const [profileOpen,   setProfileOpen]   = useState(false);
//   const [searchResults, setSearchResults] = useState([]);
//   const [marketIndices, setMarketIndices] = useState(FALLBACK_INDICES);

//   /* ── Fetch ticker: use sector_performance (admin-accessible dashboard API) ─
//      Unlike UserLayout, the admin panel fetches sector data from the admin
//      analytics endpoint. Falls back gracefully to static data.
//      NO credentials:'include' — that causes CORS OPTIONS preflights.
//   ──────────────────────────────────────────────────────────────────────── */
//   const fetchMarketTicker = useCallback(async () => {
//     const token = getToken();
//     if (!token) return;
//     try {
//       /* Try admin analytics sector performance first */
//       const res  = await fetch(`${API_BASE}/admin/analytics/sector_performance`, {
//         headers: authHdr(),
//       });
//       if (res.ok) {
//         const data    = await res.json();
//         const sectors = data?.response?.sectors || [];
//         if (sectors.length > 0) {
//           setMarketIndices(
//             sectors.slice(0, 6).map((s) => {
//               const chg = s.day_change_percent || 0;
//               return {
//                 name:   s.sector_name || "—",
//                 value:  `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
//                 change: `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
//                 up:     chg >= 0,
//               };
//             })
//           );
//           return;
//         }
//       }

//       /* Fallback: dashboard sector performance (read-only, any auth role) */
//       const res2  = await fetch(`${API_BASE}/dashboard/admin/platform_summary`, {
//         headers: authHdr(),
//       });
//       if (res2.ok) {
//         const data2   = await res2.json();
//         const sectors = data2?.response?.sectors || [];
//         if (sectors.length > 0) {
//           setMarketIndices(
//             sectors.slice(0, 6).map((s) => {
//               const chg = s.day_change_percent || 0;
//               return {
//                 name:   s.sector_name || "—",
//                 value:  `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
//                 change: `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
//                 up:     chg >= 0,
//               };
//             })
//           );
//         }
//       }
//       /* If both fail, FALLBACK_INDICES already set as initial state */
//     } catch {
//       /* Keep existing indices — no console spam */
//     }
//   }, []);

//   /* ── Fetch notifications ─────────────────────────────────────────────── */
//   const fetchNotifications = useCallback(async () => {
//     const token = getToken();
//     if (!token) return;
//     try {
//       const [nRes, uRes] = await Promise.all([
//         fetch(`${API_BASE}/notifications/my`,           { headers: authHdr() }),
//         fetch(`${API_BASE}/notifications/unread_count`, { headers: authHdr() }),
//       ]);
//       if (nRes.ok) {
//         const nd = await nRes.json();
//         if (nd?.bool) {
//           setNotifications((nd.response?.notifications || nd.response || []).slice(0, 8));
//         }
//       }
//       if (uRes.ok) {
//         const ud = await uRes.json();
//         if (ud?.bool) {
//           setUnreadCount(ud.response?.unread_count || ud.response?.count || 0);
//         }
//       }
//     } catch {}
//   }, []);

//   /* ── One-time init (empty dep array — runs once only) ────────────────── */
//   useEffect(() => {
//     fetchMarketTicker();
//     fetchNotifications();
//   }, []); // eslint-disable-line react-hooks/exhaustive-deps

//   /* ── Debounced live search: users + stocks ───────────────────────────── */
//   useEffect(() => {
//     if (!searchQuery || searchQuery.length < 2) {
//       setSearchResults([]);
//       return;
//     }
//     const timer = setTimeout(async () => {
//       const token = getToken();
//       if (!token) return;
//       try {
//         /* FIX: use per_page instead of limit for both endpoints */
//         const [usersRes, stocksRes] = await Promise.all([
//           fetch(
//             `${API_BASE}/users/list_users?search=${encodeURIComponent(searchQuery)}&per_page=5`,
//             { headers: authHdr() }
//           ),
//           fetch(
//             `${API_BASE}/stocks/list?search=${encodeURIComponent(searchQuery)}&per_page=5`,
//             { headers: authHdr() }
//           ),
//         ]);

//         const results = [];

//         if (usersRes.ok) {
//           const ud = await usersRes.json();
//           if (ud?.bool) {
//             const users = ud.response?.users || ud.response?.data || [];
//             users.slice(0, 3).forEach((u) =>
//               results.push({
//                 id:   u.user_id || u.id,
//                 name: u.full_name || u.name || u.username || "—",
//                 desc: u.email,
//                 type: "User",
//               })
//             );
//           }
//         }

//         if (stocksRes.ok) {
//           const sd = await stocksRes.json();
//           if (sd?.bool) {
//             const stocks = sd.response?.stocks || sd.response?.data || [];
//             stocks.slice(0, 3).forEach((s) =>
//               results.push({
//                 id:   s.stock_id || s.id,
//                 name: s.ticker_symbol || s.symbol || "—",
//                 desc: s.company_name  || s.name   || "",
//                 type: "Stock",
//               })
//             );
//           }
//         }

//         setSearchResults(results.slice(0, 6));
//       } catch {
//         setSearchResults([]);
//       }
//     }, 300);
//     return () => clearTimeout(timer);
//   }, [searchQuery]);

//   /* ── Mark all read ───────────────────────────────────────────────────── */
//   const markAllRead = async () => {
//     try {
//       await fetch(`${API_BASE}/notifications/mark_all_read`, {
//         method:  "POST",
//         headers: authHdr(),
//       });
//       setUnreadCount(0);
//       setNotifications([]);
//     } catch {}
//   };

//   /* ── Logout ──────────────────────────────────────────────────────────── */
//   const handleLogout = async () => {
//     try {
//       await fetch(`${API_BASE}/authentication/logout`, {
//         method:  "POST",
//         headers: authHdr(),
//       });
//     } catch {}
//     localStorage.removeItem("access_token");
//     localStorage.removeItem("refresh_token");
//     logout();
//     navigate("/");
//   };

//   /* ── Helpers ─────────────────────────────────────────────────────────── */
//   const isActive = (path, exact = false) =>
//     exact ? location.pathname === path : location.pathname.startsWith(path);

//   const timeAgo = (d) => {
//     if (!d) return "";
//     const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
//     if (s < 60)   return `${s}s ago`;
//     if (s < 3600) return `${Math.floor(s / 60)}m ago`;
//     return `${Math.floor(s / 3600)}h ago`;
//   };

//   /* Ticker: duplicate array for seamless scroll */
//   const tickerItems = [...marketIndices, ...marketIndices];

//   const adminName   = user?.name   || user?.full_name || "Admin";
//   const adminAvatar = adminName.slice(0, 2).toUpperCase();
//   const adminEmail  = user?.email  || "";

//   /* ════════════════════════════════════════════════════════════════════════
//      RENDER
//   ════════════════════════════════════════════════════════════════════════ */
//   return (
//     <div className="flex h-screen bg-[#07091A] text-white overflow-hidden">

//       {/* ── Ticker bar ── */}
//       <div className="fixed top-0 left-0 right-0 z-50 h-7 bg-[#0A0C1E] border-b border-violet-500/10 overflow-hidden">
//         <div
//           className="flex items-center h-full whitespace-nowrap"
//           style={{ animation: "ticker 32s linear infinite" }}
//         >
//           {tickerItems.map((m, i) => (
//             <div key={i} className="flex items-center gap-2 px-5 whitespace-nowrap">
//               <span className="text-xs text-gray-500">{m.name}</span>
//               <span className="text-xs text-white">{m.value}</span>
//               <span className={`text-xs ${m.up ? "text-emerald-400" : "text-red-400"}`}>{m.change}</span>
//               <span className="text-violet-900 text-xs">|</span>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* ── Mobile overlay ── */}
//       <AnimatePresence>
//         {sidebar && (
//           <motion.div
//             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
//             className="fixed inset-0 bg-black/60 z-40 lg:hidden"
//             onClick={() => setSidebar(false)}
//           />
//         )}
//       </AnimatePresence>

//       {/* ── Sidebar ── */}
//       <aside className={`fixed lg:relative top-7 left-0 bottom-0 w-[230px] bg-[#0A0C1E] border-r border-violet-500/10 z-40 flex flex-col pb-7 transition-transform duration-300 ${sidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>

//         {/* Logo */}
//         <div className="flex items-center gap-3 px-5 py-4 border-b border-violet-500/10">
//           <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
//             <Shield className="w-4 h-4 text-white" />
//           </div>
//           <div className="flex-1 min-w-0">
//             <div className="text-sm font-bold text-white">TradeFlow</div>
//             <div className="text-xs text-violet-400">Admin Console</div>
//           </div>
//           <button className="lg:hidden" onClick={() => setSidebar(false)}>
//             <X className="w-4 h-4 text-gray-500" />
//           </button>
//         </div>

//         {/* Admin badge */}
//         <div className="mx-4 my-3 px-3 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center gap-2">
//           <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
//           <span className="text-xs text-violet-300 font-medium">Admin Access</span>
//           <Zap className="w-3 h-3 text-violet-400 ml-auto" />
//         </div>

//         {/* Nav */}
//         <nav className="flex-1 overflow-y-auto px-3 py-2">
//           {nav.map((item) => {
//             const active = isActive(item.path, item.exact);
//             return (
//               <Link
//                 key={item.path}
//                 to={item.path}
//                 onClick={() => setSidebar(false)}
//                 className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all duration-200 group ${
//                   active
//                     ? "bg-gradient-to-r from-violet-600/20 to-purple-600/10 text-violet-300 border border-violet-500/20"
//                     : "text-gray-500 hover:text-white hover:bg-white/5"
//                 }`}
//               >
//                 <item.icon className={`w-4 h-4 ${active ? "text-violet-400" : "text-gray-600 group-hover:text-white"}`} />
//                 <span className="text-sm">{item.label}</span>
//               </Link>
//             );
//           })}
//         </nav>

//         {/* User row */}
//         <div className="p-4 border-t border-violet-500/10">
//           <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors">
//             <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white">
//               {adminAvatar}
//             </div>
//             <div className="flex-1 min-w-0">
//               <div className="text-sm text-white truncate">{adminName}</div>
//               <div className="text-xs text-gray-600 truncate">{adminEmail}</div>
//             </div>
//             <button onClick={handleLogout} className="text-gray-600 hover:text-red-400 transition-colors" title="Sign out">
//               <LogOut className="w-4 h-4" />
//             </button>
//           </div>
//         </div>
//       </aside>

//       {/* ── Main content ── */}
//       <div className="flex-1 flex flex-col min-w-0 mt-7">

//         {/* Header */}
//         <header className="bg-[#0A0C1E] border-b border-violet-500/10 px-4 lg:px-6 py-3 flex items-center gap-4">
//           <button className="lg:hidden" onClick={() => setSidebar(true)}>
//             <Menu className="w-5 h-5 text-gray-400" />
//           </button>

//           {/* Search — users + stocks */}
//           <div className="flex-1 max-w-xs relative z-50">
//             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
//             <input
//               type="text"
//               placeholder="Search users, stocks…"
//               value={searchQuery}
//               onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
//               onFocus={() => setSearchOpen(true)}
//               onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
//               className="w-full bg-[#141C30] border border-violet-500/10 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500/30 transition-colors"
//             />
//             {searchOpen && searchQuery.length >= 2 && (
//               <div className="absolute top-full left-0 right-0 mt-2 bg-[#0C1220] border border-violet-500/10 rounded-2xl shadow-2xl overflow-hidden">
//                 {searchResults.length > 0 ? (
//                   <div className="py-2">
//                     <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Results</div>
//                     {searchResults.map((res, i) => (
//                       <div
//                         key={i}
//                         onClick={() => {
//                           if (res.type === "User")  navigate(`/admin/users/${res.id}`);
//                           else                       navigate("/admin/stocks");
//                           setSearchOpen(false);
//                           setSearchQuery("");
//                         }}
//                         className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 flex items-center justify-between"
//                       >
//                         <div className="min-w-0">
//                           <div className="text-sm font-bold text-white truncate">{res.name}</div>
//                           <div className="text-xs text-gray-500 truncate">{res.desc}</div>
//                         </div>
//                         <div className={`text-xs px-2 py-1 rounded-md ml-3 flex-shrink-0 ${res.type === "User" ? "bg-violet-500/10 text-violet-400" : "bg-cyan-500/10 text-cyan-400"}`}>
//                           {res.type}
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 ) : (
//                   <div className="p-4 text-center text-sm text-gray-500">
//                     No results for "{searchQuery}"
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>

//           <div className="ml-auto flex items-center gap-3">
//             {/* Markets status */}
//             <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/15 rounded-full">
//               <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
//               <span className="text-xs text-emerald-400">Markets Open</span>
//             </div>

//             {/* Notifications */}
//             <div className="relative">
//               <button
//                 onClick={() => {
//                   const next = !notifs;
//                   setNotifs(next);
//                   if (next && unreadCount > 0) markAllRead();
//                 }}
//                 className="relative p-2 rounded-xl bg-[#141C30] border border-violet-500/10 text-gray-500 hover:text-white transition-colors"
//               >
//                 <Bell className="w-4 h-4" />
//                 {unreadCount > 0 && (
//                   <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-500" />
//                 )}
//               </button>

//               {notifs && (
//                 <div className="absolute right-0 top-full mt-2 w-80 bg-[#0C1220] border border-violet-500/15 rounded-2xl shadow-2xl z-50 overflow-hidden">
//                   <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
//                     <span className="text-sm font-medium text-white">Admin Alerts</span>
//                     {notifications.length > 0 && (
//                       <button onClick={markAllRead} className="text-xs text-violet-400 hover:underline">
//                         Mark all read
//                       </button>
//                     )}
//                   </div>
//                   {notifications.length > 0 ? (
//                     notifications.map((n, i) => (
//                       <div key={n.notification_id || i} className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0">
//                         <div className="flex items-start gap-2.5">
//                           <span className="text-base mt-0.5">🔔</span>
//                           <div className="flex-1 min-w-0">
//                             <div className="text-sm text-white truncate">{n.title || n.message}</div>
//                             <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.body || n.description || ""}</div>
//                             <div className="text-xs text-gray-700 mt-1">{timeAgo(n.created_at || n.created_on)}</div>
//                           </div>
//                         </div>
//                       </div>
//                     ))
//                   ) : (
//                     /* Helpful fallback notices for admin */
//                     [
//                       { t: "Dashboard updated",      s: "Check platform stats",  i: "📊" },
//                       { t: "New user registrations", s: "Review users page",     i: "👤" },
//                     ].map((n, i) => (
//                       <div key={i} className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0">
//                         <div className="flex items-start gap-2.5">
//                           <span className="text-base">{n.i}</span>
//                           <div>
//                             <div className="text-sm text-white">{n.t}</div>
//                             <div className="text-xs text-gray-600 mt-0.5">{n.s}</div>
//                           </div>
//                         </div>
//                       </div>
//                     ))
//                   )}
//                 </div>
//               )}
//             </div>

//             {/* Profile dropdown */}
//             <div className="relative">
//               <div
//                 onClick={() => setProfileOpen(!profileOpen)}
//                 className="flex items-center gap-2 cursor-pointer p-1.5 pr-3 rounded-xl hover:bg-white/5 transition-colors"
//               >
//                 <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white">
//                   {adminAvatar}
//                 </div>
//                 <span className="text-sm text-gray-300 hidden sm:block">{adminName}</span>
//                 <ChevronDown className="w-3 h-3 text-gray-500" />
//               </div>

//               {profileOpen && (
//                 <>
//                   <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
//                   <div className="absolute right-0 top-full mt-2 w-52 bg-[#0C1220] border border-violet-500/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-1">
//                     {/* Admin info */}
//                     <div className="px-4 py-3 border-b border-white/5">
//                       <div className="text-sm font-medium text-white">{adminName}</div>
//                       <div className="text-xs text-gray-500 truncate">{adminEmail}</div>
//                       <div className="text-xs text-violet-400 mt-1">Administrator</div>
//                     </div>
//                     <button
//                       onClick={() => { setProfileOpen(false); navigate("/admin/settings"); }}
//                       className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
//                     >
//                       Platform Settings
//                     </button>
//                     <button
//                       onClick={() => { setProfileOpen(false); navigate("/admin/analytics"); }}
//                       className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
//                     >
//                       Analytics
//                     </button>
//                     <hr className="border-white/5 my-1" />
//                     <button
//                       onClick={() => { setProfileOpen(false); handleLogout(); }}
//                       className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-red-400 hover:bg-white/5 transition-colors"
//                     >
//                       Sign Out
//                     </button>
//                   </div>
//                 </>
//               )}
//             </div>
//           </div>
//         </header>

//         {/* Page content */}
//         <main className="flex-1 overflow-y-auto bg-[#07091A]">
//           <Outlet />
//         </main>
//       </div>

//       <style>{`@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
//     </div>
//   );
// }



















