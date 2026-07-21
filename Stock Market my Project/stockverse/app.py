

import os
from dotenv import load_dotenv

load_dotenv()

from portal import InitApp, db
from portal.helpers.email import init_mail


app = InitApp().app()

# Initialize Mail
init_mail(app)

def _ensure_schema():
    """Idempotently add columns that `db.create_all()` can't add to pre-existing
    tables (create_all only creates missing tables, never alters). Safe to run on
    every startup — each ALTER is guarded by an information_schema check."""
    from sqlalchemy import text

    # (table, column, DDL type + default) — additive, backward-compatible.
    additions = [
        ('trade_orders',       'trade_mode',       "VARCHAR(10) DEFAULT 'DELIVERY'"),
        ('portfolio_holdings', 'trade_mode',       "VARCHAR(10) DEFAULT 'DELIVERY'"),
    ]
    db_name = db.session.execute(text("SELECT DATABASE()")).scalar()
    for table, column, ddl in additions:
        exists = db.session.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = :db AND table_name = :t AND column_name = :c"
        ), {'db': db_name, 't': table, 'c': column}).scalar()
        if not exists:
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            db.session.commit()
            app.logger.info(f"[schema] added {table}.{column}")

    # Drop the old unique (portfolio_id, stock_id) constraint on holdings so a
    # stock can be held as both a DELIVERY holding and an INTRADAY position.
    idx_exists = db.session.execute(text(
        "SELECT COUNT(*) FROM information_schema.statistics "
        "WHERE table_schema = :db AND table_name = 'portfolio_holdings' "
        "AND index_name = 'uq_portfolio_stock'"
    ), {'db': db_name}).scalar()
    if idx_exists:
        db.session.execute(text("ALTER TABLE portfolio_holdings DROP INDEX uq_portfolio_stock"))
        db.session.commit()
        app.logger.info("[schema] dropped portfolio_holdings.uq_portfolio_stock")


def _ensure_currency_inr():
    """Normalise legacy USD rows to INR.

    The platform trades exclusively in Indian Rupees; every model now defaults to
    'INR'. Rows created before that change still carry 'USD' and would render with
    a '$' symbol in the admin finance/analytics pages. This rewrites those rows and
    the PLATFORM_DEFAULT_CURRENCY setting. Idempotent — a no-op once converted.

    NOTE: only the currency *label* is corrected. The stored amounts are untouched,
    because these rows were always rupee amounts mislabelled as USD; no FX
    conversion is applied (and none would be correct here).
    """
    from sqlalchemy import text

    tables = [
        'stocks', 'wallets', 'transactions', 'wallet_transactions',
    ]
    for table in tables:
        try:
            res = db.session.execute(text(
                f"UPDATE {table} SET currency = 'INR' WHERE currency <> 'INR' OR currency IS NULL"
            ))
            if res.rowcount:
                db.session.commit()
                app.logger.info(f"[currency] {table}: {res.rowcount} row(s) -> INR")
            else:
                db.session.rollback()
        except Exception as e:
            db.session.rollback()
            app.logger.debug(f"[currency] skipped {table} ({e})")

    try:
        res = db.session.execute(text(
            "UPDATE user_profiles SET currency_preference = 'INR' "
            "WHERE currency_preference <> 'INR' OR currency_preference IS NULL"
        ))
        if res.rowcount:
            db.session.commit()
            app.logger.info(f"[currency] user_profiles: {res.rowcount} row(s) -> INR")
        else:
            db.session.rollback()
    except Exception as e:
        db.session.rollback()
        app.logger.debug(f"[currency] skipped user_profiles ({e})")

    # The seeder only inserts missing keys, so an existing 'USD' row needs this.
    try:
        res = db.session.execute(text(
            "UPDATE admin_settings SET setting_value = 'INR', default_value = 'INR' "
            "WHERE setting_key = 'PLATFORM_DEFAULT_CURRENCY' AND setting_value <> 'INR'"
        ))
        if res.rowcount:
            db.session.commit()
            app.logger.info("[currency] PLATFORM_DEFAULT_CURRENCY -> INR")
        else:
            db.session.rollback()
    except Exception as e:
        db.session.rollback()
        app.logger.debug(f"[currency] skipped admin_settings ({e})")


# Create Tables and Run Seeders
with app.app_context():

    # Create all database tables
    db.create_all()

    # Patch in additive columns on existing tables (trade_mode, etc.)
    try:
        _ensure_schema()
    except Exception as e:
        app.logger.error(f"Schema patch failed: {e}")

    # Convert any legacy USD-labelled rows to INR.
    try:
        _ensure_currency_inr()
    except Exception as e:
        app.logger.error(f"Currency normalisation failed: {e}")

    from portal.seeders import run_all_seeders

    try:
        run_all_seeders()
        app.logger.info("All seeders executed successfully.")
    except Exception as e:
        app.logger.error(f"Seeder execution failed: {str(e)}")

# Run Application
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5050,
        debug=os.getenv("BACKEND", "DEV").upper() == "DEV"
    )















# ****************************************


# import os

# from dotenv import load_dotenv

# load_dotenv()

# from portal import InitApp
# from portal.helpers.email import init_mail

# app = InitApp().app()

# init_mail(app)

# with app.app_context():

#     from portal import db

#     db.create_all()

#     from portal.seeders import run_all_seeders
#     run_all_seeders()

# if __name__ == "__main__":
#     app.run(
#         debug=(os.environ.get("Backend", "DEV") == "DEV"),
#         port=5000
#     )


# ---------------------------------------------







# from portal import InitApp


# app = InitApp().app()


# if __name__ == '__main__':
#     app.run(use_reloader=False)
#     app.run(debug=True)


# Migration
# 1. flask db init
# 2. flask db migrate -m "Initial migration"
# 3. flask db upgrade
