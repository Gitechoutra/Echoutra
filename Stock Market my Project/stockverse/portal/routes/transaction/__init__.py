import logging

from portal.api import api

ns = api.namespace(
    'transactions',
    description="Transaction APIs"
)

logger = logging.getLogger(__name__)

from .routes import *