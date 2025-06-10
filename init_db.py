#!/usr/bin/env python3
"""
Complete database initialization script for MLB ERA vs OPS Visualization.
Handles all database setup, seeding, and maintenance operations intelligently.
"""
import os
import json
import logging
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('init_db')

def check_maintenance_needed():
    """
    Check if maintenance operations should run based on environment and timing.
    Returns: (should_run_cleanup, should_run_migration)
    """
    env = os.getenv('FLASK_ENV', 'production')
    
    # Skip heavy maintenance in development
    if env == 'development':
        logger.info("Development environment - skipping heavy maintenance")
        return False, False
    
    # Check for maintenance flag file (prevents excessive runs)
    flag_file = '/tmp/mlb_maintenance_last_run'
    now = datetime.now().timestamp()
    
    if os.path.exists(flag_file):
        try:
            with open(flag_file, 'r') as f:
                last_run = float(f.read().strip())
            
            # Skip if maintenance ran in last 4 hours
            if (now - last_run) < 14400:  # 4 hours
                logger.info("Maintenance ran recently - skipping")
                return False, False
        except:
            pass  # Ignore errors reading flag file
    
    return True, True

def create_maintenance_flag():
    """Create flag file to track when maintenance last ran"""
    try:
        with open('/tmp/mlb_maintenance_last_run', 'w') as f:
            f.write(str(datetime.now().timestamp()))
    except:
        pass  # Ignore errors

def initialize_database_tables(app):
    """Create all database tables"""
    from app import db
    
    with app.app_context():
        logger.info("Creating database tables...")
        db.create_all()
        logger.info("Database tables created successfully")

def seed_database_if_empty(app):
    """Seed database with initial data if it's empty"""
    from app import db, validate_mlb_data
    from app.models.mlb_snapshot import MLBSnapshot
    
    with app.app_context():
        count = MLBSnapshot.query.count()
        logger.info(f"Found {count} existing snapshots in database")
        
        if count == 0:
            logger.info("Database is empty - initializing with cached data...")
            
            # Try to load from data_cache.json
            cache_file = os.path.join(os.path.dirname(__file__), 'data_cache.json')
            
            try:
                with open(cache_file, 'r') as f:
                    initial_data = json.load(f)
                
                if initial_data and len(initial_data) > 0:
                    # Validate the data
                    validated_data = validate_mlb_data(initial_data)
                    
                    # Create initial snapshot with yesterday's date
                    snapshot = MLBSnapshot(
                        timestamp=datetime.now(timezone.utc) - timedelta(days=1),
                        data=json.dumps(validated_data)
                    )
                    db.session.add(snapshot)
                    db.session.commit()
                    logger.info(f"Successfully initialized database with {len(validated_data)} teams")
                else:
                    logger.warning("No valid data found in data_cache.json")
                    
            except FileNotFoundError:
                logger.warning("data_cache.json not found - database will remain empty")
            except Exception as e:
                logger.error(f"Error loading initial data: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
        
        # Try to seed from db_seed_data if available and database still needs data
        current_count = MLBSnapshot.query.count()
        if current_count < 5:  # Less than 5 snapshots suggests we need more historical data
            try:
                from db_seed_data import SEED_SNAPSHOTS
                logger.info(f"Found seed data with {len(SEED_SNAPSHOTS)} snapshots")
                
                # Add missing snapshots from seed data
                existing_timestamps = {s.timestamp.replace(microsecond=0) 
                                     for s in MLBSnapshot.query.all()}
                
                added_count = 0
                for seed_data in SEED_SNAPSHOTS[:50]:  # Limit to avoid overwhelming
                    timestamp = seed_data['timestamp'].replace(microsecond=0)
                    if timestamp not in existing_timestamps:
                        try:
                            teams_data = json.loads(seed_data['data'])
                            validated_data = validate_mlb_data(teams_data)
                            
                            snapshot = MLBSnapshot(
                                timestamp=seed_data['timestamp'],
                                data=json.dumps(validated_data)
                            )
                            db.session.add(snapshot)
                            added_count += 1
                            
                            if added_count % 10 == 0:
                                db.session.commit()  # Commit in batches
                        except Exception as e:
                            logger.warning(f"Skipping invalid seed snapshot: {e}")
                
                if added_count > 0:
                    db.session.commit()
                    logger.info(f"Added {added_count} historical snapshots from seed data")
                    
            except ImportError:
                logger.info("No seed data module found - skipping historical seeding")
            except Exception as e:
                logger.error(f"Error seeding from historical data: {e}")

def run_database_maintenance(app):
    """Run database maintenance operations when needed"""
    from app.models.mlb_snapshot import MLBSnapshot
    
    with app.app_context():
        initial_count = MLBSnapshot.query.count()
        logger.info(f"Starting maintenance check with {initial_count} snapshots")
        
        if initial_count > 1500:  # Only run cleanup if we have too many snapshots
            logger.info("Database has excessive snapshots - running cleanup...")
            
            # First, remove exact duplicates
            try:
                from app.utils.snapshot_cleanup import cleanup_duplicate_snapshots
                duplicates_removed = cleanup_duplicate_snapshots()
                if duplicates_removed > 0:
                    logger.info(f"Removed {duplicates_removed} duplicate snapshots")
            except ImportError:
                logger.info("Duplicate cleanup module not available")
            except Exception as e:
                logger.error(f"Error during duplicate cleanup: {e}")
            
            # Then run aggressive cleanup if still too many
            current_count = MLBSnapshot.query.count()
            if current_count > 1000:
                try:
                    from app.utils.aggressive_cleanup import aggressive_snapshot_cleanup
                    before, after, deleted = aggressive_snapshot_cleanup(
                        keep_recent_hours=24,    # Keep all from last 24 hours
                        hourly_after_days=2,     # Keep hourly for 2 days
                        daily_after_days=14      # Keep daily for 2 weeks
                    )
                    logger.info(f"Aggressive cleanup: {before} -> {after} (deleted {deleted})")
                except ImportError:
                    logger.info("Aggressive cleanup module not available")
                except Exception as e:
                    logger.error(f"Error during aggressive cleanup: {e}")
        else:
            logger.info("Snapshot count is reasonable - skipping cleanup")

def run_data_migrations(app):
    """Run any needed data migrations"""
    with app.app_context():
        # Run run_differential migration if needed
        try:
            from app.utils.run_diff_migration import migrate_run_differential
            updated_count = migrate_run_differential()
            if updated_count > 0:
                logger.info(f"Run differential migration: Updated {updated_count} snapshots")
        except ImportError:
            logger.info("Run differential migration module not available")
        except Exception as e:
            logger.error(f"Error during run differential migration: {e}")

def print_database_info(app):
    """Print helpful database information"""
    from app import db
    from app.models.mlb_snapshot import MLBSnapshot
    
    with app.app_context():
        # Hide password in database URL for logging
        db_url = app.config['SQLALCHEMY_DATABASE_URI']
        if '@' in db_url:
            parts = db_url.split('@')
            user_part = parts[0].split(':')[0] if ':' in parts[0] else parts[0]
            rest_part = '@'.join(parts[1:])
            safe_url = f"{user_part}:*****@{rest_part}"
        else:
            safe_url = db_url
        
        logger.info(f"Connected to database: {safe_url}")
        
        # Get snapshot statistics
        total_snapshots = MLBSnapshot.query.count()
        
        if total_snapshots > 0:
            latest = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).first()
            oldest = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.asc()).first()
            
            logger.info(f"Database contains {total_snapshots} snapshots")
            logger.info(f"Latest snapshot: {latest.timestamp_aware}")
            logger.info(f"Oldest snapshot: {oldest.timestamp_aware}")
        else:
            logger.info("Database is empty")

def main():
    """Main initialization function"""
    logger.info("=" * 60)
    logger.info("Starting MLB ERA vs OPS Database Initialization")
    logger.info("=" * 60)
    
    try:
        # Create Flask app context
        from app import create_app
        app = create_app()
        
        # Step 1: Create database tables
        initialize_database_tables(app)
        
        # Step 2: Seed database if empty
        seed_database_if_empty(app)
        
        # Step 3: Check if maintenance is needed
        should_cleanup, should_migrate = check_maintenance_needed()
        
        if should_cleanup:
            logger.info("Running database maintenance...")
            run_database_maintenance(app)
            
        if should_migrate:
            logger.info("Running data migrations...")
            run_data_migrations(app)
            
        if should_cleanup or should_migrate:
            create_maintenance_flag()
        
        # Step 4: Print database status
        print_database_info(app)
        
        logger.info("Database initialization completed successfully")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise

if __name__ == "__main__":
    main()