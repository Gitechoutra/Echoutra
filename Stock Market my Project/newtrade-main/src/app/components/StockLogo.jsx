/**
 * StockLogo — a circular, text-only monogram for a stock.
 *
 * Replaces the `logo_url` images that used to sit beside stock names. Those were
 * remote assets that frequently 404'd, so half the rows showed a broken or blank
 * square while the rest showed a logo — inconsistent, and each table papered
 * over it with its own `onError` hack. A monogram is always available, always
 * the same size, and needs no network.
 *
 * Initials follow the product rule, derived from the COMPANY name:
 *   one word    → its first two letters      Reliance      → RE
 *   two or more → first letter of each of    Tata Motors   → TM
 *                 the first two words        State Bank    → SB
 *
 * Colour is derived from the ticker, so a stock keeps the same colour on every
 * screen — the eye can track it across the dashboard, portfolio and watchlist.
 */

/** Words that can start an initial — drops stray "&", "-", "(" and the like. */
const WORD = /^[\p{L}\p{N}]/u;

/**
 * Initials for a stock. `name` is the company name; `fallback` (the ticker) is
 * used when the row carries no company name.
 */
export function monogram(name, fallback) {
  const source = String(name ?? "").trim() || String(fallback ?? "").trim();
  if (!source) return "?";

  const words = source.split(/[\s.]+/).filter((w) => WORD.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Small stable string hash, so a stock's colour never changes between renders. */
function hashOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// One palette for the whole app. Tinted fills with a matching ring read clearly
// on the dark surfaces without shouting over the numbers, which are what the
// user is actually here to read.
const PALETTE = [
  { bg: "bg-cyan-500/15",    text: "text-cyan-300",    ring: "ring-cyan-500/25" },
  { bg: "bg-violet-500/15",  text: "text-violet-300",  ring: "ring-violet-500/25" },
  { bg: "bg-emerald-500/15", text: "text-emerald-300", ring: "ring-emerald-500/25" },
  { bg: "bg-amber-500/15",   text: "text-amber-300",   ring: "ring-amber-500/25" },
  { bg: "bg-rose-500/15",    text: "text-rose-300",    ring: "ring-rose-500/25" },
  { bg: "bg-blue-500/15",    text: "text-blue-300",    ring: "ring-blue-500/25" },
  { bg: "bg-teal-500/15",    text: "text-teal-300",    ring: "ring-teal-500/25" },
  { bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", ring: "ring-fuchsia-500/25" },
];

// Written out in full rather than interpolated, so Tailwind's scanner keeps them.
const SIZES = {
  xs: "w-6 h-6  text-[10px]",
  sm: "w-7 h-7  text-[11px]",
  md: "w-8 h-8  text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-12 h-12 text-base",
};

export function tonesFor(key) {
  return PALETTE[hashOf(String(key ?? "")) % PALETTE.length];
}

/**
 * @param {string} symbol  ticker — drives the colour, and the initials if no name
 * @param {string} name    company name — drives the initials
 * @param {"xs"|"sm"|"md"|"lg"|"xl"} size
 */
export function StockLogo({ symbol, name, size = "md", className = "" }) {
  const initials = monogram(name, symbol);
  const tone     = tonesFor(symbol || name);

  return (
    <div
      title={name || symbol || ""}
      aria-hidden="true"
      className={`flex-shrink-0 rounded-full flex items-center justify-center
                  font-bold tracking-tight select-none ring-1
                  ${SIZES[size] || SIZES.md} ${tone.bg} ${tone.text} ${tone.ring} ${className}`}
    >
      {initials}
    </div>
  );
}
