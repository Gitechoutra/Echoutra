import { useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  User,
  Bell,
  Shield,
  CreditCard,
  Globe,
  Moon,
  Sun,
  LogOut,
  Check,
  Camera,
  ChevronRight,
  Smartphone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Download,
  Trash2,
} from "lucide-react";

const tabs = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "preferences", label: "Preferences", icon: Globe },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("profile");
  const [darkMode, setDarkMode] = useState(true);
  const [showSaved, setShowSaved] = useState(false);
  const [profile, setProfile] = useState({
    name: "Alex Johnson",
    email: "alex.johnson@email.com",
    phone: "+1 (555) 234-5678",
    bio: "Active trader focusing on tech and growth stocks.",
    location: "San Francisco, CA",
    timezone: "Pacific Time (PT)",
  });
  const [notifications, setNotifications] = useState({
    priceAlerts: true,
    portfolioUpdates: true,
    newsDigest: false,
    tradeConfirmations: true,
    weeklyReport: true,
    marketOpen: true,
    marketClose: false,
    earningsAlerts: true,
  });
  const [twoFA, setTwoFA] = useState(true);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);

  const handleSave = () => {
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 3000);
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      {/* Success notification */}
      {showSaved && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 right-6 z-50 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2.5 rounded-xl"
        >
          <Check className="w-4 h-4" />
          <span className="text-sm">Changes saved successfully</span>
        </motion.div>
      )}

      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage your account and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar nav */}
        <div className="lg:w-52 flex-shrink-0">
          <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all border-b border-[#1E2D4A] last:border-0 ${
                  activeTab === tab.id
                    ? "bg-cyan-500/10 text-cyan-400"
                    : "text-gray-500 hover:text-white hover:bg-white/5"
                }`}
              >
                <tab.icon
                  className={`w-4 h-4 ${activeTab === tab.id ? "text-cyan-400" : "text-gray-600"}`}
                />
                {tab.label}
                {activeTab === tab.id && (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                )}
              </button>
            ))}
            <button
              onClick={() => navigate("/")}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/5 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5">
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-5"
            >
              <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
                <div className="text-sm font-medium text-white mb-5">
                  Profile Information
                </div>

                {/* Avatar */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl font-bold text-white">
                      AJ
                    </div>
                    <button className="absolute -bottom-1 -right-1 w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center">
                      <Camera className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">
                      {profile.name}
                    </div>
                    <div className="text-xs text-gray-500 mb-1">
                      {profile.email}
                    </div>
                    <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-xs text-cyan-400">
                      Pro Member
                    </span>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { label: "Full Name", key: "name", type: "text" },
                    { label: "Email Address", key: "email", type: "email" },
                    { label: "Phone Number", key: "phone", type: "tel" },
                    { label: "Location", key: "location", type: "text" },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="text-xs text-gray-500 mb-1.5 block">
                        {field.label}
                      </label>
                      <input
                        type={field.type}
                        value={profile[field.key]}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            [field.key]: e.target.value,
                          })
                        }
                        className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50 transition-colors"
                      />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <label className="text-xs text-gray-500 mb-1.5 block">
                      Bio
                    </label>
                    <textarea
                      value={profile.bio}
                      onChange={(e) =>
                        setProfile({ ...profile, bio: e.target.value })
                      }
                      rows={3}
                      className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50 transition-colors resize-none"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSave}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Save Changes
              </button>
            </motion.div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <motion.div
              key="notifications"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#1E2D4A]">
                  <div className="text-sm font-medium text-white">
                    Notification Preferences
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Choose what notifications you receive
                  </div>
                </div>

                {[
                  {
                    key: "priceAlerts",
                    label: "Price Alerts",
                    desc: "Get notified when stocks hit your target price",
                    icon: Bell,
                  },
                  {
                    key: "portfolioUpdates",
                    label: "Portfolio Updates",
                    desc: "Daily portfolio performance summaries",
                    icon: ChevronRight,
                  },
                  {
                    key: "tradeConfirmations",
                    label: "Trade Confirmations",
                    desc: "Immediate confirmation of executed orders",
                    icon: Check,
                  },
                  {
                    key: "earningsAlerts",
                    label: "Earnings Alerts",
                    desc: "Notifications for upcoming earnings reports",
                    icon: AlertTriangle,
                  },
                  {
                    key: "marketOpen",
                    label: "Market Open",
                    desc: "Alert when US markets open at 9:30 AM ET",
                    icon: Globe,
                  },
                  {
                    key: "marketClose",
                    label: "Market Close",
                    desc: "Alert when US markets close at 4:00 PM ET",
                    icon: Globe,
                  },
                  {
                    key: "newsDigest",
                    label: "Morning News Digest",
                    desc: "Daily financial news summary at 7:00 AM",
                    icon: Mail,
                  },
                  {
                    key: "weeklyReport",
                    label: "Weekly Portfolio Report",
                    desc: "Comprehensive weekly performance analysis",
                    icon: Download,
                  },
                ].map((notif) => (
                  <div
                    key={notif.key}
                    className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D4A]/50 last:border-0"
                  >
                    <div className="flex-1">
                      <div className="text-sm text-white">{notif.label}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {notif.desc}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setNotifications({
                          ...notifications,
                          [notif.key]: !notifications[notif.key],
                        })
                      }
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                        notifications[notif.key]
                          ? "bg-cyan-500"
                          : "bg-[#1A2235]"
                      }`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          notifications[notif.key]
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSave}
                className="mt-4 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Save Preferences
              </button>
            </motion.div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <motion.div
              key="security"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-5"
            >
              {/* Change Password */}
              <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
                <div className="text-sm font-medium text-white mb-4">
                  Change Password
                </div>
                <div className="space-y-3 max-w-sm">
                  {[
                    {
                      label: "Current Password",
                      show: showCurrentPassword,
                      toggle: () =>
                        setShowCurrentPassword(!showCurrentPassword),
                    },
                    { label: "New Password", show: false, toggle: () => {} },
                    {
                      label: "Confirm New Password",
                      show: false,
                      toggle: () => {},
                    },
                  ].map((field, i) => (
                    <div key={i}>
                      <label className="text-xs text-gray-500 mb-1.5 block">
                        {field.label}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                        <input
                          type={field.show ? "text" : "password"}
                          placeholder="••••••••"
                          className="w-full bg-[#1A2235] border border-[#1E2D4A] rounded-lg pl-10 pr-10 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50"
                        />

                        {i === 0 && (
                          <button
                            onClick={field.toggle}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                          >
                            {field.show ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={handleSave}
                    className="mt-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Update Password
                  </button>
                </div>
              </div>

              {/* 2FA */}
              <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-white">
                    Two-Factor Authentication
                  </div>
                  <button
                    onClick={() => setTwoFA(!twoFA)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${twoFA ? "bg-cyan-500" : "bg-[#1A2235]"}`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${twoFA ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Add an extra layer of security to your account using
                  authenticator apps.
                </p>
                {twoFA && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-emerald-400">
                      2FA is active on your account
                    </span>
                  </div>
                )}
              </div>

              {/* Sessions */}
              <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#1E2D4A]">
                  <div className="text-sm font-medium text-white">
                    Active Sessions
                  </div>
                </div>
                {[
                  {
                    device: "MacBook Pro",
                    location: "San Francisco, CA",
                    time: "Current session",
                    current: true,
                  },
                  {
                    device: "iPhone 15 Pro",
                    location: "San Francisco, CA",
                    time: "2 hours ago",
                    current: false,
                  },
                  {
                    device: "Chrome Windows",
                    location: "New York, NY",
                    time: "2 days ago",
                    current: false,
                  },
                ].map((session, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E2D4A]/50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#1A2235] flex items-center justify-center">
                        {i === 1 ? (
                          <Smartphone className="w-4 h-4 text-gray-500" />
                        ) : (
                          <Globe className="w-4 h-4 text-gray-500" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm text-white flex items-center gap-2">
                          {session.device}
                          {session.current && (
                            <span className="px-1.5 py-0.5 bg-emerald-500/10 rounded text-xs text-emerald-400">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600">
                          {session.location} · {session.time}
                        </div>
                      </div>
                    </div>
                    {!session.current && (
                      <button className="text-xs text-red-400 hover:text-red-300 transition-colors px-2.5 py-1 border border-red-500/20 rounded-lg">
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Danger zone */}
              <div className="bg-[#0A0E1A] border border-red-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <div className="text-sm font-medium text-red-400">
                    Danger Zone
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  These actions are permanent and cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button className="flex items-center gap-2 px-4 py-2 bg-[#1A2235] border border-[#1E2D4A] rounded-lg text-sm text-gray-400 hover:text-white transition-all">
                    <Download className="w-3.5 h-3.5" />
                    Export Data
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 hover:bg-red-500/20 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Account
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Billing Tab */}
          {activeTab === "billing" && (
            <motion.div
              key="billing"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-5"
            >
              {/* Current Plan */}
              <div className="bg-gradient-to-br from-cyan-500/10 to-blue-600/5 border border-cyan-500/20 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">
                      Current Plan
                    </div>
                    <div className="text-xl font-bold text-white">Pro Plan</div>
                    <div className="text-sm text-cyan-400">
                      $19/month · Renews June 6, 2026
                    </div>
                  </div>
                  <div className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg">
                    <span className="text-sm text-cyan-400 font-medium">
                      Active
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                    Upgrade to Elite
                  </button>
                  <button className="px-4 py-2 bg-[#1A2235] border border-[#1E2D4A] rounded-lg text-sm text-gray-400 hover:text-white transition-all">
                    Cancel Plan
                  </button>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-white">
                    Payment Methods
                  </div>
                  <button className="text-xs text-cyan-400 hover:text-cyan-300">
                    + Add Card
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-[#1A2235] border border-[#1E2D4A] rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded flex items-center justify-center">
                      <span className="text-xs font-bold text-white">VISA</span>
                    </div>
                    <div>
                      <div className="text-sm text-white">
                        •••• •••• •••• 4242
                      </div>
                      <div className="text-xs text-gray-600">Expires 12/27</div>
                    </div>
                  </div>
                  <span className="text-xs text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded-full">
                    Default
                  </span>
                </div>
              </div>

              {/* Billing History */}
              <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#1E2D4A]">
                  <div className="text-sm font-medium text-white">
                    Billing History
                  </div>
                </div>
                {[
                  {
                    date: "May 6, 2026",
                    amount: "$19.00",
                    status: "Paid",
                    desc: "Pro Plan - Monthly",
                  },
                  {
                    date: "Apr 6, 2026",
                    amount: "$19.00",
                    status: "Paid",
                    desc: "Pro Plan - Monthly",
                  },
                  {
                    date: "Mar 6, 2026",
                    amount: "$19.00",
                    status: "Paid",
                    desc: "Pro Plan - Monthly",
                  },
                  {
                    date: "Feb 6, 2026",
                    amount: "$19.00",
                    status: "Paid",
                    desc: "Pro Plan - Monthly",
                  },
                ].map((bill, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-5 py-3 border-b border-[#1E2D4A]/50 last:border-0"
                  >
                    <div>
                      <div className="text-sm text-white">{bill.desc}</div>
                      <div className="text-xs text-gray-600">{bill.date}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-white">{bill.amount}</div>
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
                        {bill.status}
                      </span>
                      <button className="text-xs text-gray-600 hover:text-white transition-colors">
                        PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Preferences Tab */}
          {activeTab === "preferences" && (
            <motion.div
              key="preferences"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-5"
            >
              <div className="bg-[#0A0E1A] border border-[#1E2D4A] rounded-xl p-5">
                <div className="text-sm font-medium text-white mb-4">
                  Display Preferences
                </div>
                <div className="space-y-4">
                  {/* Theme */}
                  <div>
                    <label className="text-xs text-gray-500 mb-2 block">
                      Theme
                    </label>
                    <div className="flex gap-3">
                      {["dark", "light", "system"].map((theme) => (
                        <button
                          key={theme}
                          onClick={() => setDarkMode(theme === "dark")}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm capitalize transition-all ${
                            (theme === "dark" && darkMode) ||
                            (theme === "light" && !darkMode)
                              ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                              : "border-[#1E2D4A] bg-[#1A2235] text-gray-500 hover:text-white"
                          }`}
                        >
                          {theme === "dark" ? (
                            <Moon className="w-4 h-4" />
                          ) : theme === "light" ? (
                            <Sun className="w-4 h-4" />
                          ) : (
                            <Globe className="w-4 h-4" />
                          )}
                          {theme}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Currency */}
                  <div>
                    <label className="text-xs text-gray-500 mb-2 block">
                      Display Currency
                    </label>
                    <select className="bg-[#1A2235] border border-[#1E2D4A] rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50 w-full sm:w-auto">
                      <option>USD - US Dollar</option>
                      <option>EUR - Euro</option>
                      <option>GBP - British Pound</option>
                      <option>JPY - Japanese Yen</option>
                    </select>
                  </div>

                  {/* Default order type */}
                  <div>
                    <label className="text-xs text-gray-500 mb-2 block">
                      Default Order Type
                    </label>
                    <div className="flex gap-2">
                      {["market", "limit", "stop"].map((type) => (
                        <button
                          key={type}
                          className="px-3 py-2 bg-[#1A2235] border border-[#1E2D4A] rounded-lg text-sm text-gray-400 capitalize hover:text-white transition-colors"
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chart type */}
                  <div>
                    <label className="text-xs text-gray-500 mb-2 block">
                      Default Chart Type
                    </label>
                    <div className="flex gap-2">
                      {["Line", "Candle", "Bar", "Area"].map((type) => (
                        <button
                          key={type}
                          className="px-3 py-2 bg-[#1A2235] border border-[#1E2D4A] rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSave}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Save Preferences
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
