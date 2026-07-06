import logging

from portal.api import api

ns = api.namespace(
    'dashboard',
    description="Dashboard APIs"
)

logger = logging.getLogger(__name__)

from .routes import *