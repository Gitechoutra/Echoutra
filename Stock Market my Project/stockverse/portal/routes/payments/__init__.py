import logging

from portal.api import api

ns = api.namespace(
    'payments',
    description="Payments APIs"
)

logger = logging.getLogger(__name__)

from .routes import *