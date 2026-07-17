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
