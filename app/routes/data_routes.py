# app/routes/data_routes.py

from flask import Blueprint, jsonify, request, current_app
import logging
from datetime import datetime, timezone, timedelta
from app.routes.helper_functions import (
    get_latest_data, update_mlb_data, update_status
)
from app.models.mlb_snapshot import MLBSnapshot
from app.services.division_standings import get_division_cards_data
import bisect


# Set up logging
logger = logging.getLogger(__name__)

# Create blueprint
data_bp = Blueprint('data', __name__, url_prefix='/api')

@data_bp.route('/team-data')
def get_team_data():
    """API endpoint to get the latest team data."""
    try:
        teams, db_exists, is_fresh, last_updated = get_latest_data(must_exist=True)
        
        # If data is not fresh, trigger an async update
        if not is_fresh:
            logger.info("Data is not fresh, triggering async update")
            from app.services.mlb_data import MLBDataFetcher
            fetcher = MLBDataFetcher()
            if fetcher.api_available:
                # Start update in background
                update_mlb_data(step=1)
        
        response = {
            "teams": teams,
            "fresh": is_fresh,
            "last_updated": last_updated,
            "source": "database" if db_exists else "cache"
        }
        
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error getting team data: {str(e)}")
        return jsonify({
            "error": str(e),
            "teams": [],
            "fresh": False,
            "last_updated": None,
            "source": "error"
        }), 500

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
    days = request.args.get('days', 90, type=int)
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
    
@data_bp.route('/team-movement')
def get_team_movement():
    """API endpoint to get comprehensive team movement data for advanced insights."""
    try:
        # Calculate the date 14 days ago
        two_weeks_ago = datetime.now(timezone.utc) - timedelta(days=14)
        
        # Get snapshots from last 14 days
        snapshots = MLBSnapshot.query.filter(
            MLBSnapshot.timestamp >= two_weeks_ago
        ).order_by(MLBSnapshot.timestamp.asc()).all()
        
        if len(snapshots) < 2:
            return jsonify({
                "error": "Not enough historical data available",
                "teams": []
            })
        
        # Get the oldest and newest snapshots from this period
        oldest_snapshot = snapshots[0]
        newest_snapshot = snapshots[-1]
        
        # Dictionary to track all teams
        all_teams = {}
        
        # Process only the snapshots from last 2 weeks
        for snapshot in snapshots:
            timestamp = snapshot.timestamp_aware
            
            for team in snapshot.teams:
                team_id = team.get('id')
                
                if team_id is None:
                    continue
                
                # Initialize team entry if not exists
                if team_id not in all_teams:
                    all_teams[team_id] = {
                        'id': team_id,
                        'name': team.get('name', 'Unknown'),
                        'full_name': team.get('full_name', team.get('name', 'Unknown')),
                        'path': [],  # List of positions over time
                        'division': team.get('division', 'Unknown'),
                        'league': team.get('league', 'Unknown'),
                        'current_era': 0,
                        'current_ops': 0,
                        'first_era': 0,
                        'first_ops': 0
                    }
                
                # Add position to path if valid
                try:
                    era = float(team.get('era', 0))
                    ops = float(team.get('ops', 0))
                    
                    # Only add valid data points
                    if 1.0 <= era <= 7.0 and 0.5 <= ops <= 1.0:
                        all_teams[team_id]['path'].append({
                            'timestamp': timestamp.isoformat(),
                            'era': era,
                            'ops': ops,
                            'wins': team.get('wins', 0),
                            'losses': team.get('losses', 0)
                        })
                        
                        # Update current values (from newest snapshot)
                        if snapshot == newest_snapshot:
                            all_teams[team_id]['current_era'] = era
                            all_teams[team_id]['current_ops'] = ops
                            all_teams[team_id]['current_wins'] = team.get('wins', 0)
                            all_teams[team_id]['current_losses'] = team.get('losses', 0)
                        
                        # Set first values (from oldest snapshot with this team)
                        if not all_teams[team_id].get('first_set') and snapshot == oldest_snapshot:
                            all_teams[team_id]['first_era'] = era
                            all_teams[team_id]['first_ops'] = ops
                            all_teams[team_id]['first_set'] = True
                except (ValueError, TypeError):
                    continue  # Skip invalid data points
        
        # Calculate movement metrics for each team
        movement_data = []
        
        import math
        
        for team_id, team_data in all_teams.items():
            path = team_data['path']
            
            # Need at least 2 points for movement analysis
            if len(path) < 2:
                continue
                
            # Calculate total volatility (sum of all day-to-day changes)
            total_volatility = 0
            era_changes = []
            ops_changes = []
            
            for i in range(1, len(path)):
                # Calculate day-to-day changes
                era_change = abs(path[i]['era'] - path[i-1]['era'])
                ops_change = abs(path[i]['ops'] - path[i-1]['ops'])
                
                # Add to collections
                era_changes.append(era_change)
                ops_changes.append(ops_change)
                
                # Calculate combined movement for this step
                combined_change = math.sqrt(era_change**2 + ops_change**2)
                total_volatility += combined_change
            
            # Calculate averages
            num_changes = len(path) - 1
            avg_era_volatility = sum(era_changes) / num_changes if num_changes > 0 else 0
            avg_ops_volatility = sum(ops_changes) / num_changes if num_changes > 0 else 0
            avg_combined_volatility = total_volatility / num_changes if num_changes > 0 else 0
            
            # Calculate win percentage
            wins = team_data['current_wins']
            losses = team_data['current_losses']
            win_pct = wins / (wins + losses) if (wins + losses) > 0 else 0
            
            # Final team movement data
            team_movement = {
                'id': team_id,
                'name': team_data['name'],
                'full_name': team_data['full_name'],
                'division': team_data['division'],
                'league': team_data['league'],
                'current_era': team_data['current_era'],
                'current_ops': team_data['current_ops'],
                'avg_era_volatility': avg_era_volatility,
                'avg_ops_volatility': avg_ops_volatility,
                'avg_combined_volatility': avg_combined_volatility,
                'total_volatility': total_volatility,
                'path_points': len(path),
                'win_pct': win_pct
            }
            
            movement_data.append(team_movement)
        
        # Sort by most volatile teams in the last 2 weeks
        most_volatile = sorted(movement_data, key=lambda x: x['avg_combined_volatility'], reverse=True)[:3]
        
        # Calculate percentiles for stability analysis
        all_era_volatilities = [team['avg_era_volatility'] for team in movement_data if team['avg_era_volatility'] > 0]
        all_ops_volatilities = [team['avg_ops_volatility'] for team in movement_data if team['avg_ops_volatility'] > 0]
        
        if all_era_volatilities and all_ops_volatilities:
            # Sort volatilities
            all_era_volatilities.sort()
            all_ops_volatilities.sort()
            
            # Calculate percentiles for each team (lower percentile = more stable)
            for team in movement_data:
                # Find percentile for ERA volatility (lower is better for stability)
                era_index = bisect.bisect_left(all_era_volatilities, team['avg_era_volatility'])
                team['pitching_stability_percentile'] = (era_index / len(all_era_volatilities)) * 100
                
                # Find percentile for OPS volatility (lower is better for stability) 
                ops_index = bisect.bisect_left(all_ops_volatilities, team['avg_ops_volatility'])
                team['hitting_stability_percentile'] = (ops_index / len(all_ops_volatilities)) * 100
            
            # Find most stable teams (lowest volatility)
            most_stable = sorted(movement_data, key=lambda x: x['avg_combined_volatility'])[:3]
        else:
            most_stable = []
        
        return jsonify({
            "recent_movers": most_volatile,
            "most_stable": most_stable,
            "movement_data": movement_data,
            "start_date": oldest_snapshot.timestamp_aware.isoformat(),
            "end_date": newest_snapshot.timestamp_aware.isoformat()
        })
        
    except Exception as e:
        import logging
        logging.getLogger('data_routes').error(f"Error getting team movement data: {str(e)}")
        import traceback
        logging.getLogger('data_routes').error(traceback.format_exc())
        
        return jsonify({
            "error": str(e),
            "movement_data": []
        }), 500