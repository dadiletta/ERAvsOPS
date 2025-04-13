# app/routes/main_routes.py

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
            # Use timezone-aware comparison
            now = datetime.now(timezone.utc)
            timestamp = snapshot.timestamp_aware  # Use the new property
            
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

@main_bp.route('/')
def index():
    """Render the homepage with MLB team data visualization."""
    # Get latest team data
    teams, db_exists, is_fresh, last_updated = get_latest_data()
    
    # Prepare status info for the template
    status = {
        "is_fresh": is_fresh,
        "last_updated": last_updated,
        "update_in_progress": update_status["in_progress"],
        "teams_updated": update_status["teams_updated"],
        "total_teams": update_status["total_teams"],
        "snapshot_count": update_status["snapshot_count"]
    }
    
    # Render the template with team data and status
    return render_template('index.html', teams=teams, status=status)

@main_bp.route('/api/team-data')
def get_team_data():
    """API endpoint to get the latest team data."""
    teams, _, _, _ = get_latest_data(must_exist=True)
    return jsonify(teams)

@main_bp.route('/api/update-status')
def get_update_status():
    """API endpoint to get the status of the data update."""
    # Get latest data
    _, db_exists, is_fresh, last_updated = get_latest_data()
    
    # Prepare status response
    status = {
        "in_progress": update_status["in_progress"],
        "teams_updated": update_status["teams_updated"],
        "total_teams": update_status["total_teams"],
        "cache_fresh": is_fresh,
        "last_updated": last_updated,
        "snapshot_count": update_status["snapshot_count"]
    }
    
    return jsonify(status)

@main_bp.route('/api/start-update', methods=['POST'])
def start_update():
    """API endpoint to start updating MLB data."""
    # Only start if not already updating
    if not update_status["in_progress"]:
        # Reset update status
        update_status["in_progress"] = True
        update_status["teams_updated"] = 0
        update_status["total_teams"] = 0
        
        # Get batch size from request
        data = request.get_json() or {}
        batch_size = data.get('batch_size', 1)
        
        # Start update
        update_mlb_data(step=batch_size)
    
    # Return current status
    return get_update_status()

@main_bp.route('/api/continue-update', methods=['POST'])
def continue_update():
    """API endpoint to continue updating MLB data."""
    # Only continue if already updating
    if update_status["in_progress"]:
        # Get batch size from request
        data = request.get_json() or {}
        batch_size = data.get('batch_size', 1)
        
        # Continue update
        update_mlb_data(step=batch_size)
    
    # Return current status
    return get_update_status()

@main_bp.route('/api/snapshots')
def get_snapshots():
    """API endpoint to get available snapshots."""
    snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).all()
    
    # Convert to JSON-serializable format
    snapshot_list = [{
        "id": s.id,
        "timestamp": s.timestamp.isoformat()
    } for s in snapshots]
    
    return jsonify(snapshot_list)

@main_bp.route('/api/snapshot/<snapshot_id>')
def get_snapshot(snapshot_id):
    """API endpoint to get data from a specific snapshot."""
    if snapshot_id == 'latest':
        # Get latest snapshot
        snapshot = MLBSnapshot.get_latest()
    else:
        # Get specific snapshot by ID
        snapshot = MLBSnapshot.query.get_or_404(int(snapshot_id))
    
    # Return validated team data
    if snapshot:
        teams = validate_mlb_data(snapshot.teams)
        # Add timestamp to each team
        for team in teams:
            team['snapshot_time'] = snapshot.timestamp.isoformat()
        return jsonify(teams)
    
    return jsonify([])

@main_bp.route('/api/team-history/<team_id>')
def get_team_history(team_id):
    """API endpoint to get historical data for a specific team."""
    days = request.args.get('days', 30, type=int)
    history = MLBSnapshot.get_team_history(team_id, limit=days)
    return jsonify(history)

# Reset the update status to fix the stuck update process
@main_bp.route('/api/reset-update', methods=['POST'])
def reset_update():
    """API endpoint to reset a stuck update process."""
    global update_status
    
    # Reset update status
    update_status = {
        "in_progress": False,
        "teams_updated": 0,
        "total_teams": 0,
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "snapshot_count": MLBSnapshot.query.count()
    }
    
    logger.info("Update status has been manually reset")
    
    return jsonify({
        "status": "success",
        "message": "Update status has been reset",
        "current_status": update_status
    })

# Modified start_update function to reset status first
@main_bp.route('/api/start-update', methods=['POST'])
def start_update():
    """API endpoint to start updating MLB data."""
    global update_status
    
    # Reset status first to avoid stuck updates
    update_status["in_progress"] = False
    update_status["teams_updated"] = 0
    update_status["total_teams"] = 0
    
    # Only start if not already updating
    if not update_status["in_progress"]:
        # Mark as in progress
        update_status["in_progress"] = True
        
        # Get batch size from request
        data = request.get_json() or {}
        batch_size = data.get('batch_size', 1)
        
        # Start update
        try:
            update_mlb_data(step=batch_size)
        except Exception as e:
            logger.error(f"Error starting update: {str(e)}")
            # Reset status on error
            update_status["in_progress"] = False
            
            return jsonify({
                "error": f"Failed to start update: {str(e)}",
                "in_progress": False
            })
    
    # Return current status
    return get_update_status()