"""
portal/seeders/__init__.py
===========================
Central seeder registry — imports and runs all seeders
in the correct dependency order.

Usage in create_app() inside app.py:

    with app.app_context():
        db.create_all()
        from portal.seeders import run_all_seeders
        run_all_seeders()
"""

import logging

logger = logging.getLogger(__name__)


def run_all_seeders():
    """
    Run every seeder in strict dependency order:

        1. seed_roles        → ADMIN + USER rows must exist first
        2. seed_admin        → admin user needs ADMIN role to exist
        4. seed_news_categories    → categories must exist before any news article
        5. seed_dashboard_widgets  → widgets must exist before any layout is saved
        6. seed_admin_settings     → platform config key-values
        7. seed_feature_flags      → feature toggle defaults

    All seeders are idempotent — safe to call on every app boot.
    """
    # logger.info("=" * 55)
    logger.info("[Seeders] Starting database seeding...")
    # logger.info("=" * 55)

    # 1. Roles (no dependencies)
    try:
        from portal.seeders.seed_roles import seed_roles
        seed_roles()
    except Exception as e:
        logger.error(f"[Seeders] seed_roles FAILED: {e}")
        raise

    # 2. Admin user (depends on: roles)
    try:
        from portal.seeders.seed_admin import seed_admin
        seed_admin()
    except Exception as e:
        logger.error(f"[Seeders] seed_admin FAILED: {e}")
        raise

    # 4. News categories (no dependencies)
    try:
        from portal.seeders.seed_news_categories import seed_news_categories
        seed_news_categories()
    except Exception as e:
        logger.error(f"[Seeders] seed_news_categories FAILED: {e}")
        raise

    # 5. Dashboard widgets (no dependencies)
    try:
        from portal.seeders.seed_dashboard_widgets import seed_dashboard_widgets
        seed_dashboard_widgets()
    except Exception as e:
        logger.error(f"[Seeders] seed_dashboard_widgets FAILED: {e}")
        raise

    # 6. Admin settings (no dependencies)
    try:
        from portal.seeders.seed_admin_settings import seed_admin_settings
        seed_admin_settings()
    except Exception as e:
        logger.error(f"[Seeders] seed_admin_settings FAILED: {e}")
        raise

    # 7. Feature flags (no dependencies)
    try:
        from portal.seeders.seed_feature_flags import seed_feature_flags
        seed_feature_flags()
    except Exception as e:
        logger.error(f"[Seeders] seed_feature_flags FAILED: {e}")
        raise

    # 8. Add Stocks (no dependencies)
    try:
        from portal.seeders.seed_stocks import seed_stocks
        seed_stocks()
    except Exception as e:
        logger.error(f"[Seeders] seed_stocks FAILED: {e}")
        raise

    # logger.info("=" * 55)
    logger.info("[Seeders] All seeders completed successfully.")
    # logger.info("=" * 55)