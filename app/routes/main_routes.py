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

    # If data is stale during season/game hours, try to fetch fresh data before rendering
    if not is_fresh and db_exists:
        logger.info("Data is stale on initial page load, attempting fresh fetch...")
        try:
            from app.services.mlb_data import MLBDataFetcher
            from app.routes.helper_functions import update_mlb_data
            from datetime import datetime, timezone

            fetcher = MLBDataFetcher()

            # Only attempt fresh fetch if API is available and it's during season
            if fetcher.api_available:
                from app.routes.helper_functions import is_mlb_season_active, are_games_likely_being_played

                now = datetime.now(timezone.utc)
                if is_mlb_season_active(now) and are_games_likely_being_played(now):
                    logger.info("MLB season active and games likely - fetching fresh data synchronously")
                    # Fetch fresh data (this will be quick - just a few seconds)
                    result = update_mlb_data(step=30)  # Fetch all teams at once
                    if result:
                        # Reload data after update
                        teams, db_exists, is_fresh, last_updated = get_latest_data()
                        logger.info("Fresh data loaded successfully")
        except Exception as e:
            logger.warning(f"Could not fetch fresh data on page load: {e}")
            # Continue with stale data - don't block page load

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