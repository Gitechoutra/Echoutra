"""End-to-end validation tests against the real Flask routes.

test_validators.py proves the rules; this proves they are actually *wired in*
and reject a hostile request at the HTTP boundary. It posts through the real
app with a stubbed DB session, so a route that forgets to call the Validator
fails here even though the unit tests still pass.

Run:  pytest tests/test_route_validation.py -q
"""

import json
import os
import sys
from unittest.mock import patch

import pytest

os.environ.setdefault('FLASK_ENV', 'dev')


@pytest.fixture(scope='module')
def client():
    """Real app + real routes; the DB is never reached because validation
    rejects these payloads before any query runs."""
    from app import app
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def _body(res):
    return json.loads(res.data)


def _msg(res):
    return (_body(res).get('response') or {}).get('message', '')


# ── Register ────────────────────────────────────────────────────────────────

REGISTER_OK = {
    'email': 'valid.user@gmail.com',
    'username': 'valid_user',
    'password': 'Passw0rd!',
    'first_name': 'Pavan',
    'last_name': 'Kumar',
    'mobile_number': '9876543210',
    'date_of_birth': '1990-01-01',
    'country': 'India',
    'state': 'Telangana',
    'city': 'Hyderabad',
    'terms_accepted': True,
}


def _register(client, **overrides):
    payload = {**REGISTER_OK, **overrides}
    return client.post('/v1/authentication/register', json=payload)


@pytest.mark.parametrize('field,value,expect', [
    ('first_name',  'Pavan123',      'cannot contain numbers'),
    ('first_name',  '@Pavan',        'can only contain letters'),
    ('last_name',   '<script>x</script>', 'can only contain letters'),
    ('email',       'usergmail.com', 'valid email'),
    ('email',       '@gmail.com',    'valid email'),
    ('username',    'pavan kumar',   'cannot contain spaces'),
    ('username',    'pavan@kumar',   'letters, numbers, underscore'),
    ('password',    'short1!',       'at least 8 characters'),
    ('password',    'password1!',    'uppercase'),
    ('password',    'Password!',     'number'),
    ('password',    'Password1',     'special character'),
    ('mobile_number', '98765abcde',  'cannot contain letters'),
    ('mobile_number', '12345',       'digits'),
    ('date_of_birth', '2020-01-01',  'at least 18'),
    ('date_of_birth', '15/03/2024',  'YYYY-MM-DD'),
])
def test_register_rejects_bad_field(client, field, value, expect):
    res = _register(client, **{field: value})
    assert _body(res)['bool'] is False
    assert expect.lower() in _msg(res).lower(), f"{field}={value!r} -> {_msg(res)!r}"


def test_register_rejects_missing_terms(client):
    res = _register(client, terms_accepted=False)
    assert _body(res)['bool'] is False
    assert 'terms' in _msg(res).lower()


def test_register_returns_field_error_map(client):
    """Several bad fields at once come back as a map, not just one message."""
    res = _register(client, first_name='Pavan123', email='nope')
    errors = _body(res)['response']['errors']
    assert set(errors) == {'first_name', 'email'}


def test_register_cannot_self_assign_admin_role(client):
    """role_name is client-supplied; honouring it would let anyone mint an
    admin. The route must ignore it and always create a USER."""
    with patch('portal.routes.authentication.routes.Users') as users, \
         patch('portal.routes.authentication.routes.Roles') as roles:
        users.query.filter_by.return_value.first.return_value = None
        roles.query.filter_by.return_value.first.return_value = None  # forces early exit
        _register(client, role_name='ADMIN', email='esc@gmail.com', username='esc_user')

        # Whatever role was looked up, it must have been USER — never ADMIN.
        looked_up = [c.kwargs.get('role_name') for c in roles.query.filter_by.call_args_list]
        assert 'ADMIN' not in looked_up
        assert looked_up == ['USER']


# ── Login ───────────────────────────────────────────────────────────────────

def test_login_rejects_malformed_email_without_enumerating(client):
    res = client.post('/v1/authentication/login',
                      json={'email': 'usergmail.com', 'password': 'x'})
    assert _body(res)['bool'] is False
    # Same generic text as a wrong password — must not reveal the reason.
    assert _msg(res) == 'Invalid email or password.'


def test_login_does_not_enforce_password_complexity(client):
    """A legacy weak password must reach the credential check, not be bounced
    by the new complexity rule -- otherwise existing users are locked out."""
    with patch('portal.routes.authentication.routes.Users') as users:
        users.query.filter_by.return_value.first.return_value = None
        res = client.post('/v1/authentication/login',
                          json={'email': 'old.user@gmail.com', 'password': 'weak'})
        # It got as far as the DB lookup rather than failing validation.
        assert users.query.filter_by.called
        assert _body(res)['bool'] is False


# ── Reset password ──────────────────────────────────────────────────────────

@pytest.mark.parametrize('payload,expect', [
    ({'email': 'u@gmail.com', 'otp_code': '12345',  'new_password': 'Passw0rd!'}, 'exactly 6 digits'),
    ({'email': 'u@gmail.com', 'otp_code': '12a456', 'new_password': 'Passw0rd!'}, 'numbers only'),
    ({'email': 'u@gmail.com', 'otp_code': '123456', 'new_password': 'weak'},      'at least 8 characters'),
    ({'email': 'bad',         'otp_code': '123456', 'new_password': 'Passw0rd!'}, 'valid email'),
])
def test_reset_password_validates(client, payload, expect):
    res = client.post('/v1/authentication/reset_password', json=payload)
    assert _body(res)['bool'] is False
    assert expect.lower() in _msg(res).lower()


def test_reset_password_closes_the_6_char_downgrade(client):
    """The old flow accepted 6 chars, letting a reset drop a password below
    the bar signup enforces."""
    res = client.post('/v1/authentication/reset_password', json={
        'email': 'u@gmail.com', 'otp_code': '123456', 'new_password': 'Abc12!',
    })
    assert _body(res)['bool'] is False
    assert 'at least 8' in _msg(res).lower()


def test_forgot_password_still_does_not_enumerate(client):
    """A malformed email must produce the same success reply as an unknown one."""
    with patch('portal.routes.authentication.routes.Users') as users:
        users.query.filter_by.return_value.first.return_value = None
        bad_res = client.post('/v1/authentication/forgot_password', json={'email': 'nope'})
        unknown_res = client.post('/v1/authentication/forgot_password',
                                  json={'email': 'unknown@gmail.com'})
    assert _msg(bad_res) == _msg(unknown_res)
    assert _body(bad_res)['bool'] == _body(unknown_res)['bool'] is True
