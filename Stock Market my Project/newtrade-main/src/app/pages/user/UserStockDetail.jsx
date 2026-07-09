import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, Star, TrendingUp, TrendingDown,
  Bell, BarChart2, Info, AlertCircle, CheckCircle,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

const TFS = ["1D", "1W", "1M", "3M", "6M", "1Y"];

// ── Load Razorpay script ──────────────────────────────────────────────────────
const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    if (document.getElementById("razorpay-script")) {
      const wait = setInterval(() => {
        if (window.Razorpay) { clearInterval(wait); resolve(true); }
      }, 100);
      return;
    }
    const s  = document.createElement("script");
    s.id     = "razorpay-script";
    s.src    = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror= () => resolve(false);
    document.body.appendChild(s);
  });

export function UserStockDetail() {
  const { symbol } = useParams();
  const navigate   = useNavigate();

  // page data
  const [stock,            setStock]           = useState(null);
  const [loading,          setLoading]         = useState(true);
  const [error,            setError]           = useState("");
  const [myHolding,        setMyHolding]       = useState(null);
  const [priceHistory,     setPriceHistory]    = useState([]);
  const [relatedNews,      setRelatedNews]     = useState([]);

  // watchlist
  const [watched,          setWatched]         = useState(false);
  const [watchlistId,      setWatchlistId]     = useState(null);
  const [watchlistItemId,  setWatchlistItemId] = useState(null);

  // trade panel
  const [tf,           setTf]           = useState("3M");
  const [tradeType,    setT]            = useState("buy");
  const [orderType,    setOT]           = useState("market");
  const [qty,          setQty]          = useState("10");
  const [limitPx,      setLimitPx]      = useState("");
  const [confirm,      setConfirm]      = useState(false);
  const [placeErr,     setPlaceErr]     = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [placed,       setPlaced]       = useState(false);
  const [buyingPower,  setBuyingPower]  = useState(0);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchStockDetails = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/stocks/ticker/${symbol}`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool && data.response) { setStock(data.response); return data.response; }
      setError("Stock not found.");
    } catch { setError("Failed to load stock data."); }
    return null;
  }, [symbol]);

  // CORRECT URL: /stocks/<stock_id>/price_history  (NOT /stocks/ticker/SYMBOL/price_history)
  const fetchPriceHistory = useCallback(async (stockObj) => {
    if (!stockObj?.stock_id) return;
    try {
      const res  = await fetch(
        `${API_BASE}/stocks/${stockObj.stock_id}/price_history?interval=1d&limit=365`,
        { headers: authHdr() }
      );
      const data = await res.json();
      if (data.bool && data.response?.data?.length > 0) {
        setPriceHistory(data.response.data.map((p) => ({
          date:  (p.timestamp || p.date || "").slice(5, 10),
          close: parseFloat(p.close || p.close_price || 0),
        })));
        return;
      }
    } catch { /* fall through to synthetic */ }
    // Synthetic fallback
    const base = parseFloat(stockObj.current_price || 100);
    setPriceHistory(Array.from({ length: 90 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (89 - i));
      return { date: `${d.getMonth()+1}/${d.getDate()}`, close: base * (1+(Math.random()-0.48)*0.04) };
    }));
  }, []);

  // CORRECT URL: /market_news/stock/<stock_id>  (NOT /market_news/stock/SYMBOL)
  const fetchRelatedNews = useCallback(async (stockObj) => {
    if (!stockObj?.stock_id) return;
    try {
      const res  = await fetch(`${API_BASE}/market_news/stock/${stockObj.stock_id}`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) setRelatedNews((data.response?.news || data.response?.data || []).slice(0, 3));
    } catch { /* silent */ }
  }, []);

  const fetchUserHoldings = useCallback(async (stockObj) => {
    if (!stockObj?.stock_id) return;
    try {
      const portRes  = await fetch(`${API_BASE}/portfolios/my`, { headers: authHdr() });
      const portData = await portRes.json();
      if (portData.bool && portData.response?.portfolios?.length > 0) {
        const p    = portData.response.portfolios.find(p => p.is_default) || portData.response.portfolios[0];
        const hRes = await fetch(`${API_BASE}/portfolios/${p.portfolio_id}`, { headers: authHdr() });
        const hData= await hRes.json();
        if (hData.bool) {
          const h = (hData.response?.holdings || []).find(
            h => h.stock_id === stockObj.stock_id || h.ticker_symbol === symbol
          );
          setMyHolding(h || null);
        }
      }
    } catch { /* silent */ }
  }, [symbol]);

  const fetchWallet = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/wallets/me`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool) setBuyingPower(parseFloat(data.response?.available_balance || 0));
    } catch { /* silent */ }
  }, []);

  const fetchWatchlistStatus = useCallback(async (stockObj) => {
    if (!stockObj?.stock_id) return;
    try {
      const res  = await fetch(`${API_BASE}/watchlists/my`, { headers: authHdr() });
      const data = await res.json();
      if (data.bool && data.response?.watchlists?.length > 0) {
        const wl = data.response.watchlists[0];
        setWatchlistId(wl.watchlist_id);
        const detailRes  = await fetch(`${API_BASE}/watchlists/${wl.watchlist_id}`, { headers: authHdr() });
        const detailData = await detailRes.json();
        if (detailData.bool) {
          const item = (detailData.response?.items || []).find(
            i => i.stock_id === stockObj.stock_id || i.ticker_symbol === symbol
          );
          if (item) { setWatched(true); setWatchlistItemId(item.item_id); }
        }
      } else {
        const createRes  = await fetch(`${API_BASE}/watchlists/create`, {
          method: "POST", headers: { ...authHdr(), "Content-Type": "application/json" },
          body: JSON.stringify({ watchlist_name: "My Watchlist" }),
        });
        const createData = await createRes.json();
        if (createData.bool) setWatchlistId(createData.response?.watchlist_id);
      }
    } catch { /* silent */ }
  }, [symbol]);

  // ── Watchlist toggle ──────────────────────────────────────────────────────

  const toggleWatchlist = async () => {
    if (!watchlistId || !stock?.stock_id) return;
    if (watched) {
      try {
        await fetch(`${API_BASE}/watchlists/${watchlistId}/items/${watchlistItemId}/remove`,
          { method: "DELETE", headers: authHdr() });
        setWatched(false); setWatchlistItemId(null);
      } catch { /* silent */ }
    } else {
      try {
        // FIXED: send stock_id (int), NOT ticker_symbol
        const res  = await fetch(`${API_BASE}/watchlists/${watchlistId}/items/add`, {
          method: "POST",
          headers: { ...authHdr(), "Content-Type": "application/json" },
          body: JSON.stringify({ stock_id: stock.stock_id }),
        });
        const data = await res.json();
        if (data.bool) { setWatched(true); setWatchlistItemId(data.response?.item_id); }
      } catch { /* silent */ }
    }
  };

  // ── Place order ───────────────────────────────────────────────────────────
  // Backend place_parser REQUIRES:
  //   stock_id (int, required)  — NOT ticker_symbol
  //   order_side (BUY/SELL)     — NOT "side"
  //   order_type (MARKET/LIMIT)
  //   quantity (float)
  //   order_duration (DAY/GTC)  — NOT "time_in_force"
  //   limit_price (float, optional)
  //
  // BUY  → Razorpay payment first → /payment/create_order → /payment/verify
  // SELL → direct /trade_orders/place

  const placeOrder = async () => {
    setPlaceErr("");
    if (!stock?.stock_id) { setPlaceErr("Stock data not loaded."); return; }
    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity <= 0) { setPlaceErr("Enter a valid quantity."); return; }
    if (orderType !== "market" && (!limitPx || isNaN(parseFloat(limitPx)))) {
      setPlaceErr("Enter a valid limit/stop price."); return;
    }

    // ── SELL — direct order placement ────────────────────────────────────
    if (tradeType === "sell") {
      const owned = parseFloat(myHolding?.quantity || 0);
      if (owned < quantity) {
        setPlaceErr(`Insufficient shares. You own ${owned} share(s) of ${symbol}.`); return;
      }
      setPlacingOrder(true);
      try {
        const body = {
          stock_id:       stock.stock_id,        // int  (required)
          order_side:     "SELL",                // str  (required)
          order_type:     orderType.toUpperCase(),
          quantity:       quantity,
          order_duration: "DAY",
        };
        if (orderType !== "market" && limitPx) body.limit_price = parseFloat(limitPx);

        const res = await fetch(`${API_BASE}/trade_orders/place`, {
          method: "POST",
          headers: { ...authHdr(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        let data;
        try { data = await res.json(); }
        catch { setPlaceErr(`Server error (${res.status}).`); return; }

        if (data.bool) {
          setConfirm(false); setPlaced(true);
          setTimeout(() => setPlaced(false), 4000);
          await Promise.all([fetchUserHoldings(stock), fetchWallet()]);
          setQty("10"); setLimitPx(""); setPlaceErr("");
        } else {
          setPlaceErr(data.response?.message || "Failed to place sell order.");
        }
      } catch { setPlaceErr("Network error. Please try again."); }
      finally { setPlacingOrder(false); }
      return;
    }

    // ── BUY — Razorpay payment flow ───────────────────────────────────────
    const execPrice   = orderType === "market" ? (stock.current_price || 0) : parseFloat(limitPx);
    const totalAmount = quantity * execPrice;
    if (totalAmount <= 0) { setPlaceErr("Invalid order amount."); return; }

    setPlacingOrder(true);
    try {
      // 1. Load Razorpay SDK
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setPlaceErr("Payment gateway failed to load. Check your connection."); return;
      }

      // 2. Create Razorpay order — POST /payment/create_order
      const createRes = await fetch(`${API_BASE}/payments/create_order`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount:     totalAmount,
          stock_id:   stock.stock_id,
          quantity:   quantity,
          order_data: {
            stock_id:       stock.stock_id,
            order_type:     orderType.toUpperCase(),
            order_duration: "DAY",
            limit_price:    orderType !== "market" ? parseFloat(limitPx) : null,
          },
        }),
      });
      let createData;
      try { createData = await createRes.json(); }
      catch { setPlaceErr(`Server error (${createRes.status}). Could not create payment.`); return; }

      if (!createData.bool) {
        setPlaceErr(createData.response?.message || "Failed to create payment order."); return;
      }
      const razorpayOrder = createData.response;

      // 3. Open Razorpay checkout and wait for result
      await new Promise((resolve, reject) => {
        const options = {
          key:         razorpayOrder.key_id,
          amount:      razorpayOrder.amount_paise || razorpayOrder.amount,
          currency:    razorpayOrder.currency || "INR",
          name:        "TradeFlow",
          description: `Buy ${quantity} share(s) of ${symbol}`,
          order_id:    razorpayOrder.order_id,
          handler: async (paymentResponse) => {
            // 4. Verify + place trade — POST /payment/verify
            try {
              const verifyRes = await fetch(`${API_BASE}/payments/verify`, {
                method: "POST",
                headers: { ...authHdr(), "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_order_id:   paymentResponse.razorpay_order_id,
                  razorpay_payment_id: paymentResponse.razorpay_payment_id,
                  razorpay_signature:  paymentResponse.razorpay_signature,
                  order_data: {
                    stock_id:       stock.stock_id,
                    order_type:     orderType.toUpperCase(),
                    order_duration: "DAY",
                    limit_price:    orderType !== "market" ? parseFloat(limitPx) : null,
                  },
                }),
              });
              let verifyData;
              try { verifyData = await verifyRes.json(); }
              catch { reject(new Error(`Server error (${verifyRes.status}).`)); return; }
              if (verifyData.bool) resolve(verifyData.response);
              else reject(new Error(verifyData.response?.message || "Payment verification failed."));
            } catch (e) { reject(e); }
          },
          theme: { color: "#06b6d4" },
          modal: { ondismiss: () => reject(new Error("Payment cancelled.")) },
        };
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", (r) => reject(new Error(r.error?.description || "Payment failed.")));
        rzp.open();
      });

      // Success
      setConfirm(false); setPlaced(true);
      setTimeout(() => setPlaced(false), 4000);
      await Promise.all([fetchUserHoldings(stock), fetchWallet()]);
      setQty("10"); setLimitPx(""); setPlaceErr("");

    } catch (err) {
      setPlaceErr(err.message || "Payment failed. Please try again.");
    } finally {
      setPlacingOrder(false);
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => { loadRazorpayScript(); }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError("");
      const stockObj = await fetchStockDetails();
      if (stockObj) {
        await Promise.allSettled([
          fetchUserHoldings(stockObj),
          fetchWatchlistStatus(stockObj),
          fetchWallet(),
          fetchPriceHistory(stockObj),
          fetchRelatedNews(stockObj),
        ]);
      }
      setLoading(false);
    };
    load();
  }, [symbol]); // eslint-disable-line

  // ── Derived ───────────────────────────────────────────────────────────────
  const getFilteredHistory = () => {
    const daysMap = { "1D":1,"1W":7,"1M":30,"3M":90,"6M":180,"1Y":365 };
    return priceHistory.slice(-(daysMap[tf]||90));
  };
  const filteredHistory = getFilteredHistory();
  const up     = (stock?.price_change_percent || 0) >= 0;
  const execPx = orderType==="market" ? (stock?.current_price||0) : (parseFloat(limitPx)||stock?.current_price||0);
  const total  = (parseFloat(qty)||0)*execPx;

  // ── Early returns ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"/>
    </div>
  );
  if (error||!stock) return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <button onClick={()=>navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white mb-5">
        <ArrowLeft className="w-4 h-4"/> Back
      </button>
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center text-red-400">
        {error||"Stock not found."}
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">

      {/* Success toast */}
      <AnimatePresence>
        {placed && (
          <motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}}
            className="fixed top-24 right-6 z-50 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 px-4 py-3 rounded-2xl shadow-xl">
            <CheckCircle className="w-5 h-5"/>
            <div>
              <div className="text-sm font-medium">Order Placed!</div>
              <div className="text-xs text-emerald-500/60">{tradeType==="buy"?"Buy":"Sell"} {qty} {symbol}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button onClick={()=>navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors mb-5">
        <ArrowLeft className="w-4 h-4"/> Back
      </button>

      <div className="grid lg:grid-cols-3 gap-5">

        {/* ── Left ──────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Header card */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/15 flex items-center justify-center">
                    <span className="text-sm font-bold text-cyan-400">{stock.ticker_symbol?.slice(0,2)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white">{stock.ticker_symbol}</span>
                      <span className="px-2 py-0.5 bg-white/5 rounded text-xs text-gray-500">{stock.sector||"General"}</span>
                      {myHolding&&<span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-xs text-cyan-400">I own this</span>}
                    </div>
                    <div className="text-sm text-gray-500">{stock.company_name}</div>
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="text-3xl font-bold text-white">₹{parseFloat(stock.current_price||0).toFixed(2)}</div>
                  <div className={`flex items-center gap-1.5 pb-1 ${up?"text-emerald-400":"text-red-400"}`}>
                    {up?<TrendingUp className="w-4 h-4"/>:<TrendingDown className="w-4 h-4"/>}
                    <span className="text-base font-medium">{up?"+":""}{parseFloat(stock.price_change||0).toFixed(2)}</span>
                    <span className="text-sm">({up?"+":""}{parseFloat(stock.price_change_percent||0).toFixed(2)}%)</span>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mt-1">{stock.exchange||"NASDAQ"} · Real-time</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={toggleWatchlist}
                  className={`p-2 rounded-xl border transition-all ${watched?"bg-amber-500/10 border-amber-500/20 text-amber-400":"bg-[#141C30] border-white/8 text-gray-500 hover:text-white"}`}>
                  <Star className={`w-4 h-4 ${watched?"fill-amber-400":""}`}/>
                </button>
                <button className="p-2 rounded-xl border bg-[#141C30] border-white/8 text-gray-500 hover:text-white transition-all">
                  <Bell className="w-4 h-4"/>
                </button>
              </div>
            </div>

            {myHolding&&(
              <div className="mb-4 p-3 bg-cyan-500/8 border border-cyan-500/15 rounded-xl">
                <div className="text-xs text-cyan-400 mb-2 font-medium">My Position</div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ["Shares",   parseFloat(myHolding.quantity||0).toFixed(2)],
                    ["Avg Cost", `₹${parseFloat(myHolding.average_buy_price||0).toFixed(2)}`],
                    ["Mkt Value",`₹${parseFloat(myHolding.current_value||0).toLocaleString("en",{maximumFractionDigits:0})}`],
                    ["P&L",      `${parseFloat(myHolding.unrealized_pnl||0)>=0?"+":""}₹${Math.abs(parseFloat(myHolding.unrealized_pnl||0)).toFixed(0)}`],
                  ].map(([l,v])=>(
                    <div key={l}>
                      <div className="text-xs text-gray-600">{l}</div>
                      <div className={`text-sm font-medium ${l==="P&L"?parseFloat(myHolding.unrealized_pnl||0)>=0?"text-emerald-400":"text-red-400":"text-white"}`}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-1 mb-4">
              {TFS.map(t=>(
                <button key={t} onClick={()=>setTf(t)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-all ${tf===t?"bg-cyan-500/20 text-cyan-400 border border-cyan-500/25":"text-gray-600 hover:text-gray-400"}`}>
                  {t}
                </button>
              ))}
            </div>

            <div className="h-52">
              {filteredHistory.length>0?(
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredHistory}>
                    <defs><linearGradient id="sdGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={up?"#10B981":"#EF4444"} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={up?"#10B981":"#EF4444"} stopOpacity={0}/>
                    </linearGradient></defs>
                    <XAxis dataKey="date" tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                    <YAxis tick={{fill:"#4B5563",fontSize:10}} tickLine={false} axisLine={false} domain={["auto","auto"]} tickFormatter={v=>`₹${v.toFixed(0)}`}/>
                    <Tooltip contentStyle={{background:"#0C1220",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,fontSize:11}} formatter={v=>[`₹${v.toFixed(2)}`,"Price"]}/>
                    <Area type="monotone" dataKey="close" stroke={up?"#10B981":"#EF4444"} strokeWidth={2} fill="url(#sdGrad)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              ):(
                <div className="flex items-center justify-center h-full text-gray-600 text-sm">No chart data available</div>
              )}
            </div>
          </div>

          {/* Key statistics */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4"><Info className="w-4 h-4 text-gray-500"/><span className="text-sm font-medium text-white">Key Statistics</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["52W High",  stock.week_52_high  ?`₹${parseFloat(stock.week_52_high).toFixed(2)}` :"—"],
                ["52W Low",   stock.week_52_low   ?`₹${parseFloat(stock.week_52_low).toFixed(2)}`  :"—"],
                ["Market Cap",stock.market_cap    ?`₹${(stock.market_cap/1e9).toFixed(1)}B`        :"—"],
                ["P/E Ratio", stock.pe_ratio      ?parseFloat(stock.pe_ratio).toFixed(1)            :"—"],
                ["Volume",    stock.volume        ?(stock.volume>=1e6?`${(stock.volume/1e6).toFixed(1)}M`:`${stock.volume}`):"—"],
                ["Sector",    stock.sector        ||"—"],
                ["Exchange",  stock.exchange      ||"—"],
                ["Dividend",  stock.dividend_yield?`${parseFloat(stock.dividend_yield).toFixed(2)}%`:"—"],
              ].map(([l,v])=>(
                <div key={l} className="bg-[#141C30] rounded-xl p-3">
                  <div className="text-xs text-gray-600 mb-1">{l}</div>
                  <div className="text-sm font-medium text-white">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Related news */}
          {relatedNews.length>0&&(
            <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 text-sm font-medium text-white">Related News</div>
              {relatedNews.map((n,i)=>(
                <div key={n.news_id||n.id||i} className="px-5 py-3.5 border-b border-white/5 last:border-0 hover:bg-white/5 cursor-pointer transition-colors">
                  <div className="text-sm text-white mb-1">{n.title}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>{n.source||"Market"}</span><span>·</span>
                    <span>{n.published_at?new Date(n.published_at).toLocaleDateString():"Recent"}</span>
                    {n.category&&<span className="px-1.5 py-0.5 bg-white/5 rounded">{n.category}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: trade panel ─────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden sticky top-6">

            <div className="grid grid-cols-2">
              {["buy","sell"].map(t=>(
                <button key={t} onClick={()=>{setT(t);setPlaceErr("");}}
                  className={`py-3.5 text-sm font-medium capitalize transition-all ${tradeType===t?t==="buy"?"bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500":"bg-red-500/10 text-red-400 border-b-2 border-red-500":"text-gray-500 hover:text-gray-300 border-b border-white/5"}`}>
                  {t}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {/* Order type */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Order Type</label>
                <div className="flex gap-2">
                  {["market","limit","stop"].map(ot=>(
                    <button key={ot} onClick={()=>{setOT(ot);setLimitPx("");}}
                      className={`flex-1 py-2 text-xs rounded-xl capitalize border transition-all ${orderType===ot?"border-cyan-500/50 bg-cyan-500/10 text-cyan-400":"border-white/8 bg-[#141C30] text-gray-500"}`}>
                      {ot}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Quantity</label>
                <input type="number" value={qty} onChange={e=>setQty(e.target.value)}
                  className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30"/>
              </div>

              {/* Limit price */}
              {orderType!=="market"&&(
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">{orderType==="limit"?"Limit":"Stop"} Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input type="number" value={limitPx} onChange={e=>setLimitPx(e.target.value)}
                      placeholder={stock.current_price?.toFixed(2)}
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-6 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/30"/>
                  </div>
                </div>
              )}

              {/* Order summary */}
              <div className="bg-[#141C30] rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-xs"><span className="text-gray-500">Market Price</span><span className="text-white">₹{parseFloat(stock.current_price||0).toFixed(2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Quantity</span><span className="text-white">{qty||0} shares</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Commission (~0.1%)</span><span className="text-gray-400">₹{(total*0.001).toFixed(2)}</span></div>
                <div className="pt-2 border-t border-white/5 flex justify-between text-sm">
                  <span className="text-gray-400">Est. Total</span>
                  <span className="text-white font-bold">₹{total.toLocaleString("en",{maximumFractionDigits:2})}</span>
                </div>
              </div>

              <div className="text-xs text-center text-gray-600">
                Buying Power: <span className="text-white">₹{buyingPower.toLocaleString("en",{minimumFractionDigits:2})}</span>
              </div>

              {tradeType==="buy"&&(
                <div className="px-3 py-2 bg-cyan-500/8 border border-cyan-500/20 rounded-xl text-xs text-cyan-400 text-center">
                  Payment via Razorpay gateway
                </div>
              )}

              {placeErr&&(
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>{placeErr}
                </div>
              )}

              <button onClick={()=>{setPlaceErr("");setConfirm(true);}}
                disabled={!qty||parseFloat(qty)<=0}
                className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${tradeType==="buy"?"bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/15":"bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-500/15"}`}>
                Review {tradeType==="buy"?"Buy":"Sell"} Order
              </button>
            </div>
          </div>

          {/* Analyst ratings */}
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl p-5">
            <div className="text-sm font-medium text-white mb-4">Analyst Ratings</div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full border-4 border-emerald-500 flex items-center justify-center">
                <span className="text-lg font-bold text-emerald-400">82</span>
              </div>
              <div>
                <div className="text-sm font-medium text-emerald-400">Strong Buy</div>
                <div className="text-xs text-gray-500">Based on 28 analysts</div>
              </div>
            </div>
            {[{l:"Strong Buy",n:18,p:64},{l:"Buy",n:7,p:25},{l:"Hold",n:3,p:11},{l:"Sell",n:0,p:0}].map(r=>(
              <div key={r.l} className="flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-500 w-20">{r.l}</span>
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${r.l.includes("Buy")?"bg-emerald-500":r.l==="Hold"?"bg-amber-500":"bg-red-500"}`} style={{width:`${r.p}%`}}/>
                </div>
                <span className="text-xs text-gray-600">{r.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Confirm modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {confirm&&(
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}
              className="bg-[#0C1220] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${tradeType==="buy"?"bg-emerald-500/10":"bg-red-500/10"}`}>
                <BarChart2 className={`w-6 h-6 ${tradeType==="buy"?"text-emerald-400":"text-red-400"}`}/>
              </div>
              <div className="text-center mb-5"><div className="text-lg font-bold text-white mb-1">Confirm Order</div></div>
              <div className="bg-[#141C30] rounded-xl p-4 space-y-2.5 mb-5">
                {[
                  ["Action",     tradeType==="buy"?"Buy":"Sell"],
                  ["Symbol",     stock.ticker_symbol],
                  ["Order Type", orderType.toUpperCase()],
                  ["Quantity",   `${qty} shares`],
                  ["Price",      `₹${execPx.toFixed(2)}`],
                  ["Est. Total", `₹${total.toLocaleString("en",{maximumFractionDigits:2})}`],
                ].map(([l,v])=>(
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-gray-500">{l}</span>
                    <span className={l==="Action"?tradeType==="buy"?"text-emerald-400 font-medium":"text-red-400 font-medium":"text-white"}>{v}</span>
                  </div>
                ))}
              </div>

              {tradeType==="buy"&&(
                <div className="mb-4 p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-xs text-cyan-400 text-center">
                  Clicking Confirm will open the Razorpay payment gateway.
                </div>
              )}

              {placeErr&&(
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 mb-4">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>{placeErr}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button onClick={()=>{setConfirm(false);setPlaceErr("");}}
                  className="py-2.5 bg-[#141C30] border border-white/8 rounded-xl text-sm text-gray-400 hover:text-white transition-all">
                  Cancel
                </button>
                <button onClick={placeOrder} disabled={placingOrder}
                  className={`py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${tradeType==="buy"?"bg-emerald-500 hover:bg-emerald-400":"bg-red-500 hover:bg-red-400"}`}>
                  {placingOrder?"Processing…":"Confirm"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}























