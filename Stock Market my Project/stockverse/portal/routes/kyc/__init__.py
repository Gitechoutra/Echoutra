import logging

from portal.api import api

ns = api.namespace(
    'kyc',
    description="KYC APIs"
)

logger = logging.getLogger(__name__)

from .routes import *