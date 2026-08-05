import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, Star, TrendingUp, TrendingDown,
  Bell, BarChart2, AlertCircle, CheckCircle,
} from "lucide-react";
import { StockChart } from "../../components/StockChart";
import { StockTabs } from "../../components/StockTabs";
import { MarketClosedNotice } from "../../components/MarketStatusBadge";
import { useMarketStatus } from "../../hooks/useMarketStatus";
import { useLiveQuotes, liveStock, liveHolding } from "../../context/LiveQuotesContext";
import { StockLogo } from "../../components/StockLogo";
import { filterQuantity, filterDecimal } from "../../utils/validation";
import { inr, inr0 } from "../../utils/currency";

/* Time-in-force in plain words — these change what happens to money, so the
   acronym is never left to be guessed at. */
const VALIDITY_HINTS = {
  DAY: "Rests until the market closes today, then cancels if unfilled.",
  GTC: "Rests until it fills or you cancel it — carries across sessions.",
  IOC: "Fills whatever it can right now; anything unfilled is cancelled.",
};

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

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

  // Market session — the server owns it; the client never decides from its own
  // clock. Drives whether the trade panel accepts input at all.
  const { status: marketStatus } = useMarketStatus();
  const { quotes } = useLiveQuotes();
  // Until the first status lands, `undefined` means "don't know" — the button
  // stays enabled and the server has the final say, so a slow status call can
  // never lock a user out of a market that is genuinely open.
  const tradingAllowed = marketStatus ? (marketStatus.trading_allowed ?? marketStatus.is_open) : true;

  // page data. The *Raw values are what the one-shot fetches returned; the
  // derived `stock` / `myHolding` below carry the live price over the top, so
  // every reference further down this file updates on each quote tick without
  // needing its own fetch.
  const [stockRaw,         setStock]           = useState(null);
  const [loading,          setLoading]         = useState(true);
  const [error,            setError]           = useState("");
  const [myHoldingRaw,     setMyHolding]       = useState(null);
  const [relatedNews,      setRelatedNews]     = useState([]);

  // watchlist
  const [watched,          setWatched]         = useState(false);
  const [watchlistId,      setWatchlistId]     = useState(null);
  const [watchlistItemId,  setWatchlistItemId] = useState(null);

  // trade panel
  const [tradeType,    setT]            = useState("buy");
  const [exchange,     setExchange]     = useState("NSE");        // NSE | BSE
  const [tradeMode,    setTradeMode]    = useState("delivery");   // delivery | intraday
  const [orderType,    setOT]           = useState("market");
  const [qty,          setQty]          = useState("");
  const [limitPx,      setLimitPx]      = useState("");   // entry price for a Limit order
  const [stopLossPx,   setStopLossPx]   = useState("");   // protective exit, set independently
  const [validity,     setValidity]     = useState("DAY");  // DAY | GTC | IOC
  const [confirm,      setConfirm]      = useState(false);
  const [placeErr,     setPlaceErr]     = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [placed,       setPlaced]       = useState(false);
  const [placedMsg,    setPlacedMsg]    = useState("");
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

    // Market hours. The backend rejects these too — this is here so the user
    // gets the reason without a round trip, not as the enforcement point.
    if (!tradingAllowed) {
      setPlaceErr(
        (tradeMode === "intraday"
          ? marketStatus?.intraday_blocked_reason
          : marketStatus?.trading_blocked_reason) || "Market is currently closed."
      );
      return;
    }

    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity <= 0) { setPlaceErr("Enter a valid quantity."); return; }
    if (orderType === "limit" && (!limitPx || isNaN(parseFloat(limitPx)))) {
      setPlaceErr("Enter a valid limit price."); return;
    }

    // ── Wallet-based order placement (ALL orders) ─────────────────────────
    // Every order — BUY/SELL, MARKET/LIMIT/STOP — is placed through the wallet:
    //   • MARKET      → executes immediately, deducting (BUY) / crediting (SELL)
    //                   the wallet balance right away.
    //   • LIMIT/STOP  → reserves buying power (BUY) or shares (SELL) and sits
    //                   PENDING until the engine triggers it on live price.
    // Funds are added separately via Settings → Wallet → Add Money (Razorpay).
    // Frontend owned-check only for Delivery (myHolding tracks the delivery
    // holding). Intraday positions are validated by the backend per trade_mode.
    // Delivery can only sell what you own. Intraday can sell short, so it is
    // deliberately NOT blocked here — the backend validates the margin.
    if (tradeType === "sell" && tradeMode === "delivery") {
      const owned = ownedQty;
      if (owned < quantity) {
        setPlaceErr(
          `Insufficient shares. You own ${owned} share(s) of ${symbol}. ` +
          `Switch Product to Intraday to sell short (sell first, buy back later).`
        );
        return;
      }
    }
    // Covering can't overshoot the short — the backend rejects it, but say so here.
    if (isCoveringBuy && quantity > shortQty) {
      setPlaceErr(
        `You are short ${shortQty} share(s). Buy that many or fewer to cover, ` +
        `then place a separate order to go long.`
      );
      return;
    }
    // A stop on the wrong side of the entry would fire the moment it is armed.
    if (slError) { setPlaceErr(slError); return; }

    setPlacingOrder(true);
    try {
      const body = {
        stock_id:       stock.stock_id,        // int  (required)
        order_side:     tradeType.toUpperCase(),
        order_type:     orderType.toUpperCase(),
        trade_mode:     tradeMode.toUpperCase(),   // DELIVERY | INTRADAY
        exchange:       exchange,                  // NSE | BSE
        quantity:       quantity,
        time_in_force:  validity,          // DAY | GTC | IOC
      };
      // Entry level.
      if (orderType === "limit" && limitPx) body.limit_price = parseFloat(limitPx);
      // Protective exit, sent alongside the entry rather than instead of it —
      // the engine arms it as its own STOP order once this order fills. Limit
      // orders only, matching where the field is offered.
      if (tradeMode === "intraday" && orderType === "limit"
          && stopLossPx && !isNaN(parseFloat(stopLossPx))) {
        body.stop_loss_price = parseFloat(stopLossPx);
      }

      const res = await fetch(`${API_BASE}/trade_orders/place`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data;
      try { data = await res.json(); }
      catch { setPlaceErr(`Server error (${res.status}).`); return; }

      if (data.bool) {
        setConfirm(false);
        setPlacedMsg(data.response?.message || "Order placed successfully.");
        setPlaced(true);
        setTimeout(() => setPlaced(false), 6000);
        await Promise.all([fetchUserHoldings(stock), fetchWallet()]);
        // Back to an empty ticket, not "0" — the user should be able to type the
        // next quantity straight in.
        setQty(""); setLimitPx(""); setStopLossPx(""); setValidity("DAY"); setPlaceErr("");
      } else {
        const msg = data.response?.message || "Failed to place order.";
        // Insufficient wallet funds → point the user at Add Money.
        setPlaceErr(
          msg.toLowerCase().includes("insufficient funds")
            ? `${msg} Add money to your wallet in Settings → Wallet, then try again.`
            : msg
        );
      }
    } catch { setPlaceErr("Network error. Please try again."); }
    finally { setPlacingOrder(false); }
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => { loadRazorpayScript(); }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError("");
      const stockObj = await fetchStockDetails();
      if (stockObj) {
        // Default the exchange selector to the stock's primary listing.
        setExchange((stockObj.exchange || "NSE").toUpperCase() === "BSE" ? "BSE" : "NSE");
        await Promise.allSettled([
          fetchUserHoldings(stockObj),
          fetchWatchlistStatus(stockObj),
          fetchWallet(),
          fetchRelatedNews(stockObj),
        ]);
      }
      setLoading(false);
    };
    load();
  }, [symbol]); // eslint-disable-line

  // ── Derived ───────────────────────────────────────────────────────────────

  // Live overlay. The page still fetches the stock once for its static detail
  // (name, sector, 52-week range, logo); the price, day change and the position's
  // market value/P&L come from the shared quote poll, so the header price, the
  // order panel and the chart all move together.
  const stock     = useMemo(() => liveStock(stockRaw, quotes),      [stockRaw, quotes]);
  const myHolding = useMemo(() => liveHolding(myHoldingRaw, quotes), [myHoldingRaw, quotes]);

  const up     = (stock?.price_change_percent || 0) >= 0;

  // Short-selling state. `myHolding` is whichever position is open on this stock
  // — long or short — so the panel below has to read the side, not assume long.
  const isShortPos = myHolding?.position_side === "SHORT" || myHolding?.is_short === true;
  const ownedQty   = isShortPos ? 0 : parseFloat(myHolding?.quantity || 0);
  const shortQty   = isShortPos ? parseFloat(myHolding?.quantity || 0) : 0;

  // A sell with nothing owned opens a short (intraday only); a buy against an
  // open short covers it. Both need to be spelt out before the user commits.
  const isShortSell   = tradeType === "sell" && tradeMode === "intraday" && ownedQty <= 0;
  const isCoveringBuy = tradeType === "buy"  && shortQty > 0;

  // NSE / BSE prices. We store one live price for the stock's primary exchange;
  // the other exchange is shown with a small realistic spread. The selected
  // exchange drives the market-price reference used for the order.
  const basePx    = parseFloat(stock?.current_price || 0);
  const primaryEx = (stock?.exchange || "NSE").toUpperCase() === "BSE" ? "BSE" : "NSE";
  const SPREAD    = 0.0004;   // ~0.04% NSE/BSE spread
  const exPrices  = {
    NSE: primaryEx === "NSE" ? basePx : +(basePx * (1 + SPREAD)).toFixed(2),
    BSE: primaryEx === "BSE" ? basePx : +(basePx * (1 - SPREAD)).toFixed(2),
  };
  const marketPx  = exPrices[exchange] || basePx;

  const execPx = orderType==="market" ? marketPx : (parseFloat(limitPx)||marketPx);
  const total  = (parseFloat(qty)||'')*execPx;

  // ── Stop loss ─────────────────────────────────────────────────────────────
  // Checked against the ENTRY price, not the market price: on a limit order the
  // user gets in at their limit, so that is what the stop has to sit under.
  const slValue = parseFloat(stopLossPx);
  const slError = !stopLossPx || isNaN(slValue) ? ""
    : slValue <= 0 ? "Enter a valid stop loss."
    : tradeType === "buy" && slValue >= execPx
      ? `Must be below your buy price of ₹${execPx.toFixed(2)} — it would trigger immediately.`
    : tradeType === "sell" && isShortSell && slValue <= execPx
      ? `Must be above your sell price of ₹${execPx.toFixed(2)} — it would trigger immediately.`
    : "";
  // What the stop caps the loss at, if it fills exactly there.
  const slRisk = Math.abs(execPx - (slValue || execPx)) * (parseFloat(qty) || 0);
  // How far the stop sits from the CURRENT market price, as a percentage.
  // Measured against the live price rather than the limit price so it re-reads
  // on every tick — it answers "how much further can this fall before I'm out?".
  const slPct = slValue > 0 && marketPx > 0
    ? ((slValue - marketPx) / marketPx) * 100
    : null;
  // A sensible default one click away — 1% the protective side of the entry.
  const slSuggestion = execPx > 0
    ? (tradeType === "buy" ? execPx * 0.99 : execPx * 1.01).toFixed(2)
    : null;

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
            <div className="max-w-[260px]">
              <div className="text-sm font-medium">Order Placed!</div>
              {/* The server's wording, because an IOC may have filled only part
                  of the quantity or nothing at all. */}
              <div className="text-xs text-emerald-500/70">{placedMsg}</div>
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
                  <StockLogo symbol={stock.ticker_symbol} name={stock.company_name} size="lg" />
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
                <div className="text-xs text-gray-600 mt-1">{exchange} · Real-time</div>
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
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-medium ${isShortPos?"text-amber-400":"text-cyan-400"}`}>
                    My Position
                  </span>
                  {isShortPos && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-[10px] font-semibold text-amber-400">
                      SHORT · sold first
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ["Shares",   parseFloat(myHolding.quantity||0).toFixed(2)],
                    // A short's entry is the price it was SOLD at, not a cost.
                    [isShortPos?"Avg Sell":"Avg Cost", `₹${parseFloat(myHolding.average_buy_price||0).toFixed(2)}`],
                    [isShortPos?"Buy-back":"Mkt Value",inr0(myHolding.current_value)],
                    ["P&L",      `${parseFloat(myHolding.unrealized_pnl||0)>=0?"+":""}₹${Math.abs(parseFloat(myHolding.unrealized_pnl||0)).toFixed(0)}`],
                  ].map(([l,v])=>(
                    <div key={l}>
                      <div className="text-xs text-gray-600">{l}</div>
                      <div className={`text-sm font-medium ${l==="P&L"?parseFloat(myHolding.unrealized_pnl||0)>=0?"text-emerald-400":"text-red-400":"text-white"}`}>{v}</div>
                    </div>
                  ))}
                </div>
                {(myHolding.trade_mode === "INTRADAY") && (
                  <div className={`mt-2 text-[11px] ${isShortPos ? "text-amber-300/80" : "text-cyan-300/80"}`}>
                    {isShortPos
                      ? `Buy ${parseFloat(myHolding.quantity||0).toFixed(2)} share(s) to square off. `
                      : `Sell ${parseFloat(myHolding.quantity||0).toFixed(2)} share(s) to square off. `}
                    Squared off automatically at {marketStatus?.market_close_label || "market close"} IST
                    if still open.
                  </div>
                )}
              </div>
            )}

            <StockChart
              stockId={stock.stock_id}
              symbol={stock.ticker_symbol}
              currentPrice={stock.current_price}
              currency="₹"
              accent="cyan"
              height={230}
            />
          </div>

          {/* Stats · Depth · Orders · Positions */}
          <StockTabs
            stock={stock}
            myHolding={myHolding}
            symbol={stock.ticker_symbol}
            stockId={stock.stock_id}
          />

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

        {/* ── Right: trade panel (whole sidebar sticks together while scrolling) ── */}
        <div className="space-y-5 self-start lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <div className="bg-[#0C1220] border border-white/5 rounded-2xl overflow-hidden">

            {/* Exchange selector — pick NSE / BSE and trade at that quote */}
            <div className="grid grid-cols-2 gap-2 p-3 border-b border-white/5">
              {["NSE","BSE"].map(ex=>(
                <button key={ex} onClick={()=>setExchange(ex)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${exchange===ex?"border-cyan-500/50 bg-cyan-500/10":"border-white/8 bg-[#141C30] hover:border-white/15"}`}>
                  <span className={`text-xs font-semibold ${exchange===ex?"text-cyan-400":"text-gray-400"}`}>{ex}</span>
                  <span className={`text-sm font-bold ${exchange===ex?"text-white":"text-gray-500"}`}>₹{(exPrices[ex]||0).toFixed(2)}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2">
              {["buy","sell"].map(t=>(
                <button key={t} onClick={()=>{setT(t);setPlaceErr("");}}
                  className={`py-3.5 text-sm font-medium capitalize transition-all ${tradeType===t?t==="buy"?"bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500":"bg-red-500/10 text-red-400 border-b-2 border-red-500":"text-gray-500 hover:text-gray-300 border-b border-white/5"}`}>
                  {t}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {/* Market shut → say so before the user fills the form in */}
              <MarketClosedNotice
                status={marketStatus}
                mode={tradeMode === "intraday" ? "INTRADAY" : "DELIVERY"}
              />

              {/* Trading mode — Delivery vs Intraday (Upstox-style) */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Product</label>
                <div className="flex gap-2">
                  {[
                    { key:"delivery", label:"Delivery", hint:"Held in portfolio" },
                    { key:"intraday", label:"Intraday", hint:"Square off later" },
                  ].map(m=>(
                    <button key={m.key}
                      onClick={()=>{
                        setTradeMode(m.key);
                        // Delivery is Market-only and carries no stop loss.
                        if(m.key==="delivery"){ setOT("market"); setLimitPx(""); setStopLossPx(""); }
                        setPlaceErr("");
                      }}
                      className={`flex-1 py-2 rounded-xl border transition-all ${tradeMode===m.key?"border-cyan-500/50 bg-cyan-500/10 text-cyan-400":"border-white/8 bg-[#141C30] text-gray-500"}`}>
                      <div className="text-xs font-medium capitalize">{m.label}</div>
                      <div className="text-[10px] text-gray-600">{m.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Order type — Delivery = Market only; Intraday adds Limit.
                  There is no standalone "Stop" entry type: a stop is protection
                  for a position, not a way into one, so it lives as the Stop Loss
                  field under Limit rather than as a third button here. */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Order Type</label>
                <div className="flex gap-2">
                  {["market","limit"].map(ot=>(
                    <button key={ot}
                      onClick={()=>{
                        setOT(ot);
                        setLimitPx("");
                        // The stop loss belongs to a Limit order; leaving a value
                        // behind on Market would submit one the user can't see.
                        if(ot!=="limit") setStopLossPx("");
                        setPlaceErr("");
                      }}
                      className={`flex-1 py-2 text-xs rounded-xl capitalize border transition-all ${orderType===ot?"border-cyan-500/50 bg-cyan-500/10 text-cyan-400":"border-white/8 bg-[#141C30] text-gray-500"}`}>
                      {ot}
                    </button>
                  ))}
                </div>
                {tradeMode==="delivery" ? (
                  <div className="text-[10px] text-gray-600 mt-1.5">
                    Delivery holds the shares until you sell. A Limit order can rest
                    across sessions with GTC validity.
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-600 mt-1.5">
                    Intraday settles the same session — any position still open at{" "}
                    {marketStatus?.market_close_label || "market close"} IST is squared off
                    automatically at the last traded price.
                  </div>
                )}
              </div>

              {/* Quantity — text + digit filter, NOT type="number". A number
                  input still accepts "e", "+" and "-", and it renders the
                  browser's spinner arrows, which have no place on a trade
                  ticket. */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Quantity</label>
                <input type="text" inputMode="numeric" value={qty}
                  onChange={e=>setQty(filterQuantity(e.target.value))}
                  placeholder="Enter Quantity"
                  aria-label="Quantity in shares"
                  className="w-full bg-[#141C30] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/30"/>
              </div>

              {/* Validity — what happens if the order cannot fill. Same three
                  choices the Trade screen offers, so the two tickets match. */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Validity</label>
                <div className="flex gap-2">
                  {["DAY","GTC","IOC"].map(v=>(
                    <button key={v} onClick={()=>{setValidity(v);setPlaceErr("");}}
                      className={`flex-1 py-2 text-xs rounded-xl border transition-all ${validity===v?"border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-semibold":"border-white/8 bg-[#141C30] text-gray-500"}`}>
                      {v === "DAY" ? "Day" : v}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-gray-600 mt-1.5">{VALIDITY_HINTS[validity]}</div>
              </div>

              {/* Entry price — the level this order goes IN at */}
              {orderType==="limit"&&(
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">Limit Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                    <input type="text" inputMode="decimal" value={limitPx}
                      onChange={e=>setLimitPx(filterDecimal(e.target.value, 2))}
                      placeholder={marketPx.toFixed(2)}
                      aria-label="Limit price in rupees"
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-6 pr-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/30"/>
                  </div>
                </div>
              )}

              {/* Stop loss — the level this order gets OUT at. Offered only on a
                  Limit order: it pairs with the entry price directly above it, so
                  the two read together as "get in here, get out there". A Market
                  order fills instantly at whatever the market is, which leaves no
                  entry price for a stop to be measured against. */}
              {tradeMode==="intraday"&&orderType==="limit"&&(
                <div>
                  <label className="text-xs text-gray-500 mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      Stop Loss <span className="text-gray-600">(optional)</span>
                      {/* Distance from the live price, recomputed on every tick
                          and on every keystroke. */}
                      {slPct !== null && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums ${
                          slPct < 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                          {slPct > 0 ? "+" : ""}{slPct.toFixed(2)}%
                        </span>
                      )}
                    </span>
                    {slSuggestion && (
                      <button type="button" onClick={()=>setStopLossPx(slSuggestion)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 whitespace-nowrap">
                        −1% · ₹{slSuggestion}
                      </button>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                    <input type="text" inputMode="decimal" value={stopLossPx}
                      onChange={e=>setStopLossPx(filterDecimal(e.target.value, 2))}
                      placeholder={tradeType==="buy" ? "Sell if price falls to…" : "Cover if price rises to…"}
                      aria-label="Stop loss price in rupees"
                      className="w-full bg-[#141C30] border border-white/8 rounded-xl pl-6 pr-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/30"/>
                  </div>
                  {stopLossPx && (
                    <div className={`text-[10px] mt-1.5 ${slError ? "text-red-400" : "text-gray-600"}`}>
                      {slError || (
                        <>
                          {slPct !== null && `${Math.abs(slPct).toFixed(2)}% ${slPct < 0 ? "below" : "above"} the live price · `}
                          protects ~₹{slRisk.toFixed(2)} of risk
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Order summary */}
              <div className="bg-[#141C30] rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-xs"><span className="text-gray-500">Market Price ({exchange})</span><span className="text-white">₹{marketPx.toFixed(2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Quantity</span><span className="text-white">{qty||''} shares</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Commission (~0.1%)</span><span className="text-gray-400">₹{(total*0.001).toFixed(2)}</span></div>
                <div className="pt-2 border-t border-white/5 flex justify-between text-sm">
                  <span className="text-gray-400">Est. Total</span>
                  <span className="text-white font-bold">{inr(total)}</span>
                </div>
              </div>

              <div className="text-xs text-center text-gray-600">
                Buying Power: <span className="text-white">{inr(buyingPower)}</span>
              </div>

              {/* Short sell — the least obvious thing this panel can do, so it
                  says plainly what happens to the user's money. */}
              {isShortSell&&(
                <div className="px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl text-xs text-amber-300 space-y-1">
                  <div className="font-semibold text-amber-400">Short sell — you don't own this stock</div>
                  <div>
                    You sell now and buy back later. Profit if the price falls, loss if it rises.
                  </div>
                  <div>
                    {inr(total)} is held from your wallet
                    as collateral until you square off — it is not credited to you.
                  </div>
                  <div className="opacity-80">
                    Auto squared-off at {marketStatus?.market_close_label || "market close"} IST if still open.
                  </div>
                </div>
              )}
              {isCoveringBuy&&(
                <div className="px-3 py-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl text-xs text-emerald-300">
                  <span className="font-semibold text-emerald-400">Buy to cover</span> — squares off
                  your short of {shortQty.toFixed(2)} share(s). Your collateral is released and the
                  profit or loss settles to your wallet.
                </div>
              )}

              {tradeType==="buy"&&!isCoveringBuy&&orderType==="market"&&(
                <div className="px-3 py-2 bg-cyan-500/8 border border-cyan-500/20 rounded-xl text-xs text-cyan-400 text-center">
                  Paid from wallet balance · deducted instantly
                </div>
              )}
              {tradeType==="buy"&&!isCoveringBuy&&orderType==="limit"&&(
                <div className="px-3 py-2 bg-amber-500/8 border border-amber-500/20 rounded-xl text-xs text-amber-400 text-center">
                  Reserves wallet buying power · fills automatically when triggered
                </div>
              )}

              {placeErr&&(
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>{placeErr}
                </div>
              )}

              <button onClick={()=>{setPlaceErr("");setConfirm(true);}}
                disabled={!qty||parseFloat(qty)<=0||!tradingAllowed}
                title={!tradingAllowed ? marketStatus?.trading_blocked_reason : undefined}
                className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${tradeType==="buy"?"bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/15":"bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-500/15"}`}>
                {!tradingAllowed
                  ? "Market Closed"
                  : isShortSell   ? "Review Short Sell"
                  : isCoveringBuy ? "Review Buy to Cover"
                  : `Review ${tradeType==="buy"?"Buy":"Sell"} Order`}
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
                  ["Action",     isShortSell ? "Short Sell" : isCoveringBuy ? "Buy to Cover"
                                 : tradeType==="buy" ? "Buy" : "Sell"],
                  ["Symbol",     `${stock.ticker_symbol} · ${exchange}`],
                  ["Product",    tradeMode.toUpperCase()],
                  ["Order Type", orderType.toUpperCase()],
                  ["Validity",   validity],
                  ["Quantity",   `${qty} shares`],
                  ["Price",      `₹${execPx.toFixed(2)}`],
                  // Only shown when one is attached, so the confirm step stays
                  // short for a plain order.
                  ...(stopLossPx && tradeMode==="intraday" && orderType==="limit"
                    ? [["Stop Loss", `₹${parseFloat(stopLossPx).toFixed(2)}  ·  risk ≈ ₹${slRisk.toFixed(2)}`]]
                    : []),
                  ["Est. Total", inr(total)],
                ].map(([l,v])=>(
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-gray-500">{l}</span>
                    <span className={l==="Action"?tradeType==="buy"?"text-emerald-400 font-medium":"text-red-400 font-medium":"text-white"}>{v}</span>
                  </div>
                ))}
              </div>

              {isShortSell&&(
                <div className="mb-4 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-300 text-center">
                  {inr(total)} will be held as collateral
                  until you buy these shares back. Nothing is credited to your balance now.
                </div>
              )}
              {tradeType==="buy"&&!isCoveringBuy&&orderType==="market"&&(
                <div className="mb-4 p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-xs text-cyan-400 text-center">
                  {inr(total)} will be deducted from your wallet balance.
                </div>
              )}
              {tradeType==="buy"&&orderType==="limit"&&(
                <div className="mb-4 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-400 text-center">
                  This {orderType.toUpperCase()} order reserves wallet funds and fills automatically when the price is reached.
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
                {/* Re-checked here as well: the bell can ring while this modal
                    is open, and a confirm at 15:31 must not go through. */}
                <button onClick={placeOrder} disabled={placingOrder||!tradingAllowed}
                  className={`py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${tradeType==="buy"?"bg-emerald-500 hover:bg-emerald-400":"bg-red-500 hover:bg-red-400"}`}>
                  {placingOrder?"Processing…":!tradingAllowed?"Market Closed":"Confirm"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}























