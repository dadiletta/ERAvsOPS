# app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from config import get_config
import os

# Initialize SQLAlchemy
db = SQLAlchemy()

def create_app():
    """Initialize the Flask application"""
    # Create the Flask app
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(get_config())
    
    # Set up database
    database_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'mlb_data_history.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{database_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialize extensions
    db.init_app(app)
    
    # Register blueprints
    from app.routes.main_routes import main_bp
    app.register_blueprint(main_bp)
    
    # Create database tables if they don't exist
    with app.app_context():
        db.create_all()
    
    return app