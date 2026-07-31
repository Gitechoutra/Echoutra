/**
 * The live-quote overlay does money arithmetic — market value, unrealized P&L,
 * today's change — on every tick, for every holding on screen. A quiet bug here
 * shows a user the wrong profit, so the maths is pinned here rather than left to
 * be eyeballed in the browser.
 *
 * Run:  npm test
 */

import { describe, it, expect } from "vitest";
import {
  quoteFor, liveStock, liveHolding, liveStocks, liveHoldings, livePortfolio,
  positionPnl,
} from "./LiveQuotesContext";

/** Build the store the way the provider indexes it: by id AND by ticker. */
const store = (...quotes) => {
  const out = {};
  for (const q of quotes) {
    if (q.stock_id != null) out[`id:${q.stock_id}`] = q;
    if (q.ticker_symbol) out[`sym:${q.ticker_symbol.toUpperCase()}`] = q;
  }
  return out;
};

const MARUTI = {
  stock_id: 31, ticker_symbol: "MARUTI", current_price: 14300,
  previous_close: 14188, price_change: 112, price_change_percent: 0.79,
  day_high: 14348, day_low: 14124, volume: 317296,
};

// ── Lookup ──────────────────────────────────────────────────────────────────

describe("quoteFor", () => {
  const q = store(MARUTI);

  it("finds a quote by id, by symbol, and by a row carrying either", () => {
    expect(quoteFor(q, 31)).toBe(MARUTI);
    expect(quoteFor(q, "MARUTI")).toBe(MARUTI);
    expect(quoteFor(q, { stock_id: 31 })).toBe(MARUTI);
    expect(quoteFor(q, { ticker_symbol: "MARUTI" })).toBe(MARUTI);
    expect(quoteFor(q, { symbol: "MARUTI" })).toBe(MARUTI);
  });

  it("is case-insensitive on the symbol", () => {
    expect(quoteFor(q, "maruti")).toBe(MARUTI);
  });

  it("prefers stock_id when a row carries a mismatched symbol", () => {
    // Admin rows merge two sources; the id is the reliable one.
    expect(quoteFor(q, { stock_id: 31, ticker_symbol: "STALE" })).toBe(MARUTI);
  });

  it("returns null rather than throwing on unknown or empty input", () => {
    expect(quoteFor(q, "NOSUCH")).toBeNull();
    expect(quoteFor(q, null)).toBeNull();
    expect(quoteFor(null, 31)).toBeNull();
  });
});

// ── Stock overlay ───────────────────────────────────────────────────────────

describe("liveStock", () => {
  it("overlays price fields and leaves everything else alone", () => {
    const row = {
      stock_id: 31, ticker_symbol: "MARUTI", company_name: "Maruti Suzuki",
      sector: "Automobile", logo_url: "x.png", current_price: 14222,
      price_change_percent: 0.24,
    };
    const out = liveStock(row, store(MARUTI));

    expect(out.current_price).toBe(14300);
    expect(out.price_change_percent).toBe(0.79);
    expect(out.company_name).toBe("Maruti Suzuki");
    expect(out.sector).toBe("Automobile");
    expect(out.logo_url).toBe("x.png");
  });

  it("returns the SAME object when there is no quote, so React can skip the render", () => {
    const row = { stock_id: 99, current_price: 10 };
    expect(liveStock(row, store(MARUTI))).toBe(row);
  });

  it("does not blank a price out when the quote has none", () => {
    const row = { stock_id: 31, current_price: 14222 };
    const noPrice = store({ stock_id: 31, ticker_symbol: "MARUTI", current_price: null });
    expect(liveStock(row, noPrice)).toBe(row);
  });
});

// ── Holding overlay — the money ─────────────────────────────────────────────

describe("liveHolding", () => {
  // 10 shares bought at ₹13,591 → ₹135,910 invested. Price now ₹14,300.
  const holding = {
    stock_id: 31, ticker_symbol: "MARUTI", quantity: 10,
    average_buy_price: 13591, total_invested: 135910,
    current_price: 14222, current_value: 142220, unrealized_pnl: 6310,
  };

  it("revalues market value and unrealized P&L at the live price", () => {
    const out = liveHolding(holding, store(MARUTI));
    expect(out.current_value).toBe(143000);                    // 10 × 14300
    expect(out.unrealized_pnl).toBe(143000 - 135910);          // 7090
    expect(out.unrealized_pnl_percent).toBeCloseTo((7090 / 135910) * 100, 6);
  });

  it("computes today's change from the previous close, not from cost", () => {
    const out = liveHolding(holding, store(MARUTI));
    expect(out.day_change).toBeCloseTo((14300 - 14188) * 10, 6);   // 1120
    expect(out.day_change_percent).toBeCloseTo(0.7894, 3);
  });

  it("falls back to avg_buy_price × qty when total_invested is missing", () => {
    const { total_invested, ...noCost } = holding;
    const out = liveHolding(noCost, store(MARUTI));
    expect(out.unrealized_pnl).toBe(143000 - 13591 * 10);
  });

  it("does not divide by zero on a position with no cost basis", () => {
    const free = { stock_id: 31, quantity: 5, total_invested: 0 };
    const out = liveHolding(free, store(MARUTI));
    expect(out.unrealized_pnl_percent).toBe(0);
    expect(Number.isFinite(out.unrealized_pnl)).toBe(true);
  });

  it("treats a missing previous_close as flat rather than as a crash from zero", () => {
    const noPrev = store({ ...MARUTI, previous_close: null });
    const out = liveHolding(holding, noPrev);
    expect(out.day_change).toBe(0);
    expect(out.day_change_percent).toBe(0);
  });

  it("leaves the row untouched when the stock has no quote", () => {
    const row = { stock_id: 99, quantity: 1, current_value: 500 };
    expect(liveHolding(row, store(MARUTI))).toBe(row);
  });
});

// ── Short positions ─────────────────────────────────────────────────────────

describe("short positions", () => {
  // Sold 10 MARUTI short at ₹14,500. Price is now ₹14,300 → the short is up.
  const shortRow = {
    stock_id: 31, ticker_symbol: "MARUTI", position_side: "SHORT",
    quantity: 10, average_buy_price: 14500, total_invested: 145000,
  };

  it("mirrors the server's sign convention", () => {
    // Must match position_pnl() in portal/helpers/order_engine.py exactly.
    expect(positionPnl("SHORT", 100, 80, 10)).toBe(200);    // price fell → profit
    expect(positionPnl("SHORT", 100, 120, 10)).toBe(-200);  // price rose → loss
    expect(positionPnl("LONG", 100, 120, 10)).toBe(200);
    expect(positionPnl("LONG", 100, 80, 10)).toBe(-200);
  });

  it("profits when the price falls below the entry", () => {
    const out = liveHolding(shortRow, store(MARUTI));       // MARUTI now 14,300
    expect(out.unrealized_pnl).toBe((14500 - 14300) * 10);  // +2,000
    expect(out.unrealized_pnl_percent).toBeCloseTo(((14500 - 14300) / 14500) * 100, 6);
  });

  it("loses when the price rises above the entry", () => {
    const risen = store({ ...MARUTI, current_price: 14800 });
    const out = liveHolding(shortRow, risen);
    expect(out.unrealized_pnl).toBe((14500 - 14800) * 10);  // −3,000
    expect(out.unrealized_pnl).toBeLessThan(0);
  });

  it("reports current_value as the cost to buy back", () => {
    const out = liveHolding(shortRow, store(MARUTI));
    expect(out.current_value).toBe(10 * 14300);
  });

  it("treats a falling day as a gain in today's change", () => {
    // previous_close 14,188 → price 14,300 is a RISE, which hurts a short.
    const out = liveHolding(shortRow, store(MARUTI));
    expect(out.day_change).toBe((14188 - 14300) * 10);
    expect(out.day_change).toBeLessThan(0);
  });

  it("also reads the is_short flag the API sends", () => {
    const viaFlag = liveHolding(
      { ...shortRow, position_side: undefined, is_short: true }, store(MARUTI));
    expect(viaFlag.unrealized_pnl).toBe((14500 - 14300) * 10);
  });

  it("is not applied to an ordinary long row", () => {
    const long = { stock_id: 31, quantity: 10, average_buy_price: 14500, total_invested: 145000 };
    const out = liveHolding(long, store(MARUTI));
    expect(out.unrealized_pnl).toBe(10 * 14300 - 145000);   // −2,000, the mirror
  });
});

// ── Portfolio roll-up ───────────────────────────────────────────────────────

describe("livePortfolio", () => {
  const RELIANCE = {
    stock_id: 18, ticker_symbol: "RELIANCE", current_price: 1300,
    previous_close: 1292.9,
  };
  const quotes = store(MARUTI, RELIANCE);

  const rows = liveHoldings([
    { stock_id: 31, quantity: 10, total_invested: 135910 },
    { stock_id: 18, quantity: 100, total_invested: 129000 },
  ], quotes);

  it("sums value and invested across holdings", () => {
    const p = livePortfolio({ portfolio_id: 1 }, rows);
    expect(p.current_value).toBe(143000 + 130000);
    expect(p.total_invested).toBe(135910 + 129000);
  });

  it("derives return the way the server does (value − invested)", () => {
    const p = livePortfolio({ portfolio_id: 1 }, rows);
    expect(p.total_return).toBe(p.current_value - p.total_invested);
    expect(p.unrealized_pnl).toBe(p.total_return);
    expect(p.total_return_percent)
      .toBeCloseTo((p.total_return / p.total_invested) * 100, 6);
  });

  it("derives today's change against yesterday's value of the same holdings", () => {
    const p = livePortfolio({ portfolio_id: 1 }, rows);
    const expected = (14300 - 14188) * 10 + (1300 - 1292.9) * 100;
    expect(p.day_change).toBeCloseTo(expected, 6);
    const prevValue = 14188 * 10 + 1292.9 * 100;
    expect(p.day_change_percent).toBeCloseTo((expected / prevValue) * 100, 6);
  });

  it("excludes closed positions from the totals", () => {
    const withClosed = liveHoldings([
      { stock_id: 31, quantity: 10, total_invested: 135910 },
      { stock_id: 18, quantity: 100, total_invested: 129000, is_active: false },
    ], quotes);
    const p = livePortfolio({ portfolio_id: 1 }, withClosed);
    expect(p.current_value).toBe(143000);
    expect(p.total_holdings_count).toBe(1);
  });

  it("counts only a short's P&L, never its notional", () => {
    // The collateral for a short sits in the wallet's locked_balance, which is
    // already inside wallet.balance. Adding the notional here would count the
    // same money twice.
    const withShort = liveHoldings([
      { stock_id: 31, quantity: 10, average_buy_price: 14500,
        total_invested: 145000, position_side: "SHORT" },
    ], quotes);
    const p = livePortfolio({ portfolio_id: 1 }, withShort);

    expect(p.current_value).toBe((14500 - 14300) * 10);   // the P&L, not 143,000
    expect(p.total_invested).toBe(0);                     // no capital deployed
  });

  it("leaves the server's figures alone when there are no holdings to roll up", () => {
    const server = { portfolio_id: 1, current_value: 999, total_return: 5 };
    expect(livePortfolio(server, [])).toBe(server);
    expect(livePortfolio(server, [{ is_active: false }])).toBe(server);
  });
});

// ── List helpers ────────────────────────────────────────────────────────────

describe("list helpers", () => {
  it("map over rows and pass empty/absent lists straight through", () => {
    expect(liveStocks([], {})).toEqual([]);
    expect(liveStocks(undefined, {})).toBeUndefined();
    expect(liveHoldings(null, {})).toBeNull();

    const out = liveStocks([{ stock_id: 31 }, { stock_id: 99 }], store(MARUTI));
    expect(out[0].current_price).toBe(14300);
    expect(out[1].current_price).toBeUndefined();
  });
});
