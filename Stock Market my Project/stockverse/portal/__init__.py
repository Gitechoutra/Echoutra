import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_session import Session
from dotenv import load_dotenv

from flask_sqlalchemy import SQLAlchemy

APP = None

db = SQLAlchemy()

def init_cors(app):
    CORS(app, resources={r"/*": {"origins": "*"}})
    APP.logger.info('Initialized CORS')


class InitApp:
    def app(self):
        global APP
        if APP:
            return APP

        # Load .env file before anything else
        load_dotenv()

        APP = Flask(__name__)

        environment = os.getenv('Backend', 'DEV')

        # ── Logger  ─────
        import logging
        from logging.handlers import RotatingFileHandler

        log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'logs')
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, 'app.log')

        logger = logging.getLogger('stockmarket')
        logger.setLevel(logging.DEBUG)

        if not logger.handlers:
            fh = RotatingFileHandler(log_file, maxBytes=10 * 1024 * 1024, backupCount=5)
            fh.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
            logger.addHandler(fh)

            ch = logging.StreamHandler()
            ch.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
            logger.addHandler(ch)

        APP.logger = logger

        # ── Config  ─────
        APP.debug = (environment == 'DEV')
        APP.secret_key = os.environ.get('APP_SECRET_KEY', 'stockmarket-app-secret-change-in-production')

        APP.config['SQLALCHEMY_DATABASE_URI'] = (
            os.environ.get('DATABASE_URL') or
            'mysql+pymysql://root:Mahesh2605@localhost:3306/stockmarket_db'
        )
        APP.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        APP.config['SQLALCHEMY_ECHO'] = (environment == 'DEV')
        db.init_app(APP)
        APP.config['SESSION_TYPE'] = 'filesystem'

        UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
        APP.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)

        Session(APP)

        logger.info(f"Logger initialized — environment: {environment}")

        try:
            from . import api, routes, models
            from portal.helpers.jwt import Token

            models.init_app(APP)
            api.init_app(APP)
            routes.init_app()
            Token(APP)
            init_cors(APP)

            # ── Static file serving ───────────────────────────────────────────
            # @APP.route('/uploads/<path:filename>')
            # def serve_uploaded_file(filename):
            #     try:
            #         return send_from_directory(UPLOAD_FOLDER, filename)
            #     except FileNotFoundError:
            #         return {'error': 'File not found'}, 404

            # ── Scheduler (price updates, notifications) ──────────────────────
            if not APP.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
                try:
                    from portal.scheduler import init_scheduler
                    init_scheduler(APP)
                    logger.info('APScheduler started')
                except Exception as sched_err:
                    logger.warning(f'APScheduler init failed (non-fatal): {sched_err}')

        except Exception as e:
            APP.logger.error('An error occurred while initializing app components: %s', e)
            raise

        APP.logger.info('StockMarket app initialization completed successfully')
        return APP




















