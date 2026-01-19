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

        # Auto-migrate database schema if needed (adds new columns automatically)
        try:
            from sqlalchemy import inspect, text
            inspector = inspect(db.engine)

            if 'mlb_snapshots' in inspector.get_table_names():
                columns = [col['name'] for col in inspector.get_columns('mlb_snapshots')]

                # Add season column if missing
                if 'season' not in columns:
                    app.logger.info("Auto-migrating: Adding 'season' column...")
                    db.session.execute(text('ALTER TABLE mlb_snapshots ADD COLUMN season INTEGER'))
                    db.session.execute(text('CREATE INDEX IF NOT EXISTS idx_season ON mlb_snapshots(season)'))
                    db.session.commit()

                # Add team_count column if missing
                if 'team_count' not in columns:
                    app.logger.info("Auto-migrating: Adding 'team_count' column...")
                    db.session.execute(text('ALTER TABLE mlb_snapshots ADD COLUMN team_count INTEGER DEFAULT 0'))
                    db.session.commit()

                # Add data_hash column if missing
                if 'data_hash' not in columns:
                    app.logger.info("Auto-migrating: Adding 'data_hash' column...")
                    db.session.execute(text('ALTER TABLE mlb_snapshots ADD COLUMN data_hash VARCHAR(64)'))
                    db.session.execute(text('CREATE INDEX IF NOT EXISTS idx_data_hash ON mlb_snapshots(data_hash)'))
                    db.session.commit()

                # Ensure timestamp index exists
                try:
                    db.session.execute(text('CREATE INDEX IF NOT EXISTS idx_timestamp ON mlb_snapshots(timestamp)'))
                    db.session.commit()
                except:
                    pass

        except Exception as e:
            app.logger.warning(f"Auto-migration failed (may already be complete): {e}")
            db.session.rollback()

        # Quick health check - verify database connection
        try:
            from app.models.mlb_snapshot import MLBSnapshot
            snapshot_count = MLBSnapshot.query.count()
            app.logger.info(f"App started with {snapshot_count} snapshots in database")

            # Auto-backfill metadata for snapshots missing season/hash/count
            try:
                from app.utils.auto_maintenance import AutoMaintenance

                needs_backfill = MLBSnapshot.query.filter(
                    (MLBSnapshot.season == None) |
                    (MLBSnapshot.team_count == 0) |
                    (MLBSnapshot.data_hash == None)
                ).count()

                if needs_backfill > 0:
                    app.logger.info(f"Auto-backfilling metadata for {needs_backfill} snapshots...")
                    results = AutoMaintenance.backfill_metadata()
                    if results.get('success'):
                        app.logger.info(f"Metadata backfilled: {results['updated']} snapshots")

            except Exception as e:
                app.logger.warning(f"Auto-backfill skipped: {e}")

            # Run auto-maintenance if needed (non-blocking, self-managing)
            if snapshot_count > 100:
                try:
                    from app.utils.auto_maintenance import AutoMaintenance

                    should_run, urgency, count = AutoMaintenance.should_run_maintenance()

                    if should_run:
                        app.logger.info(f"Auto-maintenance: {urgency} urgency, {count} snapshots")
                        results = AutoMaintenance.run_auto_maintenance(urgency='normal', dry_run=False)
                        app.logger.info(f"Auto-maintenance complete: removed {results['total_removed']} snapshots")
                    else:
                        app.logger.info(f"Auto-maintenance: No cleanup needed ({count} snapshots)")

                except Exception as e:
                    app.logger.warning(f"Auto-maintenance failed: {e}")

            # Warn if database is completely empty
            if snapshot_count == 0:
                app.logger.warning("Database appears empty")

        except Exception as e:
            app.logger.error(f"Database health check failed: {str(e)}")
            # Don't raise exception - let app start anyway
    
    app.logger.info("Flask app created successfully")
    return app

# Keep this for backward compatibility if imported elsewhere
def create_app_context():
    """Compatibility function"""
    return create_app()

