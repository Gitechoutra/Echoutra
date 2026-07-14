

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
        ('subscription_plans', 'price_halfyearly', "DECIMAL(10,2) DEFAULT 0.00"),
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


# Create Tables and Run Seeders
with app.app_context():

    # Create all database tables
    db.create_all()

    # Patch in additive columns on existing tables (trade_mode, etc.)
    try:
        _ensure_schema()
    except Exception as e:
        app.logger.error(f"Schema patch failed: {e}")

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
