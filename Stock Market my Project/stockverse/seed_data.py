"""
seeds/seed_data.py
==================
Run once after flask db upgrade to populate lookup tables:

    flask shell
    >>> from seeds.seed_data import seed_all
    >>> seed_all()

Or via CLI:
    python -c "from app import create_app; app=create_app(); \
               ctx=app.app_context(); ctx.push(); \
               from seeds.seed_data import seed_all; seed_all()"
"""

from portal.extensions import db
from portal.models.roles              import Roles, RoleTypes
from portal.models.subscription_plans import SubscriptionPlans, PlanTier, BillingCycle
from portal.models.dashboard_widgets  import DashboardWidgets, WidgetType
from portal.models.news_categories    import NewsCategories
from portal.models.admin_settings     import AdminSettings
from portal.models.feature_flags      import FeatureFlags
from portal.models.users              import Users, AccountStatus
from portal.models.user_profiles      import UserProfiles
from portal.models.user_preferences   import UserPreferences
from portal.models.user_security_settings import UserSecuritySettings
from portal.models.notification_preferences import NotificationPreferences
from portal.models.wallets            import Wallets
from werkzeug.security import generate_password_hash


#  ──────────────────────
# Roles
#  ──────────────────────

def seed_roles():
    for name, desc in [
        (RoleTypes.ADMIN, 'Platform administrator — full access'),
        (RoleTypes.USER,  'Regular investor — own data only'),
    ]:
        if not Roles.query.filter_by(role_name=name).first():
            r = Roles(role_name=name, description=desc)
            r.save()
    print('[✓] Roles seeded.')


#  ──────────────────────
# Subscription Plans
#  ──────────────────────

def seed_subscription_plans():
    plans = [
        dict(
            plan_name='FREE', tier=PlanTier.FREE,
            billing_cycle=BillingCycle.MONTHLY, price_usd=0.00,
            description='Get started with basic portfolio tracking.',
            max_watchlist_items=5, max_portfolios=1, max_price_alerts=3,
            max_trade_orders_per_day=5,
            has_advanced_analytics=False, has_real_time_data=False,
            has_api_access=False, has_news_premium=False,
            display_order=1,
            features_json='["5 watchlist items","1 portfolio","3 price alerts","Delayed quotes"]',
        ),
        dict(
            plan_name='STARTER', tier=PlanTier.STARTER,
            billing_cycle=BillingCycle.MONTHLY, price_usd=9.99,
            description='For casual investors ready to level up.',
            max_watchlist_items=25, max_portfolios=3, max_price_alerts=15,
            max_trade_orders_per_day=20,
            has_advanced_analytics=False, has_real_time_data=True,
            has_api_access=False, has_news_premium=False,
            display_order=2,
            features_json='["25 watchlist items","3 portfolios","15 alerts","Real-time quotes","News feed"]',
        ),
        dict(
            plan_name='PRO', tier=PlanTier.PRO,
            billing_cycle=BillingCycle.MONTHLY, price_usd=29.99,
            description='Full analytics for serious traders.',
            max_watchlist_items=100, max_portfolios=10, max_price_alerts=50,
            max_trade_orders_per_day=100,
            has_advanced_analytics=True, has_real_time_data=True,
            has_api_access=False, has_news_premium=True,
            badge_label='Most Popular',
            display_order=3,
            features_json='["Unlimited watchlists","10 portfolios","Advanced analytics","Premium news","Priority support"]',
        ),
        dict(
            plan_name='ELITE', tier=PlanTier.ELITE,
            billing_cycle=BillingCycle.MONTHLY, price_usd=79.99,
            description='Professional-grade tools + API access.',
            max_watchlist_items=None, max_portfolios=None,
            max_price_alerts=None, max_trade_orders_per_day=None,
            has_advanced_analytics=True, has_real_time_data=True,
            has_api_access=True, has_news_premium=True,
            badge_label='Best Value',
            display_order=4,
            features_json='["Unlimited everything","API access","WebSocket feed","Dedicated support","Custom reports"]',
        ),
    ]
    for p_data in plans:
        if not SubscriptionPlans.query.filter_by(plan_name=p_data['plan_name']).first():
            plan = SubscriptionPlans(**p_data, is_active=True)
            plan.save()
    print('[✓] Subscription plans seeded.')


#  ──────────────────────
# Dashboard Widgets
#  ──────────────────────

def seed_dashboard_widgets():
    widgets = [
        # User widgets
        dict(widget_type=WidgetType.PORTFOLIO_VALUE,  widget_name='Portfolio Value',
             description='Total portfolio value, P&L, and day change.',
             role_required='USER', default_width=4, default_height=2, is_removable=False),
        dict(widget_type=WidgetType.PNL_CHART,        widget_name='P&L Chart',
             description='Performance chart over time.',
             role_required='USER', default_width=8, default_height=2),
        dict(widget_type=WidgetType.TOP_HOLDINGS,     widget_name='Top Holdings',
             description='Your top positions by value.',
             role_required='USER', default_width=6, default_height=3),
        dict(widget_type=WidgetType.SECTOR_ALLOCATION, widget_name='Sector Allocation',
             description='Portfolio sector breakdown donut chart.',
             role_required='USER', default_width=6, default_height=3),
        dict(widget_type=WidgetType.MARKET_MOVERS,    widget_name='Market Movers',
             description='Today\'s top gainers and losers.',
             role_required='USER', default_width=4, default_height=3),
        dict(widget_type=WidgetType.WATCHLIST_MINI,   widget_name='Watchlist',
             description='Mini view of your default watchlist.',
             role_required='USER', default_width=4, default_height=3),
        dict(widget_type=WidgetType.RECENT_TRADES,    widget_name='Recent Trades',
             description='Your latest executed orders.',
             role_required='USER', default_width=4, default_height=3),
        dict(widget_type=WidgetType.NEWS_FEED,        widget_name='News Feed',
             description='Latest market news.',
             role_required='USER', default_width=8, default_height=3),
        dict(widget_type=WidgetType.PRICE_ALERTS,     widget_name='Price Alerts',
             description='Active and triggered price alerts.',
             role_required='USER', default_width=4, default_height=3),
        # Admin widgets
        dict(widget_type=WidgetType.PLATFORM_STATS,   widget_name='Platform Stats',
             description='AUM, active users, revenue KPIs.',
             role_required='ADMIN', default_width=6, default_height=2, is_removable=False),
        dict(widget_type=WidgetType.REVENUE_CHART,    widget_name='Revenue Chart',
             description='Platform revenue trend.',
             role_required='ADMIN', default_width=6, default_height=2),
        dict(widget_type=WidgetType.USER_GROWTH,      widget_name='User Growth',
             description='Daily signup trend chart.',
             role_required='ADMIN', default_width=6, default_height=3),
        dict(widget_type=WidgetType.PLAN_DISTRIBUTION, widget_name='Plan Distribution',
             description='Subscription plan breakdown donut.',
             role_required='ADMIN', default_width=6, default_height=3),
        dict(widget_type=WidgetType.RECENT_USERS_TABLE, widget_name='Recent Users',
             description='Latest registered users table.',
             role_required='ADMIN', default_width=8, default_height=3),
        dict(widget_type=WidgetType.SYSTEM_HEALTH,   widget_name='System Health',
             description='Service health status panel.',
             role_required='ADMIN', default_width=4, default_height=3),
    ]
    for w_data in widgets:
        if not DashboardWidgets.query.filter_by(widget_type=w_data['widget_type']).first():
            w = DashboardWidgets(**w_data, is_active=True,
                                 is_resizable=w_data.pop('is_removable', True))
            # Re-add is_removable properly
            w.is_removable = w_data.get('is_removable', True)
            w.save()
    print('[✓] Dashboard widgets seeded.')


#  ──────────────────────
# News Categories
#  ──────────────────────

def seed_news_categories():
    cats = [
        ('All',       'all',       '📰', '#6B7280', 0),
        ('Earnings',  'earnings',  '💰', '#10B981', 1),
        ('Economy',   'economy',   '🏦', '#3B82F6', 2),
        ('Tech',      'tech',      '💻', '#8B5CF6', 3),
        ('Crypto',    'crypto',    '₿',  '#F59E0B', 4),
        ('IPO',       'ipo',       '🚀', '#EF4444', 5),
        ('Dividends', 'dividends', '💵', '#06B6D4', 6),
        ('Mergers',   'mergers',   '🤝', '#F97316', 7),
        ('Analysis',  'analysis',  '📊', '#14B8A6', 8),
    ]
    for name, slug, icon, color, order in cats:
        if not NewsCategories.query.filter_by(slug=slug).first():
            c = NewsCategories(
                category_name=name, slug=slug,
                icon=icon, color_hex=color,
                display_order=order, is_active=True
            )
            c.save()
    print('[✓] News categories seeded.')


#  ──────────────────────
# Admin Settings (platform defaults)
#  ──────────────────────

def seed_admin_settings():
    settings = [
        dict(setting_key='platform_name',      setting_group='GENERAL',
             display_label='Platform Name',    value_type='STRING',
             string_value='TradeFlow',         is_public=True),
        dict(setting_key='support_email',      setting_group='GENERAL',
             display_label='Support Email',    value_type='STRING',
             string_value='support@tradeflow.io', is_public=True),
        dict(setting_key='maintenance_mode',   setting_group='GENERAL',
             display_label='Maintenance Mode', value_type='BOOL',
             bool_value=False,                 is_public=True),
        dict(setting_key='max_login_attempts', setting_group='SECURITY',
             display_label='Max Login Attempts', value_type='INT',
             int_value=5,                      is_public=False),
        dict(setting_key='otp_expiry_minutes', setting_group='SECURITY',
             display_label='OTP Expiry (mins)', value_type='INT',
             int_value=10,                     is_public=False),
        dict(setting_key='platform_fee_pct',   setting_group='TRADING',
             display_label='Platform Fee %',   value_type='FLOAT',
             float_value=0.10,                 is_public=True),
        dict(setting_key='min_trade_amount',   setting_group='TRADING',
             display_label='Min Trade ($)',     value_type='FLOAT',
             float_value=1.00,                 is_public=True),
        dict(setting_key='two_fa_required_admin', setting_group='SECURITY',
             display_label='Require 2FA for Admins', value_type='BOOL',
             bool_value=True,                  is_public=False),
    ]
    for s_data in settings:
        if not AdminSettings.query.filter_by(setting_key=s_data['setting_key']).first():
            s = AdminSettings(**s_data)
            s.save()
    print('[✓] Admin settings seeded.')


#  ──────────────────────
# Feature Flags
#  ──────────────────────

def seed_feature_flags():
    flags = [
        dict(flag_key='real_time_quotes',     display_name='Real-Time Quotes',
             description='Live price streaming via WebSocket.',
             is_enabled=True,  rollout_percent=100),
        dict(flag_key='paper_trading',        display_name='Paper Trading',
             description='Simulated trading without real money.',
             is_enabled=True,  rollout_percent=100),
        dict(flag_key='fractional_shares',    display_name='Fractional Shares',
             description='Allow buying < 1 share.',
             is_enabled=True,  rollout_percent=100),
        dict(flag_key='social_portfolio',     display_name='Public Portfolio Sharing',
             description='Let users make their portfolio public.',
             is_enabled=False, rollout_percent=0),
        dict(flag_key='api_access_beta',      display_name='API Access (Beta)',
             description='External API access for ELITE plan users.',
             is_enabled=True,  rollout_percent=100,
             allowed_plans='["ELITE"]'),
        dict(flag_key='ai_stock_insights',    display_name='AI Stock Insights',
             description='AI-generated buy/sell recommendations.',
             is_enabled=False, rollout_percent=0),
        dict(flag_key='dark_mode',            display_name='Dark Mode',
             description='Dark UI theme.',
             is_enabled=True,  rollout_percent=100),
        dict(flag_key='crypto_trading',       display_name='Crypto Trading',
             description='Enable cryptocurrency trading.',
             is_enabled=False, rollout_percent=0),
    ]
    for f_data in flags:
        if not FeatureFlags.query.filter_by(flag_key=f_data['flag_key']).first():
            f = FeatureFlags(**f_data, scope='GLOBAL')
            f.save()
    print('[✓] Feature flags seeded.')


#  ──────────────────────
# Default Admin User
#  ──────────────────────

def seed_admin_user():
    admin_email = 'admin@tradeflow.io'
    if Users.query.filter_by(email=admin_email).first():
        print('[✓] Admin user already exists.')
        return

    admin_role = Roles.query.filter_by(role_name=RoleTypes.ADMIN).first()
    if not admin_role:
        print('[✗] ADMIN role not found — run seed_roles() first.')
        return

    admin = Users()
    admin.role_id        = admin_role.role_id
    admin.full_name      = 'TradeFlow Admin'
    admin.username       = 'tradeflow_admin'
    admin.email          = admin_email
    admin.password_hash  = generate_password_hash('Admin@123')
    admin.account_status = AccountStatus.ACTIVE
    admin.is_email_verified = True
    admin.save()

    UserProfiles(user_id=admin.user_id).save()
    UserPreferences(user_id=admin.user_id).save()
    UserSecuritySettings(user_id=admin.user_id).save()
    NotificationPreferences(user_id=admin.user_id).save()
    Wallets(user_id=admin.user_id).save()

    print(f'[✓] Admin user created: {admin_email} / Admin@123')


#  ──────────────────────
# Run all seeds
#  ──────────────────────

def seed_all():
    seed_roles()
    seed_subscription_plans()
    seed_dashboard_widgets()
    seed_news_categories()
    seed_admin_settings()
    seed_feature_flags()
    seed_admin_user()
    db.session.commit()
    print('\n[✓] All seeds complete.')