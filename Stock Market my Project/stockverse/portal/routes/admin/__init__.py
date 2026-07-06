import logging

from portal.api import api

ns = api.namespace(
    'admin',
    description="Admin APIs"
)

logger = logging.getLogger(__name__)

from .routes import *