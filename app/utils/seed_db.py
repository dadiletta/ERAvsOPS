#!/usr/bin/env python3
"""
Database seed initialization script for MLB ERA vs OPS Visualization.
Seeds the database with historical snapshot data if it's empty.
"""
import os
import json
import logging
from datetime import datetime, timezone
from app import db, validate_mlb_data

# Import the seed data (will be created by export_snapshots.py)
try:
    from db_seed_data import SEED_SNAPSHOTS
    SEED_DATA_AVAILABLE = True
except ImportError:
    SEED_DATA_AVAILABLE = False

# Set up logging
logger = logging.getLogger('seed_db')

def seed_database(app):
    """
    Seed the database with historical snapshots if it's empty.
    
    Args:
        app: Flask application with context
    
    Returns:
        int: Number of snapshots added
    """
    from app.models.mlb_snapshot import MLBSnapshot
    
    # Check if database is already populated
    count = MLBSnapshot.query.count()
    if count > 0:
        logger.info(f"Database already has {count} snapshots, skipping seed")
        return 0
    
    # If seed data is available, use it
    if SEED_DATA_AVAILABLE:
        logger.info(f"Found {len(SEED_SNAPSHOTS)} seed snapshots to import")
        
        snapshots_added = 0
        
        for seed_data in SEED_SNAPSHOTS:
            try:
                # Parse the snapshot data
                timestamp = seed_data['timestamp']
                teams_data = json.loads(seed_data['data'])
                
                # Validate team data
                validated_data = validate_mlb_data(teams_data)
                
                # Create and add the snapshot
                snapshot = MLBSnapshot(
                    timestamp=timestamp,
                    data=json.dumps(validated_data)
                )
                db.session.add(snapshot)
                snapshots_added += 1
                
                # Commit in batches to avoid memory issues
                if snapshots_added % 5 == 0:
                    db.session.commit()
                    logger.info(f"Added {snapshots_added} snapshots so far...")
            
            except Exception as e:
                logger.error(f"Error importing seed snapshot: {str(e)}")
        
        # Final commit for any remaining snapshots
        db.session.commit()
        logger.info(f"Successfully seeded database with {snapshots_added} snapshots")
        return snapshots_added
    
    # If no seed data found, fall back to data_cache.json
    else:
        logger.info("No seed data found, falling back to data_cache.json")
        
        try:
            # Load data from data_cache.json
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
                logger.info(f"Initialized database with {len(initial_data)} validated teams")
                return 1
            else:
                logger.warning("No valid data found in data_cache.json")
                return 0
                
        except Exception as e:
            logger.error(f"Error initializing database with data_cache.json: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return 0

if __name__ == "__main__":
    # Run standalone for testing
    from app import create_app
    app = create_app()
    
    with app.app_context():
        seed_database(app)