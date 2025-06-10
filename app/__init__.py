# app/__init__.py 

import logging
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

# Initialize database
db = SQLAlchemy()

def validate_mlb_data(data):
    """
    Validate and clean MLB team data
    
    Args:
        data: List of team dictionaries
        
    Returns:
        List of validated team dictionaries
    """
    if not data or not isinstance(data, list):
        return []
    
    valid_data = []
    seen_teams = set()
    team_count_before = len(data)
    
    # Get Flask app for logging if available
    try:
        from flask import current_app as app
    except:
        app = None
    
    for team in data:
        if not isinstance(team, dict):
            continue
            
        # Ensure required fields exist with defaults
        required_fields = ['era', 'ops', 'wins', 'losses']
        
        for field in required_fields:
            if field not in team or team[field] is None:
                if app:
                    app.logger.warning(f"Team missing {field}: {team.get('name', 'Unknown')}")
                team[field] = 0.0
                
        # Ensure run differential fields exist
        if 'runs_scored' not in team or team['runs_scored'] is None:
            if app:
                app.logger.warning(f"Team missing runs_scored: {team.get('name', 'Unknown')}")
            team['runs_scored'] = 0
            team['runs_allowed'] = 0
            team['run_differential'] = 0
            
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
    """
    Create and configure the Flask application.
    
    Note: Heavy initialization operations (seeding, cleanup, migrations) 
    are handled by init_db.py to avoid redundancy.
    """
    # Create the Flask app
    app = Flask(__name__)
    
    # Load configuration
    from config import get_config
    app.config.from_object(get_config())
    
    # Configure logging
    if not app.debug:
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s %(levelname)s %(name)s: %(message)s'
        )
    
    # Initialize extensions
    db.init_app(app)
    
    # Register blueprints
    from app.routes.main_routes import main_bp
    from app.routes.data_routes import data_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(data_bp)
    
    # Minimal app context operations (tables should already exist from init_db.py)
    with app.app_context():
        # Ensure tables exist (lightweight operation)
        db.create_all()
        
        # Quick health check - verify database connection
        try:
            from app.models.mlb_snapshot import MLBSnapshot
            snapshot_count = MLBSnapshot.query.count()
            app.logger.info(f"App started with {snapshot_count} snapshots in database")
            
            # Run lightweight cleanup if we have snapshots to process
            if snapshot_count > 20:  # Only if we have enough data
                try:
                    from app.utils.snapshot_cleanup import lightweight_snapshot_cleanup
                    results = lightweight_snapshot_cleanup(batch_size=25)  # Smaller batch for app startup
                    
                    if results["removed"] > 0:
                        app.logger.info(f"Startup cleanup: removed {results['removed']} snapshots")
                        
                except Exception as e:
                    app.logger.warning(f"Startup cleanup failed: {e}")
                    # Don't let cleanup failure prevent app startup
            
            # Warn if database is completely empty
            if snapshot_count == 0:
                app.logger.warning("Database appears empty - ensure init_db.py ran successfully")
                
        except Exception as e:
            app.logger.error(f"Database health check failed: {str(e)}")
            # Don't raise exception - let app start anyway
    
    app.logger.info("Flask app created successfully")
    return app

# Keep this for backward compatibility if imported elsewhere
def create_app_context():
    """Compatibility function"""
    return create_app()

