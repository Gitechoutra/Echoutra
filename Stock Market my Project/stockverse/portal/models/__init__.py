from flask_migrate import Migrate
from portal import db

migrate = Migrate()


def init_app(app):

    migrate.init_app(app, db)

    app.logger.info("Initialized models")

    with app.app_context():

        from .roles import Roles, RoleTypes
        from .users import Users, UserStatus
        from .user_profiles import UserProfiles
        from .user_preferences import UserPreferences, ExperienceLevel
        from .user_security_settings import UserSecuritySettings
        from .user_sessions import UserSessions, SessionStatus
        from .otp_verifications import OTPVerifications, OTPPurpose, OTPStatus
        from .login_history import LoginHistory, LoginStatus
        from .subscription_plans import SubscriptionPlans, PlanTier, BillingCycle
        from .user_subscriptions import UserSubscriptions, SubscriptionStatus
        from .billing_transactions import BillingTransactions, TransactionStatus
        from .wallets import Wallets, WalletStatus
        from .wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus
        from .stocks import Stocks, StockStatus, AssetType
        from .stock_price_history import StockPriceHistory, PriceInterval
        from .stock_analytics import StockAnalytics
        from .stock_ratings import StockRatings, RatingAction, AnalystRating
        from .stock_news_mapping import StockNewsMapping
        from .portfolios import Portfolios, PortfolioType
        from .portfolio_holdings import PortfolioHoldings
        from .portfolio_performance_history import PortfolioPerformanceHistory, SnapshotInterval
        from .watchlists import Watchlists
        from .watchlist_items import WatchlistItems
        from .watchlist_alerts import WatchlistAlerts, AlertCondition, AlertStatus
        from .trade_orders import TradeOrders, OrderType, OrderSide, OrderStatus, OrderDuration
        from .trade_executions import TradeExecutions
        from .transactions import Transactions, TxnType, TxnStatus
        from .market_news import MarketNews, NewsSentiment
        from .news_categories import NewsCategories
        from .notifications import Notifications, NotificationType, NotificationPriority
        from .notification_preferences import NotificationPreferences
        from .price_alerts import PriceAlerts, PriceAlertCondition, PriceAlertStatus
        from .admin_settings import AdminSettings, SettingDataType
        from .platform_statistics import PlatformStatistics
        from .audit_logs import AuditLogs
        from .admin_activity_logs import AdminActivityLogs
        from .feature_flags import FeatureFlags, FlagRolloutType
        from .dashboard_widgets import DashboardWidgets, WidgetType, WidgetRole
        from .user_dashboard_layouts import UserDashboardLayouts
        from .market_movers import MarketMovers, MoverCategory, MoverTimeframe
        from .sector_performance import SectorPerformance
        from .platform_revenue import PlatformRevenue, RevenueType
        from .country_statistics import CountryStatistics
        from .system_health_logs import SystemHealthLogs, HealthStatus, ServiceType
        from .kyc_verifications import KYCVerifications, KYCStatus, DocumentType
        from .payment_transactions import PaymentTransactions, PaymentStatus
        from .support_messages import SupportMessages, SupportSenderRole












