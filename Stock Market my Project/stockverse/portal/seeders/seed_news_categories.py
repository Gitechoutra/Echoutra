"""
portal/seeders/seed_news_categories.py
=======================================
Seeds default financial news categories.
Idempotent — skips any category whose slug already exists.
"""

import logging
from portal.models.news_categories import NewsCategories

logger = logging.getLogger(__name__)


DEFAULT_CATEGORIES = [
    {
        'category_name': 'Markets',
        'slug':          'markets',
        'description':   'Stock market news, indices and global market updates.',
        'icon':          'TrendingUp',
        'color_hex':     '#00C4FF',
        'is_active':     True,
        'sort_order':    1,
    },
    {
        'category_name': 'Technology',
        'slug':          'tech',
        'description':   'Technology sector news, earnings and product launches.',
        'icon':          'Cpu',
        'color_hex':     '#7C3AED',
        'is_active':     True,
        'sort_order':    2,
    },
    {
        'category_name': 'Economy',
        'slug':          'economy',
        'description':   'Macroeconomic data, Fed decisions and GDP reports.',
        'icon':          'Globe',
        'color_hex':     '#059669',
        'is_active':     True,
        'sort_order':    3,
    },
    {
        'category_name': 'Earnings',
        'slug':          'earnings',
        'description':   'Quarterly earnings reports, guidance and analyst reactions.',
        'icon':          'BarChart2',
        'color_hex':     '#F59E0B',
        'is_active':     True,
        'sort_order':    4,
    },
    {
        'category_name': 'Crypto',
        'slug':          'crypto',
        'description':   'Cryptocurrency prices, blockchain news and regulation.',
        'icon':          'Bitcoin',
        'color_hex':     '#F97316',
        'is_active':     True,
        'sort_order':    5,
    },
    {
        'category_name': 'Energy',
        'slug':          'energy',
        'description':   'Oil, gas, renewables and energy sector news.',
        'icon':          'Zap',
        'color_hex':     '#EF4444',
        'is_active':     True,
        'sort_order':    6,
    },
    {
        'category_name': 'Healthcare',
        'slug':          'healthcare',
        'description':   'Pharma, biotech, clinical trials and health policy.',
        'icon':          'Heart',
        'color_hex':     '#EC4899',
        'is_active':     True,
        'sort_order':    7,
    },
    {
        'category_name': 'Finance',
        'slug':          'finance',
        'description':   'Banking, insurance, interest rates and credit markets.',
        'icon':          'DollarSign',
        'color_hex':     '#10B981',
        'is_active':     True,
        'sort_order':    8,
    },
    {
        'category_name': 'IPO',
        'slug':          'ipo',
        'description':   'Initial public offerings, SPAC listings and market debuts.',
        'icon':          'Star',
        'color_hex':     '#6366F1',
        'is_active':     True,
        'sort_order':    9,
    },
    {
        'category_name': 'Dividends',
        'slug':          'dividends',
        'description':   'Dividend announcements, ex-dates and yield updates.',
        'icon':          'Gift',
        'color_hex':     '#14B8A6',
        'is_active':     True,
        'sort_order':    10,
    },
]


def seed_news_categories():
    """
    Idempotent — inserts only categories whose slug doesn't already exist.
    """
    created = []
    for data in DEFAULT_CATEGORIES:
        existing = NewsCategories.query.filter_by(slug=data['slug']).first()
        if not existing:
            cat = NewsCategories()
            for field, value in data.items():
                setattr(cat, field, value)
            cat.save()
            created.append(data['slug'])
            logger.info(f"[Seeder] News category created: {data['category_name']}")
        else:
            logger.debug(f"[Seeder] News category already exists: {data['slug']}")

    if created:
        logger.info(f"[Seeder] News categories seeded: {created}")
    else:
        logger.info("[Seeder] All news categories already present.")