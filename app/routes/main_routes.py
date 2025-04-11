# app/routes/main_routes.py
from flask import Blueprint, render_template, current_app, jsonify
import json
import os
from datetime import datetime
import threading
# Import the MLBDataFetcher service
from app.services.mlb_data import MLBDataFetcher

# Create blueprint
main_bp = Blueprint('main', __name__)

# Global variable to track background update status
bg_update_status = {
    "in_progress": False,
    "last_updated": None,
    "teams_updated": 0,
    "total_teams": 0
}

def get_cached_data(must_exist=False):
    """Get team data from cache if it exists"""
    cache_file = current_app.config['CACHE_FILE']
    
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r') as f:
                data = json.load(f)
                # Check if cache is fresh
                file_mod_time = datetime.fromtimestamp(os.path.getmtime(cache_file))
                cache_age = datetime.now() - file_mod_time
                is_fresh = cache_age.total_seconds() < current_app.config['CACHE_TIMEOUT']
                return data, True, is_fresh  # Return data, exists flag, and freshness
        except Exception as e:
            current_app.logger.error(f"Error reading cache: {str(e)}")
            if must_exist:
                # Return fallback data if cache must exist but can't be read
                return get_fallback_data(), False, False
    
    return get_fallback_data() if must_exist else (None, False, False)

def save_to_cache(data):
    """Save data to cache file"""
    cache_file = current_app.config['CACHE_FILE']
    with open(cache_file, 'w') as f:
        json.dump(data, f)

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
    return [
        {"name": "Mets", "full_name": "New York Mets", "abbreviation": "NYM", "era": 2.00, "ops": 0.700, "logo": "/static/logos/mets.png"},
        {"name": "Giants", "full_name": "San Francisco Giants", "abbreviation": "SF", "era": 2.55, "ops": 0.650, "logo": "/static/logos/giants.png"},
        # Add more teams as needed from your fallback data
        {"name": "Pirates", "full_name": "Pittsburgh Pirates", "abbreviation": "PIT", "era": 4.90, "ops": 0.600, "logo": "/static/logos/pirates.png"}
    ], False, False

def background_update_data():
    """Update team data in the background"""
    global bg_update_status
    
    current_app.logger.info("=== STARTING BACKGROUND DATA UPDATE ===")
    
    # Set status to in progress
    bg_update_status["in_progress"] = True
    bg_update_status["teams_updated"] = 0
    bg_update_status["total_teams"] = 30  # Default MLB team count
    
    try:
        # Get fetcher
        current_app.logger.info("Initializing MLB data fetcher")
        fetcher = MLBDataFetcher()
        
        # Use a callback to track progress
        def progress_callback(team_name, current, total):
            global bg_update_status
            bg_update_status["teams_updated"] = current
            bg_update_status["total_teams"] = total
            current_app.logger.info(f"Updated team {current}/{total}: {team_name}")
        
        # Get fresh data with progress tracking
        current_app.logger.info("Starting data fetch from MLB Stats API")
        fresh_data = fetcher.get_all_team_stats(progress_callback=progress_callback)
        
        # If we got valid data, save it to cache
        if fresh_data and len(fresh_data) > 0:
            current_app.logger.info(f"Successfully fetched data for {len(fresh_data)} teams")
            current_app.logger.info("Saving data to cache file")
            save_to_cache(fresh_data)
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            bg_update_status["last_updated"] = timestamp
            current_app.logger.info(f"Cache updated at {timestamp}")
        else:
            current_app.logger.error("No valid data received from MLB Stats API")
    except Exception as e:
        current_app.logger.error(f"Error in background update: {str(e)}")
        import traceback
        current_app.logger.error(traceback.format_exc())
    finally:
        # Update status
        bg_update_status["in_progress"] = False
        current_app.logger.info("=== BACKGROUND DATA UPDATE COMPLETED ===")
        
    return

@main_bp.route('/')
def index():
    """Main route to display the chart"""
    # Always use cached data first if it exists
    teams, exists, is_fresh = get_cached_data(must_exist=True)
    teams = fix_logo_paths(teams)
    
    # Start background update if cache is stale or doesn't exist
    global bg_update_status
    
    needs_update = not is_fresh
    update_in_progress = bg_update_status["in_progress"]
    
    # Only start a new update if one isn't already running and we need it
    if needs_update and not update_in_progress:
        # Start background thread to update data
        current_app.logger.info("Starting background data update")
        update_thread = threading.Thread(target=background_update_data)
        update_thread.daemon = True
        update_thread.start()
    
    # Pass status to template
    status = {
        "from_cache": True,  # We're always using cache initially
        "is_fresh": is_fresh,
        "update_in_progress": bg_update_status["in_progress"],
        "last_updated": bg_update_status["last_updated"]
    }
    
    return render_template('index.html', teams=teams, status=status)

@main_bp.route('/api/update-status')
def update_status():
    """API endpoint to check update status"""
    global bg_update_status
    return jsonify(bg_update_status)