/**
 * Market status + adaptive price polling, shared by the User and Admin portals.
 *
 * Both portals call these hooks, so the two can't drift into disagreeing about
 * whether prices are live -- previously the user side polled every 20s while the
 * admin side only refreshed when someone clicked a button, so the same stock
 * could show two different prices in the two portals at the same moment.
 *
 * The server is the authority on market state (it owns the NSE calendar and
 * knows whether the Upstox token actually works). The client never decides
 * "the market is open" from its own clock -- a laptop with a skewed clock or a
 * non-IST timezone would get it wrong.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = "http://127.0.0.1:5050/v1";

const getToken = () => localStorage.getItem("access_token");

/** Poll cadence used before the first status response lands. */
const DEFAULT_POLL_MS = 30_000;

/**
 * Tracks market session state and live-feed health.
 *
 * Returns { status, loading, error, refresh }, where `status` carries
 * `prices_are_live`, `stale_reason`, `session_label` and `poll_interval_ms`.
 */
export function useMarketStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    if (!getToken()) return null;
    try {
      const res = await fetch(`${API_BASE}/stocks/market_status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!data.bool) {
        setError(data.response?.message || "Could not read market status.");
        return null;
      }
      setStatus(data.response);
      setError("");
      return data.response;
    } catch {
      // A failed status check must not claim the market is live.
      setError("Cannot reach the server — price freshness is unknown.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Re-arms itself each tick so the cadence follows the server's advice:
    // ~10s while trading, ~60s once closed.
    const tick = async () => {
      const s = await fetchStatus();
      if (cancelled) return;
      const next = s?.poll_interval_ms || DEFAULT_POLL_MS;
      timerRef.current = setTimeout(tick, next);
    };
    tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchStatus]);

  return { status, loading, error, refresh: fetchStatus };
}

/*
 * `useLivePrices(fetcher, …)` used to live here: it re-ran a page's own fetch on
 * the market cadence. It has been removed deliberately.
 *
 * Each page that used it polled a different endpoint at a different moment, so
 * the same stock could show two prices in two places at once — and pages that
 * never adopted it (portfolio, watchlist, dashboard, stock detail) simply never
 * updated at all. Prices now come from a single poll in
 * `context/LiveQuotesContext`. Re-introducing a per-page price poll would
 * recreate exactly the drift that layer exists to prevent.
 */

/** Format an ISO timestamp as an IST wall-clock time for "last traded at ...". */
export function formatIst(iso, { withDate = false } = {}) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      ...(withDate ? { day: "2-digit", month: "short" } : {}),
    });
  } catch {
    return "—";
  }
}
