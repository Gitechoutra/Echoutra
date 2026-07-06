import logging

from portal.api import api

ns = api.namespace(
    'watchlists',
    description="Watchlists APIs"
)

logger = logging.getLogger(__name__)

from .routes import *