import { describe, it, expect } from "vitest";
import {
  filterName, filterUsername, filterMobile, filterSymbol, filterDecimal,
  filterQuantity, filterPercent, filterSearch, filterAadhaar, filterPan,
  validateName, validateEmail, validateUsername, validateMobile, validateOtp,
  validatePassword, validateConfirmPassword, passwordStrength, validateSymbol,
  validatePrice, validateQuantity, validatePercent, validateAmount,
  validateDate, validateTime, validateDob, validateAddress, validatePan,
  validateAadhaar, validateZip, validateNotes, validateSearch,
  formatCurrency, runValidators, normalizeText,
} from "./validation";

/** Valid == empty-string message. */
const ok = (msg) => expect(msg).toBe("");
const bad = (msg) => expect(msg).not.toBe("");

describe("1. Name fields", () => {
  it("accepts the spec's example", () => ok(validateName("Pavan Kumar")));
  it("rejects the spec's examples", () => {
    bad(validateName("Pavan123"));
    bad(validateName("@Pavan"));
  });
  it("accepts real names with apostrophes and hyphens", () => {
    ok(validateName("O'Brien"));
    ok(validateName("Jean-Luc Picard"));
    ok(validateName("Aisha Al-Rashid"));
  });
  it("rejects digits, symbols and markup", () => {
    bad(validateName("Pavan 1"));
    bad(validateName("Pavan@Kumar"));
    bad(validateName("<script>alert(1)</script>"));
  });
  it("rejects empty and whitespace-only input", () => {
    bad(validateName(""));
    bad(validateName("   "));
  });
  it("collapses interior double spaces rather than rejecting them", () =>
    ok(validateName("Pavan  Kumar")));
  it("rejects leading/trailing hyphens and doubled separators", () => {
    bad(validateName("-Pavan"));
    bad(validateName("Pavan--Kumar"));
  });
  it("enforces the 50-char cap", () => bad(validateName("A".repeat(51))));

  it("filters disallowed characters as the user types", () => {
    expect(filterName("Pavan123")).toBe("Pavan");
    expect(filterName("@Pavan!")).toBe("Pavan");
    expect(filterName("O'Brien")).toBe("O'Brien");
  });
});

describe("2. Email", () => {
  it("accepts the spec's example", () => ok(validateEmail("user@gmail.com")));
  it("rejects the spec's examples", () => {
    bad(validateEmail("usergmail.com"));
    bad(validateEmail("@gmail.com"));
  });
  it("accepts subdomains, plus-tags and dotted locals", () => {
    ok(validateEmail("first.last+tag@mail.co.uk"));
  });
  it("rejects malformed addresses", () => {
    bad(validateEmail("user@"));
    bad(validateEmail("user@gmail"));       // no TLD
    bad(validateEmail("user@@gmail.com"));
    bad(validateEmail("user name@gmail.com"));
    bad(validateEmail("user@.com"));
    bad(validateEmail(""));
  });
});

describe("3. Mobile number", () => {
  it("accepts a valid 10-digit Indian number", () => ok(validateMobile("9876543210", "IN")));
  it("rejects letters and special characters", () => {
    bad(validateMobile("98765abcde", "IN"));
    bad(validateMobile("98765-43210", "IN"));
    bad(validateMobile("+91 (987) 654", "IN"));
  });
  it("enforces exactly 10 digits for India", () => {
    bad(validateMobile("987654321", "IN"));    // 9
    bad(validateMobile("98765432101", "IN"));  // 11
  });
  it("rejects Indian numbers not starting 6-9", () => bad(validateMobile("1234567890", "IN")));
  it("accepts international numbers by dial code", () => {
    ok(validateMobile("+919876543210"));
    ok(validateMobile("+12125551234"));   // US
    ok(validateMobile("+6591234567"));    // SG, 8 digits
  });
  it("rejects a wrong-length number for its dial code", () =>
    bad(validateMobile("+9198765")));

  it("keeps a leading + but strips other punctuation while typing", () => {
    expect(filterMobile("+91 98765-43210")).toBe("+919876543210");
    expect(filterMobile("98abc76")).toBe("9876");
  });
});

describe("4. OTP", () => {
  it("accepts a 6-digit code", () => ok(validateOtp("123456", 6)));
  it("accepts a 4-digit code when configured", () => ok(validateOtp("1234", 4)));
  it("rejects wrong length", () => {
    bad(validateOtp("12345", 6));
    bad(validateOtp("1234567", 6));
  });
  it("rejects non-numeric codes", () => {
    bad(validateOtp("12a456", 6));
    bad(validateOtp("      ", 6));
  });
});

describe("5. Password", () => {
  it("accepts a compliant password", () => ok(validatePassword("Passw0rd!")));
  it("requires 8+ characters", () => bad(validatePassword("Pw1!aaa")));
  it("requires each character class", () => {
    bad(validatePassword("password1!"));  // no uppercase
    bad(validatePassword("PASSWORD1!"));  // no lowercase
    bad(validatePassword("Password!"));   // no number
    bad(validatePassword("Password1"));   // no special
  });
  it("caps length to stop DoS via bcrypt on huge inputs", () =>
    bad(validatePassword("Aa1!" + "x".repeat(200))));

  it("scores strength 0-4", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(0);
    expect(passwordStrength("Password1!")).toBe(4);
    expect(passwordStrength("VeryLongPassw0rd!")).toBe(4);
  });
});

describe("6. Confirm password", () => {
  it("accepts an exact match", () => ok(validateConfirmPassword("Passw0rd!", "Passw0rd!")));
  it("rejects a mismatch, including case and whitespace", () => {
    bad(validateConfirmPassword("Passw0rd!", "passw0rd!"));
    bad(validateConfirmPassword("Passw0rd!", "Passw0rd! "));
    bad(validateConfirmPassword("Passw0rd!", ""));
  });
});

describe("7. Username", () => {
  it("accepts letters, numbers, underscore and dot", () => {
    ok(validateUsername("pavan_kumar"));
    ok(validateUsername("pavan.kumar99"));
  });
  it("rejects spaces and other specials", () => {
    bad(validateUsername("pavan kumar"));
    bad(validateUsername("pavan@kumar"));
    bad(validateUsername("pavan-kumar"));
  });
  it("enforces length bounds", () => {
    bad(validateUsername("ab"));
    bad(validateUsername("a".repeat(31)));
  });
  it("strips disallowed characters while typing", () =>
    expect(filterUsername("pavan kumar@!")).toBe("pavankumar"));
});

describe("8. Search box", () => {
  it("allows letters, numbers, spaces and symbols", () => {
    ok(validateSearch("Tata Motors"));
    ok(validateSearch("AAPL"));
    ok(validateSearch("BRK.B"));
    ok(validateSearch("reliance 2024"));
  });
  it("rejects HTML", () => bad(validateSearch("<script>alert(1)</script>")));
  it("strips injection-shaped characters while typing", () => {
    expect(filterSearch("<script>alert(1)</script>")).toBe("scriptalert(1)/script");
    expect(filterSearch("AAPL'; DROP TABLE--")).toBe("AAPL DROP TABLE--");
    expect(filterSearch("Tata Motors")).toBe("Tata Motors");
  });
  it("caps length", () => bad(validateSearch("a".repeat(65))));
});

describe("9. Stock symbol", () => {
  it("accepts the spec's examples", () => {
    ok(validateSymbol("AAPL"));
    ok(validateSymbol("TSLA"));
    ok(validateSymbol("RELIANCE"));
    ok(validateSymbol("INFY"));
  });
  it("rejects the spec's example", () => bad(validateSymbol("AAPL@")));
  it("rejects lowercase and spaces", () => {
    bad(validateSymbol("aapl"));
    bad(validateSymbol("AA PL"));
  });
  it("accepts dotted class symbols like BRK.B", () => ok(validateSymbol("BRK.B")));
  it("uppercases and strips while typing", () =>
    expect(filterSymbol("aapl@!")).toBe("AAPL"));
});

describe("10. Price fields", () => {
  it("accepts integers and decimals", () => {
    ok(validatePrice("100"));
    ok(validatePrice("2499.95"));
  });
  it("rejects alphabets and mixed input", () => {
    bad(validatePrice("abc"));
    bad(validatePrice("100abc"));
    bad(validatePrice("1e5"));
  });
  it("rejects negatives and zero", () => {
    bad(validatePrice("-100"));
    bad(validatePrice("0"));
  });
  it("keeps one decimal point while typing", () => {
    expect(filterDecimal("12.34.56", 2)).toBe("12.34");
    expect(filterDecimal("abc12.5", 2)).toBe("12.5");
    expect(filterDecimal("12.999", 2)).toBe("12.99");
  });
});

describe("11. Quantity", () => {
  it("accepts positive integers", () => {
    ok(validateQuantity("1"));
    ok(validateQuantity("250"));
  });
  it("rejects decimals", () => bad(validateQuantity("2.5")));
  it("rejects zero and negatives", () => {
    bad(validateQuantity("0"));
    bad(validateQuantity("-5"));
  });
  it("rejects scientific notation and letters", () => {
    bad(validateQuantity("1e5"));
    bad(validateQuantity("ten"));
  });
  it("caps absurd sizes", () => bad(validateQuantity("99999999")));
  it("strips non-digits and leading zeros while typing", () => {
    expect(filterQuantity("-5")).toBe("5");
    expect(filterQuantity("2.5")).toBe("25");
    expect(filterQuantity("007")).toBe("7");
    expect(filterQuantity("1e5")).toBe("15");
  });
});

describe("12. Percentage fields", () => {
  it("accepts 0-100 with decimals", () => {
    ok(validatePercent("0"));
    ok(validatePercent("12.5"));
    ok(validatePercent("100"));
  });
  it("rejects out-of-range values", () => {
    bad(validatePercent("101"));
    bad(validatePercent("-1"));
  });
  it("rejects alphabets", () => bad(validatePercent("50%")));
  it("clamps to 100 while typing", () => {
    expect(filterPercent("150")).toBe("100");
    expect(filterPercent("99.5")).toBe("99.5");
  });
});

describe("13. Amount fields", () => {
  it("accepts positive amounts up to 2dp", () => {
    ok(validateAmount("1"));
    ok(validateAmount("1500.50"));
  });
  it("rejects zero, negatives and >2dp", () => {
    bad(validateAmount("0"));
    bad(validateAmount("-50"));
    bad(validateAmount("10.999"));
  });
  it("formats currency", () => {
    expect(formatCurrency(1500.5, "INR", "en-IN")).toContain("1,500.50");
    expect(formatCurrency(1500.5, "USD", "en-US")).toContain("1,500.50");
    expect(formatCurrency("abc")).toBe("");
  });
});

describe("14. Date", () => {
  it("accepts a picker-shaped date", () => ok(validateDate("2024-03-15")));
  it("rejects free-typed formats", () => {
    bad(validateDate("15/03/2024"));
    bad(validateDate("March 15 2024"));
    bad(validateDate("2024-3-5"));
  });
  it("rejects calendar-invalid dates that Date() would roll over", () => {
    bad(validateDate("2025-02-31"));
    bad(validateDate("2024-13-01"));
  });
  it("honours min/max bounds", () => {
    bad(validateDate("2020-01-01", { min: "2024-01-01" }));
    bad(validateDate("2030-01-01", { max: "2024-12-31" }));
  });
});

describe("15. Time", () => {
  it("accepts 24-hour times", () => {
    ok(validateTime("09:15"));
    ok(validateTime("23:59"));
  });
  it("rejects invalid times", () => {
    bad(validateTime("24:00"));
    bad(validateTime("9:15"));
    bad(validateTime("09:60"));
    bad(validateTime("9am"));
  });
});

describe("Date of birth (age gate)", () => {
  it("accepts an adult", () => ok(validateDob("1990-01-01")));
  it("rejects a minor", () => {
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 10);
    bad(validateDob(recent.toISOString().split("T")[0]));
  });
  it("rejects future dates", () => bad(validateDob("2999-01-01")));
});

describe("16. Address", () => {
  it("accepts letters, numbers, comma, hyphen, slash and spaces", () =>
    ok(validateAddress("12-B, MG Road / Sector 4, Hyderabad")));
  it("rejects HTML and script payloads", () => {
    bad(validateAddress("<script>alert(1)</script>"));
    bad(validateAddress("<b>Road</b>"));
  });
  it("rejects other specials", () => bad(validateAddress("Road $%^&*")));
  it("caps length", () => bad(validateAddress("a".repeat(201))));
});

describe("17. PAN number", () => {
  it("accepts the spec's format", () => ok(validatePan("ABCDE1234F")));
  it("rejects malformed PANs", () => {
    bad(validatePan("ABCD1234F"));    // 4 letters
    bad(validatePan("ABCDE12345"));   // trailing digit
    bad(validatePan("ABCDE1234"));    // too short
    bad(validatePan("abcde1234f".toUpperCase() + "X"));
  });
  it("accepts lowercase by upcasing", () => ok(validatePan("abcde1234f")));
  it("strips specials while typing", () => expect(filterPan("abcde-1234f")).toBe("ABCDE1234F"));
});

describe("18. Aadhaar", () => {
  it("accepts a 12-digit number", () => ok(validateAadhaar("234567890123")));
  it("rejects wrong length", () => {
    bad(validateAadhaar("23456789012"));
    bad(validateAadhaar("2345678901234"));
  });
  it("rejects non-digits", () => bad(validateAadhaar("2345 6789 012a")));
  it("rejects numbers starting 0 or 1 per UIDAI", () => {
    bad(validateAadhaar("034567890123"));
    bad(validateAadhaar("134567890123"));
  });
  it("tolerates grouping spaces", () => ok(validateAadhaar("2345 6789 0123")));
  it("keeps only 12 digits while typing", () =>
    expect(filterAadhaar("2345-6789-0123-999")).toBe("234567890123"));
});

describe("19. ZIP / PIN code", () => {
  it("accepts a 6-digit Indian PIN", () => ok(validateZip("500081", "IN")));
  it("rejects wrong length for India", () => {
    bad(validateZip("50008", "IN"));
    bad(validateZip("5000811", "IN"));
  });
  it("rejects a PIN starting with 0", () => bad(validateZip("050081", "IN")));
  it("rejects non-digits", () => bad(validateZip("5000A1", "IN")));
  it("applies country-specific lengths", () => {
    ok(validateZip("90210", "US"));
    bad(validateZip("500081", "US"));
    ok(validateZip("2000", "AU"));
  });
});

describe("20. Notes / description", () => {
  it("accepts normal prose", () => ok(validateNotes("Bought on the dip. Target 2800.")));
  it("rejects HTML tags", () => {
    bad(validateNotes("<script>alert(1)</script>"));
    bad(validateNotes("<img src=x onerror=alert(1)>"));
  });
  it("enforces the character limit", () => {
    ok(validateNotes("a".repeat(1000)));
    bad(validateNotes("a".repeat(1001)));
  });
  it("is optional by default but requirable", () => {
    ok(validateNotes(""));
    bad(validateNotes("", { required: true }));
  });
  it("trims extra whitespace", () => {
    expect(normalizeText("  a   b  ")).toBe("a b");
  });
});

describe("runValidators", () => {
  it("collects every failing field and reports the first message", () => {
    const { errors, isValid, firstError } = runValidators({
      name: () => validateName("Pavan123"),
      email: () => validateEmail("nope"),
      ok: () => validateName("Pavan Kumar"),
    });
    expect(isValid).toBe(false);
    expect(Object.keys(errors)).toEqual(["name", "email"]);
    expect(firstError).toBe(errors.name);
  });
  it("passes clean input", () => {
    const { isValid, firstError } = runValidators({
      name: () => validateName("Pavan Kumar"),
      email: () => validateEmail("user@gmail.com"),
    });
    expect(isValid).toBe(true);
    expect(firstError).toBe("");
  });
});
