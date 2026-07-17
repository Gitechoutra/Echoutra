"""Server-side field validation.

This is the enforcement boundary. The browser filters in
``src/app/utils/validation.js`` mirror these rules for UX, but they are
advisory only -- anything reaching a route here is treated as hostile.

Usage in a route::

    from portal.helpers.validators import Validator, validate_email

    v = Validator()
    v.check('email', validate_email(args['email']))
    v.check('quantity', validate_quantity(args['quantity']))
    if not v.ok:
        return v.response()          # 400 in this app's envelope shape

Every ``validate_*`` returns ``None`` when valid, else a message string.
Keep in sync with validation.js -- a rule that differs between the two shows
the user a passing form followed by a server rejection.
"""

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from flask import jsonify

# ── Limits ──────────────────────────────────────────────────────────────────

NAME_MAX = 50
USERNAME_MIN = 3
USERNAME_MAX = 30
EMAIL_MAX = 254
PASSWORD_MIN = 8
PASSWORD_MAX = 128
SEARCH_MAX = 64
SYMBOL_MAX = 20
ADDRESS_MAX = 200
NOTES_MAX = 1000
MOBILE_MAX = 15

# ── Patterns ────────────────────────────────────────────────────────────────

NAME_RE = re.compile(r"^[A-Za-z]+(?:[' -][A-Za-z]+)*$")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9._]+$")
SYMBOL_RE = re.compile(r"^[A-Z]+(?:[.-][A-Z0-9]+)?$")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
AADHAAR_RE = re.compile(r"^[2-9][0-9]{11}$")
ADDRESS_RE = re.compile(r"^[A-Za-z0-9 ,\-/.#()]+$")
HTML_RE = re.compile(r"<[^>]*>")

MOBILE_RULES = {
    'IN': {'code': '+91',  'digits': 10, 'starts': re.compile(r'^[6-9]'),  'label': 'India'},
    'US': {'code': '+1',   'digits': 10, 'starts': re.compile(r'^[2-9]'),  'label': 'United States'},
    'GB': {'code': '+44',  'digits': 10, 'starts': re.compile(r'^[1-9]'),  'label': 'United Kingdom'},
    'AE': {'code': '+971', 'digits': 9,  'starts': re.compile(r'^[1-9]'),  'label': 'UAE'},
    'SG': {'code': '+65',  'digits': 8,  'starts': re.compile(r'^[3689]'), 'label': 'Singapore'},
    'AU': {'code': '+61',  'digits': 9,  'starts': re.compile(r'^[2-9]'),  'label': 'Australia'},
}

ZIP_RULES = {
    'IN': {'digits': 6, 'starts': re.compile(r'^[1-9]'), 'label': 'PIN code'},
    'US': {'digits': 5, 'starts': None, 'label': 'ZIP code'},
    'SG': {'digits': 6, 'starts': None, 'label': 'postal code'},
    'AU': {'digits': 4, 'starts': None, 'label': 'postcode'},
}


def normalize_text(v):
    """Collapse whitespace runs and trim. Apply before length checks."""
    if v is None:
        return ''
    return re.sub(r'\s+', ' ', str(v)).strip()


def escape_like(v):
    """Neutralise LIKE wildcards so a search for '%' is a literal '%'.

    SQLAlchemy parameterises the value, so this is not about SQL injection --
    it stops an unescaped '%' from matching every row and scanning the table.
    Pair with ``.like(..., escape='\\\\')``.
    """
    return (v or '').replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


# ── Validators ──────────────────────────────────────────────────────────────

def validate_name(v, label='Name', required=True):
    s = normalize_text(v)
    if not s:
        return f'{label} is required.' if required else None
    if len(s) > NAME_MAX:
        return f'{label} must be {NAME_MAX} characters or fewer.'
    if any(c.isdigit() for c in s):
        return f'{label} cannot contain numbers.'
    if not NAME_RE.match(s):
        return f'{label} can only contain letters, spaces, apostrophes and hyphens.'
    return None


def validate_email(v, required=True):
    s = (v or '').strip()
    if not s:
        return 'Email address is required.' if required else None
    if len(s) > EMAIL_MAX:
        return 'Email address is too long.'
    if not EMAIL_RE.match(s):
        return 'Enter a valid email address (e.g. user@gmail.com).'
    return None


def validate_username(v, required=True):
    s = (v or '').strip()
    if not s:
        return 'Username is required.' if required else None
    if re.search(r'\s', v or ''):
        return 'Username cannot contain spaces.'
    if len(s) < USERNAME_MIN:
        return f'Username must be at least {USERNAME_MIN} characters.'
    if len(s) > USERNAME_MAX:
        return f'Username must be {USERNAME_MAX} characters or fewer.'
    if not USERNAME_RE.match(s):
        return 'Username can only contain letters, numbers, underscore and dot.'
    return None


def validate_mobile(v, country='IN', required=True):
    """National format when `country` is known; E.164 when prefixed with '+'."""
    raw = (v or '').strip()
    if not raw:
        return 'Mobile number is required.' if required else None
    if re.search(r'[A-Za-z]', raw):
        return 'Mobile number cannot contain letters.'
    if re.search(r'[^\d+]', raw):
        return 'Mobile number cannot contain special characters.'

    if raw.startswith('+'):
        digits = raw[1:]
        for rule in MOBILE_RULES.values():
            if digits.startswith(rule['code'][1:]):
                local = digits[len(rule['code']) - 1:]
                if len(local) != rule['digits']:
                    return (f"A {rule['label']} mobile number must be "
                            f"{rule['digits']} digits after {rule['code']}.")
                if rule['starts'] and not rule['starts'].match(local):
                    return f"That is not a valid {rule['label']} mobile number."
                return None
        if not 8 <= len(digits) <= 15:
            return 'Enter a valid international mobile number.'
        return None

    rule = MOBILE_RULES.get(country, MOBILE_RULES['IN'])
    if not raw.isdigit():
        return 'Mobile number can only contain digits.'
    if len(raw) != rule['digits']:
        return f"Mobile number must be exactly {rule['digits']} digits."
    if rule['starts'] and not rule['starts'].match(raw):
        return f"That is not a valid {rule['label']} mobile number."
    return None


def validate_otp(v, length=6):
    s = (v or '').strip()
    if not s:
        return 'OTP is required.'
    if not s.isdigit():
        return 'OTP must contain numbers only.'
    if len(s) != length:
        return f'OTP must be exactly {length} digits.'
    return None


def validate_password(v):
    s = v or ''
    if not s:
        return 'Password is required.'
    if len(s) < PASSWORD_MIN:
        return f'Password must be at least {PASSWORD_MIN} characters.'
    if len(s) > PASSWORD_MAX:
        return f'Password must be {PASSWORD_MAX} characters or fewer.'
    if not re.search(r'[A-Z]', s):
        return 'Password must contain an uppercase letter.'
    if not re.search(r'[a-z]', s):
        return 'Password must contain a lowercase letter.'
    if not re.search(r'\d', s):
        return 'Password must contain a number.'
    if not re.search(r'[^A-Za-z0-9]', s):
        return 'Password must contain a special character.'
    return None


def validate_confirm_password(pw, confirm):
    if not confirm:
        return 'Please confirm your password.'
    if pw != confirm:
        return 'Passwords do not match.'
    return None


def validate_symbol(v, required=True):
    s = (v or '').strip()
    if not s:
        return 'Stock symbol is required.' if required else None
    if re.search(r'\s', s):
        return 'Stock symbol cannot contain spaces.'
    if s != s.upper():
        return 'Stock symbol must be uppercase.'
    if len(s) > SYMBOL_MAX:
        return 'Stock symbol is too long.'
    if not SYMBOL_RE.match(s):
        return 'Stock symbol can only contain uppercase letters (e.g. AAPL).'
    return None


def _to_decimal(v):
    try:
        d = Decimal(str(v).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None
    # Decimal accepts 'NaN' and 'Infinity'; both would poison money maths.
    if not d.is_finite():
        return None
    return d


def validate_price(v, label='Price', min_value=Decimal('0.01'), max_value=Decimal('1000000000')):
    """Positive decimal. Accepts JSON numbers and strings; rejects NaN/Infinity."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return f'{label} is required.'
    if isinstance(v, str) and not re.match(r'^\d+(\.\d+)?$', v.strip()):
        return f'{label} must be a positive number.'
    d = _to_decimal(v)
    if d is None:
        return f'{label} must be a valid number.'
    if d < 0:
        return f'{label} must be a positive number.'
    if d < Decimal(str(min_value)):
        return f'{label} must be at least {min_value}.'
    if d > Decimal(str(max_value)):
        return f'{label} is too large.'
    return None


def validate_quantity(v, max_value=1_000_000):
    """Positive whole number.

    Accepts JSON numbers as well as strings, because reqparse(type=float)
    hands us 5.0 for a payload of 5. A float carrying a real fraction (2.5)
    is still rejected. NaN/Infinity are rejected explicitly -- they survive
    float() and slip past a naive ``<= 0`` guard.
    """
    if v is None or (isinstance(v, str) and not v.strip()):
        return 'Quantity is required.'

    d = _to_decimal(v)          # None for NaN, Infinity and junk
    if d is None:
        return 'Quantity must be a positive whole number.'
    if d != d.to_integral_value():
        return 'Quantity must be a whole number.'
    n = int(d)
    if n <= 0:
        return 'Quantity must be greater than zero.'
    if n > max_value:
        return f'Quantity cannot exceed {max_value:,}.'
    return None


def validate_percent(v, label='Percentage'):
    s = str(v if v is not None else '').strip()
    if not s:
        return f'{label} is required.'
    if not re.match(r'^\d+(\.\d+)?$', s):
        return f'{label} must be a number.'
    d = _to_decimal(s)
    if d is None:
        return f'{label} must be a valid number.'
    if d < 0 or d > 100:
        return f'{label} must be between 0 and 100.'
    return None


def validate_amount(v, label='Amount', min_value=Decimal('1'), max_value=Decimal('1000000000')):
    """Positive money value, max 2 dp. Accepts JSON numbers and strings."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return f'{label} is required.'
    if isinstance(v, str) and not re.match(r'^\d+(\.\d{1,2})?$', v.strip()):
        return f'{label} must be a number with at most 2 decimal places.'
    d = _to_decimal(v)
    if d is None:
        return f'{label} must be a valid number.'
    if d.as_tuple().exponent < -2:
        return f'{label} must be a number with at most 2 decimal places.'
    if d <= 0:
        return f'{label} must be greater than zero.'
    if d < Decimal(str(min_value)):
        return f'{label} must be at least {min_value}.'
    if d > Decimal(str(max_value)):
        return f'{label} is too large.'
    return None


def validate_date(v, label='Date', min_date=None, max_date=None, required=True):
    """Accept only YYYY-MM-DD. Rejects calendar-invalid dates like 2025-02-31."""
    s = (v or '').strip()
    if not s:
        return f'{label} is required.' if required else None
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', s):
        return f'{label} must be in YYYY-MM-DD format.'
    try:
        parsed = datetime.strptime(s, '%Y-%m-%d').date()
    except ValueError:
        return f'{label} is not a real calendar date.'
    if min_date and parsed < min_date:
        return f'{label} cannot be before {min_date.isoformat()}.'
    if max_date and parsed > max_date:
        return f'{label} cannot be after {max_date.isoformat()}.'
    return None


def validate_time(v, label='Time', required=True):
    s = (v or '').strip()
    if not s:
        return f'{label} is required.' if required else None
    if not re.match(r'^([01]\d|2[0-3]):[0-5]\d$', s):
        return f'{label} must be in HH:MM (24-hour) format.'
    return None


def validate_dob(v, min_age=18, max_age=120):
    base = validate_date(v, label='Date of birth')
    if base:
        return base
    dob = datetime.strptime(v.strip(), '%Y-%m-%d').date()
    today = date.today()
    if dob > today:
        return 'Date of birth cannot be in the future.'
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    if age < min_age:
        return f'You must be at least {min_age} years old to trade.'
    if age > max_age:
        return 'Enter a valid date of birth.'
    return None


def validate_address(v, label='Address', required=True):
    s = normalize_text(v)
    if not s:
        return f'{label} is required.' if required else None
    if len(s) > ADDRESS_MAX:
        return f'{label} must be {ADDRESS_MAX} characters or fewer.'
    if HTML_RE.search(s):
        return f'{label} cannot contain HTML.'
    if not ADDRESS_RE.match(s):
        return f'{label} can only contain letters, numbers, spaces and , - / . # ( )'
    return None


def validate_pan(v, required=True):
    s = (v or '').strip().upper()
    if not s:
        return 'PAN number is required.' if required else None
    if len(s) != 10:
        return 'PAN number must be exactly 10 characters.'
    if not PAN_RE.match(s):
        return 'PAN must be in the format ABCDE1234F.'
    return None


def validate_aadhaar(v, required=True):
    s = re.sub(r'\s', '', v or '')
    if not s:
        return 'Aadhaar number is required.' if required else None
    if not s.isdigit():
        return 'Aadhaar number must contain digits only.'
    if len(s) != 12:
        return 'Aadhaar number must be exactly 12 digits.'
    if not AADHAAR_RE.match(s):
        return 'Enter a valid Aadhaar number.'
    return None


def validate_zip(v, country='IN', required=True):
    s = (v or '').strip()
    rule = ZIP_RULES.get(country, ZIP_RULES['IN'])
    if not s:
        return f"{rule['label']} is required." if required else None
    if not s.isdigit():
        return f"{rule['label']} must contain digits only."
    if len(s) != rule['digits']:
        return f"{rule['label']} must be exactly {rule['digits']} digits."
    if rule['starts'] and not rule['starts'].match(s):
        return f"Enter a valid {rule['label']}."
    return None


def validate_notes(v, label='Notes', max_len=NOTES_MAX, required=False):
    s = (v or '').strip()
    if not s:
        return f'{label} is required.' if required else None
    if len(s) > max_len:
        return f'{label} must be {max_len} characters or fewer.'
    if HTML_RE.search(s):
        return f'{label} cannot contain HTML tags.'
    return None


def validate_search(v, required=False):
    s = (v or '').strip()
    if not s:
        return 'Search term is required.' if required else None
    if len(s) > SEARCH_MAX:
        return f'Search must be {SEARCH_MAX} characters or fewer.'
    if HTML_RE.search(s):
        return 'Search cannot contain HTML.'
    return None


def validate_choice(v, allowed, label='Value', required=True):
    """Whitelist check for enum-ish fields (order side, status, action, ...)."""
    s = (v or '').strip()
    if not s:
        return f'{label} is required.' if required else None
    if s.upper() not in {a.upper() for a in allowed}:
        return f"{label} must be one of: {', '.join(allowed)}."
    return None


def validate_pagination(page, per_page, max_per_page=100):
    """Clamp list endpoints so per_page=1000000 can't be used to exhaust memory."""
    # `page or 1` would coerce a caller-supplied 0 to 1 and skip the check
    # below, so test explicitly for None/'' instead of relying on truthiness.
    page = 1 if page is None or page == '' else page
    per_page = 20 if per_page is None or per_page == '' else per_page
    try:
        p = int(page)
        pp = int(per_page)
    except (TypeError, ValueError):
        return 'Pagination values must be integers.'
    if p < 1:
        return 'Page must be 1 or greater.'
    if pp < 1 or pp > max_per_page:
        return f'per_page must be between 1 and {max_per_page}.'
    return None


# ── Collector ───────────────────────────────────────────────────────────────

class Validator:
    """Accumulates field errors, then renders this app's response envelope."""

    def __init__(self):
        self.errors = {}

    def check(self, field, message):
        """Record `message` against `field` when it is not None. Chainable."""
        if message:
            self.errors.setdefault(field, message)
        return self

    def require(self, field, value, label=None):
        if value is None or str(value).strip() == '':
            self.errors.setdefault(field, f"{label or field.replace('_', ' ').title()} is required.")
        return self

    @property
    def ok(self):
        return not self.errors

    @property
    def first_error(self):
        return next(iter(self.errors.values()), '')

    def response(self, status=400):
        """400 in the shape the frontend already reads: data.response.message.

        Returns a bare Response, not a (Response, status) tuple: flask-restx
        re-serialises a tuple's first element and chokes on a Response object.
        The rest of this app returns bare jsonify(...) for the same reason, so
        the HTTP status travels in the body's `status` key as it does elsewhere.
        """
        return jsonify(
            response={'message': self.first_error, 'errors': self.errors},
            status=status,
            bool=False,
        )
