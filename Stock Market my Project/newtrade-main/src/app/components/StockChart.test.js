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
import { applyTick, genSeries, segmentStops, baselineOffset } from "./StockChart";

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
