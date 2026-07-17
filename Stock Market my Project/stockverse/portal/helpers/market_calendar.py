"""NSE trading calendar — the single source of truth for "is the market open?".

Both the scheduler (how often to pull quotes) and the API (what the UI shows)
read market state from here, so the badge in the browser can never disagree
with what the backend is actually doing.

Sessions, in IST:
    09:00–09:15  PRE_OPEN   order collection; no continuous trading
    09:15–15:30  OPEN       continuous trading — prices are live
    15:30–…      CLOSED     last traded price stands until the next open
    Sat/Sun      WEEKEND
    NSE holiday  HOLIDAY

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
MARKET_CLOSE   = time(15, 30)

# Market states
PRE_OPEN = 'PRE_OPEN'
OPEN     = 'OPEN'
CLOSED   = 'CLOSED'
WEEKEND  = 'WEEKEND'
HOLIDAY  = 'HOLIDAY'

LIVE_STATES = (OPEN,)   # the only state in which quotes should move

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
