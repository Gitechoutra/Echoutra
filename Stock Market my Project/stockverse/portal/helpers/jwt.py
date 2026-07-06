import os
import datetime
from flask_jwt_extended import JWTManager

jwt_manager = JWTManager()


class Token:
    def __init__(self, app):
        secret = os.environ.get('JWT_SECRET_KEY', 'stockmarket-jwt-secret-change-in-production-!@#$%')

        access_minutes = int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRES_MINUTES', 60))
        refresh_days   = int(os.environ.get('JWT_REFRESH_TOKEN_EXPIRES_DAYS', 30))

        app.config['JWT_SECRET_KEY']                = secret
        app.config['JWT_ACCESS_TOKEN_EXPIRES']      = datetime.timedelta(minutes=access_minutes)
        app.config['JWT_REFRESH_TOKEN_EXPIRES']     = datetime.timedelta(days=refresh_days)

        app.config['JWT_TOKEN_LOCATION']            = ['headers', 'cookies']
        app.config['JWT_HEADER_NAME']               = 'Authorization'
        app.config['JWT_HEADER_TYPE']               = 'Bearer'

        app.config['JWT_COOKIE_SECURE']             = os.environ.get('Backend', 'DEV') == 'PROD'
        app.config['JWT_COOKIE_CSRF_PROTECT']       = False
        app.config['JWT_ACCESS_COOKIE_PATH']        = '/'
        app.config['JWT_SESSION_COOKIE']            = False
        app.config['JWT_SAMESITE']                  = 'Lax'
        app.config['JWT_ENCODE_NBF']                = False

        jwt_manager.init_app(app)

        # ── Custom error handlers ────────────────────────────────────────────

        @jwt_manager.expired_token_loader
        def expired_token_callback(jwt_header, jwt_payload):
            from flask import jsonify
            return jsonify(
                response={'message': 'Token has expired. Please login again.'},
                status=401, bool=False
            ), 401

        @jwt_manager.invalid_token_loader
        def invalid_token_callback(error):
            from flask import jsonify
            return jsonify(
                response={'message': 'Invalid token. Please login again.'},
                status=401, bool=False
            ), 401

        @jwt_manager.unauthorized_loader
        def missing_token_callback(error):
            from flask import jsonify
            return jsonify(
                response={'message': 'Authorization token is required.'},
                status=401, bool=False
            ), 401

        @jwt_manager.revoked_token_loader
        def revoked_token_callback(jwt_header, jwt_payload):
            from flask import jsonify
            return jsonify(
                response={'message': 'Token has been revoked. Please login again.'},
                status=401, bool=False
            ), 401












