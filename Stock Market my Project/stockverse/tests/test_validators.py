"""Server-side validation tests.

Mirrors newtrade-main/src/app/utils/validation.test.js. When a rule changes,
both suites should change together -- a drift between them means the user sees
a form that passes and a server that rejects.

Run:  pytest tests/test_validators.py -q
"""

from datetime import date, timedelta

import pytest

from portal.helpers.validators import (
    Validator, escape_like, normalize_text,
    validate_aadhaar, validate_address, validate_amount, validate_choice,
    validate_confirm_password, validate_date, validate_dob, validate_email,
    validate_mobile, validate_name, validate_notes, validate_otp,
    validate_pagination, validate_pan, validate_password, validate_percent,
    validate_price, validate_quantity, validate_search, validate_symbol,
    validate_time, validate_username, validate_zip,
)


def ok(msg):
    assert msg is None, f"expected valid, got: {msg}"


def bad(msg):
    assert msg is not None, "expected an error, got None"


# ── 1. Names ────────────────────────────────────────────────────────────────

def test_name_accepts_spec_example():
    ok(validate_name('Pavan Kumar'))


@pytest.mark.parametrize('value', ['Pavan123', '@Pavan', 'Pavan 1', '<script>alert(1)</script>'])
def test_name_rejects_invalid(value):
    bad(validate_name(value))


@pytest.mark.parametrize('value', ["O'Brien", 'Jean-Luc Picard', 'Aisha Al-Rashid'])
def test_name_accepts_real_world_names(value):
    ok(validate_name(value))


def test_name_rejects_empty_and_blank():
    bad(validate_name(''))
    bad(validate_name('   '))


def test_name_collapses_double_spaces():
    ok(validate_name('Pavan  Kumar'))


def test_name_rejects_dangling_separators():
    bad(validate_name('-Pavan'))
    bad(validate_name('Pavan--Kumar'))


def test_name_length_cap():
    bad(validate_name('A' * 51))


def test_name_optional_when_not_required():
    ok(validate_name('', required=False))


# ── 2. Email ────────────────────────────────────────────────────────────────

def test_email_accepts_spec_example():
    ok(validate_email('user@gmail.com'))


@pytest.mark.parametrize('value', [
    'usergmail.com', '@gmail.com', 'user@', 'user@gmail', 'user@@gmail.com',
    'user name@gmail.com', 'user@.com', '',
])
def test_email_rejects_invalid(value):
    bad(validate_email(value))


def test_email_accepts_subdomain_and_plus_tag():
    ok(validate_email('first.last+tag@mail.co.uk'))


# ── 3. Mobile ───────────────────────────────────────────────────────────────

def test_mobile_accepts_valid_indian():
    ok(validate_mobile('9876543210', country='IN'))


@pytest.mark.parametrize('value', ['98765abcde', '98765-43210', '987654321', '98765432101', '1234567890'])
def test_mobile_rejects_invalid_indian(value):
    bad(validate_mobile(value, country='IN'))


@pytest.mark.parametrize('value', ['+919876543210', '+12125551234', '+6591234567'])
def test_mobile_accepts_international(value):
    ok(validate_mobile(value))


def test_mobile_rejects_wrong_length_for_dial_code():
    bad(validate_mobile('+9198765'))


# ── 4. OTP ──────────────────────────────────────────────────────────────────

def test_otp_valid():
    ok(validate_otp('123456', length=6))
    ok(validate_otp('1234', length=4))


@pytest.mark.parametrize('value', ['12345', '1234567', '12a456', '', '      '])
def test_otp_rejects_invalid(value):
    bad(validate_otp(value, length=6))


# ── 5/6. Password ───────────────────────────────────────────────────────────

def test_password_accepts_compliant():
    ok(validate_password('Passw0rd!'))


@pytest.mark.parametrize('value', [
    'Pw1!aaa',        # too short
    'password1!',     # no uppercase
    'PASSWORD1!',     # no lowercase
    'Password!',      # no number
    'Password1',      # no special
    '',
])
def test_password_rejects_invalid(value):
    bad(validate_password(value))


def test_password_length_cap():
    bad(validate_password('Aa1!' + 'x' * 200))


def test_confirm_password():
    ok(validate_confirm_password('Passw0rd!', 'Passw0rd!'))
    bad(validate_confirm_password('Passw0rd!', 'passw0rd!'))
    bad(validate_confirm_password('Passw0rd!', 'Passw0rd! '))
    bad(validate_confirm_password('Passw0rd!', ''))


# ── 7. Username ─────────────────────────────────────────────────────────────

def test_username_accepts_allowed_charset():
    ok(validate_username('pavan_kumar'))
    ok(validate_username('pavan.kumar99'))


@pytest.mark.parametrize('value', ['pavan kumar', 'pavan@kumar', 'pavan-kumar', 'ab', 'a' * 31])
def test_username_rejects_invalid(value):
    bad(validate_username(value))


# ── 8. Search ───────────────────────────────────────────────────────────────

def test_search_allows_normal_queries():
    ok(validate_search('Tata Motors'))
    ok(validate_search('BRK.B'))
    ok(validate_search('reliance 2024'))


def test_search_rejects_html_and_overlong():
    bad(validate_search('<script>alert(1)</script>'))
    bad(validate_search('a' * 65))


def test_escape_like_neutralises_wildcards():
    # An unescaped '%' would match every row; this keeps it a literal.
    assert escape_like('100%') == '100\\%'
    assert escape_like('a_b') == 'a\\_b'
    assert escape_like('a\\b') == 'a\\\\b'


# ── 9. Stock symbol ─────────────────────────────────────────────────────────

@pytest.mark.parametrize('value', ['AAPL', 'TSLA', 'RELIANCE', 'INFY', 'BRK.B'])
def test_symbol_accepts_valid(value):
    ok(validate_symbol(value))


@pytest.mark.parametrize('value', ['AAPL@', 'aapl', 'AA PL', ''])
def test_symbol_rejects_invalid(value):
    bad(validate_symbol(value))


# ── 10. Price ───────────────────────────────────────────────────────────────

def test_price_accepts_numbers():
    ok(validate_price('100'))
    ok(validate_price('2499.95'))
    ok(validate_price(2499.95))          # JSON number from reqparse


@pytest.mark.parametrize('value', ['abc', '100abc', '-100', '0', ''])
def test_price_rejects_invalid(value):
    bad(validate_price(value))


def test_price_rejects_non_finite():
    # float('nan')/inf survive reqparse(type=float) and must not reach money maths.
    bad(validate_price(float('nan')))
    bad(validate_price(float('inf')))
    bad(validate_price('NaN'))
    bad(validate_price('Infinity'))


# ── 11. Quantity ────────────────────────────────────────────────────────────

def test_quantity_accepts_positive_integers():
    ok(validate_quantity('1'))
    ok(validate_quantity('250'))
    ok(validate_quantity(5))
    ok(validate_quantity(5.0))           # reqparse(type=float) sends 5 as 5.0


@pytest.mark.parametrize('value', ['2.5', '0', '-5', 'ten', '', '99999999'])
def test_quantity_rejects_invalid(value):
    bad(validate_quantity(value))


def test_quantity_rejects_fractional_float():
    bad(validate_quantity(2.5))


def test_quantity_rejects_non_finite():
    # The regression this guards: `quantity <= 0` is False for NaN, so the old
    # guard passed NaN straight into the order engine.
    bad(validate_quantity(float('nan')))
    bad(validate_quantity(float('inf')))
    bad(validate_quantity('NaN'))


# ── 12. Percent ─────────────────────────────────────────────────────────────

def test_percent_accepts_range():
    ok(validate_percent('0'))
    ok(validate_percent('12.5'))
    ok(validate_percent('100'))


@pytest.mark.parametrize('value', ['101', '-1', '50%', 'abc'])
def test_percent_rejects_invalid(value):
    bad(validate_percent(value))


# ── 13. Amount ──────────────────────────────────────────────────────────────

def test_amount_accepts_money():
    ok(validate_amount('1'))
    ok(validate_amount('1500.50'))
    ok(validate_amount(1500.50))


@pytest.mark.parametrize('value', ['0', '-50', '10.999', 'abc', ''])
def test_amount_rejects_invalid(value):
    bad(validate_amount(value))


def test_amount_rejects_non_finite():
    bad(validate_amount(float('nan')))
    bad(validate_amount(float('inf')))


# ── 14/15. Date & time ──────────────────────────────────────────────────────

def test_date_accepts_iso():
    ok(validate_date('2024-03-15'))


@pytest.mark.parametrize('value', ['15/03/2024', 'March 15 2024', '2024-3-5', ''])
def test_date_rejects_non_iso(value):
    bad(validate_date(value))


@pytest.mark.parametrize('value', ['2025-02-31', '2024-13-01'])
def test_date_rejects_calendar_invalid(value):
    bad(validate_date(value))


def test_date_bounds():
    bad(validate_date('2020-01-01', min_date=date(2024, 1, 1)))
    bad(validate_date('2030-01-01', max_date=date(2024, 12, 31)))


def test_time_valid_and_invalid():
    ok(validate_time('09:15'))
    ok(validate_time('23:59'))
    for v in ('24:00', '9:15', '09:60', '9am'):
        bad(validate_time(v))


def test_dob_age_gate():
    ok(validate_dob('1990-01-01'))
    minor = (date.today() - timedelta(days=365 * 10)).isoformat()
    bad(validate_dob(minor))
    bad(validate_dob('2999-01-01'))


# ── 16. Address ─────────────────────────────────────────────────────────────

def test_address_accepts_allowed_charset():
    ok(validate_address('12-B, MG Road / Sector 4, Hyderabad'))


@pytest.mark.parametrize('value', ['<script>alert(1)</script>', '<b>Road</b>', 'Road $%^&*', 'a' * 201])
def test_address_rejects_invalid(value):
    bad(validate_address(value))


# ── 17. PAN ─────────────────────────────────────────────────────────────────

def test_pan_accepts_spec_format():
    ok(validate_pan('ABCDE1234F'))
    ok(validate_pan('abcde1234f'))       # upcased before checking


@pytest.mark.parametrize('value', ['ABCD1234F', 'ABCDE12345', 'ABCDE1234', 'ABCDE1234FX', ''])
def test_pan_rejects_invalid(value):
    bad(validate_pan(value))


# ── 18. Aadhaar ─────────────────────────────────────────────────────────────

def test_aadhaar_accepts_valid():
    ok(validate_aadhaar('234567890123'))
    ok(validate_aadhaar('2345 6789 0123'))


@pytest.mark.parametrize('value', [
    '23456789012', '2345678901234', '2345 6789 012a',
    '034567890123', '134567890123', '',
])
def test_aadhaar_rejects_invalid(value):
    bad(validate_aadhaar(value))


# ── 19. ZIP / PIN ───────────────────────────────────────────────────────────

def test_zip_india():
    ok(validate_zip('500081', country='IN'))
    for v in ('50008', '5000811', '050081', '5000A1'):
        bad(validate_zip(v, country='IN'))


def test_zip_country_specific():
    ok(validate_zip('90210', country='US'))
    bad(validate_zip('500081', country='US'))
    ok(validate_zip('2000', country='AU'))


# ── 20. Notes ───────────────────────────────────────────────────────────────

def test_notes_accepts_prose():
    ok(validate_notes('Bought on the dip. Target 2800.'))


@pytest.mark.parametrize('value', ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>'])
def test_notes_rejects_html(value):
    bad(validate_notes(value))


def test_notes_length_and_optionality():
    ok(validate_notes('a' * 1000))
    bad(validate_notes('a' * 1001))
    ok(validate_notes(''))
    bad(validate_notes('', required=True))


def test_normalize_text_trims_and_collapses():
    assert normalize_text('  a   b  ') == 'a b'
    assert normalize_text(None) == ''


# ── Choice / pagination ─────────────────────────────────────────────────────

def test_validate_choice():
    ok(validate_choice('BUY', ['BUY', 'SELL']))
    ok(validate_choice('buy', ['BUY', 'SELL']))     # case-insensitive
    bad(validate_choice('HODL', ['BUY', 'SELL']))
    bad(validate_choice('', ['BUY', 'SELL']))


def test_validate_pagination_clamps():
    ok(validate_pagination(1, 20))
    bad(validate_pagination(0, 20))
    bad(validate_pagination(1, 1_000_000))          # memory-exhaustion guard
    bad(validate_pagination('abc', 20))


# ── Validator collector ─────────────────────────────────────────────────────

def test_validator_collects_errors_in_order():
    v = Validator()
    v.check('name', validate_name('Pavan123'))
    v.check('email', validate_email('nope'))
    v.check('good', validate_name('Pavan Kumar'))
    assert not v.ok
    assert list(v.errors) == ['name', 'email']
    assert v.first_error == v.errors['name']


def test_validator_passes_clean_input():
    v = Validator()
    v.check('name', validate_name('Pavan Kumar'))
    v.check('email', validate_email('user@gmail.com'))
    assert v.ok
    assert v.first_error == ''


def test_validator_require_helper():
    v = Validator()
    v.require('amount', '', 'Amount')
    assert not v.ok
    assert 'Amount' in v.first_error


def test_validator_keeps_first_message_per_field():
    v = Validator()
    v.check('f', 'first')
    v.check('f', 'second')
    assert v.errors['f'] == 'first'
