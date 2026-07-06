import logging

from portal.api import api

ns = api.namespace(
    'stocks',
    description="Stocks APIs"
)

logger = logging.getLogger(__name__)

from .routes import *