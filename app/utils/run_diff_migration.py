# app/utils/run_diff_migration.py

import logging
import json
from flask import current_app
from app import db, validate_mlb_data
from app.models.mlb_snapshot import MLBSnapshot

logger = logging.getLogger(__name__)

def migrate_run_differential():
    """
    Add run differential data to all existing snapshots.
    
    This is a one-time migration to update historical data.
    """
    logger.info("Starting run differential migration")
    
    try:
        # Get all existing snapshots
        snapshots = MLBSnapshot.query.all()
        logger.info(f"Found {len(snapshots)} snapshots to migrate")
        
        updated_count = 0
        
        for snapshot in snapshots:
            # Parse the JSON data
            teams = json.loads(snapshot.data)
            
            # Check if any team is missing run differential
            needs_update = any('run_differential' not in team for team in teams)
            
            if needs_update:
                # Validate and update the data
                updated_teams = validate_mlb_data(teams)
                
                # Save the updated data
                snapshot.data = json.dumps(updated_teams)
                updated_count += 1
        
        # Commit all changes to database
        if updated_count > 0:
            db.session.commit()
            logger.info(f"Successfully migrated {updated_count} snapshots with run differential data")
        else:
            logger.info("No snapshots needed migration")
        
        return updated_count
    
    except Exception as e:
        logger.error(f"Error during run differential migration: {str(e)}")
        db.session.rollback()
        return 0