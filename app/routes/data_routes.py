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
        # Get all snapshots ordered by date
        snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.asc()).all()
        
        if len(snapshots) < 2:
            return jsonify({
                "error": "Not enough historical data available",
                "teams": []
            })
        
        # Get the oldest and newest snapshots
        oldest_snapshot = snapshots[0]
        newest_snapshot = snapshots[-1]
        
        # Dictionary to track all teams
        all_teams = {}
        
        # First pass: collect all teams and their complete movement history
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
        
        # Second pass: calculate movement metrics for each team
        movement_data = []
        
        import math
        
        for team_id, team_data in all_teams.items():
            path = team_data['path']
            
            # Need at least 2 points for movement analysis
            if len(path) < 2:
                continue
                
            # Calculate net movement (first to last point)
            first_point = path[0]
            last_point = path[-1]
            
            era_net_change = last_point['era'] - first_point['era']
            ops_net_change = last_point['ops'] - first_point['ops']
            
            # Calculate direct distance between first and last point (net displacement)
            net_displacement = math.sqrt(era_net_change**2 + ops_net_change**2)
            
            # Calculate total path length (sum of all segments)
            total_path_length = 0
            total_era_change = 0  # Accumulate absolute ERA changes
            total_ops_change = 0  # Accumulate absolute OPS changes
            
            # Direction consistency counters
            era_improvements = 0
            era_declines = 0
            ops_improvements = 0
            ops_declines = 0
            
            for i in range(1, len(path)):
                segment_era_change = path[i]['era'] - path[i-1]['era']
                segment_ops_change = path[i]['ops'] - path[i-1]['ops']
                
                # Count direction consistency
                if segment_era_change < 0:  # ERA decreasing (improving)
                    era_improvements += 1
                elif segment_era_change > 0:  # ERA increasing (declining)
                    era_declines += 1
                    
                if segment_ops_change > 0:  # OPS increasing (improving)
                    ops_improvements += 1
                elif segment_ops_change < 0:  # OPS decreasing (declining)
                    ops_declines += 1
                
                # Accumulate absolute changes (for volatility)
                total_era_change += abs(segment_era_change)
                total_ops_change += abs(segment_ops_change)
                
                # Calculate segment length
                segment_length = math.sqrt(segment_era_change**2 + segment_ops_change**2)
                total_path_length += segment_length
            
            # Calculate efficiency (ratio of displacement to path length)
            # Higher values (closer to 1) mean more direct/consistent movement
            path_efficiency = net_displacement / total_path_length if total_path_length > 0 else 0
            
            # Calculate volatility (average deviation per snapshot)
            num_segments = len(path) - 1
            era_volatility = total_era_change / num_segments if num_segments > 0 else 0
            ops_volatility = total_ops_change / num_segments if num_segments > 0 else 0
            
            # Calculate overall volatility
            combined_volatility = math.sqrt(era_volatility**2 + ops_volatility**2)
            
            # Calculate win percentage
            wins = last_point.get('wins', 0)
            losses = last_point.get('losses', 0)
            win_pct = wins / (wins + losses) if (wins + losses) > 0 else 0
            
            # Determine movement direction category
            if era_net_change < 0 and ops_net_change > 0:
                direction = "improving"  # Better pitching and hitting
            elif era_net_change > 0 and ops_net_change < 0:
                direction = "declining"  # Worse pitching and hitting
            else:
                direction = "mixed"      # Mixed results
                
            # Calculate path consistency - how consistent the movement direction was
            total_direction_changes = len(path) - 1
            
            era_consistency = max(era_improvements, era_declines) / total_direction_changes if total_direction_changes > 0 else 0
            ops_consistency = max(ops_improvements, ops_declines) / total_direction_changes if total_direction_changes > 0 else 0
            
            # Final team movement data
            team_movement = {
                'id': team_id,
                'name': team_data['name'],
                'full_name': team_data['full_name'],
                'division': team_data['division'],
                'league': team_data['league'],
                'current_era': team_data['current_era'],
                'current_ops': team_data['current_ops'],
                'first_era': first_point['era'],
                'first_ops': first_point['ops'],
                'era_net_change': era_net_change,
                'ops_net_change': ops_net_change,
                'total_era_change': total_era_change,
                'total_ops_change': total_ops_change,
                'net_displacement': net_displacement,
                'total_path_length': total_path_length,
                'path_efficiency': path_efficiency,
                'era_volatility': era_volatility,
                'ops_volatility': ops_volatility,
                'combined_volatility': combined_volatility,
                'direction': direction,
                'era_consistency': era_consistency,
                'ops_consistency': ops_consistency,
                'movement_magnitude': net_displacement,  # Legacy: keep original name for compatibility
                'path_points': len(path),                # Number of data points in team's history
                'win_pct': win_pct
            }
            
            movement_data.append(team_movement)
        
        # Sort data for different insights
        # Most dramatic movement (total path length)
        most_movement = sorted(movement_data, key=lambda x: x['total_path_length'], reverse=True)[:5]
        
        # Most consistent teams (highest path efficiency)
        most_consistent = sorted(movement_data, key=lambda x: x['path_efficiency'], reverse=True)[:5]
        
        # Most volatile teams (highest combined volatility)
        most_volatile = sorted(movement_data, key=lambda x: x['combined_volatility'], reverse=True)[:5]
        
        # Teams with highest improvement (best in both ERA and OPS)
        improving_teams = [t for t in movement_data if t['direction'] == 'improving']
        most_improved = sorted(improving_teams, 
                              key=lambda x: (abs(x['era_net_change']) + abs(x['ops_net_change'])), 
                              reverse=True)[:5]
        
        # Legacy: Provide previous metrics for backward compatibility
        least_movement = sorted(movement_data, key=lambda x: x['net_displacement'])[:3]
        most_movement_original = sorted(movement_data, key=lambda x: x['net_displacement'], reverse=True)[:3]
        
        # Calculate team correlations with win percentage
        win_corr_movement = []
        for team in movement_data:
            # Calculate expected win percentage based on position
            normalized_era = 1 - ((float(team['current_era']) - 2.0) / 4.0)  # Normalize ERA between 2-6
            normalized_ops = (float(team['current_ops']) - 0.6) / 0.3  # Normalize OPS between 0.6-0.9
            
            # Simple model: 50% weight on pitching, 50% on hitting
            expected_win_pct = (normalized_era + normalized_ops) / 2
            
            # Calculate discrepancy
            win_pct_discrepancy = team['win_pct'] - expected_win_pct
            team['expected_win_pct'] = expected_win_pct
            team['win_pct_discrepancy'] = win_pct_discrepancy
            
            win_corr_movement.append(team)
        
        # Teams with largest win percentage discrepancy
        biggest_discrepancy = sorted(win_corr_movement, key=lambda x: abs(x['win_pct_discrepancy']), reverse=True)[:5]
        
        return jsonify({
            "movement_data": movement_data,
            "most_movement": most_movement,
            "most_consistent": most_consistent, 
            "most_volatile": most_volatile,
            "most_improved": most_improved,
            "biggest_discrepancy": biggest_discrepancy,
            # Legacy fields for backward compatibility
            "least_movement": least_movement,
            "most_movement_legacy": most_movement_original,
            "oldest_date": oldest_snapshot.timestamp_aware.isoformat(),
            "newest_date": newest_snapshot.timestamp_aware.isoformat()
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
