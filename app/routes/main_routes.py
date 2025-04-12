# app/routes/main_routes.py
from flask import Blueprint, render_template, current_app, jsonify, request
import json
import os
import logging
from datetime import datetime
# Import the MLBDataFetcher service
from app.services.mlb_data import MLBDataFetcher

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
    "error": None
}

def get_cached_data(must_exist=False):
    """Get team data from cache if it exists"""
    cache_file = current_app.config['CACHE_FILE']
    logger.info(f"Checking cache file: {cache_file}")
    
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r') as f:
                data = json.load(f)
                # Check if cache is fresh
                file_mod_time = datetime.fromtimestamp(os.path.getmtime(cache_file))
                cache_age = datetime.now() - file_mod_time
                is_fresh = cache_age.total_seconds() < current_app.config['CACHE_TIMEOUT']
                
                logger.info(f"Cache exists with {len(data)} teams. Fresh: {is_fresh}, Age: {cache_age.total_seconds()} seconds")
                return data, True, is_fresh, file_mod_time.strftime("%Y-%m-%d %H:%M:%S")
        except Exception as e:
            error_msg = f"Error reading cache: {str(e)}"
            logger.error(error_msg)
            current_app.logger.error(error_msg)
            
            if must_exist:
                # Return fallback data if cache must exist but can't be read
                logger.warning("Returning fallback data due to cache read error")
                return get_fallback_data(), False, False, None
    else:
        logger.info("Cache file does not exist")
    
    if must_exist:
        logger.info("Returning fallback data because cache must exist but doesn't")
        return get_fallback_data(), False, False, None
    
    return None, False, False, None

def save_to_cache(data):
    """Save data to cache file"""
    cache_file = current_app.config['CACHE_FILE']
    try:
        with open(cache_file, 'w') as f:
            json.dump(data, f)
        logger.info(f"Successfully saved {len(data)} teams to cache")
        current_app.logger.info(f"Successfully saved {len(data)} teams to cache")
        return True
    except Exception as e:
        error_msg = f"Error saving to cache: {str(e)}"
        logger.error(error_msg)
        current_app.logger.error(error_msg)
        return False

def fix_logo_paths(teams):
    """Fix logo paths to match the expected filenames"""
    for team in teams:
        # Get team name in lowercase
        team_name = team["name"].lower()
        
        # Handle special cases
        if team_name == "sox" and "white" in team.get("full_name", "").lower():
            team_name = "whitesox"
        elif team_name == "sox" and "red" in team.get("full_name", "").lower():
            team_name = "redsox"
        elif team_name == "jays":
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
    ], False, False, None

def update_mlb_data(step=1, total_steps=30):
    """Update MLB data one team at a time to allow for progress tracking"""
    global update_status
    
    logger.info(f"Update request received: step={step}, total_steps={total_steps}")
    
    # If update is already in progress, just return current status
    if update_status["in_progress"]:
        logger.info("Update already in progress, returning current status")
        return update_status
    
    try:
        # Get fetcher
        logger.info("Initializing MLBDataFetcher")
        fetcher = MLBDataFetcher()
        
        # Get cached data to work with
        data, exists, _, _ = get_cached_data(True)
        
        # Set initial update status
        update_status = {
            "in_progress": True,
            "last_updated": None,
            "teams_updated": 0,
            "total_teams": total_steps,
            "error": None
        }
        
        logger.info(f"Update status initialized: {update_status}")
        current_app.logger.info(f"Update status initialized: {update_status}")
        
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
        
        # Update one team at a time (limited by step parameter)
        logger.info(f"Requesting batch of {step} teams starting at index {update_status['teams_updated']}")
        
        updated_data = fetcher.get_team_stats_batch(
            start_index=update_status["teams_updated"],
            batch_size=step
        )
        
        logger.info(f"Received {len(updated_data)} teams from batch update")
        
        if updated_data:
            # Integrate new data with existing data
            if data:
                # Find and update teams by ID
                for new_team in updated_data:
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
                data = updated_data
            
            # Save to cache after each batch
            logger.info(f"Saving {len(data)} teams to cache")
            save_to_cache(data)
            
            # Update progress
            update_status["teams_updated"] += len(updated_data)
            
            # Check if we're done
            if update_status["teams_updated"] >= update_status["total_teams"]:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                update_status["in_progress"] = False
                update_status["last_updated"] = timestamp
                logger.info(f"Update complete. Updated {update_status['teams_updated']} teams.")
        else:
            logger.warning("No team data returned from batch update")
            
            # If no data returned but no error occurred, try to continue with next batch
            if update_status["teams_updated"] < update_status["total_teams"]:
                update_status["teams_updated"] += step  # Skip this batch
                logger.info(f"Skipping current batch, moving to index {update_status['teams_updated']}")
            else:
                # If we've processed all teams, mark as complete
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                update_status["in_progress"] = False
                update_status["last_updated"] = timestamp
                logger.info("Update marked as complete (no more teams to process)")
        
        return update_status
        
    except Exception as e:
        error_msg = f"Error in update: {str(e)}"
        logger.error(error_msg)
        current_app.logger.error(error_msg)
        
        import traceback
        trace = traceback.format_exc()
        logger.error(trace)
        current_app.logger.error(trace)
        
        # Update error status
        update_status["error"] = str(e)
        update_status["in_progress"] = False
        
        return update_status

@main_bp.route('/')
def index():
    """Main route to display the chart"""
    # Always use cached data first if it exists
    teams, exists, is_fresh, last_updated = get_cached_data(must_exist=True)
    teams = fix_logo_paths(teams)
    
    logger.info(f"Rendering index with {len(teams)} teams, fresh: {is_fresh}")
    
    # Pass status to template
    status = {
        "from_cache": exists,
        "is_fresh": is_fresh,
        "update_in_progress": update_status["in_progress"],
        "last_updated": last_updated or update_status.get("last_updated"),
        "teams_updated": update_status["teams_updated"],
        "total_teams": update_status["total_teams"]
    }
    
    return render_template('index.html', teams=teams, status=status)

@main_bp.route('/api/update-status')
def get_update_status():
    """API endpoint to check update status"""
    global update_status
    
    # Get cache status
    _, exists, is_fresh, last_updated = get_cached_data()
    
    # Add cache info to status
    status = update_status.copy()
    status["cache_exists"] = exists
    status["cache_fresh"] = is_fresh
    
    if not status["last_updated"] and last_updated:
        status["last_updated"] = last_updated
    
    logger.info(f"Status check: {status}")
    return jsonify(status)

@main_bp.route('/api/start-update', methods=['POST'])
def start_update():
    """API endpoint to start the update process"""
    global update_status
    
    logger.info("Received request to start update")
    
    # Don't start a new update if one is already in progress
    if update_status["in_progress"]:
        logger.info("Update already in progress, returning current status")
        return jsonify(update_status)
    
    # Get requested batch size (default 1)
    batch_size = request.json.get('batch_size', 1) if request.is_json else 1
    logger.info(f"Starting update with batch size: {batch_size}")
    
    # Initialize update
    update_status["in_progress"] = True
    update_status["teams_updated"] = 0
    update_status["error"] = None
    
    # Do one batch to get started
    status = update_mlb_data(step=batch_size)
    
    logger.info(f"Update started. Current status: {status}")
    return jsonify(status)

@main_bp.route('/api/continue-update', methods=['POST'])
def continue_update():
    """API endpoint to continue the update process"""
    # Get requested batch size (default 1)
    batch_size = request.json.get('batch_size', 1) if request.is_json else 1
    
    logger.info(f"Continuing update with batch size: {batch_size}")
    
    # Continue update
    status = update_mlb_data(step=batch_size)
    
    logger.info(f"Update continued. Current status: {status}")
    return jsonify(status)

@main_bp.route('/api/team-data')
def team_data():
    """API endpoint to get the latest team data"""
    teams, _, _, _ = get_cached_data(must_exist=True)
    teams = fix_logo_paths(teams)
    
    logger.info(f"Team data requested. Returning {len(teams)} teams")
    return jsonify(teams)