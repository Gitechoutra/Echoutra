import logging

from portal.api import api

ns = api.namespace(
    'notifications',
    description="Notifications APIs"
)

logger = logging.getLogger(__name__)

from .routes import *