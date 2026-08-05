import { useState, useEffect, useId, useMemo, useRef } from "react";
import {
  ComposedChart, Line, Area, Bar, Customized,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  CandlestickChart, LineChart as LineIcon, AreaChart as AreaIcon,
  BarChart3, Activity, TrendingUp, ChevronDown, Check, Pause, Play,
} from "lucide-react";

import { useLiveQuote } from "../context/LiveQuotesContext";

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
//
// INVARIANT: points × stepMs must produce a UNIQUE label under `fmt` for every
// bar. `date` is the category key on the x-axis, so two bars sharing a label are
// stacked onto one x position by recharts. 1M used to be 90 bars at 8-hour steps
// against a "M/D" label — three bars a day collapsing onto 31 positions, which
// is what drew it as a single flat line. A "date" timeframe therefore needs a
// step of a whole day or more. `timeframeLabels` in the tests pins this.
const TF_CFG = {
  "1D": { points: 78,  stepMs: 5 * 60e3,          fmt: "time",  vol: 0.006 },
  "1W": { points: 84,  stepMs: 2 * 3600e3,        fmt: "dt",    vol: 0.012 },
  "1M": { points: 30,  stepMs: 24 * 3600e3,       fmt: "date",  vol: 0.02  },
  "3M": { points: 90,  stepMs: 24 * 3600e3,       fmt: "date",  vol: 0.025 },
  "6M": { points: 90,  stepMs: 2 * 24 * 3600e3,   fmt: "date",  vol: 0.03  },
  "1Y": { points: 120, stepMs: 3 * 24 * 3600e3,   fmt: "date",  vol: 0.035 },
};

/** Every x-axis label a timeframe would generate — exported so a test can assert
 *  the uniqueness invariant above rather than leaving it to be noticed on screen. */
export function timeframeLabels(tf, now = Date.now()) {
  const cfg = TF_CFG[tf] || TF_CFG["1D"];
  return Array.from({ length: cfg.points },
    (_, i) => fmtLabel(now - (cfg.points - 1 - i) * cfg.stepMs, cfg.fmt));
}

export const TIMEFRAMES = TFS;

// ── Where the live price comes from ─────────────────────────────────────────────
// The chart advances when a real quote arrives from the shared LiveQuotesProvider
// — nothing here invents a price.
//
// It used to run a 2s timer that moved the newest candle by `Math.random()`, and
// only re-anchored to the real backend price every 20s. That is why the "LIVE"
// figure on the chart disagreed with the price in the header beside it: the
// chart was showing a random walk, and the header was showing the market. Any
// attempt to sync the rest of the app *to the chart* would have spread invented
// prices into portfolio P&L and order totals.
//
// The trade-off is honest but visible: the chart now steps once per quote
// (~10s while trading) instead of gliding every 2s.

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

/**
 * Fold one REAL quote into the series.
 *
 * On 1D, once enough wall-clock has passed a new candle rolls in (opening at the
 * previous close, so the series stays continuous) and the chart scrolls left with
 * true, advancing timestamps. Otherwise the forming candle absorbs the price:
 * close moves to it, high/low stretch to include it.
 *
 * Returns the SAME array when the price hasn't moved, so an unchanged quote
 * costs no re-render.
 */
export function applyTick(prev, price, tf) {
  const px = Number(price);
  if (!prev.length || !(px > 0)) return prev;

  const cfg      = TF_CFG[tf] || TF_CFG["1D"];
  const intraday = cfg.fmt === "time";
  const now      = Date.now();
  const last     = prev[prev.length - 1];
  const close    = +px.toFixed(2);

  if (intraday && now - last.t >= (DISPLAY_STEP_MS[tf] || 3000)) {
    const open = last.close;
    return [...prev.slice(1), {
      t: now, date: fmtLabel(now, cfg.fmt),
      open,
      high:   +Math.max(open, close).toFixed(2),
      low:    +Math.min(open, close).toFixed(2),
      close,
      volume: last.volume,
    }];
  }

  if (close === last.close) return prev;

  return [...prev.slice(0, -1), {
    ...last,
    t: now,
    // The forming candle's LABEL is left alone. On an intraday chart it is
    // rewritten above when a new candle rolls; on a daily one, rewriting it
    // could hand this bar the same label as its neighbour and collapse the two
    // onto one x position.
    close,
    high: +Math.max(last.high, close).toFixed(2),
    low:  +Math.min(last.low,  close).toFixed(2),
  }];
}

// ── Trend colouring ─────────────────────────────────────────────────────────────
/**
 * Gradient stops that colour a line green where it rises and red where it falls.
 *
 * Candlesticks get this for free — each candle is drawn individually and knows
 * its own open and close. A <Line> is a single SVG path, so the only way to give
 * it more than one colour is to paint it with a gradient whose stops line up
 * with the data points. Each segment i→i+1 becomes a flat band of colour, and
 * runs of the same direction are merged into one band so a 78-point series
 * doesn't emit 156 stops.
 *
 * Offsets are fractions of the x-range; the caller renders them as percentages
 * in a horizontal <linearGradient>, whose object bounding box spans exactly the
 * first-to-last point — the same span the offsets are computed against.
 */
export function segmentStops(data, key = "close") {
  const n = data?.length || 0;
  if (n < 2) return [{ offset: 0, color: UP }, { offset: 1, color: UP }];

  const stops = [];
  let runColor = null;
  let runStart = 0;

  for (let i = 0; i < n - 1; i++) {
    const color = Number(data[i + 1][key]) >= Number(data[i][key]) ? UP : DOWN;
    if (color !== runColor) {
      if (runColor !== null) {
        stops.push({ offset: runStart / (n - 1), color: runColor });
        stops.push({ offset: i / (n - 1), color: runColor });
      }
      runColor = color;
      runStart = i;
    }
  }
  stops.push({ offset: runStart / (n - 1), color: runColor });
  stops.push({ offset: 1, color: runColor });
  return stops;
}

/** Horizontal gradient painting each rising stretch green and each falling one red. */
function SegmentGradient({ id, stops, opacity = 1 }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      {stops.map((s, i) => (
        <stop key={i} offset={`${(s.offset * 100).toFixed(3)}%`}
              stopColor={s.color} stopOpacity={opacity} />
      ))}
    </linearGradient>
  );
}

/**
 * Where a baseline sits inside the y-domain, as a 0–1 fraction from the TOP
 * (SVG's y axis points down). A baseline chart is green above that line and red
 * below it, so the fill gradient needs a hard colour change at exactly that
 * height.
 */
export function baselineOffset(baseValue, [lo, hi]) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return 0.5;
  const clamped = Math.min(Math.max(Number(baseValue), lo), hi);
  return (hi - clamped) / (hi - lo);
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

// ── Live price marker, pinned to the newest candle ─────────────────────────────
/**
 * A pulsing dot at the latest bar with the price beside it.
 *
 * Replaces a full-width dashed line: that stretched a rule across the middle of
 * the plot and dropped its label on top of the candles, which read as clutter
 * rather than information. Anchoring to the last bar puts the number where the
 * price actually is, and it moves with the candle as new quotes arrive.
 */
export function makeLivePriceMarker(data, price, color, currency) {
  return function LivePriceMarker(props) {
    const { xAxisMap, yAxisMap, offset } = props;
    if (!xAxisMap || !yAxisMap || !data.length || !(price > 0)) return null;

    const yScale = yAxisMap[Object.keys(yAxisMap)[0]].scale;
    const { centre } = xGeom(xAxisMap, data, offset);
    const x = centre(data[data.length - 1]);
    const y = yScale(price);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const label = `${currency}${Number(price).toFixed(2)}`;
    const w     = label.length * 6 + 10;
    const left  = offset?.left || 0;
    // The newest bar sits at the right edge, so the chip normally goes to its
    // left; it flips only if there isn't room, which happens when zoomed in far.
    const flip  = x - w - 10 < left;
    const chipX = flip ? x + 10 : x - w - 10;

    return (
      <g style={{ pointerEvents: "none" }}>
        <circle cx={x} cy={y} r={8} fill={color} opacity={0.18}>
          <animate attributeName="r" values="6;11;6" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.28;0.05;0.28" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx={x} cy={y} r={3.5} fill={color} stroke="#0B1120" strokeWidth={1} />
        {/* Solid chip so the price stays legible over the candles behind it. */}
        <rect x={chipX} y={y - 9} width={w} height={18} rx={4}
              fill="#0B1120" stroke={color} strokeOpacity={0.5} />
        <text x={chipX + w / 2} y={y + 4} textAnchor="middle"
              fill={color} fontSize={10} fontWeight={700}>
          {label}
        </text>
      </g>
    );
  };
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
/**
 * Always-on OHLC readout, in the style of a trading terminal legend.
 *
 * Default state shows the stock's REAL session OHLC from the live quote (open,
 * day high, day low, last price) and updates on every tick — the user should
 * never have to hover a candle to read the numbers they are trading on. Hovering
 * swaps in that candle's values and says so, so the two can't be confused.
 */
function OhlcLegend({ quote, hovered, currency, previousClose, livePrice, dayUp }) {
  const n = (v) => (v === null || v === undefined ? null : Number(v));

  const live = {
    o: n(quote?.open_price),
    h: n(quote?.day_high),
    l: n(quote?.day_low),
    c: n(quote?.current_price),
  };
  const shown = hovered
    ? { o: n(hovered.open), h: n(hovered.high), l: n(hovered.low), c: n(hovered.close) }
    : live;

  // Change is measured against the previous close on the live readout, and
  // against the candle's own open when inspecting a single candle.
  const base   = hovered ? shown.o : n(previousClose);
  const change = shown.c != null && base != null ? shown.c - base : null;
  const pct    = change != null && base ? (change / base) * 100 : null;
  const up     = (change ?? 0) >= 0;

  const fmt = (v) =>
    v == null ? "—" : `${currency}${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums">
      {[["O", shown.o], ["H", shown.h], ["L", shown.l], ["C", shown.c]].map(([label, v]) => (
        <span key={label} className="flex items-center gap-1">
          <span className="text-gray-600">{label}</span>
          <span className={`font-medium ${label === "C" ? (up ? "text-emerald-400" : "text-red-400") : "text-gray-200"}`}>
            {fmt(v)}
          </span>
        </span>
      ))}
      {change != null && (
        <span className={`font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>
          {up ? "+" : ""}{change.toFixed(2)}
          {pct != null && ` (${up ? "+" : ""}${pct.toFixed(2)}%)`}
        </span>
      )}
      <span className="text-[10px] text-gray-600">
        {hovered ? `· ${hovered.date} (candle)` : "· today"}
      </span>

      {/* While the cursor is inspecting a historical candle the O/H/L/C above
          belong to THAT candle, so the live price is pinned here as well — it
          must never be the thing the user loses by hovering. */}
      {hovered && livePrice > 0 && (
        <span className="flex items-center gap-1 ml-auto pl-2 border-l border-white/10">
          <span className="text-gray-600">LIVE</span>
          <span className={`font-semibold ${dayUp ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(livePrice)}
          </span>
        </span>
      )}
    </div>
  );
}

export function StockChart({ stockId, symbol, currentPrice, currency = "₹", accent = "cyan", height = 260 }) {
  const [type,     setType]    = useState("candlestick");
  const [tf,       setTf]      = useState("1D");
  const [series,   setSeries]  = useState([]);
  const [loading,  setLoading] = useState(true);
  const [paused,   setPaused]  = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoom,     setZoom]    = useState(null);   // visible bar count; null = fit all
  const [hovered,  setHovered] = useState(null);   // candle under the cursor, or null
  const menuRef  = useRef(null);
  const chartRef = useRef(null);

  const accentCls = accent === "violet"
    ? { active: "bg-violet-500/20 text-violet-300 border-violet-500/25", ring: "focus:border-violet-500/30" }
    : { active: "bg-cyan-500/20 text-cyan-400 border-cyan-500/25",       ring: "focus:border-cyan-500/30" };

  // The live price, from the same shared poll every other price on screen uses.
  // Falls back to the `currentPrice` prop until the first quote lands.
  const quote     = useLiveQuote(stockId ?? symbol);
  const livePrice = Number(quote?.current_price ?? currentPrice) || 0;

  // (Re)build the series whenever the stock or timeframe changes.
  // NOTE: the *history* here is still generated (see genSeries) — only the live
  // edge of the chart is real. Wiring the history to /stocks/<id>/price_history
  // is a separate change.
  //
  // `hasAnchor` is in the deps but `livePrice` is not, deliberately. Keying on
  // the price itself would rebuild the whole series on every tick and throw away
  // the candles the chart has accumulated; omitting it entirely would leave a
  // chart that mounted before the first quote landed anchored to nothing. The
  // boolean flips false→true exactly once, rebuilding at the real price.
  const hasAnchor = livePrice > 0;
  useEffect(() => {
    setLoading(true);
    setSeries(genSeries(symbol, livePrice, tf));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, hasAnchor]);

  // Live engine: one real quote in, one candle update out.
  useEffect(() => {
    if (loading || paused || !(livePrice > 0)) return;
    setSeries((prev) => applyTick(prev, livePrice, tf));
  }, [livePrice, loading, paused, tf]);

  // Close the type menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  // While streaming, this is the market price — the exact number the header, the
  // order panel and the portfolio are showing. Paused, it's the frozen candle.
  const shownPrice = paused
    ? (series.length ? series[series.length - 1].close : livePrice)
    : livePrice;

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

  // Per-segment colouring for every line-shaped chart type. Recomputed whenever
  // the data changes, so a new quote recolours the chart in step with the price.
  const stops = useMemo(() => segmentStops(data, "close"), [data]);

  // Gradient ids must be unique per chart instance. They used to be the fixed
  // strings "areaGrad"/"hlcBand"/"baseUp", so two charts on one page (the admin
  // stock table opens one in a modal over another) collided in the DOM and the
  // second silently painted itself with the first one's colours.
  const uid      = useId().replace(/:/g, "");
  const strokeId = `${uid}-stroke`;
  const fillId   = `${uid}-fill`;

  // The baseline is the previous close when we know it — "am I up or down on the
  // day?" — falling back to the first visible point.
  const baselineValue = Number(quote?.previous_close) > 0
    ? Number(quote.previous_close)
    : (data.length ? data[0].close : 0);

  // Direction on the DAY (vs previous close), not across the visible window —
  // this is what the price beside the header shows, and the two must agree.
  const dayUp = Number(quote?.price_change_percent ?? 0) >= 0;

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
              <SegmentGradient id={strokeId} stops={stops} />
              <SegmentGradient id={fillId}   stops={stops} opacity={0.16} />
            </defs>
            <Area type="monotone" dataKey={(d) => [d.low, d.high]} stroke="none"
                  fill={`url(#${fillId})`} isAnimationActive={false} />
            <Line type="monotone" dataKey="close" stroke={`url(#${strokeId})`}
                  strokeWidth={1.6} dot={false} isAnimationActive={false} />
          </>
        );
      case "line":
        return (
          <>
            <defs><SegmentGradient id={strokeId} stops={stops} /></defs>
            <Line type="monotone" dataKey="close" stroke={`url(#${strokeId})`}
                  strokeWidth={2} dot={false} isAnimationActive={false} />
          </>
        );
      case "markers":
        return (
          <>
            <defs><SegmentGradient id={strokeId} stops={stops} /></defs>
            <Line type="monotone" dataKey="close" stroke={`url(#${strokeId})`} strokeWidth={2}
                  isAnimationActive={false}
                  activeDot={{ r: 4 }}
                  /* Each marker takes the colour of the move that reached it. */
                  dot={({ cx, cy, index }) => {
                    const prev = data[index - 1];
                    const col  = !prev || data[index].close >= prev.close ? UP : DOWN;
                    return <circle key={index} cx={cx} cy={cy} r={2} fill={col} />;
                  }} />
          </>
        );
      case "step":
        return (
          <>
            <defs><SegmentGradient id={strokeId} stops={stops} /></defs>
            <Line type="stepAfter" dataKey="close" stroke={`url(#${strokeId})`}
                  strokeWidth={2} dot={false} isAnimationActive={false} />
          </>
        );
      case "area":
        return (
          <>
            <defs>
              <SegmentGradient id={strokeId} stops={stops} />
              <SegmentGradient id={fillId}   stops={stops} opacity={0.18} />
            </defs>
            <Area type="monotone" dataKey="close" stroke={`url(#${strokeId})`} strokeWidth={2}
                  fill={`url(#${fillId})`} isAnimationActive={false} />
          </>
        );
      case "baseline": {
        // A baseline chart answers a different question: not "did this segment
        // rise?" but "are we above or below where we started?". Green above the
        // line, red below it, with the colour break at the baseline's own height.
        const baseVal = baselineValue;
        const cut     = baselineOffset(baseVal, domain);
        return (
          <>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"                stopColor={UP}   stopOpacity={0.28} />
                <stop offset={`${cut * 100}%`}   stopColor={UP}   stopOpacity={0.05} />
                <stop offset={`${cut * 100}%`}   stopColor={DOWN} stopOpacity={0.05} />
                <stop offset="100%"              stopColor={DOWN} stopOpacity={0.28} />
              </linearGradient>
              <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"              stopColor={UP} />
                <stop offset={`${cut * 100}%`} stopColor={UP} />
                <stop offset={`${cut * 100}%`} stopColor={DOWN} />
                <stop offset="100%"            stopColor={DOWN} />
              </linearGradient>
            </defs>
            <ReferenceLine y={baseVal} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="close" stroke={`url(#${strokeId})`} strokeWidth={2}
                  fill={`url(#${fillId})`} baseValue={baseVal} isAnimationActive={false} />
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
        return (
          <>
            <defs><SegmentGradient id={strokeId} stops={stops} /></defs>
            <Line type="monotone" dataKey="close" stroke={`url(#${strokeId})`}
                  strokeWidth={2} dot={false} isAnimationActive={false} />
          </>
        );
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
            <span className="text-[11px] font-semibold text-white tabular-nums">{currency}{shownPrice.toFixed(2)}</span>
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

      {/* OHLC readout — always on screen, no hover required */}
      {!loading && (
        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-[#141C30]/60 border border-white/5">
          <OhlcLegend
            quote={quote}
            hovered={hovered}
            currency={currency}
            previousClose={quote?.previous_close}
            livePrice={livePrice}
            dayUp={dayUp}
          />
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
            {/* Hovering feeds the OHLC legend above; leaving snaps it back to
                the live session values. */}
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onMouseMove={(s) => setHovered(s?.activePayload?.[0]?.payload || null)}
              onMouseLeave={() => setHovered(null)}
            >
              {commonAxes}
              {renderSeries()}
              {/* Drawn last so it sits above the candles, and outside
                  renderSeries() so every chart type gets it. */}
              <Customized component={makeLivePriceMarker(data, livePrice, dayUp ? UP : DOWN, currency)} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
