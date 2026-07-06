

import os
from dotenv import load_dotenv

load_dotenv()

from portal import InitApp, db
from portal.helpers.email import init_mail


app = InitApp().app()

# Initialize Mail
init_mail(app)

# Create Tables and Run Seeders
with app.app_context():

    # Create all database tables
    db.create_all()

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
