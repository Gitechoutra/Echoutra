import logging

from portal.api import api

ns = api.namespace(
    'price_alerts',
    description="Price Alerts APIs"
)

logger = logging.getLogger(__name__)

from .routes import *