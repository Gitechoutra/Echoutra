import logging

from portal.api import api

ns = api.namespace(
    'user_security',
    description="User Security APIs"
)

logger = logging.getLogger(__name__)

from .routes import *