/**
 * The chart's live edge used to be a random walk: a 2s timer moved the newest
 * candle by Math.random() and only re-anchored to the real price every 20s. The
 * "LIVE ₹…" figure on the chart therefore disagreed with the price in the header
 * beside it.
 *
 * These tests pin the replacement: the series moves only when a real quote says
 * so, and the newest close is always exactly that quote.
 *
 * Run:  npm test
 */

import { describe, it, expect } from "vitest";
import {
  applyTick, genSeries, segmentStops, baselineOffset, timeframeLabels, TIMEFRAMES,
  makeLivePriceMarker,
} from "./StockChart";

const UP = "#10B981";
const DOWN = "#EF4444";

const bar = (t, close) => ({
  t, date: "x", open: close, high: close, low: close, close, volume: 1000,
});

describe("applyTick", () => {
  it("moves the newest close to exactly the quoted price", () => {
    const prev = [bar(Date.now() - 60_000, 100), bar(Date.now(), 101)];
    const out  = applyTick(prev, 103.5, "1D");
    expect(out[out.length - 1].close).toBe(103.5);
  });

  it("never invents a price — the same quote twice produces the same array", () => {
    const prev = [bar(1, 100), bar(Date.now(), 101)];
    expect(applyTick(prev, 101, "1D")).toBe(prev);
  });

  it("stretches the forming candle's high and low around the new price", () => {
    const now  = Date.now();
    const prev = [bar(now - 60_000, 100), { ...bar(now, 101), high: 102, low: 100 }];

    const up = applyTick(prev, 105, "1D");
    expect(up[up.length - 1].high).toBe(105);
    expect(up[up.length - 1].low).toBe(100);

    const down = applyTick(prev, 98, "1D");
    expect(down[down.length - 1].low).toBe(98);
    expect(down[down.length - 1].high).toBe(102);
  });

  it("rolls a new candle once the display step has elapsed, opening at the last close", () => {
    const old  = Date.now() - 10_000;              // well past the 3s 1D step
    const prev = [bar(old - 1000, 99), bar(old, 101)];
    const out  = applyTick(prev, 104, "1D");

    expect(out).toHaveLength(prev.length);         // scrolls, doesn't grow
    const newest = out[out.length - 1];
    expect(newest.open).toBe(101);                 // continuous with the previous close
    expect(newest.close).toBe(104);
    expect(newest.high).toBe(104);
    expect(newest.low).toBe(101);
  });

  it("updates the current candle in place on higher timeframes", () => {
    // A 1W candle must not roll just because 10s of wall clock passed.
    const prev = [bar(1, 100), bar(Date.now() - 10_000, 101)];
    const out  = applyTick(prev, 106, "1W");
    expect(out).toHaveLength(2);
    expect(out[1].open).toBe(101);                 // same candle, not a new one
    expect(out[1].close).toBe(106);
  });

  it("ignores a missing, zero or negative price instead of drawing it", () => {
    const prev = [bar(1, 100), bar(Date.now(), 101)];
    expect(applyTick(prev, 0, "1D")).toBe(prev);
    expect(applyTick(prev, -5, "1D")).toBe(prev);
    expect(applyTick(prev, null, "1D")).toBe(prev);
    expect(applyTick(prev, undefined, "1D")).toBe(prev);
  });

  it("handles an empty series without throwing", () => {
    expect(applyTick([], 100, "1D")).toEqual([]);
  });
});

// ── Trend colouring ─────────────────────────────────────────────────────────

/** The colour the gradient is painting at a given fraction along the x-axis. */
const colorAt = (stops, offset) => {
  let current = stops[0].color;
  for (const s of stops) {
    if (s.offset > offset) break;
    current = s.color;
  }
  return current;
};

const closes = (...values) => values.map((close) => ({ close }));

describe("segmentStops", () => {
  it("paints a rising line green and a falling line red", () => {
    const rising = segmentStops(closes(10, 11, 12, 13));
    expect(new Set(rising.map((s) => s.color))).toEqual(new Set([UP]));

    const falling = segmentStops(closes(13, 12, 11, 10));
    expect(new Set(falling.map((s) => s.color))).toEqual(new Set([DOWN]));
  });

  it("colours each segment independently — the whole point of the fix", () => {
    // up, up, down, down across five points.
    const stops = segmentStops(closes(10, 11, 12, 11, 10));
    expect(colorAt(stops, 0.1)).toBe(UP);      // first segment rising
    expect(colorAt(stops, 0.4)).toBe(UP);      // second still rising
    expect(colorAt(stops, 0.6)).toBe(DOWN);    // turns over
    expect(colorAt(stops, 0.9)).toBe(DOWN);
  });

  it("spans the full width, so the gradient lines up with the plot", () => {
    const stops = segmentStops(closes(1, 2, 1, 2, 1));
    expect(stops[0].offset).toBe(0);
    expect(stops[stops.length - 1].offset).toBe(1);
  });

  it("merges runs instead of emitting two stops per point", () => {
    // 40 points all rising is ONE band, not 39.
    const stops = segmentStops(closes(...Array.from({ length: 40 }, (_, i) => i)));
    expect(stops).toHaveLength(2);
  });

  it("treats a flat segment as a rise, matching the candle rule", () => {
    // Candles use close >= open for green; a flat line must not flicker red.
    expect(segmentStops(closes(10, 10, 10)).every((s) => s.color === UP)).toBe(true);
  });

  it("does not throw on a series too short to have a segment", () => {
    expect(segmentStops(closes(10))).toHaveLength(2);
    expect(segmentStops([])).toHaveLength(2);
    expect(segmentStops(undefined)).toHaveLength(2);
  });

  it("can colour by a key other than close", () => {
    const rows = [{ v: 5 }, { v: 4 }];
    expect(segmentStops(rows, "v").every((s) => s.color === DOWN)).toBe(true);
  });
});

describe("baselineOffset", () => {
  it("puts the colour break where the baseline sits in the domain", () => {
    // Domain 0–100, baseline 75 → a quarter down from the top.
    expect(baselineOffset(75, [0, 100])).toBeCloseTo(0.25, 6);
    expect(baselineOffset(25, [0, 100])).toBeCloseTo(0.75, 6);
  });

  it("clamps a baseline that falls outside the visible range", () => {
    expect(baselineOffset(500, [0, 100])).toBe(0);
    expect(baselineOffset(-500, [0, 100])).toBe(1);
  });

  it("falls back to the middle rather than dividing by zero", () => {
    expect(baselineOffset(50, [50, 50])).toBe(0.5);
    expect(baselineOffset(50, ["auto", "auto"])).toBe(0.5);
  });
});

// ── Live price marker ───────────────────────────────────────────────────────

/** Minimal stand-ins for the scales recharts hands a <Customized> layer. */
function axisProps(bars, { width = 400, left = 0 } = {}) {
  const xScale = (d) => 10 + bars.findIndex((b) => b.date === d) * 20;
  xScale.bandwidth = () => 10;
  return {
    xAxisMap: { 0: { scale: xScale } },
    yAxisMap: { 0: { scale: (v) => 500 - Number(v) } },
    offset:   { left, width },
  };
}

/** Flatten a rendered element tree into a list of nodes. */
const nodes = (el) => {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    out.push(n);
    walk(n.props?.children);
  };
  walk(el);
  return out;
};

describe("live price marker", () => {
  const bars = [
    { date: "a", close: 100 }, { date: "b", close: 101 }, { date: "c", close: 102 },
  ];

  it("sits on the NEWEST bar, at the live price", () => {
    const Marker = makeLivePriceMarker(bars, 102.5, "#10B981", "₹");
    const found  = nodes(Marker(axisProps(bars))).filter((n) => n.type === "circle");

    // Last bar: x = 10 + 2*20 + bandwidth/2 = 55. y = 500 - 102.5.
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) {
      expect(c.props.cx).toBe(55);
      expect(c.props.cy).toBeCloseTo(397.5, 6);
    }
  });

  it("labels it with the live price", () => {
    const Marker = makeLivePriceMarker(bars, 14157, "#10B981", "₹");
    const text   = nodes(Marker(axisProps(bars, { width: 4000 }))).find((n) => n.type === "text");
    expect(text.props.children).toBe("₹14157.00");
  });

  it("puts the chip left of the dot, and flips only when there is no room", () => {
    const Marker = makeLivePriceMarker(bars, 102, "#10B981", "₹");

    // Plenty of room to the left of x=55? "₹102.00" is 7 chars -> 52 wide,
    // needing x-62 >= left. With left=0 that is -7, so it flips right.
    const tight = nodes(Marker(axisProps(bars, { left: 0 }))).find((n) => n.type === "rect");
    expect(tight.props.x).toBeGreaterThan(55);

    // Shift the plot left edge far negative and the chip fits on the left.
    const roomy = nodes(Marker(axisProps(bars, { left: -500 }))).find((n) => n.type === "rect");
    expect(roomy.props.x).toBeLessThan(55);
  });

  it("draws nothing rather than guessing when inputs are unusable", () => {
    const P = axisProps(bars);
    expect(makeLivePriceMarker([], 100, "#fff", "₹")(P)).toBeNull();
    expect(makeLivePriceMarker(bars, 0, "#fff", "₹")(P)).toBeNull();
    expect(makeLivePriceMarker(bars, 100, "#fff", "₹")({})).toBeNull();
  });

  it("never intercepts the cursor — hovering must still read the candle", () => {
    const Marker = makeLivePriceMarker(bars, 102, "#10B981", "₹");
    const g = Marker(axisProps(bars));
    expect(g.props.style.pointerEvents).toBe("none");
  });
});

// ── Timeframe x-axis integrity ──────────────────────────────────────────────

describe("timeframe labels", () => {
  /* `date` is the category key on the x-axis. Two bars sharing a label get
     stacked onto one x position by recharts, which is what drew 1M as a single
     flat line: 90 bars at 8-hour steps produced only 31 unique "M/D" labels.
     This is the guard that would have caught it. */
  it.each(TIMEFRAMES)("%s gives every bar its own x position", (tf) => {
    const labels = timeframeLabels(tf);
    const unique = new Set(labels).size;
    expect(unique).toBe(labels.length);
  });

  it("1M specifically — the timeframe that was broken", () => {
    const labels = timeframeLabels("1M");
    expect(labels.length).toBeGreaterThan(20);       // a month's worth of bars
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("is stable across the day boundary it is measured from", () => {
    // Same check anchored at a few different clock times, since the collapse
    // depended on where "now" fell within a day.
    for (const hour of [0, 6, 13, 23]) {
      const at = new Date(2026, 6, 17, hour, 30).getTime();
      for (const tf of TIMEFRAMES) {
        const labels = timeframeLabels(tf, at);
        expect(new Set(labels).size, `${tf} at ${hour}:30`).toBe(labels.length);
      }
    }
  });
});

describe("genSeries", () => {
  it("anchors the last close to the price it is given", () => {
    const s = genSeries("MARUTI", 14300, "1D");
    expect(s[s.length - 1].close).toBeCloseTo(14300, 2);
  });

  it("is deterministic per symbol+timeframe, so a reopen looks the same", () => {
    const a = genSeries("MARUTI", 14300, "1D").map((d) => d.close);
    const b = genSeries("MARUTI", 14300, "1D").map((d) => d.close);
    expect(a).toEqual(b);
  });
});
