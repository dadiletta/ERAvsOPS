# app/routes/helper_functions.py

import json
import os
import logging
from datetime import datetime, timezone, timedelta
from flask import current_app
from app import db, validate_mlb_data
from app.models.mlb_snapshot import MLBSnapshot
from app.services.mlb_data import MLBDataFetcher

# Set up logging
logger = logging.getLogger(__name__)

# Global update status
update_status = {
    "in_progress": False,
    "teams_updated": 0,
    "total_teams": 0,
    "last_updated": None,
    "snapshot_count": 0,
    "error": None,
    "collected_data": [],  # New: Store collected team data during batch updates
}

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
            # Use timezone-aware comparison
            now = datetime.now(timezone.utc)
            timestamp = snapshot.timestamp_aware  # Use the property
            
            cache_age = now - timestamp
            is_fresh = cache_age.total_seconds() < current_app.config['CACHE_TIMEOUT']
            
            # Get teams and validate
            teams = snapshot.teams
            
            # Validate teams on retrieval
            teams = validate_mlb_data(teams)
            
            logger.info(f"Latest snapshot found from {timestamp}. Fresh: {is_fresh}, Age: {cache_age.total_seconds()} seconds, Valid teams: {len(teams)}")
            return teams, True, is_fresh, timestamp.strftime("%Y-%m-%d %H:%M:%S")
    
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

def cleanup_old_snapshots(limit):
    """Remove old snapshots exceeding the limit"""
    try:
        # Get total count of snapshots
        count = MLBSnapshot.query.count()
        
        # If we're over the limit, delete the oldest ones
        if count > limit:
            # Calculate how many to delete
            to_delete = count - limit
            
            # Get the oldest snapshots
            oldest_snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.asc()).limit(to_delete).all()
            
            # Delete them
            for snapshot in oldest_snapshots:
                db.session.delete(snapshot)
            
            db.session.commit()
            logger.info(f"Cleaned up {len(oldest_snapshots)} old snapshots, keeping most recent {limit}")
    except Exception as e:
        error_msg = f"Error cleaning up old snapshots: {str(e)}"
        logger.error(error_msg)

def update_mlb_data(step=1, total_steps=30):
    """Update MLB data one team at a time to allow for progress tracking"""
    global update_status
    
    # Create MLB data fetcher instance
    fetcher = MLBDataFetcher()
    
    # Check if MLB Stats API is available
    if not fetcher.api_available:
        error_msg = "MLB Stats API is not available. Cannot update data."
        logger.error(error_msg)
        update_status["error"] = error_msg
        update_status["in_progress"] = False
        return False
    
    # Get total team count if not already set
    if update_status["total_teams"] == 0:
        update_status["total_teams"] = len(fetcher.get_mlb_teams())
    
    # Calculate start index
    start_index = update_status["teams_updated"]
    
    # Skip if already completed
    if start_index >= update_status["total_teams"]:
        logger.info("Update already completed")
        update_status["in_progress"] = False
        return True
    
    logger.info(f"Processing teams starting at index {start_index} with step size {step}")
    
    try:
        # Get a batch of team stats
        batch = fetcher.get_team_stats_batch(start_index, step)
        
        # Log the batch results
        logger.info(f"Received batch of {len(batch)} teams")
        
        # Update progress
        update_status["teams_updated"] += len(batch)
        
        # If made progress, collect the data
        if len(batch) > 0:
            # Add batch to collected data
            update_status["collected_data"].extend(batch)
            logger.info(f"Added {len(batch)} teams to collected data, total now: {len(update_status['collected_data'])}")
        else:
            logger.warning(f"No teams were processed in this batch (start_index={start_index}, step={step})")
            update_status["error"] = "No teams processed in batch"
        
        # If all teams updated, create a single snapshot with all collected data
        if update_status["teams_updated"] >= update_status["total_teams"]:
            try:
                # Get existing data
                existing_data, _, _, _ = get_latest_data()
                
                # Update existing data with new team data
                updated = False
                for new_team in update_status["collected_data"]:
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
                    
                    # Save to database as a new snapshot (once per update)
                    snapshot = MLBSnapshot(
                        timestamp=datetime.now(timezone.utc),
                        data=json.dumps(validated_data)
                    )
                    db.session.add(snapshot)
                    db.session.commit()
                    
                    logger.info(f"Created a new snapshot with {len(validated_data)} teams")
                    
                    # Check if we need to clean up old snapshots
                    history_limit = current_app.config.get('HISTORY_LIMIT', 30)
                    if history_limit > 0:
                        cleanup_old_snapshots(history_limit)
                
                # Reset collected data for next update
                update_status["collected_data"] = []
                
                # Update status
                timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                update_status["in_progress"] = False
                update_status["last_updated"] = timestamp
                logger.info(f"Update completed at {timestamp}")
                
                # Reset for next update
                update_status["teams_updated"] = 0
                update_status["total_teams"] = 0
                
            except Exception as e:
                error_msg = f"Error creating snapshot: {str(e)}"
                logger.error(error_msg)
                import traceback
                logger.error(traceback.format_exc())
                update_status["error"] = error_msg
        
        return True
        
    except Exception as e:
        error_msg = f"Error in update process: {str(e)}"
        logger.error(error_msg)
        import traceback
        logger.error(traceback.format_exc())
        update_status["error"] = error_msg
        return False