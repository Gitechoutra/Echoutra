/**
 * Shared field validation for every form, modal, filter and settings page.
 *
 * Two layers, deliberately kept separate:
 *
 *   filter*(raw)   — narrows keystrokes as the user types. UX only. Never a
 *                    security control: anyone can POST straight to the API.
 *   validate*(v)   — returns "" when valid, else a human-readable message.
 *                    Run on submit. Mirrored by portal/helpers/validators.py,
 *                    which is the boundary that actually enforces these rules.
 *
 * Keep the two files in sync: a rule loosened here but not there shows the user
 * a passing form and then a server rejection.
 */

/* ── Limits ─────────────────────────────────────────────────────────────── */

export const LIMITS = {
  NAME_MAX: 50,
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  EMAIL_MAX: 254, // RFC 5321
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  SEARCH_MAX: 64,
  SYMBOL_MAX: 20,
  ADDRESS_MAX: 200,
  NOTES_MAX: 1000,
  MOBILE_MAX: 15, // E.164
};

/* ── Patterns ───────────────────────────────────────────────────────────── */

// Letters, single interior spaces, apostrophes and hyphens: "Pavan Kumar",
// "O'Brien", "Jean-Luc". Rejects digits and every other special character.
const NAME_RE = /^[A-Za-z]+(?:[' -][A-Za-z]+)*$/;

// Deliberately stricter than RFC 5322 — no quoted locals, no IP literals. A TLD
// is required, so "user@localhost" is rejected: this app only mails real users.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

const USERNAME_RE = /^[A-Za-z0-9._]+$/;
const SYMBOL_RE = /^[A-Z]+(?:[.-][A-Z0-9]+)?$/; // AAPL, TSLA, RELIANCE, BRK.B
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_RE = /^[2-9][0-9]{11}$/; // never starts 0 or 1 (UIDAI rule)
const ADDRESS_RE = /^[A-Za-z0-9 ,\-/.#()]+$/;

/* ── Country rules ──────────────────────────────────────────────────────── */

export const MOBILE_RULES = {
  IN: { code: "+91", digits: 10, starts: /^[6-9]/, label: "India" },
  US: { code: "+1", digits: 10, starts: /^[2-9]/, label: "United States" },
  GB: { code: "+44", digits: 10, starts: /^[1-9]/, label: "United Kingdom" },
  AE: { code: "+971", digits: 9, starts: /^[1-9]/, label: "UAE" },
  SG: { code: "+65", digits: 8, starts: /^[3689]/, label: "Singapore" },
  AU: { code: "+61", digits: 9, starts: /^[2-9]/, label: "Australia" },
};

export const ZIP_RULES = {
  IN: { digits: 6, starts: /^[1-9]/, label: "PIN code" },
  US: { digits: 5, label: "ZIP code" },
  SG: { digits: 6, label: "postal code" },
  AU: { digits: 4, label: "postcode" },
};

/* ── Filters (keystroke narrowing — UX only) ────────────────────────────── */

export const filterName = (v) =>
  v.replace(/[^A-Za-z' -]/g, "").replace(/\s{2,}/g, " ").slice(0, LIMITS.NAME_MAX);

export const filterEmail = (v) => v.replace(/\s/g, "").slice(0, LIMITS.EMAIL_MAX);

export const filterUsername = (v) =>
  v.replace(/[^A-Za-z0-9._]/g, "").slice(0, LIMITS.USERNAME_MAX);

export const filterDigits = (v, max = 20) => v.replace(/\D/g, "").slice(0, max);

// Leading + kept so international numbers survive typing.
export const filterMobile = (v) => {
  const plus = v.trimStart().startsWith("+");
  return (plus ? "+" : "") + v.replace(/\D/g, "").slice(0, LIMITS.MOBILE_MAX);
};

export const filterSymbol = (v) =>
  v.toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, LIMITS.SYMBOL_MAX);

export const filterPan = (v) =>
  v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);

export const filterAadhaar = (v) => filterDigits(v, 12);

/** Positive decimal. Keeps a single "." and honours `decimals` precision. */
export const filterDecimal = (v, decimals = 2) => {
  let s = v.replace(/[^\d.]/g, "");
  const first = s.indexOf(".");
  if (first !== -1) {
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, "");
    const [int, frac] = s.split(".");
    s = int + "." + frac.slice(0, decimals);
  }
  return s;
};

/** Positive integers. Strips a leading run of zeros so "007" -> "7". */
export const filterQuantity = (v) => {
  const s = v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return s === "0" ? "" : s;
};

export const filterPercent = (v) => {
  const s = filterDecimal(v, 2);
  return parseFloat(s) > 100 ? "100" : s;
};

export const filterAddress = (v) =>
  v.replace(/[^A-Za-z0-9 ,\-/.#()\n]/g, "").slice(0, LIMITS.ADDRESS_MAX);

/**
 * Search / stock lookup. Allows letters, digits, spaces, dots and hyphens so
 * "BRK.B" and "Tata Motors" work, and drops the angle brackets and quotes that
 * make injection payloads legible. This is cosmetic — `escapeLike` on the
 * server is what keeps the query safe.
 */
export const filterSearch = (v) =>
  v.replace(/[<>"'`;\\{}$]/g, "").replace(/\s{2,}/g, " ").slice(0, LIMITS.SEARCH_MAX);

/** Collapse runs of whitespace and trim. Use before length checks. */
export const normalizeText = (v) => v.replace(/\s+/g, " ").trim();

/* ── Validators (submit-time — return "" when valid) ────────────────────── */

export const validateName = (v, label = "Name") => {
  const s = normalizeText(v || "");
  if (!s) return `${label} is required.`;
  if (s.length > LIMITS.NAME_MAX) return `${label} must be ${LIMITS.NAME_MAX} characters or fewer.`;
  if (/\d/.test(s)) return `${label} cannot contain numbers.`;
  if (!NAME_RE.test(s)) return `${label} can only contain letters, spaces, apostrophes and hyphens.`;
  return "";
};

export const validateEmail = (v) => {
  const s = (v || "").trim();
  if (!s) return "Email address is required.";
  if (s.length > LIMITS.EMAIL_MAX) return "Email address is too long.";
  if (!EMAIL_RE.test(s)) return "Enter a valid email address (e.g. user@gmail.com).";
  return "";
};

export const validateUsername = (v) => {
  const s = (v || "").trim();
  if (!s) return "Username is required.";
  if (/\s/.test(v || "")) return "Username cannot contain spaces.";
  if (s.length < LIMITS.USERNAME_MIN) return `Username must be at least ${LIMITS.USERNAME_MIN} characters.`;
  if (s.length > LIMITS.USERNAME_MAX) return `Username must be ${LIMITS.USERNAME_MAX} characters or fewer.`;
  if (!USERNAME_RE.test(s)) return "Username can only contain letters, numbers, underscore and dot.";
  return "";
};

/**
 * `country` selects a national rule; a leading + dispatches on dial code.
 * Anything else falls back to a generic E.164 length check rather than
 * assuming 10 digits, which would lock out most of the world.
 */
export const validateMobile = (v, country = "IN") => {
  const raw = (v || "").trim();
  if (!raw) return "Mobile number is required.";
  if (/[A-Za-z]/.test(raw)) return "Mobile number cannot contain letters.";
  if (/[^\d+]/.test(raw)) return "Mobile number cannot contain special characters.";

  if (raw.startsWith("+")) {
    const digits = raw.slice(1);
    const match = Object.values(MOBILE_RULES).find((r) =>
      digits.startsWith(r.code.slice(1)),
    );
    if (match) {
      const local = digits.slice(match.code.length - 1);
      if (local.length !== match.digits)
        return `A ${match.label} mobile number must be ${match.digits} digits after ${match.code}.`;
      if (match.starts && !match.starts.test(local))
        return `That is not a valid ${match.label} mobile number.`;
      return "";
    }
    if (digits.length < 8 || digits.length > 15)
      return "Enter a valid international mobile number.";
    return "";
  }

  const rule = MOBILE_RULES[country] || MOBILE_RULES.IN;
  if (!/^\d+$/.test(raw)) return "Mobile number can only contain digits.";
  if (raw.length !== rule.digits)
    return `Mobile number must be exactly ${rule.digits} digits.`;
  if (rule.starts && !rule.starts.test(raw))
    return `That is not a valid ${rule.label} mobile number.`;
  return "";
};

export const validateOtp = (v, length = 6) => {
  const s = (v || "").trim();
  if (!s) return "OTP is required.";
  if (!/^\d+$/.test(s)) return "OTP must contain numbers only.";
  if (s.length !== length) return `OTP must be exactly ${length} digits.`;
  return "";
};

export const validatePassword = (v) => {
  const s = v || "";
  if (!s) return "Password is required.";
  if (s.length < LIMITS.PASSWORD_MIN)
    return `Password must be at least ${LIMITS.PASSWORD_MIN} characters.`;
  if (s.length > LIMITS.PASSWORD_MAX)
    return `Password must be ${LIMITS.PASSWORD_MAX} characters or fewer.`;
  if (!/[A-Z]/.test(s)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/.test(s)) return "Password must contain a lowercase letter.";
  if (!/\d/.test(s)) return "Password must contain a number.";
  if (!/[^A-Za-z0-9]/.test(s)) return "Password must contain a special character.";
  return "";
};

export const validateConfirmPassword = (pw, confirm) => {
  if (!confirm) return "Please confirm your password.";
  if (pw !== confirm) return "Passwords do not match.";
  return "";
};

/** Real-time strength meter, 0-4. Separate from validatePassword's pass/fail. */
export const passwordStrength = (v) => {
  const s = v || "";
  if (!s) return 0;
  let score = 0;
  if (s.length >= LIMITS.PASSWORD_MIN) score++;
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;
  if (s.length >= 12 && score === 4) return 4;
  return Math.min(score, 4);
};

export const validateSymbol = (v) => {
  const s = (v || "").trim();
  if (!s) return "Stock symbol is required.";
  if (/\s/.test(s)) return "Stock symbol cannot contain spaces.";
  if (s !== s.toUpperCase()) return "Stock symbol must be uppercase.";
  if (!SYMBOL_RE.test(s)) return "Stock symbol can only contain uppercase letters (e.g. AAPL).";
  if (s.length > LIMITS.SYMBOL_MAX) return "Stock symbol is too long.";
  return "";
};

export const validatePrice = (v, { label = "Price", min = 0.01, max = 1e9 } = {}) => {
  const s = String(v ?? "").trim();
  if (!s) return `${label} is required.`;
  if (!/^\d+(\.\d+)?$/.test(s)) return `${label} must be a number.`;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return `${label} must be a valid number.`;
  if (n < min) return `${label} must be at least ${min}.`;
  if (n > max) return `${label} is too large.`;
  return "";
};

export const validateQuantity = (v, { max = 1_000_000 } = {}) => {
  const s = String(v ?? "").trim();
  if (!s) return "Quantity is required.";
  if (s.includes(".")) return "Quantity must be a whole number.";
  if (!/^\d+$/.test(s)) return "Quantity must be a positive whole number.";
  const n = parseInt(s, 10);
  if (n <= 0) return "Quantity must be greater than zero.";
  if (n > max) return `Quantity cannot exceed ${max.toLocaleString()}.`;
  return "";
};

export const validatePercent = (v, { label = "Percentage" } = {}) => {
  const s = String(v ?? "").trim();
  if (!s) return `${label} is required.`;
  if (!/^\d+(\.\d+)?$/.test(s)) return `${label} must be a number.`;
  const n = parseFloat(s);
  if (n < 0 || n > 100) return `${label} must be between 0 and 100.`;
  return "";
};

export const validateAmount = (v, { label = "Amount", min = 1, max = 1e9 } = {}) => {
  const s = String(v ?? "").trim();
  if (!s) return `${label} is required.`;
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    return `${label} must be a number with at most 2 decimal places.`;
  const n = parseFloat(s);
  if (n <= 0) return `${label} must be greater than zero.`;
  if (n < min) return `${label} must be at least ${min}.`;
  if (n > max) return `${label} is too large.`;
  return "";
};

/** Currency display. Falls back to a plain join if the locale lacks the code. */
export const formatCurrency = (v, currency = "INR", locale = "en-IN") => {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
};

/**
 * Accepts only the YYYY-MM-DD that <input type="date"> emits, and rejects
 * calendar-invalid dates (2025-02-31) that Date() would silently roll over.
 */
export const validateDate = (v, { label = "Date", min, max, required = true } = {}) => {
  const s = (v || "").trim();
  if (!s) return required ? `${label} is required.` : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${label} must be selected from the date picker.`;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    return `${label} is not a real calendar date.`;
  if (min && s < min) return `${label} cannot be before ${min}.`;
  if (max && s > max) return `${label} cannot be after ${max}.`;
  return "";
};

export const validateTime = (v, { label = "Time", required = true } = {}) => {
  const s = (v || "").trim();
  if (!s) return required ? `${label} is required.` : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))
    return `${label} must be selected from the time picker.`;
  return "";
};

/** Date of birth: a real date, in the past, age 18-120. */
export const validateDob = (v, { minAge = 18, maxAge = 120 } = {}) => {
  const base = validateDate(v, { label: "Date of birth" });
  if (base) return base;
  const today = new Date();
  const dob = new Date(`${v}T00:00:00Z`);
  if (dob > today) return "Date of birth cannot be in the future.";
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const before =
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (before) age--;
  if (age < minAge) return `You must be at least ${minAge} years old to trade.`;
  if (age > maxAge) return "Enter a valid date of birth.";
  return "";
};

export const validateAddress = (v, { label = "Address", required = true } = {}) => {
  const s = normalizeText(v || "");
  if (!s) return required ? `${label} is required.` : "";
  if (s.length > LIMITS.ADDRESS_MAX)
    return `${label} must be ${LIMITS.ADDRESS_MAX} characters or fewer.`;
  if (/<[^>]*>/.test(s)) return `${label} cannot contain HTML.`;
  if (!ADDRESS_RE.test(s))
    return `${label} can only contain letters, numbers, spaces and , - / . # ( )`;
  return "";
};

export const validatePan = (v) => {
  const s = (v || "").trim().toUpperCase();
  if (!s) return "PAN number is required.";
  if (s.length !== 10) return "PAN number must be exactly 10 characters.";
  if (!PAN_RE.test(s)) return "PAN must be in the format ABCDE1234F.";
  return "";
};

export const validateAadhaar = (v) => {
  const s = (v || "").replace(/\s/g, "");
  if (!s) return "Aadhaar number is required.";
  if (!/^\d+$/.test(s)) return "Aadhaar number must contain digits only.";
  if (s.length !== 12) return "Aadhaar number must be exactly 12 digits.";
  if (!AADHAAR_RE.test(s)) return "Enter a valid Aadhaar number.";
  return "";
};

export const validateZip = (v, country = "IN") => {
  const s = (v || "").trim();
  const rule = ZIP_RULES[country] || ZIP_RULES.IN;
  if (!s) return `${rule.label} is required.`;
  if (!/^\d+$/.test(s)) return `${rule.label} must contain digits only.`;
  if (s.length !== rule.digits) return `${rule.label} must be exactly ${rule.digits} digits.`;
  if (rule.starts && !rule.starts.test(s)) return `Enter a valid ${rule.label}.`;
  return "";
};

export const validateNotes = (v, { label = "Notes", max = LIMITS.NOTES_MAX, required = false } = {}) => {
  const s = (v || "").trim();
  if (!s) return required ? `${label} is required.` : "";
  if (s.length > max) return `${label} must be ${max} characters or fewer.`;
  if (/<[^>]*>/.test(s)) return `${label} cannot contain HTML tags.`;
  return "";
};

export const validateSearch = (v) => {
  const s = (v || "").trim();
  if (s.length > LIMITS.SEARCH_MAX) return `Search must be ${LIMITS.SEARCH_MAX} characters or fewer.`;
  if (/<[^>]*>/.test(s)) return "Search cannot contain HTML.";
  return "";
};

/* ── Form helper ────────────────────────────────────────────────────────── */

/**
 * Run a map of `field -> () => message` and return { errors, isValid, firstError }.
 * Keeps submit handlers declarative instead of a wall of early returns.
 */
export const runValidators = (validators) => {
  const errors = {};
  for (const [field, fn] of Object.entries(validators)) {
    const msg = fn();
    if (msg) errors[field] = msg;
  }
  const keys = Object.keys(errors);
  return { errors, isValid: keys.length === 0, firstError: keys.length ? errors[keys[0]] : "" };
};
