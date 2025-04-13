# app/routes/main_routes.py - Update these sections

from flask import Blueprint, render_template, current_app, jsonify, request
import json
import os
import logging
from datetime import datetime, timezone, timedelta
# Import the MLBDataFetcher service
from app.services.mlb_data import MLBDataFetcher
# Import database and models
from app import db, validate_mlb_data
from app.models.mlb_snapshot import MLBSnapshot

# Set up logging
logger = logging.getLogger(__name__)

# Create blueprint
main_bp = Blueprint('main', __name__)

# Global update status
update_status = {
    "in_progress": False,
    "teams_updated": 0,
    "total_teams": 0,
    "last_updated": None,
    "snapshot_count": 0
}

# Helper function to get latest data
def get_latest_data(must_exist=False):
    """Get the latest team data from the database with validation"""
    logger.info("Retrieving latest data from database")
    
    try:
        # Get snapshot count
        count = MLBSnapshot.query.count()
        update_status["snapshot_count"] = count
        
        # Get the most recent snapshot
        snapshot = MLBSnapshot.get_latest()
        
        if snapshot:
            # Check if data is fresh
            cache_age = datetime.now(timezone.utc) - snapshot.timestamp
            is_fresh = cache_age.total_seconds() < current_app.config['CACHE_TIMEOUT']
            
            # Get teams and validate
            teams = snapshot.teams
            
            # Validate teams on retrieval
            teams = validate_mlb_data(teams)
            
            logger.info(f"Latest snapshot found from {snapshot.timestamp}. Fresh: {is_fresh}, Age: {cache_age.total_seconds()} seconds, Valid teams: {len(teams)}")
            return teams, True, is_fresh, snapshot.timestamp.strftime("%Y-%m-%d %H:%M:%S")
    
    except Exception as e:
        error_msg = f"Error reading from database: {str(e)}"
        logger.error(error_msg)
        current_app.logger.error(error_msg)
    
    # If no valid data found in database, try to use cache file
    logger.info("No valid data found in database, checking cache file")
    cache_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data_cache.json')
    
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r') as f:
                teams = json.load(f)
                
            # Validate teams from cache
            teams = validate_mlb_data(teams)
            
            if teams:
                logger.info(f"Loaded {len(teams)} teams from cache file")
                return teams, False, False, "Cache file (date unknown)"
        except Exception as e:
            error_msg = f"Error reading cache file: {str(e)}"
            logger.error(error_msg)
    
    # If must_exist is True and we couldn't find data, raise an exception
    if must_exist:
        raise Exception("No MLB data found in database or cache file")
        
    # Otherwise, return an empty list with appropriate flags
    return [], False, False, "No data available"

# Update function to use datetime.now(timezone.utc)
def update_mlb_data(step=1, total_steps=30):
    """Update MLB data one team at a time to allow for progress tracking"""
    global update_status
    
    # Skip if already updating
    if update_status["in_progress"]:
        logger.info("Update already in progress, skipping")
        return False
    
    # Create MLB data fetcher instance
    fetcher = MLBDataFetcher()
    
    # Get total team count if not already set
    if update_status["total_teams"] == 0:
        update_status["total_teams"] = len(fetcher.get_mlb_teams())
    
    # Mark as in progress
    update_status["in_progress"] = True
    
    # Calculate start index
    start_index = update_status["teams_updated"]
    
    # Skip if already completed
    if start_index >= update_status["total_teams"]:
        logger.info("Update already completed")
        update_status["in_progress"] = False
        return True
    
    # Get a batch of team stats
    batch = fetcher.get_team_stats_batch(start_index, step)
    
    # Update progress
    update_status["teams_updated"] += len(batch)
    
    # If made progress, store in database
    if len(batch) > 0:
        try:
            # Get existing data
            existing_data, _, _, _ = get_latest_data()
            
            # Update existing data with new team data
            updated = False
            for new_team in batch:
                # Find matching team in existing data
                for i, existing_team in enumerate(existing_data):
                    if existing_team.get('id') == new_team.get('id'):
                        # Update team
                        existing_data[i] = new_team
                        updated = True
                        break
                else:
                    # Team not found, add it
                    existing_data.append(new_team)
                    updated = True
            
            # If updates were made, validate and save to database
            if updated:
                # Validate again
                validated_data = validate_mlb_data(existing_data)
                
                # Save to database as a new snapshot
                snapshot = MLBSnapshot(
                    timestamp=datetime.now(timezone.utc),
                    data=json.dumps(validated_data)
                )
                db.session.add(snapshot)
                db.session.commit()
                
                logger.info(f"Updated database with {len(validated_data)} teams")
                
                # Check if we need to clean up old snapshots
                history_limit = current_app.config.get('HISTORY_LIMIT', 30)
                if history_limit > 0:
                    cleanup_old_snapshots(history_limit)
        
        except Exception as e:
            error_msg = f"Error updating database: {str(e)}"
            logger.error(error_msg)
            import traceback
            logger.error(traceback.format_exc())
    
    # If all teams updated, mark as complete
    if update_status["teams_updated"] >= update_status["total_teams"] and not update_status.get("completed", False):
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        update_status["in_progress"] = False
        update_status["completed"] = True
        update_status["last_updated"] = timestamp
        
        logger.info(f"Update completed at {timestamp}")
        
        # Reset for next update
        update_status["teams_updated"] = 0
        update_status["total_teams"] = 0
        update_status["completed"] = False
    
    return True