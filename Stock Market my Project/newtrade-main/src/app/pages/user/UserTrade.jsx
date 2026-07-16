import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, CheckCircle, Clock, XCircle, ArrowUpDown,
  Wallet, AlertCircle, RefreshCw, IndianRupee,
  TrendingUp, TrendingDown, ChevronDown, X, Loader2,
} from "lucide-react";


const API_BASE     = "http://127.0.0.1:5050/v1";
const RAZORPAY_KEY = import.meta.env?.VITE_RAZORPAY_KEY_ID || "rzp_test_SzxHpcvfJEeIhH";

const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({
  Authorization:  `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

/* Currency helpers — all prices display in Indian Rupees (₹) */
const sym   = () => "₹";
const fmtPx = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Load Razorpay SDK once */
function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const STATUS_CONFIG = {
  FILLED:    { color: "text-emerald-400", bg: "bg-emerald-500/10", Icon: CheckCircle },
  PENDING:   { color: "text-amber-400",   bg: "bg-amber-500/10",   Icon: Clock },
  CANCELLED: { color: "text-gray-500",    bg: "bg-gray-500/10",    Icon: XCircle },
  REJECTED:  { color: "text-red-400",     bg: "bg-red-500/10",     Icon: XCircle },
  PARTIAL:   { color: "text-cyan-400",    bg: "bg-cyan-500/10",    Icon: Clock },
};

/* ══════════════════════════════════════════════════════════════════════ */
export function UserTrade() {
  const navigate   = useNavigate();

  /* ── Form state ── */
  const [tradeType,  setTradeType]  = useState("BUY");
  const [orderType,  setOrderType]  = useState("MARKET");
  const [qty,        setQty]        = useState("1");
  const [limitPx,    setLimitPx]    = useState("");
  const [tif,        setTif]        = useState("DAY");
  const [searchQ,    setSearchQ]    = useState("");
  const [dropOpen,   setDropOpen]   = useState(false);

  /* ── Data ── */
  const [stocks,     setStocks]     = useState([]);
  const [selStock,   setSelStock]   = useState(null);
  const [history,    setHistory]    = useState([]);
  const [wallet,     setWallet]     = useState(null);
  const [holdings,   setHoldings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [hFilter,    setHFilter]    = useState("all");

  /* ── UI state ── */
  const [toast,      setToast]      = useState(null);  // {msg, ok}
  const [confirmOpen,setConfirmOpen]= useState(false);
  const [placingOrder,setPlacing]   = useState(false);
  const [topUpMode,  setTopUpMode]  = useState(false); // wallet insufficient
  const [topUpAmt,   setTopUpAmt]   = useState("");

  const searchRef = useRef(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  /* ════════════════════════════════════════════════════════
     FETCH DATA
  ════════════════════════════════════════════════════════ */
  const fetchStocks = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/stocks/list?per_page=50&sort_by=current_price&order=desc`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) {
        const list = data.response?.stocks || [];
        setStocks(list);
        if (!selStock && list.length > 0) setSelStock(list[0]);
      }
    } catch {}
  }, []);

  const fetchWallet = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/wallets/me`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) setWallet(data.response);
    } catch {}
  }, []);

  const fetchHoldings = useCallback(async () => {
    try {
      const pRes  = await fetch(`${API_BASE}/portfolios/my`, { headers: authHdr() });
      const pData = await pRes.json();
      if (!pData.bool) return;
      const ports = pData.response?.portfolios || [];
      if (ports.length === 0) return;
      const p    = ports.find(x => x.is_default) || ports[0];
      const hRes = await fetch(`${API_BASE}/portfolios/${p.portfolio_id}`, { headers: authHdr() });
      const hData= await hRes.json();
      if (hData.bool) setHoldings(hData.response?.holdings || []);
    } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      /*
        FIX — Trade history was empty because the backend /trade_orders/history
        returns different shapes depending on the Flask route version:
          - { response: { orders: [...] } }
          - { response: { trade_orders: [...] } }
          - { response: { history: [...] } }
          - { response: { data: [...] } }
          - { response: [...] }   ← direct array
        Try /history first, then /my as fallback to cover both endpoints.
      */
      const res  = await fetch(`${API_BASE}/trade_orders/history?per_page=100`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) {
        const r = data.response;
        const list =
          r?.orders       ||
          r?.trade_orders ||
          r?.history      ||
          r?.data         ||
          (Array.isArray(r) ? r : []);
        if (list.length > 0) { setHistory(list); return; }
      }

      /* Fallback: /trade_orders/my */
      const res2  = await fetch(`${API_BASE}/trade_orders/my?per_page=100`, { headers: authHdr() });
      const data2 = await res2.json();
      if (data2.bool) {
        const r2 = data2.response;
        const list2 =
          r2?.orders       ||
          r2?.trade_orders ||
          r2?.history      ||
          r2?.data         ||
          (Array.isArray(r2) ? r2 : []);
        setHistory(list2);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.allSettled([fetchStocks(), fetchWallet(), fetchHoldings(), fetchHistory()]);
      setLoading(false);
    };
    init();
  }, []);

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (dropOpen && !e.target.closest("[data-dropdown]")) setDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropOpen]);

  /* ════════════════════════════════════════════════════════
     DERIVED VALUES
  ════════════════════════════════════════════════════════ */
  const filteredStocks = stocks.filter(s =>
    (s.ticker_symbol || "").toLowerCase().includes(searchQ.toLowerCase()) ||
    (s.company_name  || "").toLowerCase().includes(searchQ.toLowerCase())
  ).slice(0, 8);

  /* For SELL — only show holdings the user owns */
  const myHoldingSymbols = new Set(holdings.map(h => h.ticker_symbol));
  const sellableStocks   = filteredStocks.filter(s => myHoldingSymbols.has(s.ticker_symbol));
  const displayStocks    = tradeType === "SELL" ? sellableStocks : filteredStocks;

  const stockCurrency = selStock?.currency || "INR";
  const currentPrice  = parseFloat(selStock?.current_price || 0);
  const execPx        = orderType === "MARKET" ? currentPrice : parseFloat(limitPx || currentPrice.toString() || "0");
  const qtyNum        = parseInt(qty || "0") || 0;

  /* Total is in stock's currency; wallet is always INR */
  const orderTotal    = qtyNum * execPx;

  /* Wallet balance */
  const walletBalance = parseFloat(wallet?.available_balance || wallet?.balance || 0);
  /*
    FIX — wallet.currency was coming back as "USD" from the backend even
    though the platform's Wallets model defaults to currency='INR'.
    This caused the wallet balance to display as "$5,15,112.29" instead
    of "₹5,15,112.29". Force wallet currency to always INR — the wallet
    is never in USD regardless of what the API returns.
  */
  const walletCurrency = "INR";

  /* How much more the user needs to top up */
  const deficit       = Math.max(0, orderTotal - walletBalance);
  const hasSufficientFunds = tradeType === "SELL" || walletBalance >= orderTotal;

  /* Current holding of selected stock */
  const myHolding     = holdings.find(h => h.ticker_symbol === selStock?.ticker_symbol);
  const myShares      = parseFloat(myHolding?.quantity || 0);

  const changePct     = parseFloat(selStock?.price_change_percent || 0);
  const isUp          = changePct >= 0;

  /* ════════════════════════════════════════════════════════
     PLACE ORDER (core logic)
     Called after any required Razorpay top-up succeeds,
     OR directly if wallet already has enough.
  ════════════════════════════════════════════════════════ */
  const placeOrder = async () => {
    if (!selStock?.stock_id) { showToast("No stock selected.", false); return; }
    if (!qtyNum || qtyNum < 1) { showToast("Enter a valid quantity.", false); return; }
    if (tradeType === "SELL" && qtyNum > myShares) {
      showToast(`You only own ${myShares} shares of ${selStock.ticker_symbol}.`, false); return;
    }

    setPlacing(true);
    try {
      /* Capture token NOW (before any async — avoids token-missing after Razorpay) */
      const token = getToken();
      if (!token) { showToast("Session expired. Please log in again.", false); navigate("/signin"); return; }

      const payload = {
        stock_id:   selStock.stock_id,
        order_side: tradeType,                    // "BUY" | "SELL"
        order_type: orderType,                    // "MARKET" | "LIMIT"
        quantity:   qtyNum,
        ...(orderType !== "MARKET" && limitPx
          ? { limit_price: parseFloat(limitPx) }
          : {}),
        time_in_force: tif,
      };

      const res  = await fetch(`${API_BASE}/trade_orders/place`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.bool) {
        showToast(data.response?.message || "Order failed. Please try again.", false);
        setPlacing(false); setConfirmOpen(false); return;
      }

      showToast(
        `${tradeType === "BUY" ? "Bought" : "Sold"} ${qtyNum} × ${selStock.ticker_symbol} successfully!`
      );
      setConfirmOpen(false);
      await Promise.allSettled([fetchHistory(), fetchWallet(), fetchHoldings()]);
    } catch {
      showToast("Network error placing order.", false);
    } finally {
      setPlacing(false);
    }
  };

  /* ════════════════════════════════════════════════════════
     RAZORPAY TOP-UP → then place order
     Flow:
     1. Load Razorpay SDK
     2. POST /payment/create_order  (purpose=WALLET_DEPOSIT)
     3. Open Razorpay checkout (bank / UPI / card)
     4. On success → POST /payment/verify → POST /wallets/deposit
     5. Refresh wallet → placeOrder()
  ════════════════════════════════════════════════════════ */
  const handleTopUpThenBuy = async () => {
    const topUpAmount = parseFloat(topUpAmt);
    if (isNaN(topUpAmount) || topUpAmount < 1) {
      showToast("Enter a valid top-up amount (min ₹1).", false); return;
    }
    if (topUpAmount < deficit) {
      showToast(`Add at least ₹${deficit.toFixed(2)} to cover this order.`, false); return;
    }

    setPlacing(true);
    try {
      /* Capture token BEFORE opening Razorpay to avoid 401 in handler */
      const token = getToken();
      if (!token) { showToast("Session expired.", false); setPlacing(false); return; }

      const rzpLoaded = await loadRazorpay();
      if (!rzpLoaded) {
        showToast("Failed to load Razorpay. Check your internet connection.", false);
        setPlacing(false); return;
      }

      /* Try to create a backend order — graceful fallback if route 404 */
      let rzpOrderId = null;
      let rzpKeyId   = RAZORPAY_KEY;

      try {
        const orderRes  = await fetch(`${API_BASE}/payment/create_order`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({
            amount:   Math.round(topUpAmount * 100),
            currency: "INR",
            purpose:  "WALLET_DEPOSIT",
          }),
        });
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          if (orderData.bool && orderData.response?.order_id) {
            rzpOrderId = orderData.response.order_id;
            rzpKeyId   = orderData.response.key_id || RAZORPAY_KEY;
          }
        }
      } catch { /* fallback — continue without order_id */ }

      const options = {
        key:         rzpKeyId,
        amount:      Math.round(topUpAmount * 100),
        currency:    "INR",
        name:        "TradeFlow",
        description: `Wallet Top-up for ${selStock?.ticker_symbol} trade`,
        ...(rzpOrderId ? { order_id: rzpOrderId } : {}),
        theme: { color: "#06B6D4" },

        handler: async (rzpResp) => {
          try {
            /* Verify signature if we have an order_id */
            if (rzpOrderId) {
              const vRes  = await fetch(`${API_BASE}/payment/verify`, {
                method:  "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body:    JSON.stringify({
                  razorpay_order_id:   rzpResp.razorpay_order_id,
                  razorpay_payment_id: rzpResp.razorpay_payment_id,
                  razorpay_signature:  rzpResp.razorpay_signature,
                  purpose:             "WALLET_DEPOSIT",
                  amount:              topUpAmount,
                }),
              });
              const vData = await vRes.json();
              if (!vData.bool) {
                showToast("Payment verification failed. Contact support.", false);
                setPlacing(false); return;
              }
            }

            /* Credit wallet */
            const dRes  = await fetch(`${API_BASE}/wallets/deposit`, {
              method:  "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body:    JSON.stringify({
                amount:              topUpAmount,
                payment_method:      "RAZORPAY",
                razorpay_payment_id: rzpResp.razorpay_payment_id,
                ...(rzpOrderId ? { razorpay_order_id: rzpResp.razorpay_order_id } : {}),
                notes:               `Top-up for ${selStock?.ticker_symbol} trade`,
              }),
            });
            const dData = await dRes.json();
            if (!dData.bool) {
              showToast(dData.response?.message || "Wallet credit failed. Contact support.", false);
              setPlacing(false); return;
            }

            /* Refresh wallet then place the trade */
            await fetchWallet();
            setTopUpMode(false);
            setConfirmOpen(false);
            showToast(`₹${topUpAmount.toFixed(2)} added to wallet. Placing order…`);
            await placeOrder();
          } catch {
            showToast("Network error during top-up. Please try again.", false);
            setPlacing(false);
          }
        },

        modal: {
          ondismiss: () => { setPlacing(false); },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        showToast(`Payment failed: ${resp.error?.description || "Unknown error"}`, false);
        setPlacing(false);
      });
      rzp.open();
    } catch {
      showToast("Something went wrong. Please try again.", false);
      setPlacing(false);
    }
  };

  /* Cancel pending order */
  const handleCancel = async (orderId) => {
    if (!window.confirm("Cancel this pending order?")) return;
    try {
      const res  = await fetch(`${API_BASE}/trade_orders/${orderId}/cancel`, {
        method: "POST", headers: authHdr(),
      });
      const data = await res.json();
      if (data.bool) { showToast("Order cancelled."); await fetchHistory(); }
      else showToast(data.response?.message || "Cancel failed.", false);
    } catch { showToast("Network error.", false); }
  };

  const histFiltered = history.filter(o =>
    hFilter === "all" || (o.status || "").toLowerCase() === hFilter
  );

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`fixed top-24 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-sm font-medium ${
              toast.ok
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border-red-500/20 text-red-400"
            }`}>
            {toast.ok
              ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Trade</h1>
          <p className="text-sm text-gray-500 mt-0.5">Buy and sell stocks from your wallet</p>
        </div>
        <button onClick={async () => { setLoading(true); await Promise.allSettled([fetchStocks(), fetchWallet(), fetchHoldings(), fetchHistory()]); setLoading(false); }}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Wallet balance banner */}
      {wallet && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#0C1220] border border-cyan-500/15 rounded-xl">
          <Wallet className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-gray-500">Wallet Available Balance </span>
            <span className="text-sm font-bold text-cyan-400 ml-1">
              {sym(walletCurrency)}{walletBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
            {wallet.locked_balance > 0 && (
              <span className="text-xs text-gray-600 ml-2">
                ({sym(walletCurrency)}{parseFloat(wallet.locked_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })} locked in pending orders)
              </span>
            )}
          </div>
          <button
            onClick={() => navigate("/user/settings")}
            className="text-xs text-cyan-400 hover:underline flex-shrink-0">
            Add Money →
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <span className="text-xs text-gray-600">Loading trading panel…</span>
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-5">

          {/* ═══ ORDER FORM ═══ */}
          <div className="lg:col-span-2">
            <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">

              {/* BUY / SELL tabs */}
              <div className="grid grid-cols-2">
                {["BUY", "SELL"].map((t) => (
                  <button key={t} onClick={() => { setTradeType(t); setLimitPx(""); }}
                    className={`py-3.5 text-sm font-semibold transition-all cursor-pointer ${
                      tradeType === t
                        ? t === "BUY"
                          ? "bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500"
                          : "bg-red-500/10 text-red-400 border-b-2 border-red-500"
                        : "text-gray-500 hover:text-gray-300 border-b border-white/5"
                    }`}>
                    {t}
                  </button>
                ))}
              </div>

              <div className="p-5 space-y-4">

                {/* ── Stock selector ── */}
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">Stock</label>
                  <div className="relative" data-dropdown>
                    <button
                      type="button"
                      onClick={() => { setDropOpen(!dropOpen); setTimeout(() => searchRef.current?.focus(), 50); }}
                      className="w-full flex items-center justify-between bg-[#141C30] border border-white/8 rounded-xl px-3 py-3 hover:border-cyan-500/20 transition-colors">
                      {selStock ? (
                        <>
                          <div className="flex items-center gap-2.5">
                            {selStock.logo_url ? (
                              <img src={selStock.logo_url} alt="" className="w-7 h-7 rounded-lg object-contain bg-white/5" onError={e => { e.target.style.display = "none"; }} />
                            ) : (
                              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                                <span className="text-xs font-bold text-cyan-400">{(selStock.ticker_symbol || "?").slice(0, 2)}</span>
                              </div>
                            )}
                            <div className="text-left">
                              <div className="text-sm font-bold text-white">{selStock.ticker_symbol}</div>
                              <div className="text-xs text-gray-600 truncate max-w-[120px]">{selStock.company_name}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-white">
                              {fmtPx(selStock.current_price, stockCurrency)}
                            </div>
                            <div className={`text-xs ${isUp ? "text-emerald-400" : "text-red-400"} flex items-center gap-0.5 justify-end`}>
                              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {isUp ? "+" : ""}{changePct.toFixed(2)}%
                            </div>
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-gray-600">Select a stock…</span>
                      )}
                      <ChevronDown className="w-4 h-4 text-gray-600 ml-2 flex-shrink-0" />
                    </button>

                    <AnimatePresence>
                      {dropOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute top-full left-0 right-0 mt-1 bg-[#0F1629] border border-white/10 rounded-2xl shadow-2xl z-30 overflow-hidden">
                          <div className="p-2 border-b border-white/5">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                              <input
                                ref={searchRef}
                                type="text" value={searchQ}
                                onChange={e => setSearchQ(e.target.value)}
                                placeholder="Search symbol or name…"
                                className="w-full bg-[#141C30] rounded-xl pl-8 pr-3 py-2 text-xs text-gray-300 focus:outline-none" />
                            </div>
                          </div>
                          {tradeType === "SELL" && (
                            <div className="px-3 py-1.5 bg-amber-500/5 border-b border-white/5 text-[10px] text-amber-400">
                              Showing only stocks you own
                            </div>
                          )}
                          <div className="max-h-52 overflow-y-auto">
                            {displayStocks.length > 0 ? displayStocks.map(s => (
                              <button key={s.stock_id}
                                onClick={() => { setSelStock(s); setDropOpen(false); setSearchQ(""); setLimitPx(""); }}
                                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors text-left">
                                <div className="flex items-center gap-2.5">
                                  {s.logo_url ? (
                                    <img src={s.logo_url} alt="" className="w-6 h-6 rounded-lg object-contain bg-white/5" onError={e => { e.target.style.display = "none"; }} />
                                  ) : (
                                    <div className="w-6 h-6 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                                      <span className="text-xs font-bold text-cyan-400">{(s.ticker_symbol || "?").slice(0, 2)}</span>
                                    </div>
                                  )}
                                  <div>
                                    <div className="text-sm font-medium text-white">{s.ticker_symbol}</div>
                                    <div className="text-xs text-gray-600 truncate max-w-[140px]">{s.company_name}</div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-white">{fmtPx(s.current_price, s.currency)}</div>
                                  <div className={`text-xs ${parseFloat(s.price_change_percent || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {parseFloat(s.price_change_percent || 0) >= 0 ? "+" : ""}{parseFloat(s.price_change_percent || 0).toFixed(2)}%
                                  </div>
                                </div>
                              </button>
                            )) : (
                              <div className="py-6 text-center text-xs text-gray-600">
                                {tradeType === "SELL" ? "No holdings to sell" : "No stocks found"}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Currency indicator — the platform trades exclusively in INR,
                    so there is no cross-currency case to warn about. */}
                {selStock && (
                  <div className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-orange-500/8 border border-orange-500/15 text-orange-300">
                    <IndianRupee className="w-3 h-3" />
                    Trading in ₹ INR · Your wallet is in ₹ INR
                  </div>
                )}

                {/* Order type */}
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">Order Type</label>
                  <div className="flex gap-2">
                    {["MARKET","LIMIT"].map(ot => (
                      <button key={ot} onClick={() => { setOrderType(ot); setLimitPx(""); }}
                        className={`flex-1 py-2 text-xs rounded-xl capitalize border transition-all cursor-pointer ${
                          orderType === ot
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-semibold"
                            : "border-white/8 bg-[#141C30] text-gray-500 hover:text-gray-300"
                        }`}>
                        {ot}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">
                    Quantity (shares)
                    {tradeType === "SELL" && myShares > 0 && (
                      <span className="ml-1.5 text-gray-700">— you own {myShares.toFixed(2)}</span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
                      className="flex-1 bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                    <div className="flex gap-1">
                      {["1","5","10","25"].map(q => (
                        <button key={q} onClick={() => setQty(q)}
                          className={`px-2.5 py-2.5 text-xs rounded-xl border transition-all cursor-pointer ${
                            qty === q
                              ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-semibold"
                              : "border-white/8 bg-[#141C30] text-gray-500 hover:text-white"
                          }`}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Limit price */}
                {orderType === "LIMIT" && (
                  <div>
                    <label className="text-xs text-gray-500 mb-2 block">Limit Price ({stockCurrency})</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{sym(stockCurrency)}</span>
                      <input type="number" min="0" step="0.01" value={limitPx}
                        onChange={e => setLimitPx(e.target.value)}
                        placeholder={currentPrice.toFixed(2)}
                        className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-6 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                    </div>
                  </div>
                )}

                {/* Time in Force */}
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">Time in Force</label>
                  <div className="flex gap-2">
                    {[{ v: "DAY", l: "Day" }, { v: "GTC", l: "GTC" }, { v: "IOC", l: "IOC" }].map(t => (
                      <button key={t.v} onClick={() => setTif(t.v)}
                        className={`flex-1 py-2 text-xs rounded-xl border transition-all cursor-pointer ${
                          tif === t.v
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-semibold"
                            : "border-white/8 bg-[#141C30] text-gray-500 hover:text-gray-300"
                        }`}>
                        {t.l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Order summary */}
                <div className="bg-[#141C30] rounded-xl p-3.5 space-y-2.5">
                  {[
                    { l: "Price",       v: fmtPx(execPx, stockCurrency)                                                         },
                    { l: "Quantity",    v: `${qtyNum} shares`                                                                    },
                    { l: "Est. Total",  v: fmtPx(orderTotal, stockCurrency), bold: true                                         },
                    { l: "Commission",  v: "Free",    green: true                                                                },
                  ].map(({ l, v, bold, green }) => (
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-gray-500">{l}</span>
                      <span className={`${bold ? "text-sm font-bold text-white" : green ? "text-emerald-400" : "text-gray-300"}`}>{v}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-white/5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Wallet Balance</span>
                      <span className={hasSufficientFunds ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                        {sym(walletCurrency)}{walletBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        {!hasSufficientFunds && ` (need ${sym(walletCurrency)}${deficit.toFixed(2)} more)`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Insufficient funds notice */}
                {tradeType === "BUY" && !hasSufficientFunds && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/8 border border-amber-500/15 rounded-xl text-xs text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    Insufficient wallet funds. You can add money via Razorpay (Bank / UPI / Card) before placing the order.
                  </div>
                )}

                {/* Place order button */}
                <button
                  onClick={() => { setTopUpMode(tradeType === "BUY" && !hasSufficientFunds); setConfirmOpen(true); }}
                  disabled={!selStock || qtyNum < 1}
                  className={`w-full py-3.5 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    tradeType === "BUY"
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/15"
                      : "bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-500/15"
                  }`}>
                  {tradeType === "BUY" && !hasSufficientFunds
                    ? `Add Funds & Buy ${selStock?.ticker_symbol || ""}`
                    : `Place ${tradeType === "BUY" ? "Buy" : "Sell"} Order`}
                </button>
              </div>
            </div>
          </div>

          {/* ═══ ORDER HISTORY ═══ */}
          <div className="lg:col-span-3 bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="text-sm font-medium text-white">My Order History</div>
              <div className="flex gap-1">
                {["all","filled","pending","cancelled"].map(f => (
                  <button key={f} onClick={() => setHFilter(f)}
                    className={`px-3 py-1.5 text-xs rounded-xl capitalize transition-all cursor-pointer ${
                      hFilter === f ? "bg-white/10 text-white font-medium" : "text-gray-600 hover:text-gray-400"
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Symbol","Side","Type","Qty","Price","Total","Status","Action"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-gray-600 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histFiltered.map((o, i) => {
                    const statusStr = (o.status || o.order_status || "FILLED").toUpperCase();
                    const sc        = STATUS_CONFIG[statusStr] || STATUS_CONFIG.FILLED;
                    const canCancel = statusStr === "PENDING";
                    const side      = (o.order_side || o.transaction_type || o.side || "BUY").toUpperCase();
                    const oCurrency = o.currency || "INR";
                    const total     = parseFloat(o.total_amount || o.total || (parseFloat(o.price || 0) * parseFloat(o.quantity || o.qty || 0)));
                    return (
                      <motion.tr key={o.order_id || o.id || i}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="text-sm font-bold text-white">{o.ticker_symbol || o.stock_ticker || o.symbol || "—"}</div>
                          <div className="text-[10px] text-gray-600 font-mono">{o.order_id ? String(o.order_id).slice(0, 8) : "—"}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            side === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                          }`}>{side}</span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500">{o.order_type || "MARKET"}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-400">{o.quantity || o.qty || "—"}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-400">
                          {parseFloat(o.price || 0) > 0 ? fmtPx(o.price, oCurrency) : "Market"}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-white whitespace-nowrap">
                          {total > 0 ? fmtPx(total, oCurrency) : "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`flex items-center gap-1 text-xs ${sc.color}`}>
                            <sc.Icon className="w-3 h-3" />{statusStr}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {canCancel ? (
                            <button onClick={() => handleCancel(o.order_id || o.id)}
                              className="px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] text-red-400 font-semibold hover:bg-red-500/20 cursor-pointer">
                              Cancel
                            </button>
                          ) : <span className="text-xs text-gray-700">—</span>}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
              {histFiltered.length === 0 && (
                <div className="py-12 text-center text-xs text-gray-600">No order records found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ CONFIRM MODAL ═══ */}
      <AnimatePresence>
        {confirmOpen && selStock && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">

              <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${tradeType === "BUY" ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                <ArrowUpDown className={`w-6 h-6 ${tradeType === "BUY" ? "text-emerald-400" : "text-red-400"}`} />
              </div>

              <div className="text-center text-base font-bold text-white mb-1">
                {topUpMode ? "Top-up Wallet & Buy" : `Confirm ${tradeType === "BUY" ? "Buy" : "Sell"} Order`}
              </div>

              {topUpMode && (
                <div className="text-xs text-gray-500 text-center mb-3">
                  Your wallet is short by {sym(walletCurrency)}{deficit.toFixed(2)}. 
                  Add funds via Razorpay (Bank / UPI / Card) then the order will be placed automatically.
                </div>
              )}

              <div className="bg-[#141C30] rounded-xl p-4 space-y-2.5 my-4">
                {[
                  { l: "Stock",   v: `${selStock.ticker_symbol} (${selStock.company_name || ""})`              },
                  { l: "Action",  v: tradeType,   colored: true                                                 },
                  { l: "Type",    v: orderType                                                                   },
                  { l: "Qty",     v: `${qtyNum} shares`                                                         },
                  { l: "Price",   v: orderType === "MARKET" ? "Market Price" : fmtPx(execPx, stockCurrency)     },
                  { l: "Est. Total", v: fmtPx(orderTotal, stockCurrency), bold: true                            },
                ].map(({ l, v, colored, bold }) => (
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-gray-500">{l}</span>
                    <span className={colored
                      ? (tradeType === "BUY" ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold")
                      : bold ? "text-white font-bold" : "text-white"}>
                      {v}
                    </span>
                  </div>
                ))}
                {tradeType === "BUY" && (
                  <div className="pt-2 border-t border-white/5 flex justify-between text-xs">
                    <span className="text-gray-600">Payment method</span>
                    <span className="text-cyan-400 font-medium">
                      {hasSufficientFunds ? "Wallet Balance" : "Razorpay (Bank/UPI/Card)"}
                    </span>
                  </div>
                )}
              </div>

              {/* Top-up amount input */}
              {topUpMode && (
                <div className="mb-4">
                  <label className="text-xs text-gray-500 mb-1.5 block">
                    Amount to add via Razorpay (min ₹{deficit.toFixed(2)})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                    <input type="number" min={Math.ceil(deficit)} step="1"
                      value={topUpAmt}
                      onChange={e => setTopUpAmt(e.target.value)}
                      placeholder={Math.ceil(deficit + 100).toString()}
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30" />
                  </div>
                  <div className="flex gap-2 mt-2">
                    {[Math.ceil(deficit), Math.ceil(deficit) + 500, Math.ceil(deficit) + 1000].map(n => (
                      <button key={n} type="button"
                        onClick={() => setTopUpAmt(String(n))}
                        className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${
                          topUpAmt === String(n)
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                            : "border-white/8 text-gray-600 hover:text-white"
                        }`}>
                        ₹{n.toLocaleString("en-IN")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setConfirmOpen(false); setTopUpMode(false); }}
                  className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white cursor-pointer">
                  Cancel
                </button>
                <button
                  onClick={topUpMode ? handleTopUpThenBuy : placeOrder}
                  disabled={placingOrder}
                  className={`py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5 ${
                    tradeType === "BUY"
                      ? "bg-emerald-500 hover:opacity-90"
                      : "bg-red-500 hover:opacity-90"
                  }`}>
                  {placingOrder
                    ? <><Loader2 className="w-4 h-4 animate-spin" />{topUpMode ? "Processing…" : "Placing…"}</>
                    : topUpMode ? "Pay & Buy →" : "Confirm"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default UserTrade;








































// import { useState, useEffect, useCallback } from "react";
// import { useNavigate } from "react-router";
// import { motion, AnimatePresence } from "motion/react";
// import {
//   Search, CheckCircle, Clock, XCircle, ArrowUpDown, AlertCircle,
// } from "lucide-react";

// const API_BASE = "http://127.0.0.1:5050/v1";
// const getToken = () => localStorage.getItem("access_token");
// const authHdr = () => ({ Authorization: `Bearer ${getToken()}` });

// // Load Razorpay script
// const loadRazorpayScript = () => {
//   return new Promise((resolve) => {
//     if (document.getElementById("razorpay-script")) {
//       resolve(true);
//       return;
//     }
//     const script = document.createElement("script");
//     script.id = "razorpay-script";
//     script.src = "https://checkout.razorpay.com/v1/checkout.js";
//     script.onload = () => resolve(true);
//     script.onerror = () => resolve(false);
//     document.body.appendChild(script);
//   });
// };

// // Status → colour + icon
// const SC = {
//   FILLED:    { color: "text-emerald-400", Icon: CheckCircle },
//   PENDING:   { color: "text-amber-400",   Icon: Clock       },
//   CANCELLED: { color: "text-gray-500",    Icon: XCircle     },
//   REJECTED:  { color: "text-red-400",     Icon: XCircle     },
//   OPEN:      { color: "text-blue-400",    Icon: Clock       },
// };

// export function UserTrade() {
//   const navigate = useNavigate();

//   // Form state
//   const [tradeType, setT]       = useState("buy");
//   const [orderType, setOT]      = useState("market");
//   const [symbol,    setSymbol]  = useState("");
//   const [stock,     setStock]   = useState(null);
//   const [qty,       setQty]     = useState("");
//   const [limitPx,   setLimitPx] = useState("");
//   const [tif,       setTif]     = useState("day");

//   // UI state
//   const [searchQ,   setSearchQ] = useState("");
//   const [dropOpen,  setDrop]    = useState(false);
//   const [confirm,   setConfirm] = useState(false);
//   const [placed,    setPlaced]  = useState(false);
//   const [placeErr,  setPlaceErr]= useState("");
//   const [hFilter,   setHFilter] = useState("all");

//   // Data state
//   const [stocks,       setStocks]       = useState([]);
//   const [myHoldings,   setMyHoldings]   = useState([]);
//   const [orderHistory, setOrderHistory] = useState([]);
//   const [loading,      setLoading]      = useState(true);
//   const [buyingPower,  setBuyingPower]  = useState(0);
//   const [placingOrder, setPlacingOrder] = useState(false);
//   const [razorpayReady, setRazorpayReady] = useState(false);

//   // Fetch helpers
//   const fetchStocks = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/stocks/list?per_page=100`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) {
//         const list = data.response?.stocks || [];
//         setStocks(list);
//         if (list.length > 0 && !symbol) {
//           setSymbol(list[0].ticker_symbol);
//           setStock(list[0]);
//         }
//       }
//     } catch (err) {
//       console.error("fetchStocks:", err);
//     }
//   }, [symbol]);

//   const fetchUserHoldings = useCallback(async () => {
//     try {
//       const portRes  = await fetch(`${API_BASE}/portfolios/my`, { headers: authHdr() });
//       const portData = await portRes.json();
//       if (portData.bool && portData.response?.portfolios?.length > 0) {
//         const defaultPort = (
//           portData.response.portfolios.find(p => p.is_default) ||
//           portData.response.portfolios[0]
//         );
//         const holdings = defaultPort.holdings || [];
//         if (holdings.length > 0) { setMyHoldings(holdings); return; }
//         const hRes  = await fetch(
//           `${API_BASE}/portfolios/${defaultPort.portfolio_id}`,
//           { headers: authHdr() }
//         );
//         const hData = await hRes.json();
//         if (hData.bool) setMyHoldings(hData.response?.holdings || []);
//       }
//     } catch (err) { console.error("fetchUserHoldings:", err); }
//   }, []);

//   const fetchOrderHistory = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/trade_orders/history?per_page=50`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool) {
//         const raw = data.response?.transactions || data.response?.orders || [];
//         setOrderHistory(raw);
//       }
//     } catch (err) { console.error("fetchOrderHistory:", err); }
//   }, []);

//   const fetchWallet = useCallback(async () => {
//     try {
//       const res  = await fetch(`${API_BASE}/wallets/me`, { headers: authHdr() });
//       const data = await res.json();
//       if (data.bool && data.response) {
//         setBuyingPower(parseFloat(data.response.available_balance || 0));
//       }
//     } catch (err) { console.error("fetchWallet:", err); }
//   }, []);

//   // Create Razorpay order on backend
//   const createRazorpayOrder = async (amount, stockId, quantity, orderData) => {
//     try {
//       const response = await fetch(`${API_BASE}/payments/create_order`, {
//         method: "POST",
//         headers: { ...authHdr(), "Content-Type": "application/json" },
//         body: JSON.stringify({
//           amount: amount,
//           stock_id: stockId,
//           quantity: quantity,
//           order_data: orderData
//         })
//       });
      
//       const data = await response.json();
//       if (data.bool && data.response) {
//         return data.response;
//       }
//       throw new Error(data.response?.message || "Failed to create payment order");
//     } catch (err) {
//       console.error("createRazorpayOrder:", err);
//       throw err;
//     }
//   };

//   // Verify payment and place trade order
//   const verifyAndPlaceOrder = async (paymentData, orderData) => {
//     try {
//       const response = await fetch(`${API_BASE}/payments/verify`, {
//         method: "POST",
//         headers: { ...authHdr(), "Content-Type": "application/json" },
//         body: JSON.stringify({
//           razorpay_order_id: paymentData.razorpay_order_id,
//           razorpay_payment_id: paymentData.razorpay_payment_id,
//           razorpay_signature: paymentData.razorpay_signature,
//           order_data: orderData
//         })
//       });
      
//       const data = await response.json();
//       if (data.bool) {
//         return data.response;
//       }
//       throw new Error(data.response?.message || "Payment verification failed");
//     } catch (err) {
//       console.error("verifyAndPlaceOrder:", err);
//       throw err;
//     }
//   };

//   // Open Razorpay checkout
//   const openRazorpayCheckout = async (razorpayOrder, orderData) => {
//     return new Promise((resolve, reject) => {
//       const options = {
//         key: razorpayOrder.key_id,
//         amount: razorpayOrder.amount,
//         currency: razorpayOrder.currency,
//         name: "TradeFlow",
//         description: `Buy ${orderData.quantity} shares of ${orderData.symbol}`,
//         order_id: razorpayOrder.order_id,
//         handler: async (response) => {
//           try {
//             const result = await verifyAndPlaceOrder(response, orderData);
//             resolve(result);
//           } catch (err) {
//             reject(err);
//           }
//         },
//         prefill: {
//           name: orderData.user_name,
//           email: orderData.user_email,
//         },
//         theme: {
//           color: "#06b6d4"
//         },
//         modal: {
//           ondismiss: () => {
//             reject(new Error("Payment cancelled by user"));
//           }
//         }
//       };
      
//       const razorpay = new window.Razorpay(options);
//       razorpay.open();
//     });
//   };

//   // Place order with Razorpay for BUY orders
//   const placeOrder = async () => {
//     setPlaceErr("");

//     // Guards
//     if (!stock?.stock_id) {
//       setPlaceErr("Please select a stock first.");
//       return;
//     }
//     const quantity = parseFloat(qty);
//     if (isNaN(quantity) || quantity <= 0) {
//       setPlaceErr("Please enter a valid quantity (> 0).");
//       return;
//     }
//     if (orderType !== "market" && (!limitPx || isNaN(parseFloat(limitPx)))) {
//       setPlaceErr("Please enter a valid limit/stop price.");
//       return;
//     }

//     // For SELL orders, no payment needed
//     if (tradeType === "sell") {
//       const holding = myHoldings.find(h =>
//         (h.ticker_symbol || h.symbol) === symbol
//       );
//       const owned = parseFloat(holding?.quantity || holding?.shares || 0);
//       if (owned < quantity) {
//         setPlaceErr(`Insufficient shares. You own ${owned} share(s) of ${symbol}.`);
//         return;
//       }
      
//       setPlacingOrder(true);
//       try {
//         const body = {
//           stock_id:      stock.stock_id,
//           order_side:    "SELL",
//           order_type:    orderType.toUpperCase(),
//           quantity:      quantity,
//           order_duration: tif.toUpperCase(),
//         };
        
//         if (orderType !== "market" && limitPx) {
//           body.limit_price = parseFloat(limitPx);
//         }
        
//         const res = await fetch(`${API_BASE}/trade_orders/place`, {
//           method:  "POST",
//           headers: { ...authHdr(), "Content-Type": "application/json" },
//           body:    JSON.stringify(body),
//         });
        
//         let data;
//         try {
//           data = await res.json();
//         } catch {
//           const text = await res.text().catch(() => "");
//           setPlaceErr(`Server error (${res.status}): ${text.slice(0, 150)}`);
//           return;
//         }
        
//         if (data.bool) {
//           setConfirm(false);
//           setPlaced(true);
//           setTimeout(() => setPlaced(false), 4000);
//           await Promise.all([fetchOrderHistory(), fetchWallet(), fetchUserHoldings()]);
//           setQty("");
//           setLimitPx("");
//           setPlaceErr("");
//         } else {
//           setPlaceErr(data.response?.message || "Failed to place order.");
//         }
//       } catch (err) {
//         console.error("placeOrder:", err);
//         setPlaceErr("Network error. Please try again.");
//       } finally {
//         setPlacingOrder(false);
//       }
//       return;
//     }

//     // For BUY orders: proceed with Razorpay
//     const execPrice = orderType === "market"
//       ? (stock.current_price || 0)
//       : parseFloat(limitPx);
//     const totalAmount = quantity * execPrice;
    
//     if (totalAmount <= 0) {
//       setPlaceErr("Invalid order amount.");
//       return;
//     }

//     setPlacingOrder(true);
    
//     try {
//       // Load Razorpay script if not loaded
//       if (!razorpayReady) {
//         const loaded = await loadRazorpayScript();
//         if (!loaded) {
//           setPlaceErr("Failed to load payment gateway. Please try again.");
//           setPlacingOrder(false);
//           return;
//         }
//         setRazorpayReady(true);
//       }
      
//       // Get user profile for prefill
//       const userRes = await fetch(`${API_BASE}/user_profiles/me`, { headers: authHdr() });
//       const userData = await userRes.json();
//       const userName = userData.bool && userData.response 
//         ? `${userData.response.first_name || ""} ${userData.response.last_name || ""}`.trim()
//         : "Investor";
//       const userEmail = userData.bool && userData.response 
//         ? userData.response.email 
//         : "";
      
//       // Prepare order data
//       const orderData = {
//         stock_id: stock.stock_id,
//         symbol: symbol,
//         quantity: quantity,
//         order_type: orderType.toUpperCase(),
//         order_duration: tif.toUpperCase(),
//         limit_price: orderType !== "market" ? parseFloat(limitPx) : null,
//         user_name: userName,
//         user_email: userEmail,
//       };
      
//       // Create Razorpay order
//       const razorpayOrder = await createRazorpayOrder(totalAmount, stock.stock_id, quantity, orderData);
      
//       // Open Razorpay checkout
//       const result = await openRazorpayCheckout(razorpayOrder, orderData);
      
//       if (result && result.order_id) {
//         setConfirm(false);
//         setPlaced(true);
//         setTimeout(() => setPlaced(false), 4000);
//         await Promise.all([fetchOrderHistory(), fetchWallet(), fetchUserHoldings()]);
//         setQty("");
//         setLimitPx("");
//         setPlaceErr("");
//       } else {
//         setPlaceErr("Payment failed. Please try again.");
//       }
//     } catch (err) {
//       console.error("placeOrder error:", err);
//       setPlaceErr(err.message || "Payment failed. Please try again.");
//     } finally {
//       setPlacingOrder(false);
//     }
//   };

//   // Keep stock object in sync when symbol changes
//   useEffect(() => {
//     if (symbol && stocks.length > 0) {
//       const found = stocks.find(s => s.ticker_symbol === symbol);
//       if (found) setStock(found);
//     }
//   }, [symbol, stocks]);

//   // Initial load
//   useEffect(() => {
//     (async () => {
//       setLoading(true);
//       await Promise.all([
//         fetchStocks(),
//         fetchUserHoldings(),
//         fetchOrderHistory(),
//         fetchWallet(),
//       ]);
//       setLoading(false);
//     })();
//   }, []);

//   // Preload Razorpay script
//   useEffect(() => {
//     loadRazorpayScript().then(loaded => setRazorpayReady(loaded));
//   }, []);

//   // Derived values
//   const filteredStocks = stocks
//     .filter(s =>
//       s.ticker_symbol?.toLowerCase().includes(searchQ.toLowerCase()) ||
//       s.company_name?.toLowerCase().includes(searchQ.toLowerCase())
//     )
//     .slice(0, 6);

//   const mySymbols    = myHoldings.map(h => h.ticker_symbol || h.symbol);
//   const sellableList = filteredStocks.filter(s => mySymbols.includes(s.ticker_symbol));

//   const up     = (stock?.price_change_percent || 0) >= 0;
//   const execPx = orderType === "market"
//     ? (stock?.current_price || 0)
//     : (parseFloat(limitPx) || stock?.current_price || 0);
//   const total  = (parseFloat(qty) || 0) * execPx;

//   const getStatus = (o) => {
//     const raw = o.order_status || o.txn_status || o.status || "PENDING";
//     const s   = raw.toUpperCase();
//     if (s === "COMPLETED" || s === "BUY" || s === "SELL") return "FILLED";
//     return s;
//   };

//   const histFiltered = orderHistory.filter(o => {
//     const s = getStatus(o);
//     return hFilter === "all" || s === hFilter.toUpperCase();
//   });

//   return (
//     <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">

//       {/* Success toast */}
//       <AnimatePresence>
//         {placed && (
//           <motion.div
//             initial={{ opacity: 0, y: -20 }}
//             animate={{ opacity: 1, y: 0 }}
//             exit={{ opacity: 0, y: -20 }}
//             className="fixed top-24 right-6 z-50 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 px-4 py-3 rounded-2xl shadow-xl"
//           >
//             <CheckCircle className="w-5 h-5" />
//             <div>
//               <div className="text-sm font-medium">Order Placed!</div>
//               <div className="text-xs text-emerald-500/60">
//                 {tradeType === "buy" ? "Buy" : "Sell"} {qty} {symbol}
//               </div>
//             </div>
//           </motion.div>
//         )}
//       </AnimatePresence>

//       <div>
//         <h1 className="text-xl font-bold text-white">Trade</h1>
//         <p className="text-sm text-gray-500 mt-0.5">Buy and sell your investments</p>
//       </div>

//       {loading ? (
//         <div className="flex items-center justify-center py-16">
//           <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
//         </div>
//       ) : (
//         <div className="grid lg:grid-cols-5 gap-5">

//           {/* Order form */}
//           <div className="lg:col-span-2">
//             <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">

//               {/* Buy / Sell tabs */}
//               <div className="grid grid-cols-2">
//                 {["buy", "sell"].map((t) => (
//                   <button key={t} onClick={() => { setT(t); setPlaceErr(""); }}
//                     className={`py-3.5 text-sm font-medium capitalize transition-all ${
//                       tradeType === t
//                         ? t === "buy"
//                           ? "bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500"
//                           : "bg-red-500/10 text-red-400 border-b-2 border-red-500"
//                         : "text-gray-500 hover:text-gray-300 border-b border-white/5"
//                     }`}>
//                     {t}
//                   </button>
//                 ))}
//               </div>

//               <div className="p-5 space-y-4">

//                 {/* Stock selector */}
//                 <div>
//                   <label className="text-xs text-gray-500 mb-2 block">Stock</label>
//                   <div className="relative">
//                     <div onClick={() => setDrop(!dropOpen)}
//                       className="flex items-center justify-between bg-[#141C30] border border-white/8 rounded-xl px-3 py-3 cursor-pointer hover:border-cyan-500/20 transition-colors">
//                       <div className="flex items-center gap-3">
//                         <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
//                           <span className="text-xs font-bold text-cyan-400">
//                             {symbol?.slice(0, 2) || "—"}
//                           </span>
//                         </div>
//                         <div>
//                           <div className="text-sm font-medium text-white">{symbol || "Select stock"}</div>
//                           <div className="text-xs text-gray-600">{stock?.company_name || "—"}</div>
//                         </div>
//                       </div>
//                       <div className="text-right">
//                         <div className="text-sm text-white">
//                           ${stock?.current_price?.toFixed(2) || "—"}
//                         </div>
//                         <div className={`text-xs ${up ? "text-emerald-400" : "text-red-400"}`}>
//                           {up ? "+" : ""}{(stock?.price_change_percent || 0).toFixed(2)}%
//                         </div>
//                       </div>
//                     </div>

//                     <AnimatePresence>
//                       {dropOpen && (
//                         <motion.div
//                           initial={{ opacity: 0, y: -5 }}
//                           animate={{ opacity: 1, y: 0 }}
//                           exit={{ opacity: 0, y: -5 }}
//                           className="absolute top-full left-0 right-0 mt-1 bg-[#0F1629] border border-white/10 rounded-2xl shadow-2xl z-20 overflow-hidden">
//                           <div className="p-2 border-b border-white/5">
//                             <div className="relative">
//                               <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
//                               <input type="text" value={searchQ}
//                                 onChange={(e) => setSearchQ(e.target.value)}
//                                 placeholder="Search…" autoFocus
//                                 className="w-full bg-[#141C30] rounded-xl pl-8 pr-3 py-2 text-xs text-gray-300 focus:outline-none"
//                               />
//                             </div>
//                           </div>
//                           {tradeType === "sell" && (
//                             <div className="px-3 py-2 bg-amber-500/5 border-b border-white/5">
//                               <div className="text-xs text-amber-400">
//                                 Showing your holdings only for sell orders
//                               </div>
//                             </div>
//                           )}
//                           <div className="max-h-48 overflow-y-auto">
//                             {(tradeType === "sell" ? sellableList : filteredStocks).map((s) => (
//                               <div key={s.stock_id || s.ticker_symbol}
//                                 onClick={() => {
//                                   setSymbol(s.ticker_symbol);
//                                   setStock(s);
//                                   setDrop(false);
//                                   setSearchQ("");
//                                 }}
//                                 className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 cursor-pointer">
//                                 <div>
//                                   <div className="text-sm font-medium text-white">{s.ticker_symbol}</div>
//                                   <div className="text-xs text-gray-600 truncate max-w-[150px]">{s.company_name}</div>
//                                 </div>
//                                 <div className={`text-xs ${(s.price_change_percent || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
//                                   {(s.price_change_percent || 0) >= 0 ? "+" : ""}
//                                   {(s.price_change_percent || 0).toFixed(2)}%
//                                 </div>
//                               </div>
//                             ))}
//                             {(tradeType === "sell" ? sellableList : filteredStocks).length === 0 && (
//                               <div className="px-4 py-6 text-center text-sm text-gray-500">
//                                 {tradeType === "sell" ? "No holdings to sell" : "No stocks found"}
//                               </div>
//                             )}
//                           </div>
//                         </motion.div>
//                       )}
//                     </AnimatePresence>
//                   </div>
//                 </div>

//                 {/* Order type */}
//                 <div>
//                   <label className="text-xs text-gray-500 mb-2 block">Order Type</label>
//                   <div className="flex gap-2">
//                     {["market", "limit", "stop"].map((ot) => (
//                       <button key={ot} onClick={() => { setOT(ot); setLimitPx(""); }}
//                         className={`flex-1 py-2 text-xs rounded-xl capitalize border transition-all ${
//                           orderType === ot
//                             ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
//                             : "border-white/8 bg-[#141C30] text-gray-500"
//                         }`}>
//                         {ot}
//                       </button>
//                     ))}
//                   </div>
//                 </div>

//                 {/* Quantity */}
//                 <div>
//                   <label className="text-xs text-gray-500 mb-2 block">Quantity</label>
//                   <div className="flex gap-2">
//                     <input type="number" value={qty}
//                       onChange={(e) => setQty(e.target.value)}
//                       className="flex-1 bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30"
//                     />
//                     <div className="flex gap-1">
//                       {["5", "10", "25", "50"].map((q) => (
//                         <button key={q} onClick={() => setQty(q)}
//                           className={`px-2.5 py-2.5 text-xs rounded-xl border transition-all ${
//                             qty === q
//                               ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
//                               : "border-white/8 bg-[#141C30] text-gray-500 hover:text-white"
//                           }`}>
//                           {q}
//                         </button>
//                       ))}
//                     </div>
//                   </div>
//                 </div>

//                 {/* Limit / stop price */}
//                 {orderType !== "market" && (
//                   <div>
//                     <label className="text-xs text-gray-500 mb-2 block">
//                       {orderType === "limit" ? "Limit" : "Stop"} Price
//                     </label>
//                     <div className="relative">
//                       <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
//                       <input type="number" value={limitPx}
//                         onChange={(e) => setLimitPx(e.target.value)}
//                         placeholder={stock?.current_price?.toFixed(2) || "0.00"}
//                         className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-6 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30"
//                       />
//                     </div>
//                   </div>
//                 )}

//                 {/* Time in Force */}
//                 <div>
//                   <label className="text-xs text-gray-500 mb-2 block">Time in Force</label>
//                   <div className="flex gap-2">
//                     {[{ v: "day", l: "Day" }, { v: "gtc", l: "GTC" }, { v: "ioc", l: "IOC" }].map((t) => (
//                       <button key={t.v} onClick={() => setTif(t.v)}
//                         className={`flex-1 py-2 text-xs rounded-xl border transition-all ${
//                           tif === t.v
//                             ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
//                             : "border-white/8 bg-[#141C30] text-gray-500"
//                         }`}>
//                         {t.l}
//                       </button>
//                     ))}
//                   </div>
//                 </div>

//                 {/* Order summary */}
//                 <div className="bg-[#141C30] rounded-xl p-3 space-y-2">
//                   <div className="flex justify-between text-xs">
//                     <span className="text-gray-500">Price</span>
//                     <span className="text-white">${execPx.toFixed(2)}</span>
//                   </div>
//                   <div className="flex justify-between text-xs">
//                     <span className="text-gray-500">Quantity</span>
//                     <span className="text-white">{qty || 0} shares</span>
//                   </div>
//                   <div className="flex justify-between text-xs">
//                     <span className="text-gray-500">Commission (~0.1%)</span>
//                     <span className="text-gray-400">${(total * 0.001).toFixed(2)}</span>
//                   </div>
//                   <div className="pt-2 border-t border-white/5 flex justify-between text-sm">
//                     <span className="text-gray-400">Est. Total</span>
//                     <span className="text-white font-bold">
//                       ${total.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
//                     </span>
//                   </div>
//                 </div>

//                 <div className="text-xs text-center text-gray-600">
//                   Buying Power:{" "}
//                   <span className="text-white">
//                     ${buyingPower.toLocaleString("en", { minimumFractionDigits: 2 })}
//                   </span>
//                 </div>

//                 {/* Inline error */}
//                 {placeErr && (
//                   <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
//                     <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
//                     {placeErr}
//                   </div>
//                 )}

//                 <button
//                   onClick={() => { setPlaceErr(""); setConfirm(true); }}
//                   disabled={!symbol || !stock?.stock_id || !qty || parseFloat(qty) <= 0}
//                   className={`w-full py-3.5 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${
//                     tradeType === "buy"
//                       ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/15"
//                       : "bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-500/15"
//                   }`}>
//                   Place {tradeType === "buy" ? "Buy" : "Sell"} Order
//                 </button>
//               </div>
//             </div>
//           </div>

//           {/* Order history */}
//           <div className="lg:col-span-3 bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
//             <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
//               <div className="text-sm font-medium text-white">My Order History</div>
//               <div className="flex gap-1">
//                 {["all", "FILLED", "PENDING", "CANCELLED"].map((f) => (
//                   <button key={f} onClick={() => setHFilter(f)}
//                     className={`px-3 py-1.5 text-xs rounded-xl transition-all ${
//                       hFilter === f ? "bg-white/10 text-white" : "text-gray-600 hover:text-gray-400"
//                     }`}>
//                     {f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
//                   </button>
//                 ))}
//               </div>
//             </div>

//             <div className="overflow-x-auto">
//               <table className="w-full">
//                 <thead>
//                   <tr className="border-b border-white/5">
//                     {["Order ID", "Symbol", "Type", "Qty", "Price", "Total", "Status", "Date"].map((h) => (
//                       <th key={h} className="px-5 py-3 text-left text-xs text-gray-600 font-medium">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {histFiltered.length === 0 ? (
//                     <tr>
//                       <td colSpan={8} className="px-5 py-8 text-center text-sm text-gray-600">
//                         No orders found. Place your first trade!
//                       </td>
//                     </tr>
//                   ) : (
//                     histFiltered.map((o, i) => {
//                       const status  = getStatus(o);
//                       const sc      = SC[status] || SC.PENDING;
//                       const side    = (o.order_side || o.txn_type || "").toUpperCase();
//                       const displaySide = side === "BUY" || side === "SELL" ? side : "—";
//                       const price   = o.avg_fill_price || o.price_per_unit || o.limit_price || o.price || 0;
//                       const qtyVal  = o.quantity || 0;
//                       const ticker  = o.ticker_symbol || "—";
//                       const orderId = o.order_id || o.txn_id || i;
//                       const date    = o.submitted_at || o.transacted_at || o.created_at || "";

//                       return (
//                         <motion.tr key={orderId}
//                           initial={{ opacity: 0 }}
//                           animate={{ opacity: 1 }}
//                           transition={{ delay: i * 0.04 }}
//                           className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
//                           onClick={() => ticker !== "—" && navigate(`/user/stock/${ticker}`)}>
//                           <td className="px-5 py-3 text-xs text-gray-600 font-mono">
//                             #{String(orderId).slice(-6)}
//                           </td>
//                           <td className="px-5 py-3 text-sm font-bold text-white">{ticker}</td>
//                           <td className="px-5 py-3">
//                             <span className={`text-xs px-2 py-0.5 rounded-full ${
//                               displaySide === "BUY"
//                                 ? "bg-emerald-500/10 text-emerald-400"
//                                 : displaySide === "SELL"
//                                 ? "bg-red-500/10 text-red-400"
//                                 : "bg-gray-500/10 text-gray-400"
//                             }`}>
//                               {displaySide}
//                             </span>
//                           </td>
//                           <td className="px-5 py-3 text-sm text-gray-400">{parseFloat(qtyVal).toFixed(2)}</td>
//                           <td className="px-5 py-3 text-sm text-gray-400">
//                             {price ? `$${parseFloat(price).toFixed(2)}` : "—"}
//                           </td>
//                           <td className="px-5 py-3 text-sm text-white">
//                             ${(parseFloat(qtyVal) * parseFloat(price || 0)).toFixed(2)}
//                           </td>
//                           <td className="px-5 py-3">
//                             <div className={`flex items-center gap-1.5 text-xs ${sc.color}`}>
//                               <sc.Icon className="w-3.5 h-3.5" />
//                               {status}
//                             </div>
//                           </td>
//                           <td className="px-5 py-3 text-xs text-gray-600">
//                             {date ? new Date(date).toLocaleDateString() : "—"}
//                           </td>
//                         </motion.tr>
//                       );
//                     })
//                   )}
//                 </tbody>
//               </table>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Confirm modal */}
//       <AnimatePresence>
//         {confirm && (
//           <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
//             <motion.div
//               initial={{ opacity: 0, scale: 0.95 }}
//               animate={{ opacity: 1, scale: 1 }}
//               className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">

//               <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${
//                 tradeType === "buy" ? "bg-emerald-500/10" : "bg-red-500/10"
//               }`}>
//                 <ArrowUpDown className={`w-6 h-6 ${tradeType === "buy" ? "text-emerald-400" : "text-red-400"}`} />
//               </div>

//               <div className="text-center text-lg font-bold text-white mb-5">Confirm Order</div>

//               <div className="bg-[#141C30] rounded-xl p-4 space-y-2.5 mb-5">
//                 {[
//                   ["Action",      tradeType === "buy" ? "Buy" : "Sell"],
//                   ["Symbol",      symbol],
//                   ["Order Type",  orderType.toUpperCase()],
//                   ["Quantity",    `${qty} shares`],
//                   ["Est. Total",  `$${total.toLocaleString("en", { maximumFractionDigits: 2 })}`],
//                 ].map(([l, v]) => (
//                   <div key={l} className="flex justify-between text-sm">
//                     <span className="text-gray-500">{l}</span>
//                     <span className={
//                       l === "Action"
//                         ? tradeType === "buy"
//                           ? "text-emerald-400 font-medium"
//                           : "text-red-400 font-medium"
//                         : "text-white"
//                     }>{v}</span>
//                   </div>
//                 ))}
//               </div>

//               {/* Payment info for buy orders */}
//               {tradeType === "buy" && (
//                 <div className="mb-4 p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
//                   <div className="text-xs text-cyan-400 text-center">
//                     You will be redirected to Razorpay payment gateway to complete the purchase.
//                   </div>
//                 </div>
//               )}

//               {/* Error inside modal */}
//               {placeErr && (
//                 <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 mb-4">
//                   <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
//                   {placeErr}
//                 </div>
//               )}

//               <div className="grid grid-cols-2 gap-3">
//                 <button
//                   onClick={() => { setConfirm(false); setPlaceErr(""); }}
//                   className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white">
//                   Cancel
//                 </button>
//                 <button
//                   onClick={placeOrder}
//                   disabled={placingOrder}
//                   className={`py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${
//                     tradeType === "buy" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
//                   }`}>
//                   {placingOrder ? "Processing…" : "Confirm"}
//                 </button>
//               </div>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }





















