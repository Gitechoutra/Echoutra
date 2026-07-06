import logging

from portal.api import api

ns = api.namespace(
    'authentication',
    description="Authentication APIs"
)

logger = logging.getLogger(__name__)


from .routes import *








# import logging

# from portal.api import api

# ns = api.namespace(
#     'authentication',
#     description="Authentication APIs"
# )

# logger = logging.getLogger(__name__)


