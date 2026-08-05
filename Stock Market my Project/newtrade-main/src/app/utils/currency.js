/**
 * Money formatting — one definition for the whole user portal.
 *
 * Two rules, both of which were being broken in different places:
 *
 *  1. NEVER abbreviate. "₹20.7K" and "₹1.5L" hide the actual figure behind a
 *     rounding the user cannot undo — on a trading screen the difference
 *     between ₹20,700 and ₹20,749 is real money. Values are written in full.
 *
 *  2. Indian grouping (2,2,3), not Western (3,3,3). `toLocaleString("en", …)`
 *     produces "1,234,567"; the same number in India reads "12,34,567". The
 *     locale has to be "en-IN" explicitly — "en" alone silently groups the
 *     Western way.
 */

const LOCALE = "en-IN";

/**
 * `₹12,34,567.89`
 *
 * @param {number|string} value
 * @param {number}  decimals  fixed decimal places (2 for prices, 0 for totals)
 * @param {boolean} signed    prefix an explicit + on positives
 * @param {boolean} symbol    include the ₹
 */
export function inr(value, { decimals = 2, signed = false, symbol = true } = {}) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const sign = safe < 0 ? "-" : signed ? "+" : "";
  const body = Math.abs(safe).toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${symbol ? "₹" : ""}${body}`;
}

/** Whole rupees — for totals and card figures where paise are noise. */
export const inr0 = (value, opts = {}) => inr(value, { decimals: 0, ...opts });

/** Plain grouped number, no symbol — quantities, share counts. */
export const num = (value, decimals = 0) =>
  Number(Number(value) || 0).toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
