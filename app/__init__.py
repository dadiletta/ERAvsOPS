# app/__init__.py
from flask import Flask, current_app
from flask_sqlalchemy import SQLAlchemy
from config import get_config
import os
import json
from datetime import datetime, timezone

# Initialize SQLAlchemy
db = SQLAlchemy()

# Create a module-level variable for the app
app = None

def validate_mlb_data(data):
    """
    Validate MLB team data to ensure quality and accuracy
    
    Args:
        data: List of team data dictionaries
    
    Returns:
        List of validated team data dictionaries
    """
    valid_data = []
    seen_teams = set()
    team_count_before = len(data)
    
    for team in data:
        # Skip teams with missing ERA or OPS
        if team.get('era') is None or team.get('ops') is None:
            if app:  # Check if app exists before using its logger
                app.logger.warning(f"Skipping team with incomplete data: {team.get('name', 'Unknown')}")
            continue
            
        # Validate ERA is within reasonable range (1.0 to 7.0)
        try:
            era = float(team['era'])
            if not (1.0 <= era <= 7.0):
                if app:
                    app.logger.warning(f"Skipping team with invalid ERA {team['era']}: {team.get('name', 'Unknown')}")
                continue
        except (ValueError, TypeError):
            if app:
                app.logger.warning(f"Skipping team with non-numeric ERA {team.get('era')}: {team.get('name', 'Unknown')}")
            continue
            
        # Validate OPS is within reasonable range (0.5 to 1.0)
        try:
            ops = float(team['ops'])
            if not (0.5 <= ops <= 1.0):
                if app:
                    app.logger.warning(f"Skipping team with invalid OPS {team['ops']}: {team.get('name', 'Unknown')}")
                continue
        except (ValueError, TypeError):
            if app:
                app.logger.warning(f"Skipping team with non-numeric OPS {team.get('ops')}: {team.get('name', 'Unknown')}")
            continue
            
        # Check for duplicate teams (by ID)
        team_id = team.get('id')
        if team_id in seen_teams:
            if app:
                app.logger.warning(f"Skipping duplicate team: {team.get('name', 'Unknown')}")
            continue
            
        seen_teams.add(team_id)
        valid_data.append(team)
    
    if app:
        app.logger.info(f"Data validation: {team_count_before} teams before, {len(valid_data)} after validation")
    
    return valid_data

def create_app():
    """Initialize the Flask application"""
    # Create the Flask app
    global app  # Now this is inside a function, which is valid
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(get_config())
    
    # Initialize extensions
    db.init_app(app)
    
    # Register blueprints
    from app.routes.main_routes import main_bp
    from app.routes.data_routes import data_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(data_bp)
    
    # Create database tables if they don't exist
    with app.app_context():
        db.create_all()
        
        # Check if database is empty and initialize with data_cache.json if needed
        from app.models.mlb_snapshot import MLBSnapshot
        if MLBSnapshot.query.count() == 0:
            try:
                app.logger.info("Database is empty, initializing with data_cache.json")
                
                # Load data directly from data_cache.json
                cache_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data_cache.json')
                with open(cache_file, 'r') as f:
                    initial_data = json.load(f)
                
                if initial_data and len(initial_data) > 0:
                    # Validate the data
                    initial_data = validate_mlb_data(initial_data)
                    
                    # Create a new snapshot with yesterday's date (to ensure it's not fresh)
                    from datetime import timedelta
                    snapshot = MLBSnapshot(
                        timestamp=datetime.now(timezone.utc) - timedelta(days=1),
                        data=json.dumps(initial_data)
                    )
                    db.session.add(snapshot)
                    db.session.commit()
                    app.logger.info(f"Initialized database with {len(initial_data)} validated teams")
            except Exception as e:
                app.logger.error(f"Error initializing database: {str(e)}")
                import traceback
                app.logger.error(traceback.format_exc())
        
        # Clean up duplicate snapshots
        try:
            # Import at this point to ensure app context is available
            from app.utils.snapshot_cleanup import cleanup_duplicate_snapshots
            
            # Run the cleanup
            deleted_count = cleanup_duplicate_snapshots()
            
            # Log the results
            if deleted_count > 0:
                app.logger.info(f"Startup cleanup: Removed {deleted_count} duplicate snapshots")
                
                # Update the remaining count for logging
                remaining = MLBSnapshot.query.count()
                app.logger.info(f"Remaining snapshots after cleanup: {remaining}")
            else:
                app.logger.info("No duplicate snapshots found during startup cleanup")
        except Exception as e:
            app.logger.error(f"Error during startup snapshot cleanup: {str(e)}")
            import traceback
            app.logger.error(traceback.format_exc())
    
    return app