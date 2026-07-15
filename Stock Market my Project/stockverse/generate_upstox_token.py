"""
generate_upstox_token.py
========================
Interactive helper to generate a fresh Upstox access token and write it straight
into `.env`. Upstox tokens expire every day (~3:30 AM IST), so run this each
trading morning:

    python generate_upstox_token.py

It uses UPSTOX_API_KEY / UPSTOX_API_SECRET / UPSTOX_REDIRECT_URI from `.env`.
The redirect URI MUST exactly match the one registered in your Upstox app at
https://developer.upstox.com (e.g. https://127.0.0.1 or your registered URL).

Flow:
  1. Prints the login URL — open it in a browser, log in + approve.
  2. Upstox redirects to your redirect URI with `?code=XXXX` in the address bar.
  3. Paste that `code` here.
  4. The script exchanges it for an access token and rewrites the
     UPSTOX_ACCESS_TOKEN line in `.env`, then prints the new expiry.
"""
import os
import re
import sys
import json
import base64
import datetime
from urllib.parse import quote, urlparse, parse_qs

import requests
from dotenv import load_dotenv

ENV_PATH  = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
AUTH_URL  = 'https://api.upstox.com/v2/login/authorization/dialog'
TOKEN_URL = 'https://api.upstox.com/v2/login/authorization/token'


def _fail(msg):
    print(f'\n[ERROR] {msg}')
    sys.exit(1)


def _decode_expiry(token):
    try:
        p = token.split('.')[1]
        p += '=' * (-len(p) % 4)
        exp = json.loads(base64.urlsafe_b64decode(p))['exp']
        return datetime.datetime.fromtimestamp(exp, datetime.timezone.utc)
    except Exception:
        return None


def _write_env_token(token):
    """Replace (or append) the UPSTOX_ACCESS_TOKEN line in .env."""
    with open(ENV_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    line = f'UPSTOX_ACCESS_TOKEN={token}'
    if re.search(r'^UPSTOX_ACCESS_TOKEN=.*$', content, re.M):
        content = re.sub(r'^UPSTOX_ACCESS_TOKEN=.*$', line, content, count=1, flags=re.M)
    else:
        content = content.rstrip() + '\n' + line + '\n'
    with open(ENV_PATH, 'w', encoding='utf-8') as f:
        f.write(content)


def main():
    load_dotenv(ENV_PATH)
    api_key      = (os.environ.get('UPSTOX_API_KEY') or '').strip()
    api_secret   = (os.environ.get('UPSTOX_API_SECRET') or '').strip()
    redirect_uri = (os.environ.get('UPSTOX_REDIRECT_URI') or '').strip()

    if not api_key or not api_secret:
        _fail('UPSTOX_API_KEY / UPSTOX_API_SECRET missing from .env.')
    if not redirect_uri:
        redirect_uri = input(
            'UPSTOX_REDIRECT_URI is not set in .env.\n'
            'Enter the redirect URI registered in your Upstox app '
            '(e.g. https://127.0.0.1): '
        ).strip()
        if not redirect_uri:
            _fail('A redirect URI is required (must match your Upstox app config).')

    login_url = (f'{AUTH_URL}?response_type=code'
                 f'&client_id={quote(api_key, safe="")}'
                 f'&redirect_uri={quote(redirect_uri, safe="")}')

    print('\n' + '=' * 70)
    print('STEP 1 — open this URL in your browser, log in and approve:\n')
    print('  ' + login_url)
    print('\nSTEP 2 — after approving, your browser jumps to a URL like:')
    print(f'  {redirect_uri}?code=abc123&...')
    print('=' * 70)

    raw = input('\nPaste the `code` value (or the full redirected URL): ').strip()
    # Accept either a bare code or the whole redirected URL.
    if raw.startswith('http'):
        qs = parse_qs(urlparse(raw).query)
        code = (qs.get('code') or [''])[0]
    else:
        code = raw
    if not code:
        _fail('No authorization code found in what you pasted.')

    print('\nExchanging code for an access token ...')
    try:
        resp = requests.post(
            TOKEN_URL,
            data={
                'code':          code,
                'client_id':     api_key,
                'client_secret': api_secret,
                'redirect_uri':  redirect_uri,
                'grant_type':    'authorization_code',
            },
            headers={'accept': 'application/json',
                     'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=30,
        )
        payload = resp.json()
    except requests.RequestException as e:
        _fail(f'Network error talking to Upstox: {e}')
    except ValueError:
        _fail('Upstox returned a non-JSON response.')

    token = payload.get('access_token')
    if not token:
        _fail(f'No access_token in Upstox response (HTTP {resp.status_code}): '
              f'{json.dumps(payload)[:400]}')

    _write_env_token(token)
    exp = _decode_expiry(token)
    print('\n[SUCCESS] New access token written to .env')
    if exp:
        print(f'          Token valid until: {exp} UTC')
    print('\nNow RESTART the Flask backend so it loads the new token.')
    print('During market hours (09:15–15:30 IST) live prices will start '
          'refreshing every 10 seconds automatically.')


if __name__ == '__main__':
    main()
