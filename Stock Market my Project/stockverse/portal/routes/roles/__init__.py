import logging

from portal.api import api

ns = api.namespace(
    'roles',
    description="Roles APIs"
)

logger = logging.getLogger(__name__)

from .routes import *