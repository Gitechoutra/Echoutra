"""
portal/config.py
================
Configuration classes for development, testing, and production.
Copy .env.example to .env and populate before running.
"""

import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class BaseConfig:
    """Shared settings across all environments."""

    SECRET_KEY              = os.getenv('SECRET_KEY', 'CHANGE-ME-IN-PRODUCTION')
    DEBUG                   = False
    TESTING                 = False

    # ── Database ───────────────────────────────────────────────────────────
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO                = False

    # ── JWT ────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY          = os.getenv('JWT_SECRET_KEY', 'JWT-CHANGE-ME')
    JWT_ACCESS_TOKEN_EXPIRES  = timedelta(hours=int(os.getenv('JWT_ACCESS_HOURS', 1)))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.getenv('JWT_REFRESH_DAYS', 30)))
    JWT_ALGORITHM           = 'HS256'

    # ── CORS ────────────────────────────────────────────────────────────────
    CORS_ORIGINS            = os.getenv('CORS_ORIGINS', '*')

    # ── Mail ────────────────────────────────────────────────────────────────
    MAIL_SERVER             = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT               = int(os.getenv('MAIL_PORT', 587))
    MAIL_USE_TLS            = True
    MAIL_USERNAME           = os.getenv('MAIL_USERNAME', '')
    MAIL_PASSWORD           = os.getenv('MAIL_PASSWORD', '')
    MAIL_DEFAULT_SENDER     = os.getenv('MAIL_DEFAULT_SENDER', 'noreply@tradeflow.io')

    # ── Payment gateways ────────────────────────────────────────────────────
    STRIPE_SECRET_KEY       = os.getenv('STRIPE_SECRET_KEY', '')
    STRIPE_WEBHOOK_SECRET   = os.getenv('STRIPE_WEBHOOK_SECRET', '')
    RAZORPAY_KEY_ID         = os.getenv('RAZORPAY_KEY_ID', '')
    RAZORPAY_KEY_SECRET     = os.getenv('RAZORPAY_KEY_SECRET', '')

    # ── Market data ─────────────────────────────────────────────────────────
    ALPHA_VANTAGE_API_KEY   = os.getenv('ALPHA_VANTAGE_API_KEY', '')
    POLYGON_API_KEY         = os.getenv('POLYGON_API_KEY', '')

    # ── File storage ─────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID       = os.getenv('AWS_ACCESS_KEY_ID', '')
    AWS_SECRET_ACCESS_KEY   = os.getenv('AWS_SECRET_ACCESS_KEY', '')
    AWS_S3_BUCKET           = os.getenv('AWS_S3_BUCKET', 'tradeflow-assets')
    AWS_REGION              = os.getenv('AWS_REGION', 'us-east-1')


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DEV_DATABASE_URL',
        'mysql+pymysql://root:Ra123@localhost:3306/stockverse'
    )
    SQLALCHEMY_ECHO = bool(os.getenv('SQL_ECHO', False))


class TestingConfig(BaseConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'TEST_DATABASE_URL',
        'mysql+pymysql://root:Ra123@localhost:3306/stockverse'
    )
    JWT_ACCESS_TOKEN_EXPIRES  = timedelta(minutes=5)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(minutes=10)


class ProductionConfig(BaseConfig):
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', '')
    SQLALCHEMY_POOL_SIZE       = int(os.getenv('DB_POOL_SIZE', 10))
    SQLALCHEMY_MAX_OVERFLOW    = int(os.getenv('DB_MAX_OVERFLOW', 20))
    SQLALCHEMY_POOL_TIMEOUT    = int(os.getenv('DB_POOL_TIMEOUT', 30))
    SQLALCHEMY_POOL_RECYCLE    = int(os.getenv('DB_POOL_RECYCLE', 1800))
    SQLALCHEMY_ECHO            = False


config_by_name = {
    'development': DevelopmentConfig,
    'testing':     TestingConfig,
    'production':  ProductionConfig,
    'default':     DevelopmentConfig,
}





