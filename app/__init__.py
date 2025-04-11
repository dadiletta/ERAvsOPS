# app/__init__.py
from flask import Flask
from config import get_config

def create_app():
    """Initialize the Flask application"""
    # Create the Flask app
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(get_config())
    
    # Register blueprints
    from app.routes.main_routes import main_bp
    app.register_blueprint(main_bp)
    
    return app