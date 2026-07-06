"""
portal/extensions.py
====================
Shared Flask extension instances — imported by models and the app factory.
"""

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db      = SQLAlchemy()
migrate = Migrate()