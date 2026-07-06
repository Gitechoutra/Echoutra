import logging

from portal.api import api

ns = api.namespace(
    'portfolios',
    description="Portfolios APIs"
)

logger = logging.getLogger(__name__)

from .routes import *