/**
 * Market status badge — rendered identically in the User and Admin portals.
 *
 * The point is honesty: when the feed is down or the market is shut, prices on
 * screen are the last traded values, and this says so. Showing a stale number
 * with no indication is the failure mode that matters on a trading screen.
 */

import { Circle, AlertTriangle, Clock } from "lucide-react";
import { formatIst } from "../hooks/useMarketStatus";

/**
 * @param {object}  status   the /stocks/market_status payload
 * @param {boolean} compact  icon + label only, for dense headers
 */
export function MarketStatusBadge({ status, compact = false }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/5 text-gray-500 border border-white/8">
        <Clock className="w-3 h-3" /> Checking market…
      </span>
    );
  }

  const live = status.prices_are_live;
  // Open-but-not-live is the dangerous case: the market is moving and we are
  // not. It gets amber, not green, and names the reason.
  const feedBroken = status.is_open && !live;

  const tone = live
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : feedBroken
    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
    : "bg-white/5 text-gray-400 border-white/8";

  const label = live
    ? "LIVE"
    : feedBroken
    ? "STALE"
    : status.session_label || "Market closed";

  const Icon = live ? Circle : feedBroken ? AlertTriangle : Clock;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${tone}`}
      title={status.stale_reason || `Server time ${formatIst(status.server_time_ist)} IST`}
    >
      <Icon className={`w-3 h-3 ${live ? "fill-current animate-pulse" : ""}`} />
      <span className="font-semibold tracking-wide">{label}</span>
      {!compact && !live && status.stale_reason && (
        <span className="text-[11px] font-normal opacity-80">— {status.stale_reason}</span>
      )}
    </span>
  );
}

/**
 * Header pill: which NSE session we are in, right now.
 *
 * Distinct from MarketStatusBadge, which is about whether our *price feed* is
 * live. This one answers "can I trade?" — it was previously a hardcoded
 * "Markets Open" in both layouts, which read as an invitation to trade at
 * 11 PM on a Sunday.
 */
export function MarketSessionPill({ status }) {
  if (!status) {
    return (
      <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/8 rounded-full">
        <Clock className="w-3 h-3 text-gray-500" />
        <span className="text-xs text-gray-500">Checking market…</span>
      </span>
    );
  }

  const open    = status.trading_allowed ?? status.is_open;
  const preOpen = status.state === "PRE_OPEN";

  const tone = open
    ? "bg-emerald-500/10 border-emerald-500/15 text-emerald-400"
    : preOpen
    ? "bg-amber-500/10 border-amber-500/15 text-amber-400"
    : "bg-white/5 border-white/8 text-gray-400";

  const label = open
    ? "Markets Open"
    : preOpen
    ? "Pre-open"
    : status.holiday_name || "Markets Closed";

  // Hours come from the server (market_close_label), never from a copy kept here
  // — the two would drift the first time the trading window changed.
  const title = open
    ? `Trading closes ${status.market_close_label || ""} IST`.replace(/\s+/g, " ").trim()
    : status.next_open
    ? `Reopens ${formatIst(status.next_open, { withDate: true })} IST`
    : status.session_label;

  return (
    <span
      className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 border rounded-full ${tone}`}
      title={title}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          open ? "bg-emerald-400 animate-pulse" : preOpen ? "bg-amber-400" : "bg-gray-500"
        }`}
      />
      <span className="text-xs">{label}</span>
    </span>
  );
}

/**
 * Blocking notice for order forms when the market is shut. Renders nothing
 * while trading is allowed, so it can sit unconditionally in the panel.
 *
 * `mode` picks the wording the server supplies for that product — intraday gets
 * its own message because intraday is the product that cannot exist outside the
 * session at all.
 */
export function MarketClosedNotice({ status, mode = "DELIVERY" }) {
  if (!status || (status.trading_allowed ?? status.is_open)) return null;

  const message =
    (mode === "INTRADAY" ? status.intraday_blocked_reason : status.trading_blocked_reason) ||
    "Market is currently closed.";

  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border bg-amber-500/10 border-amber-500/20 text-xs text-amber-300">
      <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <div>
        <span>{message}</span>
        {status.holiday_name && (
          <span className="block opacity-80 mt-0.5">Today is a trading holiday — {status.holiday_name}.</span>
        )}
        {status.next_open && (
          <span className="block opacity-80 mt-0.5">
            Market reopens {formatIst(status.next_open, { withDate: true })} IST.
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * One-line explanation of what the prices on screen actually represent.
 * Render it near price tables when the market isn't live.
 */
export function StaleDataNotice({ status }) {
  if (!status || status.prices_are_live) return null;

  const feedBroken = status.is_open && !status.prices_are_live;
  const tone = feedBroken
    ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
    : "bg-white/5 border-white/8 text-gray-400";

  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${tone}`}>
      {feedBroken ? (
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      ) : (
        <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      )}
      <div>
        <span className="font-semibold">
          {feedBroken ? "Live prices unavailable." : `${status.session_label}.`}
        </span>{" "}
        Showing the last traded price.
        {status.stale_reason && feedBroken && (
          <span className="block opacity-80 mt-0.5">{status.stale_reason}</span>
        )}
        {!feedBroken && status.next_open && (
          <span className="block opacity-80 mt-0.5">
            Market reopens {formatIst(status.next_open, { withDate: true })} IST.
          </span>
        )}
      </div>
    </div>
  );
}
