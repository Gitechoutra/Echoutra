"""
portal/helpers/email.py
========================
Flask-Mail initialisation + all transactional email helpers.

Gmail Setup (REQUIRED — plain password will NOT work):
──────────────────────────────────────────────────────
1. Login to https://myaccount.google.com/security
2. Turn ON  "2-Step Verification"  (mandatory first step)
3. Go to    https://myaccount.google.com/apppasswords
4. Select   App → "Mail",  Device → "Other" → type "StockVerse"
5. Google gives a 16-character password like:  abcd efgh ijkl mnop
6. Copy it WITHOUT spaces into .env:
       MAIL_PASSWORD=abcdefghijklmnop

.env keys used:
    MAIL_SERVER          smtp.gmail.com
    MAIL_PORT            587
    MAIL_USE_TLS         True
    MAIL_USE_SSL         False
    MAIL_USERNAME        ramanarajmuddada20@gmail.com
    MAIL_PASSWORD        <16-char app password — NO spaces>
    MAIL_DEFAULT_SENDER  StockVerse <ramanarajmuddada20@gmail.com>
    FRONTEND_BASE_URL    http://localhost:3000
    RESET_TOKEN_SECRET   stockverse-reset-secret
    RESET_TOKEN_SALT     password-reset-salt
    RESET_TOKEN_EXPIRES  3600
"""

import os
import logging
from flask_mail import Mail, Message
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature

logger = logging.getLogger('stockmarket')

# ── Flask-Mail singleton ───────────────────────────────────────────────────────
mail = Mail()


def init_mail(app):
    """
    Configure and initialise Flask-Mail.
    Call this inside create_app() AFTER load_dotenv() has been called
    so that os.environ already has the values from .env.
    """
    app.config['MAIL_SERVER']         = os.environ.get('MAIL_SERVER',  'smtp.gmail.com')
    app.config['MAIL_PORT']           = int(os.environ.get('MAIL_PORT', 587))
    app.config['MAIL_USE_TLS']        = os.environ.get('MAIL_USE_TLS',  'True')  == 'True'
    app.config['MAIL_USE_SSL']        = os.environ.get('MAIL_USE_SSL',  'False') == 'True'
    app.config['MAIL_USERNAME']       = os.environ.get('MAIL_USERNAME',  '')
    app.config['MAIL_PASSWORD']       = os.environ.get('MAIL_PASSWORD',  '')
    app.config['MAIL_DEFAULT_SENDER'] = os.environ.get(
        'MAIL_DEFAULT_SENDER',
        f"StockVerse <{os.environ.get('MAIL_USERNAME', 'noreply@stockverse.com')}>"
    )

    # ── Debug: log what was loaded (mask password) ────────────────────────────
    logger.info(
        f"[Mail] server={app.config['MAIL_SERVER']} "
        f"port={app.config['MAIL_PORT']} "
        f"tls={app.config['MAIL_USE_TLS']} "
        f"user={app.config['MAIL_USERNAME']} "
        f"password={'SET' if app.config['MAIL_PASSWORD'] else 'NOT SET'}"
    )

    if not app.config['MAIL_USERNAME']:
        logger.warning("[Mail] MAIL_USERNAME is empty — emails will NOT be sent.")
    if not app.config['MAIL_PASSWORD']:
        logger.warning("[Mail] MAIL_PASSWORD is empty — emails will NOT be sent.")

    mail.init_app(app)
    logger.info('[Mail] Flask-Mail initialized successfully.')


# ── Token helpers ──────────────────────────────────────────────────────────────

def _get_serializer():
    secret = os.environ.get('RESET_TOKEN_SECRET', 'stockverse-reset-secret-change-me')
    return URLSafeTimedSerializer(secret)


def generate_reset_token(email: str) -> str:
    """Generate a signed, time-limited token embedding the user email."""
    salt = os.environ.get('RESET_TOKEN_SALT', 'password-reset-salt')
    return _get_serializer().dumps(email.lower(), salt=salt)


def verify_reset_token(token: str):
    """
    Verify a reset token.
    Returns (email, None) on success or (None, error_message) on failure.
    """
    salt    = os.environ.get('RESET_TOKEN_SALT',    'password-reset-salt')
    max_age = int(os.environ.get('RESET_TOKEN_EXPIRES', 3600))
    try:
        email = _get_serializer().loads(token, salt=salt, max_age=max_age)
        return email, None
    except SignatureExpired:
        return None, 'Reset link has expired. Please request a new one.'
    except BadSignature:
        return None, 'Invalid reset link. Please request a new one.'
    except Exception as e:
        logger.error(f'[Mail] Token verification error: {e}')
        return None, 'Invalid or corrupted reset link.'


# ── Internal send helper ───────────────────────────────────────────────────────

def _send(msg: Message, log_label: str) -> bool:
    """
    Internal helper: send a Message object and catch all errors.
    Returns True on success, False on failure.
    """
    try:
        mail.send(msg)
        logger.info(f"[Mail] {log_label} sent to {msg.recipients}")
        return True
    except Exception as e:
        logger.error(f"[Mail] Failed to send {log_label} to {msg.recipients}: {e}")
        return False


# ── OTP Email ──────────────────────────────────────────────────────────────────

def send_otp_email(to_email: str, full_name: str, otp_code: str) -> bool:
    """
    Send a 6-digit OTP verification email.
    Called immediately after user registers.
    """
    subject = 'Your StockVerse Verification OTP'

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body       {{ font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:0; }}
    .container {{ max-width:600px; margin:40px auto; background:#ffffff;
                  border-radius:8px; overflow:hidden;
                  box-shadow:0 2px 8px rgba(0,0,0,0.1); }}
    .header    {{ background:#1a237e; padding:32px 40px; text-align:center; }}
    .header h1 {{ color:#ffffff; margin:0; font-size:24px; letter-spacing:1px; }}
    .body      {{ padding:40px; }}
    .body p    {{ color:#444444; font-size:15px; line-height:1.6; margin:0 0 16px; }}
    .otp-box   {{ background:#f0f4ff; border:2px dashed #1a237e;
                  border-radius:8px; padding:24px; text-align:center; margin:24px 0; }}
    .otp-code  {{ font-size:42px; font-weight:bold; color:#1a237e;
                  letter-spacing:12px; margin:0; }}
    .otp-note  {{ font-size:13px; color:#888888; margin-top:8px; }}
    .warning   {{ font-size:13px; color:#888888; margin-top:24px; }}
    .footer    {{ background:#f9f9f9; padding:20px 40px; text-align:center;
                  font-size:12px; color:#aaaaaa;
                  border-top:1px solid #eeeeee; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📈 StockVerse</h1>
    </div>
    <div class="body">
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Thank you for registering on <strong>StockVerse</strong>!
         Please use the OTP below to verify your email address.</p>
      <div class="otp-box">
        <p class="otp-code">{otp_code}</p>
        <p class="otp-note">⏱ This OTP expires in <strong>10 minutes</strong>.</p>
      </div>
      <p>Enter this OTP on the verification screen to activate your account.</p>
      <p class="warning">
        ⚠️ If you did not create a StockVerse account, please ignore this email.
      </p>
    </div>
    <div class="footer">
      &copy; 2025 StockVerse Platform. All rights reserved.<br>
      This is an automated email — please do not reply.
    </div>
  </div>
</body>
</html>"""

    text_body = (
        f"Hi {full_name},\n\n"
        f"Your StockVerse email verification OTP is:\n\n"
        f"  {otp_code}\n\n"
        f"This OTP expires in 10 minutes.\n\n"
        f"If you did not register, ignore this email.\n\n"
        f"— StockVerse Team"
    )

    msg      = Message(subject=subject, recipients=[to_email])
    msg.body = text_body
    msg.html = html_body
    return _send(msg, 'OTP email')


# ── Welcome Email ──────────────────────────────────────────────────────────────

def send_welcome_email(to_email: str, full_name: str) -> bool:
    """Send a welcome email after OTP is verified and account is activated."""
    subject = 'Welcome to StockVerse! 🎉'

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body       {{ font-family:Arial,sans-serif; background:#f4f4f4; margin:0; padding:0; }}
    .container {{ max-width:600px; margin:40px auto; background:#ffffff;
                  border-radius:8px; overflow:hidden;
                  box-shadow:0 2px 8px rgba(0,0,0,0.1); }}
    .header    {{ background:#1a237e; padding:32px 40px; text-align:center; }}
    .header h1 {{ color:#ffffff; margin:0; font-size:24px; }}
    .body      {{ padding:40px; }}
    .body p    {{ color:#444444; font-size:15px; line-height:1.6; margin:0 0 16px; }}
    .step      {{ display:flex; align-items:flex-start; margin-bottom:16px; }}
    .step-num  {{ background:#1a237e; color:#fff; border-radius:50%;
                  min-width:28px; height:28px;
                  display:inline-flex; align-items:center; justify-content:center;
                  font-weight:bold; margin-right:12px; font-size:14px; }}
    .footer    {{ background:#f9f9f9; padding:20px 40px; text-align:center;
                  font-size:12px; color:#aaaaaa; border-top:1px solid #eeeeee; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>📈 Welcome to StockVerse</h1></div>
    <div class="body">
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Your account has been verified and activated. Here is how to get started:</p>
      <div class="step">
        <span class="step-num">1</span>
        <p style="margin:0;"><strong>Complete KYC</strong> — Submit your ID documents to unlock full trading access.</p>
      </div>
      <div class="step">
        <span class="step-num">2</span>
        <p style="margin:0;"><strong>Add Funds</strong> — Deposit money into your wallet to start trading.</p>
      </div>
      <div class="step">
        <span class="step-num">3</span>
        <p style="margin:0;"><strong>Explore Stocks</strong> — Browse the market and build your watchlist.</p>
      </div>
      <div class="step">
        <span class="step-num">4</span>
        <p style="margin:0;"><strong>Start Trading</strong> — Buy and sell stocks and track your portfolio P&amp;L.</p>
      </div>
      <p>Happy investing! 🚀</p>
    </div>
    <div class="footer">&copy; 2025 StockVerse Platform. All rights reserved.</div>
  </div>
</body>
</html>"""

    text_body = (
        f"Hi {full_name},\n\nWelcome to StockVerse! Your account is now active.\n\n"
        f"Next steps:\n"
        f"1. Complete KYC\n2. Add Funds\n3. Explore Stocks\n4. Start Trading\n\n"
        f"Happy investing!\n— StockVerse Team"
    )

    msg      = Message(subject=subject, recipients=[to_email])
    msg.body = text_body
    msg.html = html_body
    return _send(msg, 'Welcome email')


# ── Password Reset Email ───────────────────────────────────────────────────────

def send_password_reset_email(to_email: str, full_name: str, reset_token: str) -> bool:
    """Send a password-reset link email."""
    frontend_url = os.environ.get('FRONTEND_BASE_URL', 'http://localhost:3000')
    reset_link   = f"{frontend_url}/reset-password?token={reset_token}"
    subject      = 'Reset Your StockVerse Password'

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body       {{ font-family:Arial,sans-serif; background:#f4f4f4; margin:0; padding:0; }}
    .container {{ max-width:600px; margin:40px auto; background:#ffffff;
                  border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1); }}
    .header    {{ background:#1a237e; padding:32px 40px; text-align:center; }}
    .header h1 {{ color:#ffffff; margin:0; font-size:24px; letter-spacing:1px; }}
    .body      {{ padding:40px; }}
    .body p    {{ color:#444444; font-size:15px; line-height:1.6; margin:0 0 16px; }}
    .btn       {{ display:inline-block; margin:24px 0; padding:14px 36px;
                  background:#1a237e; color:#ffffff !important;
                  text-decoration:none; border-radius:6px;
                  font-size:16px; font-weight:bold; }}
    .link-box  {{ background:#f4f4f4; border-radius:4px; padding:12px 16px;
                  word-break:break-all; font-size:13px; color:#555555; }}
    .warning   {{ font-size:13px; color:#888888; margin-top:24px; }}
    .footer    {{ background:#f9f9f9; padding:20px 40px; text-align:center;
                  font-size:12px; color:#aaaaaa; border-top:1px solid #eeeeee; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>📈 StockVerse</h1></div>
    <div class="body">
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>We received a request to reset the password for your StockVerse account
         (<strong>{to_email}</strong>).</p>
      <p>Click the button below to set a new password. This link is valid for
         <strong>1 hour</strong>.</p>
      <p style="text-align:center;">
        <a href="{reset_link}" class="btn">Reset My Password</a>
      </p>
      <p>Or copy and paste this URL into your browser:</p>
      <div class="link-box">{reset_link}</div>
      <p class="warning">
        ⚠️ If you did not request a password reset, ignore this email.
        Your password will not change unless you click the link above.
      </p>
    </div>
    <div class="footer">
      &copy; 2025 StockVerse Platform. All rights reserved.<br>
      This is an automated email — please do not reply.
    </div>
  </div>
</body>
</html>"""

    text_body = (
        f"Hi {full_name},\n\n"
        f"Reset your StockVerse password (valid 1 hour):\n\n"
        f"{reset_link}\n\n"
        f"If you did not request this, ignore this email.\n\n"
        f"— StockVerse Team"
    )

    msg      = Message(subject=subject, recipients=[to_email])
    msg.body = text_body
    msg.html = html_body
    return _send(msg, 'Password reset email')


# ── Password Changed Notification ─────────────────────────────────────────────

def send_password_changed_email(to_email: str, full_name: str) -> bool:
    """Notify the user that their password was changed successfully."""
    subject = 'Your StockVerse Password Was Changed'

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body       {{ font-family:Arial,sans-serif; background:#f4f4f4; margin:0; padding:0; }}
    .container {{ max-width:600px; margin:40px auto; background:#ffffff;
                  border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1); }}
    .header    {{ background:#1a237e; padding:32px 40px; text-align:center; }}
    .header h1 {{ color:#ffffff; margin:0; font-size:24px; }}
    .body      {{ padding:40px; }}
    .body p    {{ color:#444444; font-size:15px; line-height:1.6; margin:0 0 16px; }}
    .alert     {{ background:#fff3cd; border-left:4px solid #ffc107;
                  padding:12px 16px; border-radius:4px;
                  font-size:14px; color:#856404; }}
    .footer    {{ background:#f9f9f9; padding:20px 40px; text-align:center;
                  font-size:12px; color:#aaaaaa; border-top:1px solid #eeeeee; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>📈 StockVerse</h1></div>
    <div class="body">
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Your StockVerse account password was successfully changed.</p>
      <div class="alert">
        ⚠️ <strong>Wasn't you?</strong> If you did not make this change,
        please contact support immediately or reset your password.
      </div>
    </div>
    <div class="footer">&copy; 2025 StockVerse Platform. All rights reserved.</div>
  </div>
</body>
</html>"""

    msg      = Message(subject=subject, recipients=[to_email])
    msg.html = html_body
    msg.body = (
        f"Hi {full_name},\n\nYour StockVerse password was changed successfully.\n"
        f"If this wasn't you, contact support immediately.\n\n— StockVerse Team"
    )
    return _send(msg, 'Password changed notification')









