import logging

from portal.api import api

ns = api.namespace(
    'users',
    description="Users APIs"
)

logger = logging.getLogger(__name__)

from .routes import *