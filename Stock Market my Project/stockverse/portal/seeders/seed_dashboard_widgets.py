"""
portal/seeders/seed_dashboard_widgets.py
=========================================
Seeds the master catalogue of dashboard widgets available
to both Admin and User roles.
Idempotent — skips any widget_type that already exists.
"""

import logging
from portal.models.dashboard_widgets import DashboardWidgets, WidgetType, WidgetRole

logger = logging.getLogger(__name__)


DEFAULT_WIDGETS = [

    # ── User widgets  ────
    {
        'widget_type':        WidgetType.PORTFOLIO_SUMMARY,
        'widget_name':        'Portfolio Summary',
        'description':        'Shows total value, day change, total return and invested amount.',
        'icon':               'PieChart',
        'available_for_role': WidgetRole.USER,
        'default_width':      6,
        'default_height':     2,
        'min_width':          4,
        'min_height':         2,
        'max_width':          12,
        'is_resizable':       True,
        'is_removable':       False,   # Core widget — always shown
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'portfolio_id': 'integer'},
    },
    {
        'widget_type':        WidgetType.HOLDINGS_TABLE,
        'widget_name':        'My Holdings',
        'description':        'Table of all current stock holdings with P&L.',
        'icon':               'Table',
        'available_for_role': WidgetRole.USER,
        'default_width':      12,
        'default_height':     3,
        'min_width':          6,
        'min_height':         2,
        'max_width':          12,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'portfolio_id': 'integer', 'rows': 'integer'},
    },
    {
        'widget_type':        WidgetType.SECTOR_ALLOCATION,
        'widget_name':        'Sector Allocation',
        'description':        'Donut chart showing portfolio breakdown by sector.',
        'icon':               'Layers',
        'available_for_role': WidgetRole.USER,
        'default_width':      4,
        'default_height':     3,
        'min_width':          3,
        'min_height':         2,
        'max_width':          6,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'portfolio_id': 'integer'},
    },
    {
        'widget_type':        WidgetType.PERFORMANCE_CHART,
        'widget_name':        'Performance Chart',
        'description':        'Line chart of portfolio value over time.',
        'icon':               'TrendingUp',
        'available_for_role': WidgetRole.USER,
        'default_width':      8,
        'default_height':     3,
        'min_width':          4,
        'min_height':         2,
        'max_width':          12,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'period': 'string', 'portfolio_id': 'integer'},
    },
    {
        'widget_type':        WidgetType.WATCHLIST,
        'widget_name':        'Watchlist',
        'description':        'Quick-view watchlist with live prices and sparklines.',
        'icon':               'Eye',
        'available_for_role': WidgetRole.USER,
        'default_width':      4,
        'default_height':     4,
        'min_width':          3,
        'min_height':         3,
        'max_width':          6,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'watchlist_id': 'integer', 'limit': 'integer'},
    },
    {
        'widget_type':        WidgetType.NEWS_FEED,
        'widget_name':        'News Feed',
        'description':        'Latest market news headlines relevant to your portfolio.',
        'icon':               'Newspaper',
        'available_for_role': WidgetRole.USER,
        'default_width':      6,
        'default_height':     4,
        'min_width':          4,
        'min_height':         3,
        'max_width':          12,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'limit': 'integer', 'category_id': 'integer'},
    },
    {
        'widget_type':        WidgetType.MARKET_MOVERS,
        'widget_name':        'Market Movers',
        'description':        'Top gainers, losers and most active stocks today.',
        'icon':               'Activity',
        'available_for_role': WidgetRole.USER,
        'default_width':      6,
        'default_height':     3,
        'min_width':          4,
        'min_height':         2,
        'max_width':          12,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'category': 'string', 'limit': 'integer'},
    },
    {
        'widget_type':        WidgetType.RECENT_ORDERS,
        'widget_name':        'Recent Orders',
        'description':        'Last 5 trade orders with status badges.',
        'icon':               'ShoppingCart',
        'available_for_role': WidgetRole.USER,
        'default_width':      6,
        'default_height':     3,
        'min_width':          4,
        'min_height':         2,
        'max_width':          12,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'limit': 'integer'},
    },
    {
        'widget_type':        WidgetType.PRICE_ALERT_LIST,
        'widget_name':        'Price Alerts',
        'description':        'Active price alerts with trigger progress.',
        'icon':               'Bell',
        'available_for_role': WidgetRole.USER,
        'default_width':      4,
        'default_height':     3,
        'min_width':          3,
        'min_height':         2,
        'max_width':          6,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'limit': 'integer'},
    },

    # ── Admin widgets  ───
    {
        'widget_type':        WidgetType.PLATFORM_STATS,
        'widget_name':        'Platform Statistics',
        'description':        'Key platform metrics: AUM, users, revenue and trades.',
        'icon':               'BarChart',
        'available_for_role': WidgetRole.ADMIN,
        'default_width':      12,
        'default_height':     2,
        'min_width':          6,
        'min_height':         1,
        'max_width':          12,
        'is_resizable':       True,
        'is_removable':       False,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      None,
    },
    {
        'widget_type':        WidgetType.USER_GROWTH_CHART,
        'widget_name':        'User Growth',
        'description':        'Line chart showing new user registrations over time.',
        'icon':               'Users',
        'available_for_role': WidgetRole.ADMIN,
        'default_width':      6,
        'default_height':     3,
        'min_width':          4,
        'min_height':         2,
        'max_width':          12,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'days': 'integer'},
    },
    {
        'widget_type':        WidgetType.REVENUE_CHART,
        'widget_name':        'Revenue Chart',
        'description':        'Platform revenue trend — MRR, ARR and daily breakdown.',
        'icon':               'DollarSign',
        'available_for_role': WidgetRole.ADMIN,
        'default_width':      6,
        'default_height':     3,
        'min_width':          4,
        'min_height':         2,
        'max_width':          12,
        'is_resizable':       True,
        'is_removable':       True,
        'required_plan':      None,
        'is_active':          True,
        'config_schema':      {'days': 'integer', 'revenue_type': 'string'},
    },
]


def seed_dashboard_widgets():
    """
    Idempotent — inserts only widgets whose widget_type doesn't already exist.
    """
    created = []
    for data in DEFAULT_WIDGETS:
        existing = DashboardWidgets.query.filter_by(widget_type=data['widget_type']).first()
        if not existing:
            widget = DashboardWidgets()
            for field, value in data.items():
                setattr(widget, field, value)
            widget.save()
            created.append(data['widget_type'])
            logger.info(f"[Seeder] Widget created: {data['widget_name']}")
        else:
            logger.debug(f"[Seeder] Widget already exists: {data['widget_type']}")

    if created:
        logger.info(f"[Seeder] Dashboard widgets seeded: {created}")
    else:
        logger.info("[Seeder] All dashboard widgets already present.")