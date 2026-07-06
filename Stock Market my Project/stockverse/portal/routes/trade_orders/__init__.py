import logging

from portal.api import api

ns = api.namespace(
    'trade_orders',
    description="Trade Orders APIs"
)

logger = logging.getLogger(__name__)

from .routes import *