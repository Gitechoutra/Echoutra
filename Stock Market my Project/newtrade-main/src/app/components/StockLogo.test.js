/**
 * The monogram rule, pinned. It is the one piece of StockLogo with real logic,
 * and it runs on every stock name in the app — including the messy ones that
 * exchange listings are full of.
 *
 * Run:  npm test
 */

import { describe, it, expect } from "vitest";
import { monogram, tonesFor } from "./StockLogo";

describe("monogram", () => {
  it("takes the first two letters of a single-word name", () => {
    expect(monogram("Reliance")).toBe("RE");
    expect(monogram("Infosys")).toBe("IN");
    expect(monogram("Titan")).toBe("TI");
  });

  it("takes one letter from each of the first two words", () => {
    expect(monogram("Tata Motors")).toBe("TM");
    expect(monogram("State Bank")).toBe("SB");
    expect(monogram("Asian Paints")).toBe("AP");
  });

  it("ignores everything after the second word", () => {
    expect(monogram("Maruti Suzuki India Limited")).toBe("MS");
    expect(monogram("State Bank of India")).toBe("SB");
  });

  it("skips punctuation that isn't a real word", () => {
    // "&" must not become an initial — "L&" would be nonsense on screen.
    expect(monogram("Larsen & Toubro")).toBe("LT");
    expect(monogram("Procter & Gamble")).toBe("PG");
  });

  it("handles abbreviations with full stops", () => {
    expect(monogram("Dr. Reddy's Laboratories")).toBe("DR");
  });

  it("always returns uppercase, whatever the input case", () => {
    expect(monogram("reliance")).toBe("RE");
    expect(monogram("tata motors")).toBe("TM");
    expect(monogram("HDFC Bank")).toBe("HB");
  });

  it("tolerates extra whitespace", () => {
    expect(monogram("  Tata   Motors  ")).toBe("TM");
    expect(monogram("  Reliance  ")).toBe("RE");
  });

  it("falls back to the ticker when there is no company name", () => {
    expect(monogram(null, "MARUTI")).toBe("MA");
    expect(monogram("", "LT")).toBe("LT");
    expect(monogram(undefined, "TITAN")).toBe("TI");
  });

  it("never renders empty — an unnamed row still gets a circle", () => {
    expect(monogram(null, null)).toBe("?");
    expect(monogram("", "")).toBe("?");
    expect(monogram("   ")).toBe("?");
    expect(monogram("&&&")).toBe("?");
  });

  it("copes with a one-letter name", () => {
    expect(monogram("L")).toBe("L");
  });
});

describe("tonesFor", () => {
  it("gives a stock the same colour every time", () => {
    expect(tonesFor("MARUTI")).toBe(tonesFor("MARUTI"));
  });

  it("spreads different stocks across the palette", () => {
    const tickers = ["MARUTI", "TITAN", "LT", "ASIANPAINT", "EICHERMOT",
                     "RELIANCE", "TCS", "INFY", "HDFCBANK", "ITC"];
    const used = new Set(tickers.map((t) => tonesFor(t).bg));
    expect(used.size).toBeGreaterThan(1);
  });

  it("does not throw on a missing key", () => {
    expect(tonesFor(null).bg).toBeTruthy();
    expect(tonesFor(undefined).bg).toBeTruthy();
  });
});
