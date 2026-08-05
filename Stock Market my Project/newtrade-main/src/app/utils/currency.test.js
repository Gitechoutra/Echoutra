/**
 * The two rules money formatting kept breaking: never abbreviate, and group the
 * Indian way. Both are easy to regress by reaching for `toLocaleString("en")`.
 *
 * Run:  npm test
 */

import { describe, it, expect } from "vitest";
import { inr, inr0, num } from "./currency";

describe("inr", () => {
  it("writes values in full — never K, L or Cr", () => {
    expect(inr0(54000)).toBe("₹54,000");
    expect(inr0(150000)).toBe("₹1,50,000");
    expect(inr0(2500000)).toBe("₹25,00,000");
    expect(inr0(20700)).toBe("₹20,700");

    for (const v of [54000, 150000, 2500000, 99999999]) {
      expect(inr0(v)).not.toMatch(/[KLM]|Cr/);
    }
  });

  it("groups the Indian way, not the Western way", () => {
    // The bug this replaces: toLocaleString("en") gives "1,234,567".
    expect(inr0(1234567)).toBe("₹12,34,567");
    expect(inr0(100000)).toBe("₹1,00,000");
    expect(inr0(999)).toBe("₹999");
  });

  it("keeps paise when asked and drops them when not", () => {
    expect(inr(1234.5)).toBe("₹1,234.50");
    expect(inr0(1234.5)).toBe("₹1,235");
    expect(inr(1234.567, { decimals: 2 })).toBe("₹1,234.57");
  });

  it("puts the minus before the symbol, not after it", () => {
    expect(inr0(-384)).toBe("-₹384");
    expect(inr(-1234.5)).toBe("-₹1,234.50");
  });

  it("adds an explicit + only when asked", () => {
    expect(inr0(1117, { signed: true })).toBe("+₹1,117");
    expect(inr0(-1117, { signed: true })).toBe("-₹1,117");
    expect(inr0(1117)).toBe("₹1,117");
    expect(inr0(0, { signed: true })).toBe("+₹0");
  });

  it("can drop the symbol for use inside a sentence", () => {
    expect(inr0(5000, { symbol: false })).toBe("5,000");
  });

  it("renders 0 rather than NaN for junk input", () => {
    expect(inr0(null)).toBe("₹0");
    expect(inr0(undefined)).toBe("₹0");
    expect(inr0("")).toBe("₹0");
    expect(inr0("abc")).toBe("₹0");
    expect(inr0(NaN)).toBe("₹0");
    expect(inr0(Infinity)).toBe("₹0");
  });

  it("accepts numeric strings, which is what the API sends", () => {
    expect(inr0("2500000")).toBe("₹25,00,000");
    expect(inr("1234.5")).toBe("₹1,234.50");
  });
});

describe("num", () => {
  it("groups quantities without a currency symbol", () => {
    expect(num(1234567)).toBe("12,34,567");
    expect(num(2.5, 2)).toBe("2.50");
    expect(num(null)).toBe("0");
  });
});
