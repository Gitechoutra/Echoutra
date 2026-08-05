/**
 * These helpers are called during render, so a broken one takes the whole page
 * down rather than degrading. That is not hypothetical: `fmtAxisINR` once
 * shipped referencing an `inr0` whose import had landed inside a block comment.
 * It was valid JavaScript, the build passed, and every chart threw a
 * ReferenceError the moment it rendered.
 *
 * A build check cannot catch that. Calling the function can.
 *
 * Run:  npm test
 */

import { describe, it, expect } from "vitest";
import { valueDomain, fmtAxisINR, showDots } from "./chart";

describe("fmtAxisINR", () => {
  it("actually runs — every dependency it needs is really imported", () => {
    expect(() => fmtAxisINR(48000)).not.toThrow();
  });

  it("writes axis ticks in full, never abbreviated", () => {
    expect(fmtAxisINR(48000)).toBe("₹48,000");
    expect(fmtAxisINR(150000)).toBe("₹1,50,000");
    expect(fmtAxisINR(2500000)).toBe("₹25,00,000");
    expect(fmtAxisINR(48000)).not.toMatch(/[kKLM]|Cr/);
  });

  it("survives the junk an axis hands it before data arrives", () => {
    for (const v of [0, null, undefined, NaN, "abc"]) {
      expect(() => fmtAxisINR(v)).not.toThrow();
    }
    expect(fmtAxisINR(0)).toBe("₹0");
  });
});

describe("valueDomain", () => {
  it("runs and pads a normal range", () => {
    const [lo, hi] = valueDomain([100, 200]);
    expect(lo).toBeLessThan(100);
    expect(hi).toBeGreaterThan(200);
  });

  it("gives a flat series a band instead of collapsing it", () => {
    const [lo, hi] = valueDomain([500, 500]);
    expect(hi).toBeGreaterThan(lo);
  });

  it("falls back rather than throwing on non-numeric bounds", () => {
    expect(valueDomain(["auto", "auto"])).toEqual([0, "auto"]);
  });
});

describe("showDots", () => {
  it("marks short series only", () => {
    expect(showDots([1, 2, 3])).toBe(true);
    expect(showDots(new Array(20))).toBe(false);
    expect(showDots(undefined)).toBe(true);
  });
});
