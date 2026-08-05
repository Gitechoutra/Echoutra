import { inr0 } from "./currency";

/**
 * chart.js
 * ─────────────────────────────────────────────────────────────────────────
 * Shared helpers for the portfolio value charts (UserDashboard, UserPortfolio).
 */

/**
 * valueDomain — Y-axis domain for a money series.
 *
 * Recharts defaults a numeric axis to [0, dataMax]. For a portfolio worth
 * ₹30,759 whose value moves by a few rupees, that plots the line pinned flat
 * against the top of an otherwise empty chart — the movement is invisible
 * because it's ~0.01% of the axis. Zooming to the data range with padding makes
 * the real shape visible.
 *
 * This MUST be a function. Recharts' string form ("dataMin - 100") only accepts
 * a numeric literal — its parser is /dataMin[\s]*-[\s]*([0-9]+([.][0-9]+)?)$/ —
 * so an expression like "dataMin - dataMin * 0.02" silently fails to parse and
 * the axis falls back to starting at zero.
 *
 * Pass directly: <YAxis domain={valueDomain} />
 */
export const valueDomain = ([min, max]) => {
  const lo = Number(min);
  const hi = Number(max);
  if (!isFinite(lo) || !isFinite(hi)) return [0, "auto"];

  // One snapshot, or a perfectly flat stretch: give it a band so the point
  // sits mid-chart instead of on an edge.
  if (hi === lo) {
    const pad = Math.abs(hi) * 0.05 || 1;
    return [lo - pad, hi + pad];
  }

  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
};

/**
 * fmtAxisINR — rupee axis ticks, written out in full.
 *
 * These used to be abbreviated (₹1.2L, ₹34Cr). Axis labels are the reference a
 * user reads the whole chart against, so an abbreviation there quietly rounds
 * every point they infer from it. Full Indian grouping instead; the axis is
 * given the extra width it needs at the call sites.
 */
export const fmtAxisINR = (v) => inr0(v);

/**
 * Show point markers only on a short series — on a long one they turn the line
 * into a caterpillar, but a 1–2 point series has no visible line without them.
 */
export const showDots = (data) => (data?.length || 0) < 8;
