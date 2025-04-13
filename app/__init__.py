# app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from config import get_config
import os
import json

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
        
        # Check if database is empty and initialize with data_cache.json if needed
        from app.models.mlb_snapshot import MLBSnapshot
        if MLBSnapshot.query.count() == 0:
            try:
                app.logger.info("Database is empty, initializing with data from data_cache.json")
                
                # Load data directly from data_cache.json
                cache_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data_cache.json')
                with open(cache_file, 'r') as f:
                    initial_data = json.load(f)
                
                if initial_data and len(initial_data) > 0:
                    # Create a new snapshot with yesterday's date (to ensure it's not fresh)
                    from datetime import datetime, timedelta
                    snapshot = MLBSnapshot(
                        timestamp=datetime.utcnow() - timedelta(days=1),
                        data=json.dumps(initial_data)
                    )
                    db.session.add(snapshot)
                    db.session.commit()
                    app.logger.info(f"Initialized database with {len(initial_data)} teams")
            except Exception as e:
                app.logger.error(f"Error initializing database: {str(e)}")
                import traceback
                app.logger.error(traceback.format_exc())
    
    return app