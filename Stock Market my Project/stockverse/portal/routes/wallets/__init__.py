import logging

from portal.api import api

ns = api.namespace(
    'wallets',
    description="Wallets APIs"
)

logger = logging.getLogger(__name__)

from .routes import *