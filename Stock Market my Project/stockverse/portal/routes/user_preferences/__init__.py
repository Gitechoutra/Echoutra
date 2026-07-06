import logging

from portal.api import api

ns = api.namespace(
    'user_preferences',
    description="User Preferences APIs"
)

logger = logging.getLogger(__name__)

from .routes import *