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
    
    with app.app_context():
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
            
            # Ensure wins and losses are valid integers (but don't reject if missing)
            try:
                if 'wins' in team:
                    team['wins'] = int(team['wins'])
                else:
                    team['wins'] = 0
                    
                if 'losses' in team:
                    team['losses'] = int(team['losses'])
                else:
                    team['losses'] = 0
            except (ValueError, TypeError):
                if app:
                    app.logger.warning(f"Converting invalid wins/losses to zero for {team.get('name', 'Unknown')}")
                team['wins'] = 0
                team['losses'] = 0
                
            # Validate runs_scored and runs_allowed, or derive them if missing
            try:
                if 'runs_scored' in team:
                    team['runs_scored'] = int(team['runs_scored'])
                else:
                    # Default value or derivation based on other stats
                    team['runs_scored'] = int(float(team['ops']) * 500)  # Estimate based on OPS
                    if app:
                        app.logger.info(f"Estimated runs_scored for {team.get('name', 'Unknown')}")
                        
                if 'runs_allowed' in team:
                    team['runs_allowed'] = int(team['runs_allowed'])
                else:
                    # Default value or derivation based on other stats
                    team['runs_allowed'] = int(float(team['era']) * 100)  # Estimate based on ERA
                    if app:
                        app.logger.info(f"Estimated runs_allowed for {team.get('name', 'Unknown')}")
                        
                # Always calculate run_differential from runs_scored and runs_allowed
                team['run_differential'] = team['runs_scored'] - team['runs_allowed']
                    
            except (ValueError, TypeError):
                if app:
                    app.logger.warning(f"Error processing runs data for {team.get('name', 'Unknown')}")
                # Set default values
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
        
        # Import and run the database seeding script
        from .utils.seed_db import seed_database, add_missing_snapshots
        try:
            # First run the normal seed process (which only runs if DB is empty)
            snapshot_count = seed_database(app)
            if snapshot_count > 0:
                app.logger.info(f"Database initialized with {snapshot_count} snapshots")
                
            # Then check for and add any missing snapshots
            missing_count = add_missing_snapshots(app)
            if missing_count > 0:
                app.logger.info(f"Added {missing_count} missing snapshots from seed data")
        except Exception as e:
            app.logger.error(f"Error seeding database: {str(e)}")
            import traceback
            app.logger.error(traceback.format_exc())
        
    # Aggressive cleanup for excessive snapshots (run before regular cleanup)
    try:
        from app.utils.aggressive_cleanup import aggressive_snapshot_cleanup
        
        # Run aggressive cleanup first
        before, after, deleted = aggressive_snapshot_cleanup()
        
        if deleted > 0:
            app.logger.warning(f"AGGRESSIVE CLEANUP: Reduced snapshots from {before} to {after} (deleted {deleted})")
    except Exception as e:
        app.logger.error(f"Error during aggressive snapshot cleanup: {str(e)}")
        import traceback
        app.logger.error(traceback.format_exc())
    
    # Clean up duplicate snapshots
    try:
        from app.utils.snapshot_cleanup import cleanup_duplicate_snapshots
        from app.models.mlb_snapshot import MLBSnapshot 
        
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
    
        try:
            from app.utils.run_diff_migration import migrate_run_differential
            
            # Run the migration
            updated_count = migrate_run_differential()
            
            # Log the results
            if updated_count > 0:
                app.logger.info(f"Run differential migration: Updated {updated_count} snapshots")
        except Exception as e:
            app.logger.error(f"Error during run differential migration: {str(e)}")
    
    return app