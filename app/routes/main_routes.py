# app/routes/main_routes.py
from flask import Blueprint, render_template, current_app
import json
import os
from datetime import datetime
# Import the MLBDataFetcher service
from app.services.mlb_data import MLBDataFetcher

# Create blueprint
main_bp = Blueprint('main', __name__)

def get_cached_data():
    """Get team data from cache if it exists and is fresh"""
    cache_file = current_app.config['CACHE_FILE']
    
    if os.path.exists(cache_file):
        # Check if cache is fresh
        file_mod_time = datetime.fromtimestamp(os.path.getmtime(cache_file))
        cache_age = datetime.now() - file_mod_time
        
        if cache_age.total_seconds() < current_app.config['CACHE_TIMEOUT']:
            with open(cache_file, 'r') as f:
                return json.load(f), True  # Return data and "from cache" indicator
    
    return None, False

def save_to_cache(data):
    """Save data to cache file"""
    cache_file = current_app.config['CACHE_FILE']
    with open(cache_file, 'w') as f:
        json.dump(data, f)

def get_team_data():
    """Get team data, either from cache or fresh from API"""
    # Try to get data from cache first
    cached_data, from_cache = get_cached_data()
    if cached_data:
        return cached_data, from_cache
    
    # If no cache or it's stale, fetch fresh data
    fetcher = MLBDataFetcher()
    fresh_data = fetcher.get_all_team_stats()
    
    # If we got valid data, save it to cache
    if fresh_data:
        save_to_cache(fresh_data)
        return fresh_data, False  # Not from cache
    
    # If all else fails, use the placeholder data or empty cache
    if os.path.exists(current_app.config['CACHE_FILE']):
        with open(current_app.config['CACHE_FILE'], 'r') as f:
            return json.load(f), True  # Return fallback data and "from cache" indicator
    else:
        # Fallback placeholder data
        teams = [
            {"name": "Mets", "era": 2.00, "ops": 0.700, "logo": "static/logos/mets.png"},
            {"name": "Giants", "era": 2.55, "ops": 0.650, "logo": "static/logos/giants.png"},
            {"name": "Reds", "era": 2.90, "ops": 0.610, "logo": "static/logos/reds.png"},
            {"name": "Royals", "era": 3.00, "ops": 0.650, "logo": "static/logos/royals.png"},
            {"name": "Rays", "era": 3.10, "ops": 0.700, "logo": "static/logos/rays.png"},
            # ... additional fallback data would go here ...
        ]
        save_to_cache(teams)
        return teams, True  # Return fallback data and "from cache" indicator (emergency fallback)

@main_bp.route('/')
def index():
    """Main route to display the chart"""
    teams, from_cache = get_team_data()
    # Convert Python boolean to JavaScript string representation
    from_cache_js = str(from_cache).lower()
    current_app.logger.info(f"Using cached data: {from_cache_js}")
    return render_template('index.html', teams=teams, from_cache=from_cache_js)