import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
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
  Menu,
  X,
  LogOut,
  ChevronDown,
  BarChart2,
  Wallet,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { SupportChatWidget } from "../../components/SupportChatWidget";
import { MarketSessionPill } from "../../components/MarketStatusBadge";
import { useMarketStatus } from "../../hooks/useMarketStatus";
import { LiveQuotesProvider, useLiveQuotes, liveStocks } from "../../context/LiveQuotesContext";
import { StockLogo } from "../../components/StockLogo";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken  = () => localStorage.getItem("access_token");

/* Auth header — NO credentials:'include' (that causes CORS preflight on every request) */
const authHdr = () => ({
  Authorization:  `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

const nav = [
  { path: "/user",              label: "Dashboard",    icon: LayoutDashboard, exact: true },
  { path: "/user/market",       label: "Markets",      icon: TrendingUp },
  { path: "/user/portfolio",    label: "Portfolio",    icon: Briefcase },
  { path: "/user/watchlist",    label: "Watchlist",    icon: Star },
  { path: "/user/trade",        label: "Trade",        icon: ArrowLeftRight },
  { path: "/user/news",         label: "News",         icon: Newspaper },
  { path: "/user/transactions", label: "Transactions", icon: BarChart2 },
  { path: "/user/wallet",       label: "Wallet",       icon: Wallet },
  { path: "/user/settings",     label: "Settings",     icon: Settings },
];

/* ────────────────────────────────────────────────────────────────────────── */
/**
 * The provider wraps the layout itself, not just <Outlet/>, because the header
 * ticker is one of the things that has to stay live. Everything below — header,
 * ticker, and every routed page — then reads prices from one shared poll.
 */
export function UserLayout() {
  return (
    <LiveQuotesProvider>
      <UserLayoutInner />
    </LiveQuotesProvider>
  );
}

function UserLayoutInner() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user: authUser, logout } = useAuth();
  const { status: marketStatus }   = useMarketStatus();
  const { quotes }                 = useLiveQuotes();

  const [sidebar,       setSidebar]       = useState(false);
  const [notifs,        setNotifs]        = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [sidebarMenu,   setSidebarMenu]   = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifLoading,  setNotifLoading]  = useState(false);
  const [userProfile,   setUserProfile]   = useState(null);
  const [holdings,      setHoldings]      = useState([]);

  /* Stable refs so interval closures always call the latest version */
  const fetchNotifRef  = useRef(null);
  const notifIntervalRef  = useRef(null);
  const notifRef          = useRef(null);   // wraps the bell + dropdown for click-outside

  /* ── Close the notification dropdown on any click outside it ───────────── */
  useEffect(() => {
    if (!notifs) return;
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifs(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifs]);

  /* ── Ticker rows, derived from the shared quote store ────────────────────
     No fetch and no interval of its own any more. The ticker used to poll
     /stocks/list every 20s on its own schedule, which meant the price scrolling
     across the top could be up to 20s out of step with the same stock's price
     on the page below it. Now both read the same poll.
  ──────────────────────────────────────────────────────────────────────── */
  const marketIndices = useMemo(() => {
    // The store indexes each quote under both `id:` and `sym:`; take the id
    // entries only so each stock appears once.
    const rows = Object.entries(quotes)
      .filter(([k]) => k.startsWith("id:"))
      .map(([, q]) => q)
      .filter((q) => q.current_price != null)
      .sort((a, b) => Number(b.current_price) - Number(a.current_price))
      .slice(0, 14);

    return rows.map((q) => {
      const chg = Number(q.price_change_percent ?? 0);
      return {
        name:   q.ticker_symbol || "—",
        value:  `₹${Number(q.current_price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
        change: `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
        up:     chg >= 0,
      };
    });
  }, [quotes]);

  /* ── Fetch user profile ──────────────────────────────────────────────── */
  const fetchUserProfile = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res  = await fetch(`${API_BASE}/user_profiles/me`, { headers: authHdr() });
      if (res.ok) {
        const data = await res.json();
        if (data?.bool && data.response) setUserProfile(data.response);
      }
    } catch {}
  }, []);

  /* ── Fetch holdings for search enrichment ───────────────────────────── */
  const fetchUserHoldings = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const portRes  = await fetch(`${API_BASE}/portfolios/my`, { headers: authHdr() });
      if (!portRes.ok) return;
      const portData = await portRes.json();
      const list     = portData?.response?.portfolios || [];
      if (list.length === 0) return;

      const def      = list.find(p => p.is_default) || list[0];
      const holdRes  = await fetch(`${API_BASE}/portfolios/${def.portfolio_id}`, { headers: authHdr() });
      if (!holdRes.ok) return;
      const holdData = await holdRes.json();
      if (holdData?.bool && holdData.response?.holdings) {
        setHoldings(holdData.response.holdings);
      }
    } catch {}
  }, []);

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
        if (nd?.bool) setNotifications((nd.response?.notifications || []).slice(0, 8));
      }
      if (uRes.ok) {
        const ud = await uRes.json();
        if (ud?.bool) setUnreadCount(ud.response?.unread_count || ud.response?.count || 0);
      }
    } catch {
      /* keep last known notifications — no error spam */
    } finally {
      if (showSpinner) setNotifLoading(false);
    }
  }, []);

  /* Keep refs current so interval closures always call the latest fn */
  useEffect(() => { fetchNotifRef.current  = fetchNotifications; }, [fetchNotifications]);

  /* ── Mark notification read ─────────────────────────────────────────── */
  const markNotificationRead = async (id) => {
    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method:  "POST",
        headers: authHdr(),
      });
      setNotifications(prev => prev.filter(n => n.notification_id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  /* ── Click a notification → mark read + follow its deep link ─────────── */
  const handleNotificationClick = (n) => {
    markNotificationRead(n.notification_id);
    setNotifs(false);
    const url = n.action_url;
    if (url && url.startsWith("/")) navigate(url);
  };

  /* ── Toggle bell dropdown — refetch fresh data every time it's opened ── */
  const toggleNotifs = () => {
    const next = !notifs;
    setNotifs(next);
    if (next) fetchNotifications(true); // showSpinner=true for instant feedback
  };

  /* ── Debounced stock search ──────────────────────────────────────────── */
  const searchStocks = useCallback(async (query) => {
    if (!query.trim()) { setSearchResults([]); return; }
    const token = getToken();
    if (!token) return;
    try {
      const params = new URLSearchParams({ search: query, per_page: 8 });
      const res    = await fetch(`${API_BASE}/stocks/list?${params}`, { headers: authHdr() });
      if (!res.ok) return;
      const data  = await res.json();
      if (!data?.bool) return;

      const stocks      = data.response?.stocks || [];
      const holdSymbols = new Set(holdings.map(h => h.ticker_symbol));
      const results = [
        ...holdings
          .filter(h =>
            h.ticker_symbol?.toLowerCase().includes(query.toLowerCase()) ||
            h.company_name?.toLowerCase().includes(query.toLowerCase())
          )
          .map(h => ({ symbol: h.ticker_symbol, name: h.company_name, type: "Holding" })),
        ...stocks
          .filter(s => !holdSymbols.has(s.ticker_symbol))
          .map(s => ({ symbol: s.ticker_symbol, name: s.company_name, type: "Stock" })),
      ].slice(0, 8);
      setSearchResults(results);
    } catch { setSearchResults([]); }
  }, [holdings]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchQuery) searchStocks(searchQuery);
      else setSearchResults([]);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchStocks]);

  /* ── One-time init + intervals (EMPTY dep array → runs once only) ───────
     Root causes fixed here:
     • Notifications previously had NO recurring interval at all — only
       fetched once at mount. Admin-sent alerts (stock/news/KYC/etc.) would
       sit in the DB and never reach the bell until a hard page reload.
       Fixed by adding a dedicated 30-second poll for notifications.
     • Having `fetchX` functions in the dep array caused the effect to
       re-register whenever function identity changed — avoided by using
       stable refs (fetchNotifRef) inside the intervals.
     • `credentials:'include'` caused a CORS preflight (OPTIONS) before
       EVERY request — removed from all fetch calls above.
     • The ticker's own 20s price poll is gone — prices now come from the
       shared LiveQuotesProvider, so the ticker can't drift out of step with
       the page beneath it.
     • Notifications interval is 30 seconds (needs to feel near-live).
  ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    /* Initial fetch — call through refs so we don't need them as deps */
    fetchUserProfile();
    fetchUserHoldings();
    fetchNotifications();

    /* Settings lives in a sibling route, so a profile picture saved there can't
       reach this layout through props. It fires `profile-updated` and we re-read
       the profile, keeping the sidebar/header avatar in sync without a reload. */
    const onProfileUpdated = () => fetchUserProfile();
    window.addEventListener("profile-updated", onProfileUpdated);

    /* Refresh notifications every 30 seconds — this is the actual fix:
       admin-sent notifications now reach the bell without a page reload */
    notifIntervalRef.current = setInterval(() => {
      if (getToken()) fetchNotifRef.current?.();
      else {
        clearInterval(notifIntervalRef.current);
        notifIntervalRef.current = null;
      }
    }, 30_000); // 30 seconds

    return () => {
      window.removeEventListener("profile-updated", onProfileUpdated);
      clearInterval(notifIntervalRef.current);
      notifIntervalRef.current  = null;
    };
  }, []); // ← intentionally empty — runs once on mount

  /* ── Refetch notifications whenever the user navigates to a new page ──
     Catches the case where an admin notification arrived while the user
     was mid-navigation; keeps the badge accurate without waiting 30s. ── */
  useEffect(() => {
    if (getToken()) fetchNotifRef.current?.();
  }, [location.pathname]);

  /* ── Logout ─────────────────────────────────────────────────────────── */
  const handleLogout = async () => {
    try {
      const token = getToken();
      if (token) {
        await fetch(`${API_BASE}/authentication/logout`, {
          method:  "POST",
          headers: authHdr(),
        });
      }
    } catch {}
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    logout();
    navigate("/");
  };

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  const isActive = (path, exact = false) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const getNotifIcon = (type) => {
    const t = (type || "").toUpperCase();
    if (t === "PRICE_ALERT")        return "📈";
    if (t === "ORDER_EXECUTED" || t === "ORDER_FILLED") return "✅";
    if (t === "ORDER_CANCELLED" || t === "ORDER_REJECTED") return "❌";
    if (t === "PORTFOLIO_UPDATE")   return "📊";
    if (t === "NEWS" || t === "MARKET_NEWS" || t === "NEWS_ALERT") return "📰";
    if (t === "STOCK_LISTED")       return "🆕";
    if (t === "DIVIDEND")           return "💵";
    if (t === "SUBSCRIPTION")       return "⭐";
    if (t === "KYC" || t === "KYC_UPDATE" || t === "KYC_APPROVED" || t === "KYC_REJECTED") return "🪪";
    if (t === "ADMIN_MESSAGE")      return "📨";
    if (t === "SECURITY")           return "🔒";
    if (t === "WALLET" || t === "DEPOSIT" || t === "WITHDRAWAL") return "💰";
    return "🔔";
  };

  const timeAgo = (dateString) => {
    if (!dateString) return "recently";
    const secs = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400)return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  };

  /* ── Derived display values ──────────────────────────────────────────── */
  const displayName   = userProfile?.first_name
    ? `${userProfile.first_name} ${userProfile.last_name || ""}`.trim()
    : authUser?.full_name || authUser?.name || authUser?.username || "Investor";
  const displayEmail  = userProfile?.email  || authUser?.email  || "";
  const displayAvatar = displayName.charAt(0).toUpperCase() || "I";
  const avatarUrl     = userProfile?.avatar_url || "";

  /* Profile picture, falling back to the name initial when none is set.
     Used by both the sidebar row and the header dropdown so a photo saved in
     Settings shows up everywhere without a reload. */
  const Avatar = ({ size }) => (
    avatarUrl ? (
      <img src={avatarUrl} alt="" className={`${size} rounded-full object-cover border border-white/10 flex-shrink-0`} />
    ) : (
      <div className={`${size} rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
        {displayAvatar}
      </div>
    )
  );

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  return (
    /* pt-7 reserves the fixed ticker's height so the sidebar and main column both
       flow beneath it — prevents the sidebar footer from being clipped off-screen. */
    <div className="flex h-screen bg-[#07091A] text-white overflow-hidden pt-7">

      {/* ── Ticker bar ── */}
      <div className="fixed top-0 left-0 right-0 z-50 h-7 bg-[#0A0E1E] border-b border-cyan-500/10 overflow-hidden">
        <div className="flex items-center h-full" style={{ animation: "ticker 32s linear infinite" }}>
          {[...marketIndices, ...marketIndices].map((m, i) => (
            <div key={i} className="flex items-center gap-2 px-5 whitespace-nowrap">
              <span className="text-xs text-gray-500">{m.name}</span>
              <span className="text-xs text-white">{m.value}</span>
              <span className={`text-xs ${m.up ? "text-emerald-400" : "text-red-400"}`}>{m.change}</span>
              <span className="text-cyan-900 text-xs">|</span>
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
      <aside className={`fixed lg:relative top-7 lg:top-0 left-0 bottom-0 w-[228px] bg-[#0A0E1E] border-r border-cyan-500/10 z-40 flex flex-col transition-transform duration-300 ${sidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-cyan-500/10">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white">TradeFlow</div>
            <div className="text-xs text-cyan-400">Investor Portal</div>
          </div>
          <button className="lg:hidden" onClick={() => setSidebar(false)}>
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Personal view badge */}
        <div className="mx-4 my-3 px-3 py-2 bg-cyan-500/8 border border-cyan-500/15 rounded-xl flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs text-cyan-300 font-medium">Personal View</span>
        </div>

        {/* Nav links */}
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
                    ? "bg-gradient-to-r from-cyan-500/15 to-blue-600/10 text-cyan-300 border border-cyan-500/20"
                    : "text-gray-500 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className={`w-4 h-4 ${active ? "text-cyan-400" : "text-gray-600 group-hover:text-white"}`} />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User row */}
        <div className="p-4 border-t border-cyan-500/10 relative">
          <div
            onClick={() => setSidebarMenu((v) => !v)}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
          >
            <Avatar size="w-8 h-8" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">{displayName}</div>
              <div className="text-xs text-gray-600 truncate">{displayEmail}</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${sidebarMenu ? "rotate-180" : ""}`} />
          </div>

          {sidebarMenu && (
            <>
              {/* Click-away backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setSidebarMenu(false)} />
              {/* Dropdown — opens upward since the row sits at the bottom */}
              <div className="absolute left-4 right-4 bottom-full mb-2 bg-[#0C1220] border border-cyan-500/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-1">
                <div className="px-4 py-3 border-b border-white/5">
                  <div className="text-sm font-medium text-white truncate">{displayName}</div>
                  <div className="text-xs text-gray-500 truncate">{displayEmail}</div>
                </div>
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
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="bg-[#0A0E1E] border-b border-cyan-500/10 px-4 lg:px-6 py-3 flex items-center gap-4">
          <button className="lg:hidden" onClick={() => setSidebar(true)}>
            <Menu className="w-5 h-5 text-gray-400" />
          </button>

          {/* Search */}
          <div className="flex-1 max-w-xs relative z-50">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input
              type="text"
              placeholder="Search stocks or companies..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              className="w-full bg-[#141C30] border border-cyan-500/10 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 transition-colors"
            />
            {searchOpen && searchQuery && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#0C1220] border border-cyan-500/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="py-2">
                  <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Results</div>
                  {searchResults.map((res, i) => (
                    <div key={i}
                      onClick={() => { navigate(`/user/stock/${res.symbol}`); setSearchOpen(false); setSearchQuery(""); }}
                      className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <StockLogo symbol={res.symbol} name={res.name} size="xs" />
                        <div>
                          <div className="text-sm font-bold text-white">{res.symbol}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[140px]">{res.name}</div>
                        </div>
                      </div>
                      <div className="text-xs px-2 py-1 bg-cyan-500/10 text-cyan-400 rounded-md">{res.type}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {searchOpen && searchQuery && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#0C1220] border border-cyan-500/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="px-4 py-4 text-center text-sm text-gray-500">No results for "{searchQuery}"</div>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Live NSE session state — never hardcode this; it tells the user
                whether they can trade at all. */}
            <MarketSessionPill status={marketStatus} />

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={toggleNotifs}
                className="relative p-2 rounded-xl bg-[#141C30] border border-cyan-500/10 text-gray-500 hover:text-white transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
              </button>

              {notifs && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[#0C1220] border border-cyan-500/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <span className="text-sm font-medium text-white">Alerts ({unreadCount} unread)</span>
                    {notifications.length > 0 && (
                      <button
                        onClick={async () => {
                          await fetch(`${API_BASE}/notifications/mark_all_read`, { method: "POST", headers: authHdr() });
                          setNotifications([]);
                          setUnreadCount(0);
                        }}
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifLoading ? (
                    <div className="px-4 py-6 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                    </div>
                  ) : notifications.length > 0 ? (
                    notifications.map((n) => (
                      <div
                        key={n.notification_id}
                        onClick={() => handleNotificationClick(n)}
                        className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-base">{getNotifIcon(n.notification_type || n.type)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="text-sm text-white truncate">{n.title}</div>
                              {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message || n.body}</div>
                            <div className="text-xs text-gray-600 mt-1">{timeAgo(n.created_at || n.created_on)}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">No new notifications</div>
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
                <Avatar size="w-7 h-7" />
                <span className="text-sm text-gray-300 hidden sm:block">{displayName.split(" ")[0]}</span>
                <ChevronDown className="w-3 h-3 text-gray-500" />
              </div>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-52 bg-[#0C1220] border border-cyan-500/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-1">
                    {/* Profile info */}
                    <div className="px-4 py-3 border-b border-white/5">
                      <div className="text-sm font-medium text-white truncate">{displayName}</div>
                      <div className="text-xs text-gray-500 truncate">{displayEmail}</div>
                    </div>
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-[#07091A]">
          <Outlet />
        </main>
      </div>

      {/* Floating support chat */}
      <SupportChatWidget />

      <style>{`@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
    </div>
  );
}



















