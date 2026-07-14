"""
portal/seeders/seed_subscription_plans.py
==========================================
Seeds the subscription plan tiers: Free, Pro, Elite (INR pricing, 1/3/6-month
billing). Idempotent AND self-healing — it UPSERTS the three canonical plans by
tier and DEACTIVATES any other plans (legacy Basic/Premium/Enterprise) so exactly
three active plans remain.
"""

import logging
from portal import db
from portal.models.subscription_plans import SubscriptionPlans, PlanTier

logger = logging.getLogger(__name__)


DEFAULT_PLANS = [
    {
        'plan_name':           'Free',
        'plan_tier':           PlanTier.FREE,
        'description':         'Get started with basic market access at no cost.',
        'tagline':             'Always free',
        'price_monthly':       0.00,
        'price_quarterly':     0.00,
        'price_halfyearly':    0.00,
        'price_annually':      0.00,
        'currency':            'INR',
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
        'plan_name':           'Pro',
        'plan_tier':           PlanTier.PRO,
        'description':         'Real-time data and advanced charts for active traders.',
        'tagline':             'Most Popular',
        'price_monthly':       199.00,     # 1 month
        'price_quarterly':     549.00,     # 3 months
        'price_halfyearly':    1099.00,    # 6 months
        'price_annually':      0.00,
        'currency':            'INR',
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
        'sort_order':          2,
    },
    {
        'plan_name':           'Elite',
        'plan_tier':           PlanTier.ELITE,
        'description':         'Unlimited access with API and priority support.',
        'tagline':             'For serious investors',
        'price_monthly':       399.00,     # 1 month
        'price_quarterly':     1149.00,    # 3 months
        'price_halfyearly':    2199.00,    # 6 months
        'price_annually':      0.00,
        'currency':            'INR',
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
        'sort_order':          3,
    },
]


def seed_subscription_plans():
    """UPSERT the three canonical plans by tier; deactivate any others."""
    keep_tiers = {p['plan_tier'] for p in DEFAULT_PLANS}

    for data in DEFAULT_PLANS:
        plan = SubscriptionPlans.query.filter_by(plan_tier=data['plan_tier']).first()
        if not plan:
            plan = SubscriptionPlans()
        for field, value in data.items():
            setattr(plan, field, value)
        db.session.add(plan)
    db.session.commit()

    # Deactivate legacy plans (Basic/Premium/Enterprise) so only Free/Pro/Elite show.
    legacy = SubscriptionPlans.query.filter(~SubscriptionPlans.plan_tier.in_(keep_tiers)).all()
    for p in legacy:
        if p.is_active:
            p.is_active = False
    if legacy:
        db.session.commit()

    logger.info(f"[Seeder] Subscription plans upserted: {sorted(keep_tiers)}; "
                f"deactivated {len(legacy)} legacy plan(s).")
