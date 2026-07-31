"""NSE trading calendar — the single source of truth for "is the market open?".

Both the scheduler (how often to pull quotes) and the API (what the UI shows)
read market state from here, so the badge in the browser can never disagree
with what the backend is actually doing.

Sessions, in IST — the boundaries are MARKET_OPEN / MARKET_CLOSE below:
    09:00–open   PRE_OPEN   order collection; no continuous trading
    open–close   OPEN       continuous trading — prices are live
    close–…      CLOSED     last traded price stands until the next open
    Sat/Sun      WEEKEND
    NSE holiday  HOLIDAY

Every user-facing message that quotes the trading window is BUILT from those two
constants (see SESSION_WINDOW). Change the constant and the API responses, the
rejection messages and both portals follow — there is no second copy of "9:15" or
the closing time anywhere to fall out of step with it.

It is also the gate on placing orders: `trading_blocked_reason()` returns the
message to show the user whenever the market is shut, and every order-placement
path calls it. Continuous trading is the only state in which an order may be
accepted — outside it a MARKET order would fill instantly against a last traded
price that is hours old, and an intraday position would be opened in a session
that has already ended.

⚠️  TRADING_HOLIDAYS must be refreshed each year from the official NSE circular
    (https://www.nseindia.com → Resources → Exchange Communication → Holidays).
    An out-of-date list makes the app claim "live" on a holiday and sit there
    showing a flat price as if it were the market. `holiday_calendar_health()`
    reports when the list doesn't cover the current year; /stocks/market_status
    surfaces that to admins rather than letting it rot silently.
"""

import logging
from datetime import date, datetime, time, timedelta, timezone

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))

PRE_OPEN_START = time(9, 0)
MARKET_OPEN    = time(9, 15)
MARKET_CLOSE   = time(20, 0)

# Market states
PRE_OPEN = 'PRE_OPEN'
OPEN     = 'OPEN'
CLOSED   = 'CLOSED'
WEEKEND  = 'WEEKEND'
HOLIDAY  = 'HOLIDAY'

LIVE_STATES = (OPEN,)   # the only state in which quotes should move

# ── Trading-window messages ──────────────────────────────────────────────────
# Built from the constants above rather than typed out, so the hours quoted to
# users can never disagree with the hours actually enforced.


def clock(t):
    """A time as people write it: 9:15 AM, 3:30 PM, 8:00 PM."""
    hour = t.hour % 12 or 12
    return f'{hour}:{t.minute:02d} {"AM" if t.hour < 12 else "PM"}'


OPEN_LABEL   = clock(MARKET_OPEN)
CLOSE_LABEL  = clock(MARKET_CLOSE)
# "9:15 AM – 8:00 PM IST, Monday to Friday"
SESSION_WINDOW = f'{OPEN_LABEL} – {CLOSE_LABEL} IST, Monday to Friday'

INTRADAY_CLOSED_MESSAGE = (
    'Market is currently closed. Intraday trading is available only during '
    f'official market hours ({SESSION_WINDOW}).'
)
TRADING_CLOSED_MESSAGE = (
    'Market is currently closed. Trading is available only during official '
    f'market hours ({SESSION_WINDOW}).'
)
# Why a queued intraday order is killed when the bell rings.
INTRADAY_CLOSE_EXPIRY_REASON = (
    f'Intraday order cancelled at market close ({CLOSE_LABEL} IST) — it did not '
    'trigger during the session.'
)

# NSE trading holidays. Keyed by year so we can tell "no holidays this year"
# (a data gap) from "this year genuinely has none" (impossible in practice).
#
# ⚠️ VERIFY ANNUALLY against the NSE circular before the year starts.
TRADING_HOLIDAYS = {
    2026: {
        date(2026, 1, 26):  'Republic Day',
        date(2026, 3, 4):   'Holi',
        date(2026, 3, 21):  'Id-Ul-Fitr (Ramzan Id)',
        date(2026, 3, 26):  'Ram Navami',
        date(2026, 3, 31):  'Mahavir Jayanti',
        date(2026, 4, 3):   'Good Friday',
        date(2026, 4, 14):  'Dr. Baba Saheb Ambedkar Jayanti',
        date(2026, 5, 1):   'Maharashtra Day',
        date(2026, 5, 28):  'Bakri Id',
        date(2026, 6, 26):  'Muharram',
        date(2026, 8, 15):  'Independence Day',
        date(2026, 8, 28):  'Ganesh Chaturthi',
        date(2026, 10, 2):  'Mahatma Gandhi Jayanti',
        date(2026, 10, 20): 'Dussehra',
        date(2026, 11, 9):  'Diwali Laxmi Pujan',
        date(2026, 11, 10): 'Diwali Balipratipada',
        date(2026, 11, 24): 'Guru Nanak Jayanti',
        date(2026, 12, 25): 'Christmas',
    },
}


def now_ist():
    return datetime.now(IST)


def is_holiday(d=None):
    """Return the holiday name for `d`, or None. Unknown years return None —
    `holiday_calendar_health()` is what flags that gap."""
    d = d or now_ist().date()
    return TRADING_HOLIDAYS.get(d.year, {}).get(d)


def is_weekend(d=None):
    d = d or now_ist().date()
    return d.weekday() >= 5


def is_trading_day(d=None):
    d = d or now_ist().date()
    return not is_weekend(d) and not is_holiday(d)


def market_state(now=None):
    """Current market state — one of the module-level state constants."""
    now = now or now_ist()
    if now.tzinfo is None:
        now = now.replace(tzinfo=IST)
    now = now.astimezone(IST)

    if is_weekend(now.date()):
        return WEEKEND
    if is_holiday(now.date()):
        return HOLIDAY

    t = now.time()
    if PRE_OPEN_START <= t < MARKET_OPEN:
        return PRE_OPEN
    if MARKET_OPEN <= t <= MARKET_CLOSE:
        return OPEN
    return CLOSED


def is_market_open(now=None):
    """True only during continuous trading. Prices should move only when True."""
    return market_state(now) in LIVE_STATES


def trading_blocked_reason(trade_mode='DELIVERY', now=None):
    """Why a new order may NOT be placed right now, or None if it may.

    The only state that accepts orders is continuous trading. Pre-open is
    deliberately excluded: this platform fills MARKET orders on the spot, and
    there is no price to fill against until the bell.
    """
    if is_market_open(now):
        return None
    if (trade_mode or '').upper() == 'INTRADAY':
        return INTRADAY_CLOSED_MESSAGE
    return TRADING_CLOSED_MESSAGE


def next_open(now=None):
    """When continuous trading next begins, as an IST datetime.

    Walks forward day by day, skipping weekends and holidays. Bounded at 30 days
    so a stale holiday table can never spin this into an infinite loop.
    """
    now = now or now_ist()
    now = now.astimezone(IST) if now.tzinfo else now.replace(tzinfo=IST)

    candidate = now
    for _ in range(30):
        if is_trading_day(candidate.date()):
            open_dt = datetime.combine(candidate.date(), MARKET_OPEN, tzinfo=IST)
            if now < open_dt:
                return open_dt
        candidate = datetime.combine(
            candidate.date() + timedelta(days=1), time(0, 0), tzinfo=IST)
    return None


def next_close(now=None):
    """When the current session closes, or None if not currently open."""
    now = now or now_ist()
    now = now.astimezone(IST) if now.tzinfo else now.replace(tzinfo=IST)
    if market_state(now) not in (OPEN, PRE_OPEN):
        return None
    return datetime.combine(now.date(), MARKET_CLOSE, tzinfo=IST)


def holiday_calendar_health(now=None):
    """Report whether the holiday table still covers us.

    Returns {'ok', 'message', 'years_covered'}. Not ok => the calendar has
    aged out and HOLIDAY detection is silently wrong.
    """
    now = now or now_ist()
    year = now.year
    covered = sorted(TRADING_HOLIDAYS)
    if year not in TRADING_HOLIDAYS:
        return {
            'ok': False,
            'message': (f'No NSE holiday calendar for {year}. Holidays will be '
                        f'treated as trading days until TRADING_HOLIDAYS is updated '
                        f'from the official NSE circular.'),
            'years_covered': covered,
        }
    return {'ok': True, 'message': None, 'years_covered': covered}


def describe(now=None):
    """Full market status for the API/UI. One shape, used by both portals."""
    now = now or now_ist()
    state = market_state(now)
    nxt_open = next_open(now)
    nxt_close = next_close(now)
    health = holiday_calendar_health(now)

    return {
        'state':            state,
        'is_open':          state in LIVE_STATES,
        'session_label':    _LABELS.get(state, state),
        # Whether the order forms should accept input at all, and the exact
        # wording to show when they shouldn't. The client never re-derives these
        # from its own clock — the server owns the calendar.
        'trading_allowed':          state in LIVE_STATES,
        'trading_blocked_reason':   trading_blocked_reason('DELIVERY', now),
        'intraday_blocked_reason':  trading_blocked_reason('INTRADAY', now),
        # The window itself, so the UI can say "closes at 8:00 PM" without
        # keeping its own copy of the hours.
        'market_open_label':        OPEN_LABEL,
        'market_close_label':       CLOSE_LABEL,
        'session_window':           SESSION_WINDOW,
        'holiday_name':     is_holiday(now.date()),
        'server_time_ist':  now.isoformat(),
        'next_open':        nxt_open.isoformat() if nxt_open else None,
        'next_close':       nxt_close.isoformat() if nxt_close else None,
        'calendar_ok':      health['ok'],
        'calendar_warning': health['message'],
    }


_LABELS = {
    PRE_OPEN: 'Pre-open session',
    OPEN:     'Market open',
    CLOSED:   'Market closed',
    WEEKEND:  'Weekend — market closed',
    HOLIDAY:  'Trading holiday',
}
