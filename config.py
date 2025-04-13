# config.py
import os
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

class Config:
    """Base configuration for ERAvsOPS app"""
    # Flask config
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-key-for-testing')
    
    # MLB API config
    MLB_API_KEY = os.getenv('MLB_API_KEY', None)
    
    # Database and Cache settings
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///mlb_data_history.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CACHE_TIMEOUT = int(os.getenv('CACHE_TIMEOUT', 3600))  # 1 hour in seconds
    SNAPSHOT_INTERVAL = int(os.getenv('SNAPSHOT_INTERVAL', 86400))  # 24 hours in seconds
    HISTORY_LIMIT = int(os.getenv('HISTORY_LIMIT', 30))  # Max number of historical data points to keep
    
    # Rate limiting settings
    API_RATE_LIMIT = float(os.getenv('API_RATE_LIMIT', 2.0))  # Minimum seconds between API requests

class DevelopmentConfig(Config):
    """Development environment configuration"""
    DEBUG = True
    TESTING = False

class TestingConfig(Config):
    """Testing environment configuration"""
    DEBUG = True
    TESTING = True

class ProductionConfig(Config):
    """Production environment configuration"""
    DEBUG = False
    TESTING = False

# Dictionary to map environment names to config objects
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

# Get the appropriate configuration based on environment
def get_config():
    env = os.getenv('FLASK_ENV', 'development')
    return config.get(env, config['default'])