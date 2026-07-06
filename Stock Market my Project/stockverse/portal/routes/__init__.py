import logging


logger = logging.getLogger("backend-logger")
logger.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)

if not logger.hasHandlers():
    logger.addHandler(console_handler)


def init_app():
    from .authentication import routes
    from .dashboard import routes
    from .kyc import routes
    from .market_news import routes
    from .notifications import routes
    from .portfolios import routes
    from .price_alerts import routes
    from .roles import routes
    from .stocks import routes  
    from .users import routes
    from .watchlists import routes
    from .trade_orders import routes
    from .subscriptions import routes
    from .user_preferences import routes
    from .user_security import routes
    from .user_profiles import routes
    from .wallets import routes
    from .admin import routes
    from .transaction import routes
    from .payments import routes

    
