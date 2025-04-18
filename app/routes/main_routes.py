# app/routes/main_routes.py

from flask import Blueprint, render_template, current_app
import logging
from app.routes.helper_functions import get_latest_data, update_status
from app.services.division_standings import get_division_cards_data

# Set up logging
logger = logging.getLogger(__name__)

# Create blueprint
main_bp = Blueprint('main', __name__)

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
    
    # Get division standings data
    division_cards = get_division_cards_data(teams)
    
    # Render the template with team data, status, and standings
    return render_template('index.html', teams=teams, status=status, division_cards=division_cards)