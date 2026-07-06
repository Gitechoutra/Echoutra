"""
portal/seeders/seed_subscription_plans.py
==========================================
Seeds the five default subscription plan tiers.
Idempotent — skips any plan that already exists by plan_tier.
"""

import logging
from portal.models.subscription_plans import SubscriptionPlans, PlanTier, BillingCycle

logger = logging.getLogger(__name__)


DEFAULT_PLANS = [
    {
        'plan_name':           'Free',
        'plan_tier':           PlanTier.FREE,
        'description':         'Get started with basic market access at no cost.',
        'tagline':             'Always free',
        'price_monthly':       0.00,
        'price_quarterly':     0.00,
        'price_annually':      0.00,
        'currency':            'USD',
        'max_watchlist_items': 5,
        'max_portfolios':      1,
        'max_price_alerts':    3,
        'real_time_data':      False,
        'advanced_charts':     False,
        'analyst_ratings':     False,
        'news_access':         True,
        'api_access':          False,
        'priority_support':    False,
        'features':            ['basic_charts', 'news_feed', 'one_portfolio'],
        'is_active':           True,
        'is_popular':          False,
        'sort_order':          1,
    },
    {
        'plan_name':           'Basic',
        'plan_tier':           PlanTier.BASIC,
        'description':         'More watchlists and alerts for the casual investor.',
        'tagline':             'Perfect for beginners',
        'price_monthly':       9.99,
        'price_quarterly':     26.99,
        'price_annually':      99.99,
        'currency':            'USD',
        'max_watchlist_items': 25,
        'max_portfolios':      3,
        'max_price_alerts':    10,
        'real_time_data':      False,
        'advanced_charts':     False,
        'analyst_ratings':     False,
        'news_access':         True,
        'api_access':          False,
        'priority_support':    False,
        'features':            ['basic_charts', 'news_feed', 'multi_portfolio',
                                'email_alerts', 'price_alerts'],
        'is_active':           True,
        'is_popular':          False,
        'sort_order':          2,
    },
    {
        'plan_name':           'Pro',
        'plan_tier':           PlanTier.PRO,
        'description':         'Real-time data and advanced charts for active traders.',
        'tagline':             'Most Popular',
        'price_monthly':       29.99,
        'price_quarterly':     79.99,
        'price_annually':      299.99,
        'currency':            'USD',
        'max_watchlist_items': 100,
        'max_portfolios':      10,
        'max_price_alerts':    50,
        'real_time_data':      True,
        'advanced_charts':     True,
        'analyst_ratings':     True,
        'news_access':         True,
        'api_access':          False,
        'priority_support':    False,
        'features':            ['real_time_data', 'advanced_charts', 'analyst_ratings',
                                'news_feed', 'multi_portfolio', 'email_alerts',
                                'sms_alerts', 'price_alerts', 'sector_analysis'],
        'is_active':           True,
        'is_popular':          True,
        'sort_order':          3,
    },
    {
        'plan_name':           'Premium',
        'plan_tier':           PlanTier.PREMIUM,
        'description':         'Unlimited access with API and priority support.',
        'tagline':             'For serious investors',
        'price_monthly':       59.99,
        'price_quarterly':     159.99,
        'price_annually':      599.99,
        'currency':            'USD',
        'max_watchlist_items': None,   # Unlimited
        'max_portfolios':      None,
        'max_price_alerts':    None,
        'real_time_data':      True,
        'advanced_charts':     True,
        'analyst_ratings':     True,
        'news_access':         True,
        'api_access':          True,
        'priority_support':    True,
        'features':            ['real_time_data', 'advanced_charts', 'analyst_ratings',
                                'news_feed', 'unlimited_portfolios', 'unlimited_alerts',
                                'api_access', 'priority_support', 'sector_analysis',
                                'export_data', 'custom_screener'],
        'is_active':           True,
        'is_popular':          False,
        'sort_order':          4,
    },
    {
        'plan_name':           'Enterprise',
        'plan_tier':           PlanTier.ENTERPRISE,
        'description':         'Custom solutions for institutions and teams.',
        'tagline':             'Contact us for pricing',
        'price_monthly':       199.99,
        'price_quarterly':     549.99,
        'price_annually':      1999.99,
        'currency':            'USD',
        'max_watchlist_items': None,
        'max_portfolios':      None,
        'max_price_alerts':    None,
        'real_time_data':      True,
        'advanced_charts':     True,
        'analyst_ratings':     True,
        'news_access':         True,
        'api_access':          True,
        'priority_support':    True,
        'features':            ['real_time_data', 'advanced_charts', 'analyst_ratings',
                                'news_feed', 'unlimited_portfolios', 'unlimited_alerts',
                                'api_access', 'priority_support', 'sector_analysis',
                                'export_data', 'custom_screener', 'dedicated_manager',
                                'white_label', 'sla_guarantee', 'team_accounts'],
        'is_active':           True,
        'is_popular':          False,
        'sort_order':          5,
    },
]


def seed_subscription_plans():
    """
    Idempotent — inserts only plans whose plan_tier doesn't already exist.
    """
    created = []
    for data in DEFAULT_PLANS:
        existing = SubscriptionPlans.query.filter_by(plan_tier=data['plan_tier']).first()
        if not existing:
            plan = SubscriptionPlans()
            for field, value in data.items():
                setattr(plan, field, value)
            plan.save()
            created.append(data['plan_tier'])
            logger.info(f"[Seeder] Plan created: {data['plan_name']}")
        else:
            logger.debug(f"[Seeder] Plan already exists: {data['plan_tier']}")

    if created:
        logger.info(f"[Seeder] Subscription plans seeded: {created}")
    else:
        logger.info("[Seeder] All subscription plans already present.")