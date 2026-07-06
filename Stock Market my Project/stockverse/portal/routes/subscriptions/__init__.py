import logging

from portal.api import api

ns = api.namespace(
    'subscriptions',
    description="Subscriptions APIs"
)

logger = logging.getLogger(__name__)

from .routes import *