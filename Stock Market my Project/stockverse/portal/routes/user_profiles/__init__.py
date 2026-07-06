import logging

from portal.api import api

ns = api.namespace(
    'user_profiles',
    description="User Profiles APIs"
)

logger = logging.getLogger(__name__)

from .routes import *