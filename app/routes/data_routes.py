# app/routes/data_routes.py

from flask import Blueprint, jsonify, request, current_app
import logging
from datetime import datetime, timezone
from app.routes.helper_functions import (
    get_latest_data, update_mlb_data, update_status
)
from app.models.mlb_snapshot import MLBSnapshot
from app.services.division_standings import get_division_cards_data


# Set up logging
logger = logging.getLogger(__name__)

# Create blueprint
data_bp = Blueprint('data', __name__, url_prefix='/api')

@data_bp.route('/team-data')
def get_team_data():
    """API endpoint to get the latest team data."""
    teams, _, _, _ = get_latest_data(must_exist=True)
    return jsonify(teams)

@data_bp.route('/division-standings')
def get_division_standings():
    """API endpoint to get division standings."""
    teams, _, _, _ = get_latest_data(must_exist=True)
    
    # Get division cards data
    cards_data = get_division_cards_data(teams)
    
    return jsonify(cards_data)

@data_bp.route('/update-status')
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
        "snapshot_count": update_status["snapshot_count"],
        "error": update_status.get("error")
    }
    
    return jsonify(status)

@data_bp.route('/start-update', methods=['POST'])
def start_update():
    """API endpoint to start updating MLB data."""
    global update_status
    
    # Reset status first to avoid stuck updates
    update_status["in_progress"] = False
    update_status["teams_updated"] = 0
    update_status["total_teams"] = 0
    update_status["error"] = None
    
    # Mark as in progress
    update_status["in_progress"] = True
    
    # Get batch size from request
    data = request.get_json() or {}
    batch_size = data.get('batch_size', 1)
    
    # Start update
    try:
        result = update_mlb_data(step=batch_size)
        
        if not result:
            logger.error("Failed to start update process")
            if not update_status.get("error"):
                update_status["error"] = "Unknown error starting update"
    except Exception as e:
        logger.error(f"Error starting update: {str(e)}")
        # Reset status on error
        update_status["in_progress"] = False
        update_status["error"] = str(e)
        
        return jsonify({
            "error": f"Failed to start update: {str(e)}",
            "in_progress": False
        })
    
    # Return current status
    return get_update_status()

@data_bp.route('/continue-update', methods=['POST'])
def continue_update():
    """API endpoint to continue updating MLB data."""
    global update_status
    
    # Get batch size from request
    data = request.get_json() or {}
    batch_size = data.get('batch_size', 1)
    
    # Only continue if already updating
    if update_status["in_progress"]:
        try:
            result = update_mlb_data(step=batch_size)
            
            if not result:
                logger.error("Failed to continue update process")
                if not update_status.get("error"):
                    update_status["error"] = "Unknown error continuing update"
        except Exception as e:
            logger.error(f"Error continuing update: {str(e)}")
            update_status["error"] = str(e)
    else:
        # If not in progress, start a new update
        return start_update()
    
    # Return current status
    return get_update_status()

@data_bp.route('/snapshots')
def get_snapshots():
    """API endpoint to get available snapshots."""
    snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).all()
    
    # Convert to JSON-serializable format
    snapshot_list = [{
        "id": s.id,
        "timestamp": s.timestamp.isoformat()
    } for s in snapshots]
    
    return jsonify(snapshot_list)

@data_bp.route('/snapshot/<snapshot_id>')
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
        from app import validate_mlb_data
        teams = validate_mlb_data(snapshot.teams)
        # Add timestamp to each team
        for team in teams:
            team['snapshot_time'] = snapshot.timestamp.isoformat()
        return jsonify(teams)
    
    return jsonify([])

@data_bp.route('/team-history/<team_id>')
def get_team_history(team_id):
    """API endpoint to get historical data for a specific team."""
    days = request.args.get('days', 30, type=int)
    history = MLBSnapshot.get_team_history(team_id, limit=days)
    return jsonify(history)

@data_bp.route('/reset-update', methods=['POST'])
def reset_update():
    """API endpoint to reset a stuck update process."""
    global update_status
    
    # Reset update status
    update_status = {
        "in_progress": False,
        "teams_updated": 0,
        "total_teams": 0,
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "snapshot_count": MLBSnapshot.query.count(),
        "error": None
    }
    
    logger.info("Update status has been manually reset")
    
    return jsonify({
        "status": "success",
        "message": "Update status has been reset",
        "current_status": update_status
    })