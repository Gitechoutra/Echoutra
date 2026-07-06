"""
portal/seeders/seed_feature_flags.py
=====================================
Seeds default feature flags for the platform.
Idempotent — skips any flag_key that already exists.
"""

import logging
from portal.models.feature_flags import FeatureFlags, FlagRolloutType

logger = logging.getLogger(__name__)


DEFAULT_FLAGS = [

    # ── Trading features  
    {
        'flag_key':           'FRACTIONAL_SHARES',
        'flag_name':          'Fractional Share Trading',
        'description':        'Allow users to buy fractional shares (e.g. 0.5 AAPL).',
        'category':           'TRADING',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.ALL_USERS,
        'rollout_percentage': None,
        'enabled_for_plans':  None,
        'owner':              'trading-team',
    },
    {
        'flag_key':           'LIMIT_ORDERS',
        'flag_name':          'Limit Orders',
        'description':        'Allow users to place LIMIT and STOP orders.',
        'category':           'TRADING',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.PLAN_BASED,
        'rollout_percentage': None,
        'enabled_for_plans':  ['PRO', 'PREMIUM', 'ENTERPRISE'],
        'owner':              'trading-team',
    },
    {
        'flag_key':           'PAPER_TRADING',
        'flag_name':          'Paper Trading (Simulated)',
        'description':        'Allow users to create simulated paper trading portfolios.',
        'category':           'TRADING',
        'is_enabled':         False,
        'rollout_type':       FlagRolloutType.DISABLED,
        'rollout_percentage': None,
        'enabled_for_plans':  None,
        'owner':              'trading-team',
    },

    # ── Market data  ─────
    {
        'flag_key':           'REAL_TIME_PRICES',
        'flag_name':          'Real-Time Price Data',
        'description':        'Show real-time prices instead of 15-minute delayed data.',
        'category':           'MARKET_DATA',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.PLAN_BASED,
        'rollout_percentage': None,
        'enabled_for_plans':  ['PRO', 'PREMIUM', 'ENTERPRISE'],
        'owner':              'data-team',
    },
    {
        'flag_key':           'CRYPTO_MARKET',
        'flag_name':          'Crypto Market',
        'description':        'Enable cryptocurrency trading and price data.',
        'category':           'MARKET_DATA',
        'is_enabled':         False,
        'rollout_type':       FlagRolloutType.DISABLED,
        'rollout_percentage': None,
        'enabled_for_plans':  None,
        'owner':              'data-team',
    },
    {
        'flag_key':           'ANALYST_RATINGS',
        'flag_name':          'Analyst Ratings',
        'description':        'Show analyst buy/hold/sell ratings and price targets.',
        'category':           'MARKET_DATA',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.PLAN_BASED,
        'rollout_percentage': None,
        'enabled_for_plans':  ['PRO', 'PREMIUM', 'ENTERPRISE'],
        'owner':              'data-team',
    },

    # ── UI features  ─────
    {
        'flag_key':           'ADVANCED_CHARTS',
        'flag_name':          'Advanced Candlestick Charts',
        'description':        'Enable candlestick charts with technical indicators.',
        'category':           'UI',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.PLAN_BASED,
        'rollout_percentage': None,
        'enabled_for_plans':  ['PRO', 'PREMIUM', 'ENTERPRISE'],
        'owner':              'frontend-team',
    },
    {
        'flag_key':           'DARK_MODE',
        'flag_name':          'Dark Mode',
        'description':        'Allow users to switch to dark mode UI.',
        'category':           'UI',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.ALL_USERS,
        'rollout_percentage': None,
        'enabled_for_plans':  None,
        'owner':              'frontend-team',
    },
    {
        'flag_key':           'CUSTOM_DASHBOARD',
        'flag_name':          'Customizable Dashboard',
        'description':        'Allow users to drag, drop and resize dashboard widgets.',
        'category':           'UI',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.ALL_USERS,
        'rollout_percentage': None,
        'enabled_for_plans':  None,
        'owner':              'frontend-team',
    },

    # ── Notifications  ───
    {
        'flag_key':           'SMS_ALERTS',
        'flag_name':          'SMS Price Alerts',
        'description':        'Allow users to receive price alerts via SMS.',
        'category':           'NOTIFICATIONS',
        'is_enabled':         False,
        'rollout_type':       FlagRolloutType.DISABLED,
        'rollout_percentage': None,
        'enabled_for_plans':  None,
        'owner':              'notifications-team',
    },
    {
        'flag_key':           'PUSH_NOTIFICATIONS',
        'flag_name':          'Push Notifications',
        'description':        'Enable browser and mobile push notifications.',
        'category':           'NOTIFICATIONS',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.ALL_USERS,
        'rollout_percentage': None,
        'enabled_for_plans':  None,
        'owner':              'notifications-team',
    },

    # ── Auth / Security  ─
    {
        'flag_key':           'GOOGLE_OAUTH',
        'flag_name':          'Google OAuth Login',
        'description':        'Allow users to sign in with their Google account.',
        'category':           'AUTH',
        'is_enabled':         False,
        'rollout_type':       FlagRolloutType.DISABLED,
        'rollout_percentage': None,
        'enabled_for_plans':  None,
        'owner':              'auth-team',
    },
    {
        'flag_key':           'KYC_VERIFICATION',
        'flag_name':          'KYC Verification',
        'description':        'Enable the full KYC document submission and review flow.',
        'category':           'SECURITY',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.ALL_USERS,
        'rollout_percentage': None,
        'enabled_for_plans':  None,
        'owner':              'compliance-team',
    },

    # ── API  ─────────────
    {
        'flag_key':           'PUBLIC_API_ACCESS',
        'flag_name':          'Public API Access',
        'description':        'Allow premium users to access the TradeFlow REST API.',
        'category':           'API',
        'is_enabled':         True,
        'rollout_type':       FlagRolloutType.PLAN_BASED,
        'rollout_percentage': None,
        'enabled_for_plans':  ['PREMIUM', 'ENTERPRISE'],
        'owner':              'platform-team',
    },
]


def seed_feature_flags():
    """
    Idempotent — inserts only flags whose flag_key doesn't already exist.
    """
    created = []
    for data in DEFAULT_FLAGS:
        existing = FeatureFlags.query.filter_by(flag_key=data['flag_key']).first()
        if not existing:
            flag = FeatureFlags()
            for field, value in data.items():
                setattr(flag, field, value)
            flag.save()
            created.append(data['flag_key'])
            logger.info(f"[Seeder] Feature flag created: {data['flag_key']}")
        else:
            logger.debug(f"[Seeder] Feature flag already exists: {data['flag_key']}")

    if created:
        logger.info(f"[Seeder] Feature flags seeded: {len(created)} flags")
    else:
        logger.info("[Seeder] All feature flags already present.")