import logging

from portal.api import api

ns = api.namespace(
    'support',
    description="User ↔ Admin support chat APIs"
)

logger = logging.getLogger(__name__)

from .routes import *
