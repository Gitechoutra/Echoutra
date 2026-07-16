"""
portal/seeders/seed_admin_settings.py
=======================================
Seeds default platform-wide admin settings.
Idempotent — skips any setting_key that already exists.
"""

import logging
from portal.models.admin_settings import AdminSettings, SettingDataType

logger = logging.getLogger(__name__)


DEFAULT_SETTINGS = [

    # ── Platform  ────────
    {
        'setting_key':   'PLATFORM_NAME',
        'setting_value': 'TradeFlow',
        'default_value': 'TradeFlow',
        'data_type':     SettingDataType.STRING,
        'category':      'PLATFORM',
        'label':         'Platform Name',
        'description':   'The public name of the platform shown in emails and UI.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     True,
    },
    {
        'setting_key':   'PLATFORM_SUPPORT_EMAIL',
        'setting_value': 'support@tradeflow.io',
        'default_value': 'support@tradeflow.io',
        'data_type':     SettingDataType.STRING,
        'category':      'PLATFORM',
        'label':         'Support Email',
        'description':   'Email address shown to users for support queries.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     True,
    },
    {
        'setting_key':   'PLATFORM_LOGO_URL',
        'setting_value': 'https://tradeflow.io/logo.png',
        'default_value': 'https://tradeflow.io/logo.png',
        'data_type':     SettingDataType.STRING,
        'category':      'PLATFORM',
        'label':         'Platform Logo URL',
        'description':   'URL of the platform logo used in emails and UI.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     True,
    },
    {
        'setting_key':   'PLATFORM_MAINTENANCE_MODE',
        'setting_value': 'false',
        'default_value': 'false',
        'data_type':     SettingDataType.BOOLEAN,
        'category':      'PLATFORM',
        'label':         'Maintenance Mode',
        'description':   'When true, all API endpoints return 503 except admin login.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'PLATFORM_DEFAULT_CURRENCY',
        'setting_value': 'INR',
        'default_value': 'INR',
        'data_type':     SettingDataType.STRING,
        'category':      'PLATFORM',
        'label':         'Default Currency',
        'description':   'Default currency for all financial calculations. The platform trades in INR.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     True,
    },

    # ── Trading  ─────────
    {
        'setting_key':   'TRADING_COMMISSION_PERCENT',
        'setting_value': '0.1',
        'default_value': '0.1',
        'data_type':     SettingDataType.FLOAT,
        'category':      'TRADING',
        'label':         'Commission Percentage',
        'description':   'Trading commission as a percentage of order value (e.g. 0.1 = 0.1%).',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'TRADING_WITHDRAWAL_FEE_PERCENT',
        'setting_value': '0.1',
        'default_value': '0.1',
        'data_type':     SettingDataType.FLOAT,
        'category':      'TRADING',
        'label':         'Withdrawal Fee Percentage',
        'description':   'Fee charged on wallet withdrawals as a percentage.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'TRADING_MAX_SINGLE_DEPOSIT',
        'setting_value': '100000',
        'default_value': '100000',
        'data_type':     SettingDataType.FLOAT,
        'category':      'TRADING',
        'label':         'Max Single Deposit (INR)',
        'description':   'Maximum amount (₹) a user can deposit in a single transaction.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'TRADING_ENABLED',
        'setting_value': 'true',
        'default_value': 'true',
        'data_type':     SettingDataType.BOOLEAN,
        'category':      'TRADING',
        'label':         'Trading Enabled',
        'description':   'Master switch to enable or disable all trading on the platform.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },

    # ── Security  ────────
    {
        'setting_key':   'SECURITY_MAX_LOGIN_ATTEMPTS',
        'setting_value': '5',
        'default_value': '5',
        'data_type':     SettingDataType.INTEGER,
        'category':      'SECURITY',
        'label':         'Max Login Attempts',
        'description':   'Number of failed login attempts before account lockout.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'SECURITY_LOCKOUT_DURATION_MINUTES',
        'setting_value': '30',
        'default_value': '30',
        'data_type':     SettingDataType.INTEGER,
        'category':      'SECURITY',
        'label':         'Lockout Duration (Minutes)',
        'description':   'How long a locked account remains inaccessible.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'SECURITY_SESSION_TIMEOUT_MINUTES',
        'setting_value': '120',
        'default_value': '120',
        'data_type':     SettingDataType.INTEGER,
        'category':      'SECURITY',
        'label':         'Default Session Timeout (Minutes)',
        'description':   'Default idle session timeout for all users.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'SECURITY_FORCE_2FA_FOR_ADMINS',
        'setting_value': 'true',
        'default_value': 'true',
        'data_type':     SettingDataType.BOOLEAN,
        'category':      'SECURITY',
        'label':         'Force 2FA for Admins',
        'description':   'When true, admin accounts must have 2FA enabled to login.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'SECURITY_IP_BLOCKLIST',
        'setting_value': '[]',
        'default_value': '[]',
        'data_type':     SettingDataType.JSON,
        'category':      'SECURITY',
        'label':         'IP Blocklist',
        'description':   'JSON array of blocked IP addresses.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },

    # ── Notifications  ───
    {
        'setting_key':   'NOTIFICATIONS_EMAIL_ENABLED',
        'setting_value': 'true',
        'default_value': 'true',
        'data_type':     SettingDataType.BOOLEAN,
        'category':      'NOTIFICATIONS',
        'label':         'Email Notifications Enabled',
        'description':   'Master switch for all outbound email notifications.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'NOTIFICATIONS_SMS_ENABLED',
        'setting_value': 'false',
        'default_value': 'false',
        'data_type':     SettingDataType.BOOLEAN,
        'category':      'NOTIFICATIONS',
        'label':         'SMS Notifications Enabled',
        'description':   'Master switch for all outbound SMS notifications.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'NOTIFICATIONS_PUSH_ENABLED',
        'setting_value': 'true',
        'default_value': 'true',
        'data_type':     SettingDataType.BOOLEAN,
        'category':      'NOTIFICATIONS',
        'label':         'Push Notifications Enabled',
        'description':   'Master switch for all outbound push notifications.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },

    # ── KYC  ────────────
    {
        'setting_key':   'KYC_REQUIRED_TO_TRADE',
        'setting_value': 'false',
        'default_value': 'false',
        'data_type':     SettingDataType.BOOLEAN,
        'category':      'KYC',
        'label':         'KYC Required to Trade',
        'description':   'When true, users must complete KYC before placing any order.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'KYC_REQUIRED_TO_WITHDRAW',
        'setting_value': 'true',
        'default_value': 'true',
        'data_type':     SettingDataType.BOOLEAN,
        'category':      'KYC',
        'label':         'KYC Required to Withdraw',
        'description':   'When true, users must complete KYC before withdrawing funds.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },

    # ── OTP  ────────────
    {
        'setting_key':   'OTP_EXPIRY_MINUTES',
        'setting_value': '10',
        'default_value': '10',
        'data_type':     SettingDataType.INTEGER,
        'category':      'SECURITY',
        'label':         'OTP Expiry (Minutes)',
        'description':   'How long an OTP code is valid after generation.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
    {
        'setting_key':   'OTP_MAX_ATTEMPTS',
        'setting_value': '5',
        'default_value': '5',
        'data_type':     SettingDataType.INTEGER,
        'category':      'SECURITY',
        'label':         'OTP Max Attempts',
        'description':   'Maximum number of wrong OTP attempts before invalidation.',
        'is_sensitive':  False,
        'is_editable':   True,
        'is_public':     False,
    },
]


def seed_admin_settings():
    """
    Idempotent — inserts only settings whose setting_key doesn't already exist.
    """
    created = []
    for data in DEFAULT_SETTINGS:
        existing = AdminSettings.query.filter_by(setting_key=data['setting_key']).first()
        if not existing:
            setting = AdminSettings()
            for field, value in data.items():
                setattr(setting, field, value)
            setting.save()
            created.append(data['setting_key'])
            logger.info(f"[Seeder] Setting created: {data['setting_key']}")
        else:
            logger.debug(f"[Seeder] Setting already exists: {data['setting_key']}")

    if created:
        logger.info(f"[Seeder] Admin settings seeded: {len(created)} keys")
    else:
        logger.info("[Seeder] All admin settings already present.")