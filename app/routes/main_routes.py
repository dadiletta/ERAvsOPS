# app/routes/main_routes.py
from flask import Blueprint, render_template, current_app, jsonify, request
import json
import os
import logging
from datetime import datetime, timedelta
# Import the MLBDataFetcher service
from app.services.mlb_data import MLBDataFetcher
# Import database and models
from app import db
from app.models.mlb_snapshot import MLBSnapshot

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('main_routes')

# Create blueprint
main_bp = Blueprint('main', __name__)

# Global variable to track update status
update_status = {
    "in_progress": False,
    "last_updated": None,
    "teams_updated": 0,
    "total_teams": 30,  # Set a default value for total teams
    "error": None,
    "snapshot_count": 0
}

def get_latest_data(must_exist=False):
    """Get the latest team data from the database"""
    logger.info("Retrieving latest data from database")
    
    try:
        # Get snapshot count
        count = MLBSnapshot.query.count()
        update_status["snapshot_count"] = count
        
        # Get the most recent snapshot
        snapshot = MLBSnapshot.get_latest()
        
        if snapshot:
            # Check if data is fresh
            cache_age = datetime.utcnow() - snapshot.timestamp
            is_fresh = cache_age.total_seconds() < current_app.config['CACHE_TIMEOUT']
            
            logger.info(f"Latest snapshot found from {snapshot.timestamp}. Fresh: {is_fresh}, Age: {cache_age.total_seconds()} seconds")
            return snapshot.teams, True, is_fresh, snapshot.timestamp.strftime("%Y-%m-%d %H:%M:%S")
    
    except Exception as e:
        error_msg = f"Error reading from database: {str(e)}"
        logger.error(error_msg)
        current_app.logger.error(error_msg)
    
    if must_exist:
        # Return fallback data if no snapshot exists but one is required
        logger.warning("No snapshot found in database, returning fallback data")
        return get_fallback_data(), False, False, None
    
    return None, False, False, None

def save_snapshot(data):
    """Save data as a new snapshot in the database"""
    try:
        # Create new snapshot
        snapshot = MLBSnapshot.create_snapshot(data)
        db.session.add(snapshot)
        db.session.commit()
        
        # Update count
        update_status["snapshot_count"] = MLBSnapshot.query.count()
        
        logger.info(f"Successfully saved snapshot with {len(data)} teams to database")
        current_app.logger.info(f"Successfully saved snapshot with {len(data)} teams to database")
        
        # Clean up old snapshots beyond the history limit
        history_limit = current_app.config.get('HISTORY_LIMIT', 30)
        old_snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).offset(history_limit).all()
        
        if old_snapshots:
            for old in old_snapshots:
                db.session.delete(old)
            db.session.commit()
            logger.info(f"Cleaned up {len(old_snapshots)} old snapshots beyond limit of {history_limit}")
        
        return True
    except Exception as e:
        error_msg = f"Error saving to database: {str(e)}"
        logger.error(error_msg)
        current_app.logger.error(error_msg)
        return False

def fix_logo_paths(teams):
    """Fix logo paths to match the expected filenames"""
    for team in teams:
        # Get team name in lowercase
        team_name = team["name"].lower()
        
        # Handle special cases
        if team_name == "red sox":
            team_name = "redsox"
        elif team_name == "white sox":
            team_name = "whitesox"
        elif team_name == "blue jays":
            team_name = "bluejays"
        
        # More specific handling for common name issues
        if team["name"] == "Sox" and "Boston" in team.get("full_name", ""):
            team_name = "redsox"
        elif team["name"] == "Sox" and "Chicago" in team.get("full_name", ""):
            team_name = "whitesox"
        elif team["name"] == "Jays":
            team_name = "bluejays"
        
        # Update logo path with leading slash
        team["logo"] = f"/static/logos/{team_name}.png"
    
    return teams

def get_fallback_data():
    """Return hardcoded fallback data"""
    logger.warning("Using hardcoded fallback data")
    current_app.logger.warning("Using hardcoded fallback data")
    
    # Return at least a few teams from the hardcoded data
    return [
        {"id": 121, "name": "Mets", "full_name": "New York Mets", "abbreviation": "NYM", "era": 2.00, "ops": 0.700, "logo": "/static/logos/mets.png"},
        {"id": 137, "name": "Giants", "full_name": "San Francisco Giants", "abbreviation": "SF", "era": 2.55, "ops": 0.650, "logo": "/static/logos/giants.png"},
        {"id": 113, "name": "Reds", "full_name": "Cincinnati Reds", "abbreviation": "CIN", "era": 2.90, "ops": 0.610, "logo": "/static/logos/reds.png"},
        {"id": 119, "name": "Dodgers", "full_name": "Los Angeles Dodgers", "abbreviation": "LAD", "era": 3.10, "ops": 0.740, "logo": "/static/logos/dodgers.png"},
        {"id": 147, "name": "Yankees", "full_name": "New York Yankees", "abbreviation": "NYY", "era": 4.60, "ops": 0.850, "logo": "/static/logos/yankees.png"},
        {"id": 134, "name": "Pirates", "full_name": "Pittsburgh Pirates", "abbreviation": "PIT", "era": 4.90, "ops": 0.600, "logo": "/static/logos/pirates.png"}
    ]

def update_mlb_data(step=1, total_steps=30):
    """Update MLB data one team at a time to allow for progress tracking"""
    global update_status
    
    logger.info(f"Update request received: step={step}, total_steps={total_steps}")
    
    # Initialize MLBDataFetcher if needed
    fetcher = MLBDataFetcher()
    
    # Get latest data to work with
    data, exists, _, _ = get_latest_data(True)
    
    # If update is not yet in progress, initialize the status
    if not update_status["in_progress"]:
        update_status = {
            "in_progress": True,
            "last_updated": None,
            "teams_updated": 0,
            "total_teams": total_steps,
            "error": None,
            "snapshot_count": MLBSnapshot.query.count()
        }
        logger.info(f"Update status initialized: {update_status}")
    
    # Check API availability
    if not fetcher.api_available:
        logger.error("MLB Stats API not available, cannot update")
        update_status["error"] = "MLB Stats API not available"
        update_status["in_progress"] = False
        return update_status
    
    # Ensure we have MLB teams loaded
    mlb_teams = fetcher.get_mlb_teams()
    if not mlb_teams:
        logger.error("No MLB teams found, cannot update")
        update_status["error"] = "No MLB teams found"
        update_status["in_progress"] = False
        return update_status
        
    # Update total_teams if we have actual count
    update_status["total_teams"] = len(mlb_teams)
    
    # Get the current index to process
    current_index = update_status["teams_updated"]
    
    # Make sure we don't go beyond the total
    if current_index >= len(mlb_teams):
        # We're done, mark update as complete
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        update_status["in_progress"] = False
        update_status["last_updated"] = timestamp
        
        # Save a final snapshot when complete
        save_snapshot(data)
        
        logger.info(f"Update complete. Updated {update_status['teams_updated']} teams.")
        return update_status
    
    # OPTIMIZATION: Process multiple teams at once up to the configured batch size
    # We'll cap it at 4 teams per batch maximum to avoid rate limits
    batch_size = min(4, step)
    end_index = min(current_index + batch_size, len(mlb_teams))
    current_batch = mlb_teams[current_index:end_index]
    
    logger.info(f"Processing batch of {len(current_batch)} teams starting at index {current_index}")
    
    try:
        # Get all teams in this batch
        team_stats = []
        for i, team in enumerate(current_batch):
            # Apply rate limiting between requests
            if i > 0:
                import time
                delay = current_app.config.get('API_RATE_LIMIT', 1.0) # Use config value or default to 1 second
                logger.info(f"Applying rate limit delay of {delay} seconds")
                time.sleep(delay)
            
            # Get team stats
            team_data = fetcher._fetch_team_stats(team, fetcher.current_year)
            if team_data:
                team_stats.append(team_data)
                logger.info(f"Successfully fetched stats for {team['name']}")
            else:
                logger.warning(f"Failed to fetch stats for {team['name']}")
        
        logger.info(f"Batch processing complete. Retrieved stats for {len(team_stats)} teams")
        
        if team_stats:
            # Integrate new data with existing data
            if data:
                # Find and update team by ID
                for new_team in team_stats:
                    team_id = new_team.get("id")
                    found = False
                    
                    # Look for existing team to update
                    for i, existing_team in enumerate(data):
                        if existing_team.get("id") == team_id:
                            data[i] = new_team
                            found = True
                            break
                    
                    # If team not found, add it
                    if not found:
                        data.append(new_team)
            else:
                # No existing data, just use what we got
                data = team_stats
            
            # Save an intermediate snapshot if halfway done or every 10 teams
            if current_index == len(mlb_teams) // 2 or current_index % 10 == 0:
                save_snapshot(data)
            
            # Update progress
            update_status["teams_updated"] += len(team_stats)
            logger.info(f"Updated team count: {update_status['teams_updated']}/{update_status['total_teams']}")
        else:
            logger.warning(f"No team data returned for batch starting at index {current_index}, skipping")
            # Skip this batch and move to the next
            update_status["teams_updated"] += len(current_batch)
            logger.info(f"Skipped to index {update_status['teams_updated']}")
        
        # Check if we're done
        if update_status["teams_updated"] >= update_status["total_teams"]:
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            update_status["in_progress"] = False
            update_status["last_updated"] = timestamp
            
            # Save final snapshot
            save_snapshot(data)
            
            logger.info(f"Update complete. Updated {update_status['teams_updated']} teams.")
    
    except Exception as e:
        error_msg = f"Error updating teams starting at index {current_index}: {str(e)}"
        logger.error(error_msg)
        current_app.logger.error(error_msg)
        
        import traceback
        trace = traceback.format_exc()
        logger.error(trace)
        current_app.logger.error(trace)
        
        # Skip this batch and continue with the next one
        update_status["teams_updated"] += len(current_batch)
        logger.info(f"Skipped to index {update_status['teams_updated']} after error")
    
    return update_status

@main_bp.route('/')
def index():
    """Main route to display the chart"""
    # Always use latest data from database
    teams, exists, is_fresh, last_updated = get_latest_data(must_exist=True)
    teams = fix_logo_paths(teams)
    
    logger.info(f"Rendering index with {len(teams)} teams, fresh: {is_fresh}")
    
    # Get snapshot count
    snapshot_count = MLBSnapshot.query.count()
    
    # Pass status to template
    status = {
        "from_cache": exists,
        "is_fresh": is_fresh,
        "update_in_progress": update_status["in_progress"],
        "last_updated": last_updated or update_status.get("last_updated"),
        "teams_updated": update_status["teams_updated"],
        "total_teams": update_status["total_teams"],
        "snapshot_count": snapshot_count
    }
    
    return render_template('index.html', teams=teams, status=status)

@main_bp.route('/api/update-status')
def get_update_status():
    """API endpoint to check update status"""
    global update_status
    
    # Get current data status
    _, exists, is_fresh, last_updated = get_latest_data()
    
    # Get snapshot count
    snapshot_count = MLBSnapshot.query.count()
    
    # Add data info to status
    status = update_status.copy()
    status["cache_exists"] = exists
    status["cache_fresh"] = is_fresh
    status["snapshot_count"] = snapshot_count
    
    if not status["last_updated"] and last_updated:
        status["last_updated"] = last_updated
    
    logger.info(f"Status check: {status}")
    return jsonify(status)

@main_bp.route('/api/start-update', methods=['POST'])
def start_update():
    """API endpoint to start the update process"""
    global update_status
    
    logger.info("Received request to start update")
    
    # Get requested batch size (default 1, maximum 4)
    batch_size = min(4, request.json.get('batch_size', 1) if request.is_json else 1)
    logger.info(f"Starting update with batch size: {batch_size}")
    
    # Reset update status (even if in progress)
    update_status["in_progress"] = False
    update_status["teams_updated"] = 0
    update_status["error"] = None
    
    # Start the update process (will set in_progress = True internally)
    status = update_mlb_data(step=batch_size)
    
    logger.info(f"Update started. Current status: {status}")
    return jsonify(status)

@main_bp.route('/api/continue-update', methods=['POST'])
def continue_update():
    """API endpoint to continue the update process"""
    # Get requested batch size (default 1, maximum 4)
    batch_size = min(4, request.json.get('batch_size', 1) if request.is_json else 1)
    
    logger.info(f"Continuing update with batch size: {batch_size}")
    
    # Continue update
    status = update_mlb_data(step=batch_size)
    
    logger.info(f"Update continued. Current status: {status}")
    return jsonify(status)

@main_bp.route('/api/team-data')
def team_data():
    """API endpoint to get the latest team data"""
    teams, _, _, _ = get_latest_data(must_exist=True)
    teams = fix_logo_paths(teams)
    
    logger.info(f"Team data requested. Returning {len(teams)} teams")
    return jsonify(teams)

@main_bp.route('/api/team-history/<int:team_id>')
def team_history(team_id):
    """API endpoint to get historical data for a specific team"""
    # Get requested days parameter (default 30)
    days = request.args.get('days', default=30, type=int)
    
    # Get team history from database
    history = MLBSnapshot.get_team_history(team_id, limit=days)
    
    logger.info(f"Team history requested for team {team_id}. Returning {len(history)} data points")
    return jsonify(history)

@main_bp.route('/api/snapshots')
def list_snapshots():
    """API endpoint to list available snapshots"""
    try:
        snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).all()
        result = [{"id": s.id, "timestamp": s.timestamp.isoformat(), "teams_count": len(s.teams)} for s in snapshots]
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error listing snapshots: {str(e)}")
        return jsonify({"error": str(e)}), 500

@main_bp.route('/api/snapshot/<snapshot_id>')
def get_snapshot(snapshot_id):
    """API endpoint to get data from a specific snapshot"""
    try:
        if snapshot_id == 'latest':
            snapshot = MLBSnapshot.get_latest()
        else:
            snapshot = MLBSnapshot.query.get(int(snapshot_id))
        
        if not snapshot:
            return jsonify({"error": "Snapshot not found"}), 404
        
        teams = snapshot.teams
        teams = fix_logo_paths(teams)
        
        logger.info(f"Snapshot {snapshot_id} requested. Returning {len(teams)} teams")
        return jsonify(teams)
    except Exception as e:
        logger.error(f"Error getting snapshot {snapshot_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500