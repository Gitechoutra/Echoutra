import { useState, useEffect, useMemo, useRef } from "react";
import {
  ComposedChart, Line, Area, Bar, Customized,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  CandlestickChart, LineChart as LineIcon, AreaChart as AreaIcon,
  BarChart3, Activity, TrendingUp, ChevronDown, Check, Pause, Play,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:5050/v1";
const getToken = () => localStorage.getItem("access_token");
const authHdr  = () => ({ Authorization: `Bearer ${getToken()}` });

const UP   = "#10B981";
const DOWN = "#EF4444";

// ── Chart types ───────────────────────────────────────────────────────────────
export const CHART_TYPES = [
  { key: "candlestick", label: "Candlestick",     icon: CandlestickChart, ohlc: true },
  { key: "hollow",      label: "Hollow Candles",  icon: CandlestickChart, ohlc: true },
  { key: "bars",        label: "Bars (OHLC)",     icon: BarChart3,        ohlc: true },
  { key: "hlc",         label: "HLC Area",        icon: AreaIcon,         ohlc: true },
  { key: "line",        label: "Line",            icon: LineIcon },
  { key: "markers",     label: "Line + Markers",  icon: Activity },
  { key: "step",        label: "Step Line",       icon: Activity },
  { key: "area",        label: "Area",            icon: AreaIcon },
  { key: "baseline",    label: "Baseline",        icon: TrendingUp },
  { key: "columns",     label: "Columns",         icon: BarChart3 },
];

// Default is 1D — user picks 1W / 1M / 3M / … from here.
const TFS = ["1D", "1W", "1M", "3M", "6M", "1Y"];

// Per-timeframe: how many bars, the time between bars, and how to label the axis.
const TF_CFG = {
  "1D": { points: 78,  stepMs: 5 * 60e3,          fmt: "time",  vol: 0.006 },
  "1W": { points: 84,  stepMs: 2 * 3600e3,        fmt: "dt",    vol: 0.012 },
  "1M": { points: 90,  stepMs: 8 * 3600e3,        fmt: "date",  vol: 0.02  },
  "3M": { points: 90,  stepMs: 24 * 3600e3,       fmt: "date",  vol: 0.025 },
  "6M": { points: 90,  stepMs: 2 * 24 * 3600e3,   fmt: "date",  vol: 0.03  },
  "1Y": { points: 120, stepMs: 3 * 24 * 3600e3,   fmt: "date",  vol: 0.035 },
};

// ── Live-update cadence ─────────────────────────────────────────────────────────
const LIVE_TICK_MS = 2000;    // add a new bar (and scroll) every 2s
const REAL_SYNC_MS = 20000;   // re-anchor to the real backend price every 20s

// ── Deterministic PRNG (so a stock's history looks the same each open) ──────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function fmtLabel(ms, fmt) {
  const d  = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  // Intraday (1D) uses seconds so fast, real-time candles get unique x labels.
  if (fmt === "time") return `${hh}:${mm}:${ss}`;
  if (fmt === "dt")   return `${d.getDate()}/${d.getMonth() + 1} ${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Real cadence (ms) at which the 1D chart rolls a fresh candle. Keeping this on
// the wall clock is what makes the x-axis time *live* instead of racing ahead.
const DISPLAY_STEP_MS = { "1D": 3000 };

// Build a timeframe's OHLC series ending "now", anchored so the last close == price.
export function genSeries(symbol, price, tf) {
  const cfg  = TF_CFG[tf] || TF_CFG["1D"];
  const n    = cfg.points;
  const rand = mulberry32(seedFromString((symbol || "STOCK") + tf));
  const base = Number(price) > 0 ? Number(price) : 100;

  const closes = [base];
  for (let i = 1; i < n; i++) {
    const drift = (rand() - 0.5) * cfg.vol;
    closes.push(closes[i - 1] / (1 + drift));
  }
  closes.reverse();

  const now = Date.now();
  const out = [];
  for (let i = 0; i < n; i++) {
    const t     = now - (n - 1 - i) * cfg.stepMs;
    const close = closes[i];
    const open  = i === 0 ? close * (1 + (rand() - 0.5) * 0.006) : closes[i - 1];
    const hi    = Math.max(open, close) * (1 + rand() * 0.01);
    const lo    = Math.min(open, close) * (1 - rand() * 0.01);
    out.push({
      t, date: fmtLabel(t, cfg.fmt),
      open: +open.toFixed(2), high: +hi.toFixed(2),
      low: +lo.toFixed(2), close: +close.toFixed(2),
      volume: Math.round(1e6 + rand() * 9e6),
    });
  }
  return out;
}

// Advance the live chart on REAL wall-clock time so the x-axis and the graph
// stay in sync:
//   • 1D (intraday): the newest candle is a "forming" candle stamped at the
//     current clock; it updates in place every tick and rolls to a new candle
//     once real time crosses DISPLAY_STEP_MS — so the chart scrolls left with
//     true, advancing timestamps instead of racing minutes into the future.
//   • Higher timeframes (daily/weekly candles): only the current candle updates
//     in place; a new candle would only appear at a real day/hour boundary.
export function liveAppend(prev, tf) {
  if (!prev.length) return prev;
  const cfg      = TF_CFG[tf] || TF_CFG["1D"];
  const intraday = cfg.fmt === "time";
  const now      = Date.now();
  const last     = prev[prev.length - 1];
  const vol      = intraday ? 0.0018 : cfg.vol * 0.3;

  // Roll a brand-new candle (1D only) once real time crosses the display step.
  if (intraday && now - last.t >= (DISPLAY_STEP_MS[tf] || 3000)) {
    const open  = last.close;
    const close = Math.max(0.01, open * (1 + (Math.random() - 0.5) * 2 * vol));
    const hi    = Math.max(open, close) * (1 + Math.random() * 0.004);
    const lo    = Math.min(open, close) * (1 - Math.random() * 0.004);
    const bar   = {
      t: now, date: fmtLabel(now, cfg.fmt),
      open: +open.toFixed(2), high: +hi.toFixed(2),
      low: +lo.toFixed(2), close: +close.toFixed(2),
      volume: Math.round(1e6 + Math.random() * 9e6),
    };
    return [...prev.slice(1), bar];
  }

  // Otherwise update the forming candle in place, stamped at the real clock.
  const close = Math.max(0.01, last.close * (1 + (Math.random() - 0.5) * 2 * vol * 0.6));
  const bar   = {
    ...last,
    t: now, date: fmtLabel(now, cfg.fmt),
    close: +close.toFixed(2),
    high:  +Math.max(last.high, close).toFixed(2),
    low:   +Math.min(last.low,  close).toFixed(2),
  };
  return [...prev.slice(0, -1), bar];
}

// Snap the newest bar's close to the real market price (truthful re-anchor).
export function reanchor(prev, price) {
  if (!prev.length || !(price > 0)) return prev;
  const arr  = prev.slice();
  const i    = arr.length - 1;
  const last = { ...arr[i] };
  last.close = +price.toFixed(2);
  last.high  = +Math.max(last.high, price).toFixed(2);
  last.low   = +Math.min(last.low,  price).toFixed(2);
  arr[i] = last;
  return arr;
}

// ── Custom OHLC tooltip ─────────────────────────────────────────────────────────
function OhlcTooltip({ active, payload, symbol, curr }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const up = p.close >= p.open;
  const Row = ([l, v]) => (
    <div key={l} className="flex justify-between gap-4 text-[11px]">
      <span className="text-gray-500">{l}</span>
      <span className="text-gray-200 font-medium">{curr}{Number(v).toFixed(2)}</span>
    </div>
  );
  return (
    <div className="bg-[#0C1220] border border-white/10 rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[11px] font-semibold text-white mb-1">{symbol} · {p.date}</div>
      {[["Open", p.open], ["High", p.high], ["Low", p.low], ["Close", p.close]].map(Row)}
      <div className={`text-[11px] mt-1 font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
        {up ? "▲" : "▼"} {(((p.close - p.open) / p.open) * 100).toFixed(2)}%
      </div>
    </div>
  );
}

// ── Geometry helper: pixel x-centre + column width from the recharts x-scale ────
function xGeom(xAxisMap, data, offset) {
  const xAxis  = xAxisMap[Object.keys(xAxisMap)[0]];
  const xScale = xAxis.scale;
  const bw     = xScale.bandwidth ? xScale.bandwidth() : 0;
  const centre = (d) => (xScale(d.date) ?? 0) + bw / 2;
  let step = bw;
  if (!step && data.length > 1) step = Math.abs(centre(data[1]) - centre(data[0]));
  if (!step) step = (offset?.width || 300) / Math.max(1, data.length);
  return { centre, width: Math.max(1.5, Math.min(step * 0.62, 16)) };
}

// ── Candlestick / hollow-candle layer (drawn via <Customized>) ─────────────────
export function makeCandleLayer(data, hollow) {
  return function CandleLayer(props) {
    const { xAxisMap, yAxisMap, offset } = props;
    if (!xAxisMap || !yAxisMap) return null;
    const yScale = yAxisMap[Object.keys(yAxisMap)[0]].scale;
    const { centre, width } = xGeom(xAxisMap, data, offset);
    return (
      <g>
        {data.map((d, i) => {
          const x  = centre(d);
          const up = d.close >= d.open;
          const color = up ? UP : DOWN;
          const yO = yScale(d.open), yC = yScale(d.close);
          const yH = yScale(d.high), yL = yScale(d.low);
          const top = Math.min(yO, yC);
          const h   = Math.max(1, Math.abs(yC - yO));
          const fill = hollow ? (up ? "none" : color) : color;
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth={1} />
              <rect x={x - width / 2} y={top} width={width} height={h}
                    fill={fill} stroke={color} strokeWidth={1} />
            </g>
          );
        })}
      </g>
    );
  };
}

// ── OHLC bar layer (left tick = open, right tick = close) ──────────────────────
export function makeBarLayer(data) {
  return function BarLayer(props) {
    const { xAxisMap, yAxisMap, offset } = props;
    if (!xAxisMap || !yAxisMap) return null;
    const yScale = yAxisMap[Object.keys(yAxisMap)[0]].scale;
    const { centre, width } = xGeom(xAxisMap, data, offset);
    const t = width / 2;
    return (
      <g>
        {data.map((d, i) => {
          const x = centre(d);
          const color = d.close >= d.open ? UP : DOWN;
          return (
            <g key={i} stroke={color} strokeWidth={1.4}>
              <line x1={x} x2={x} y1={yScale(d.high)} y2={yScale(d.low)} />
              <line x1={x - t} x2={x} y1={yScale(d.open)} y2={yScale(d.open)} />
              <line x1={x} x2={x + t} y1={yScale(d.close)} y2={yScale(d.close)} />
            </g>
          );
        })}
      </g>
    );
  };
}

/**
 * Reusable, live, interactive stock chart.
 * - Defaults to the 1D timeframe; user switches to 1W / 1M / 3M / 6M / 1Y.
 * - Streams new bars every few seconds so the graph scrolls left with advancing
 *   time labels on the x-axis, and periodically re-anchors to the real price.
 */
export function StockChart({ stockId, symbol, currentPrice, currency = "₹", accent = "cyan", height = 260 }) {
  const [type,     setType]    = useState("candlestick");
  const [tf,       setTf]      = useState("1D");
  const [series,   setSeries]  = useState([]);
  const [loading,  setLoading] = useState(true);
  const [paused,   setPaused]  = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoom,     setZoom]    = useState(null);   // visible bar count; null = fit all
  const menuRef  = useRef(null);
  const chartRef = useRef(null);

  const accentCls = accent === "violet"
    ? { active: "bg-violet-500/20 text-violet-300 border-violet-500/25", ring: "focus:border-violet-500/30" }
    : { active: "bg-cyan-500/20 text-cyan-400 border-cyan-500/25",       ring: "focus:border-cyan-500/30" };

  // (Re)build the series whenever the stock or timeframe changes.
  useEffect(() => {
    setLoading(true);
    setSeries(genSeries(symbol, Number(currentPrice) || 0, tf));
    setLoading(false);
  }, [symbol, currentPrice, tf]);

  // Live engine: scroll a new bar in on a timer + re-anchor to the real price.
  useEffect(() => {
    if (loading || paused) return;
    const tickId = setInterval(() => setSeries((prev) => liveAppend(prev, tf)), LIVE_TICK_MS);
    const syncId = setInterval(async () => {
      if (!symbol) return;
      try {
        const res  = await fetch(`${API_BASE}/stocks/ticker/${symbol}`, { headers: authHdr() });
        const data = await res.json();
        const price = parseFloat(data?.response?.current_price);
        if (price > 0) setSeries((prev) => reanchor(prev, price));
      } catch { /* keep simulated motion on network error */ }
    }, REAL_SYNC_MS);
    return () => { clearInterval(tickId); clearInterval(syncId); };
  }, [loading, paused, tf, symbol]);

  // Close the type menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const livePrice = series.length ? series[series.length - 1].close : Number(currentPrice) || 0;

  // Zoom: show only the last `zoom` bars (null = fit all). Everything that draws
  // (axes, candle layers, domain) uses this sliced `data` so the chart — and only
  // the chart — zooms. The browser page never zooms (see the wheel handler below).
  const data = useMemo(() => {
    if (!zoom || zoom >= series.length) return series;
    return series.slice(series.length - zoom);
  }, [series, zoom]);

  // Chart-only zoom via a NON-passive wheel listener (React's onWheel is passive
  // and cannot preventDefault). Wheel up = zoom in, down = zoom out.
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom((z) => {
        const cur  = z || series.length;
        let next   = e.deltaY < 0 ? Math.round(cur * 0.85) : Math.round(cur * 1.18);
        next       = Math.max(15, Math.min(series.length, next));
        return next >= series.length ? null : next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [series.length]);

  // Y domain from OHLC so wicks always fit
  const domain = useMemo(() => {
    if (!data.length) return ["auto", "auto"];
    let lo = Infinity, hi = -Infinity;
    data.forEach((d) => {
      lo = Math.min(lo, d.low, d.open, d.close, d.high);
      hi = Math.max(hi, d.low, d.open, d.close, d.high);
    });
    const pad = (hi - lo) * 0.06 || hi * 0.02;
    return [Math.max(0, lo - pad), hi + pad];
  }, [data]);

  const trendUp = data.length > 1 ? data[data.length - 1].close >= data[0].close : true;
  const trendColor = trendUp ? UP : DOWN;
  const activeType = CHART_TYPES.find((t) => t.key === type) || CHART_TYPES[0];

  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
      <XAxis dataKey="date" tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false}
             axisLine={false} interval="preserveStartEnd" minTickGap={40} />
      <YAxis tick={{ fill: "#4B5563", fontSize: 10 }} tickLine={false} axisLine={false}
             domain={domain} width={52} tickFormatter={(v) => `${currency}${Number(v).toFixed(0)}`} />
      <Tooltip content={<OhlcTooltip symbol={symbol} curr={currency} />}
               cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
    </>
  );

  // Render the series/layer for the active chart type
  const renderSeries = () => {
    switch (type) {
      case "candlestick":
        return <><Line dataKey="close" stroke="transparent" dot={false} isAnimationActive={false} />
                 <Customized component={makeCandleLayer(data, false)} /></>;
      case "hollow":
        return <><Line dataKey="close" stroke="transparent" dot={false} isAnimationActive={false} />
                 <Customized component={makeCandleLayer(data, true)} /></>;
      case "bars":
        return <><Line dataKey="close" stroke="transparent" dot={false} isAnimationActive={false} />
                 <Customized component={makeBarLayer(data)} /></>;
      case "hlc":
        return (
          <>
            <defs>
              <linearGradient id="hlcBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={trendColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={trendColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey={(d) => [d.low, d.high]} stroke="none"
                  fill="url(#hlcBand)" isAnimationActive={false} />
            <Line type="monotone" dataKey="close" stroke={trendColor} strokeWidth={1.6} dot={false} isAnimationActive={false} />
          </>
        );
      case "line":
        return <Line type="monotone" dataKey="close" stroke={trendColor} strokeWidth={2} dot={false} isAnimationActive={false} />;
      case "markers":
        return <Line type="monotone" dataKey="close" stroke={trendColor} strokeWidth={2}
                     dot={{ r: 2, fill: trendColor }} activeDot={{ r: 4 }} isAnimationActive={false} />;
      case "step":
        return <Line type="stepAfter" dataKey="close" stroke={trendColor} strokeWidth={2} dot={false} isAnimationActive={false} />;
      case "area":
        return (
          <>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={trendColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="close" stroke={trendColor} strokeWidth={2} fill="url(#areaGrad)" isAnimationActive={false} />
          </>
        );
      case "baseline": {
        const baseVal = data.length ? data[0].close : 0;
        return (
          <>
            <defs>
              <linearGradient id="baseUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={UP} stopOpacity={0.25} />
                <stop offset="100%" stopColor={UP} stopOpacity={0} />
              </linearGradient>
            </defs>
            <ReferenceLine y={baseVal} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="close" stroke={trendColor} strokeWidth={2}
                  fill="url(#baseUp)" baseValue={baseVal} isAnimationActive={false} />
          </>
        );
      }
      case "columns":
        return <Bar dataKey="close" isAnimationActive={false}
                    shape={(p) => {
                      const d = p.payload; const col = d.close >= d.open ? UP : DOWN;
                      const w = Math.max(1.5, p.width * 0.6);
                      return <rect x={p.x + (p.width - w) / 2} y={p.y} width={w} height={p.height}
                                   fill={col} opacity={0.85} rx={1} />;
                    }} />;
      default:
        return <Line type="monotone" dataKey="close" stroke={trendColor} strokeWidth={2} dot={false} isAnimationActive={false} />;
    }
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        {/* Timeframe */}
        <div className="flex gap-1">
          {TFS.map((t) => (
            <button key={t} onClick={() => setTf(t)}
              className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
                tf === t ? accentCls.active : "border-transparent text-gray-600 hover:text-gray-400"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Chart-type dropdown */}
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-[#141C30] border border-white/10 text-gray-200 hover:border-white/20 ${accentCls.ring}`}>
            <activeType.icon className="w-3.5 h-3.5" />
            {activeType.label}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1.5 z-30 w-48 bg-[#0C1220] border border-white/10 rounded-xl shadow-2xl py-1 max-h-72 overflow-y-auto">
              {CHART_TYPES.map((t) => {
                const Icon = t.icon; const sel = t.key === type;
                return (
                  <button key={t.key} onClick={() => { setType(t.key); setMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors ${
                      sel ? "bg-white/5 text-white" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"}`}>
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1">{t.label}</span>
                    {sel && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Live status bar */}
      {!loading && (
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="relative flex w-2 h-2">
              {!paused && (
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
              )}
              <span className={`relative inline-flex w-2 h-2 rounded-full ${paused ? "bg-gray-500" : "bg-emerald-400"}`} />
            </span>
            <span className={`text-[11px] font-semibold ${paused ? "text-gray-500" : "text-emerald-400"}`}>
              {paused ? "PAUSED" : "LIVE"}
            </span>
            <span className="text-[11px] font-semibold text-white tabular-nums">{currency}{livePrice.toFixed(2)}</span>
            <span className="text-[10px] text-gray-600 truncate">· {activeType.label} · {tf}</span>
          </div>
          <button onClick={() => setPaused((v) => !v)}
            title={paused ? "Resume live updates" : "Pause live updates"}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg bg-[#141C30] border border-white/10 text-gray-400 hover:text-white hover:border-white/20 flex-shrink-0">
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      )}

      {/* Chart — scroll-wheel zooms the chart only (touchAction:none stops the
          browser page from zooming/scrolling). */}
      <div ref={chartRef} style={{ height, touchAction: "none", overscrollBehavior: "contain", position: "relative" }}>
        {zoom && zoom < series.length && (
          <button onClick={() => setZoom(null)}
            title="Reset zoom"
            className="absolute top-1 right-1 z-10 flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg bg-[#141C30]/90 border border-white/10 text-gray-300 hover:text-white hover:border-white/20">
            Reset zoom ({zoom})
          </button>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">No chart data available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {commonAxes}
              {renderSeries()}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
