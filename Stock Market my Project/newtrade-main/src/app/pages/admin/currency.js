/**
 * currency.js
 * ─────────────────────────────────────────────────────────────────────────
 * Shared currency formatting helper used across Admin pages
 * (AdminAnalytics.jsx, AdminUsers.jsx, AdminUserDetail.jsx).
 *
 * The backend defaults all financial models (Wallets, Transactions,
 * UserSubscriptions, SubscriptionPlans, PlatformRevenue, UserProfiles)
 * to currency = 'INR'. Some stocks/portfolios may carry 'USD' or other
 * currencies. This helper renders the correct symbol and locale-aware
 * formatting for whichever currency code is passed in.
 */

const CURRENCY_SYMBOLS = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
};

const CURRENCY_LOCALE = {
  INR: "en-IN",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  JPY: "ja-JP",
  AUD: "en-AU",
  CAD: "en-CA",
};

/**
 * formatCurrency(value, currency, options)
 *
 * @param {number|string|null|undefined} value     - numeric amount
 * @param {string} currency                        - e.g. "INR", "USD" (defaults to "INR")
 * @param {object} options
 *   - compact: boolean            → use K/L/Cr (INR) or K/M/B (other) abbreviations
 *   - minimumFractionDigits: number (default 2)
 *   - maximumFractionDigits: number (default 2)
 *
 * @returns {string} formatted currency string, e.g. "₹1,23,456.78" or "$1,234.56"
 */
export function formatCurrency(value, currency = "INR", options = {}) {
  let {
    compact = false,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  const curr = (currency || "INR").toUpperCase();
  const sym  = CURRENCY_SYMBOLS[curr] || curr + " ";
  const locale = CURRENCY_LOCALE[curr] || "en-IN";

  const num = Number(value);
  const safeNum = isNaN(num) ? 0 : num;

  if (compact) {
    return `${sym}${formatCompactNumber(safeNum, curr)}`;
  }

  /*
    FIX — RangeError: maximumFractionDigits value is out of range.
    toLocaleString requires 0 <= minimumFractionDigits <= maximumFractionDigits <= 100.
    Callers sometimes pass only `{ maximumFractionDigits: 0 }` (e.g. for whole-number
    portfolio values), leaving minimumFractionDigits at its default of 2 — which is
    greater than maximumFractionDigits(0) and throws. Clamp/reconcile here so any
    combination of options passed by callers is always safe.
  */
  maximumFractionDigits = Math.min(100, Math.max(0, Number(maximumFractionDigits) || 0));
  minimumFractionDigits = Math.min(100, Math.max(0, Number(minimumFractionDigits) || 0));
  if (minimumFractionDigits > maximumFractionDigits) {
    minimumFractionDigits = maximumFractionDigits;
  }

  const formatted = safeNum.toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return `${sym}${formatted}`;
}

/**
 * formatCompactNumber — abbreviates large numbers.
 * INR uses Indian numbering (K, L = Lakh, Cr = Crore).
 * Other currencies use K, M, B, T.
 */
function formatCompactNumber(num, currency) {
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (currency === "INR") {
    if (abs >= 1e7)  return `${sign}${(abs / 1e7).toFixed(2)}Cr`;  // Crore
    if (abs >= 1e5)  return `${sign}${(abs / 1e5).toFixed(2)}L`;   // Lakh
    if (abs >= 1e3)  return `${sign}${(abs / 1e3).toFixed(2)}K`;
    return `${sign}${abs.toFixed(2)}`;
  }

  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${sign}${(abs / 1e3).toFixed(2)}K`;
  return `${sign}${abs.toFixed(2)}`;
}

/**
 * currSym(currency) — just the symbol, e.g. "₹" or "$"
 */
export function currSym(currency = "INR") {
  return CURRENCY_SYMBOLS[(currency || "INR").toUpperCase()] || (currency + " ");
}

export default formatCurrency;