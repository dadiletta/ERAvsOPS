# app/routes/main_routes.py
from flask import Blueprint, render_template, current_app
import json
import os
from datetime import datetime
# Import will be uncommented once service is fully implemented
# from app.services.mlb_data import MLBDataFetcher

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
                return json.load(f)
    
    return None

def save_to_cache(data):
    """Save data to cache file"""
    cache_file = current_app.config['CACHE_FILE']
    with open(cache_file, 'w') as f:
        json.dump(data, f)

def get_team_data():
    """Get team data, either from cache or fresh from API"""
    # Try to get data from cache first
    cached_data = get_cached_data()
    if cached_data:
        return cached_data
    
    # If no cache or it's stale, you would fetch fresh data here
    # fetcher = MLBDataFetcher()
    # fresh_data = fetcher.get_all_team_stats()
    # save_to_cache(fresh_data)
    # return fresh_data
    
    # For now, return placeholder data
    teams = [
        {"name": "Mets", "era": 2.00, "ops": 0.700, "logo": "static/logos/mets.png"},
        {"name": "Giants", "era": 2.55, "ops": 0.650, "logo": "static/logos/giants.png"},
        {"name": "Reds", "era": 2.90, "ops": 0.610, "logo": "static/logos/reds.png"},
        {"name": "Royals", "era": 3.00, "ops": 0.650, "logo": "static/logos/royals.png"},
        {"name": "Rays", "era": 3.10, "ops": 0.700, "logo": "static/logos/rays.png"},
        {"name": "Dodgers", "era": 3.10, "ops": 0.740, "logo": "static/logos/dodgers.png"},
        {"name": "Astros", "era": 3.50, "ops": 0.590, "logo": "static/logos/astros.png"},
        {"name": "White Sox", "era": 3.80, "ops": 0.600, "logo": "static/logos/whitesox.png"},
        {"name": "Rangers", "era": 3.60, "ops": 0.630, "logo": "static/logos/rangers.png"},
        {"name": "Mariners", "era": 3.80, "ops": 0.650, "logo": "static/logos/mariners.png"},
        {"name": "Marlins", "era": 4.00, "ops": 0.660, "logo": "static/logos/marlins.png"},
        {"name": "Blue Jays", "era": 3.65, "ops": 0.720, "logo": "static/logos/bluejays.png"},
        {"name": "Padres", "era": 3.55, "ops": 0.750, "logo": "static/logos/padres.png"},
        {"name": "Phillies", "era": 3.70, "ops": 0.780, "logo": "static/logos/phillies.png"},
        {"name": "Tigers", "era": 3.55, "ops": 0.810, "logo": "static/logos/tigers.png"},
        {"name": "Twins", "era": 4.50, "ops": 0.590, "logo": "static/logos/twins.png"},
        {"name": "Braves", "era": 4.50, "ops": 0.620, "logo": "static/logos/braves.png"},
        {"name": "Rockies", "era": 4.50, "ops": 0.650, "logo": "static/logos/rockies.png"},
        {"name": "Guardians", "era": 4.50, "ops": 0.680, "logo": "static/logos/guardians.png"},
        {"name": "Angels", "era": 4.35, "ops": 0.710, "logo": "static/logos/angels.png"},
        {"name": "Orioles", "era": 4.45, "ops": 0.710, "logo": "static/logos/orioles.png"},
        {"name": "Nationals", "era": 4.50, "ops": 0.720, "logo": "static/logos/nationals.png"},
        {"name": "Red Sox", "era": 4.25, "ops": 0.730, "logo": "static/logos/redsox.png"},
        {"name": "Cubs", "era": 4.50, "ops": 0.750, "logo": "static/logos/cubs.png"},
        {"name": "Diamondbacks", "era": 4.80, "ops": 0.780, "logo": "static/logos/diamondbacks.png"},
        {"name": "Yankees", "era": 4.60, "ops": 0.850, "logo": "static/logos/yankees.png"},
        {"name": "Athletics", "era": 5.40, "ops": 0.730, "logo": "static/logos/athletics.png"},
        {"name": "Brewers", "era": 5.55, "ops": 0.690, "logo": "static/logos/brewers.png"},
        {"name": "Cardinals", "era": 5.90, "ops": 0.820, "logo": "static/logos/cardinals.png"},
        {"name": "Pirates", "era": 4.90, "ops": 0.600, "logo": "static/logos/pirates.png"}
    ]
    save_to_cache(teams)
    return teams

@main_bp.route('/')
def index():
    """Main route to display the chart"""
    teams = get_team_data()
    return render_template('index.html', teams=teams)