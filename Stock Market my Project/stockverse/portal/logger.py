import logging
import os
from logging.handlers import RotatingFileHandler


class Logging:
    @staticmethod
    def init_logger(config):
        log_dir = config['keys']['log_dir']
        os.makedirs(log_dir, exist_ok=True)

        log_file = os.path.join(log_dir, 'app.log')

        # Provide a custom logger name here
        logger = logging.getLogger('__name__')
        logger.setLevel(logging.DEBUG)

        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5
        )
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s'))

        logger.addHandler(file_handler)

        return logger


