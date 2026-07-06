from flask import Blueprint
from flask_restx import Api

api = Api(
    version='1.0',
    title='StockMarket API',
    description='Backend API for StockMarket — Admin & User Trading Platform',
    doc='/doc/',
    catch_all_404s=True
)


def init_app(app):

    v1 = Blueprint('api', __name__, url_prefix='/v1')

    api.init_app(v1)

    # ── Import Namespaces ───────────────────────────────
    from portal.routes.authentication import ns as authentication_ns
    from portal.routes.roles import ns as roles_ns
    from portal.routes.users import ns as users_ns

    # ── Add Namespaces ──────────────────────────────────
    api.add_namespace(authentication_ns, path='/authentication')
    api.add_namespace(roles_ns, path='/roles')
    api.add_namespace(users_ns, path='/users')

    # ── Register Blueprint ──────────────────────────────
    app.register_blueprint(v1)

    app.logger.info("Initialized API namespaces")










