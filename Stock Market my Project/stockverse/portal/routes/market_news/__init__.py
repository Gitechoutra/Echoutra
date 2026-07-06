import logging

from portal.api import api

ns = api.namespace(
    'market_news',
    description="Market News APIs"
)

logger = logging.getLogger(__name__)

from .routes import *