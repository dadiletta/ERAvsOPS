# app/routes/main_routes.py

from flask import Blueprint, render_template, current_app
import logging
from app.routes.helper_functions import get_latest_data, update_status
from app.services.division_standings import get_division_cards_data
from app.models.mlb_snapshot import MLBSnapshot

# Set up logging
logger = logging.getLogger(__name__)

# Create blueprint
main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    """Render the homepage with MLB team data visualization."""
    current_season = MLBSnapshot.get_current_season()

    # Always show the most recent snapshot regardless of season so the chart
    # is never blank. An overlay is rendered when the data is from a prior season.
    teams, db_exists, is_fresh, last_updated = get_latest_data()

    # Determine what season the rendered data actually belongs to
    latest_snapshot = MLBSnapshot.get_latest()
    data_season = latest_snapshot.season if latest_snapshot else None

    # If data is stale during season/game hours, try to fetch fresh data before rendering
    if not is_fresh and db_exists:
        logger.info("Data is stale on initial page load, attempting fresh fetch...")
        try:
            from app.services.mlb_data import MLBDataFetcher
            from app.routes.helper_functions import update_mlb_data
            from datetime import datetime, timezone

            fetcher = MLBDataFetcher()

            if fetcher.api_available:
                from app.routes.helper_functions import is_mlb_season_active, are_games_likely_being_played

                now = datetime.now(timezone.utc)
                if is_mlb_season_active(now) and are_games_likely_being_played(now):
                    logger.info("MLB season active and games likely - fetching fresh data synchronously")
                    result = update_mlb_data(step=30)
                    if result:
                        teams, db_exists, is_fresh, last_updated = get_latest_data()
                        latest_snapshot = MLBSnapshot.get_latest()
                        data_season = latest_snapshot.season if latest_snapshot else None
                        logger.info("Fresh data loaded successfully")
        except Exception as e:
            logger.warning(f"Could not fetch fresh data on page load: {e}")

    # Prepare status info for the template
    status = {
        "is_fresh": is_fresh,
        "last_updated": last_updated,
        "update_in_progress": update_status["in_progress"],
        "teams_updated": update_status["teams_updated"],
        "total_teams": update_status["total_teams"],
        "snapshot_count": update_status["snapshot_count"]
    }

    # Overlay: visible when the chart is showing a prior season's data
    show_stale_overlay = db_exists and (data_season is None or data_season < current_season)

    # Trend arrows compare within the same season as the rendered data
    previous_snapshot = MLBSnapshot.get_previous(season=data_season)
    previous_teams = previous_snapshot.teams if previous_snapshot else []
    division_cards = get_division_cards_data(teams, previous_teams=previous_teams)

    return render_template(
        'index.html',
        teams=teams,
        status=status,
        division_cards=division_cards,
        current_season=current_season,
        data_season=data_season,
        show_stale_overlay=show_stale_overlay,
    )