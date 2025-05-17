# app/utils/snapshot_cleanup.py

import json
import logging
from flask import current_app
from app import db

logger = logging.getLogger(__name__)

def compare_snapshots(data1, data2):
    """
    Compare two snapshot data sets to determine if they are functionally identical.
    
    Args:
        data1: First snapshot data (list of team dictionaries)
        data2: Second snapshot data (list of team dictionaries)
        
    Returns:
        bool: True if snapshots contain identical team data
    """
    # If lengths are different, they're not identical
    if len(data1) != len(data2):
        return False
    
    # Create dictionaries indexed by team ID for faster comparison
    team_dict1 = {team['id']: team for team in data1 if 'id' in team}
    team_dict2 = {team['id']: team for team in data2 if 'id' in team}
    
    # Check if they have the same team IDs
    if set(team_dict1.keys()) != set(team_dict2.keys()):
        return False
    
    # Compare each team's critical stats (ERA, OPS, and now run differential)
    for team_id, team1 in team_dict1.items():
        team2 = team_dict2[team_id]
        
        # Round to 3 decimal places for comparison to avoid floating point issues
        era1 = round(float(team1.get('era', 0)), 3)
        era2 = round(float(team2.get('era', 0)), 3)
        ops1 = round(float(team1.get('ops', 0)), 3)
        ops2 = round(float(team2.get('ops', 0)), 3)
        
        # Add comparison for run differential
        diff1 = int(team1.get('run_differential', 0))
        diff2 = int(team2.get('run_differential', 0))
        
        if era1 != era2 or ops1 != ops2 or diff1 != diff2:
            return False
    
    # If we got here, the snapshots contain identical team data
    return True

def cleanup_duplicate_snapshots():
    """
    Scan for and remove duplicate snapshots, keeping the oldest of each duplicate set
    to maintain historical timeline integrity.
    
    Returns:
        int: Number of duplicate snapshots removed
    """
    from app.models.mlb_snapshot import MLBSnapshot
    
    logger.info("Starting duplicate snapshot cleanup")
    
    try:
        # Get all snapshots ordered by timestamp
        snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.asc()).all()
        
        if len(snapshots) <= 1:
            logger.info("Not enough snapshots to check for duplicates")
            return 0
        
        # Track snapshots to delete
        to_delete = []
        
        # Compare each snapshot with the previous one
        previous = None
        for current in snapshots:
            if previous is not None:
                # Parse the JSON data
                prev_data = json.loads(previous.data)
                curr_data = json.loads(current.data)
                
                # Compare the snapshots
                if compare_snapshots(prev_data, curr_data):
                    # They're duplicates - mark the newer one for deletion
                    to_delete.append(current)
                    logger.info(f"Marking duplicate snapshot ID {current.id} from {current.timestamp} for deletion")
                else:
                    # Not a duplicate, update previous
                    previous = current
            else:
                # First snapshot, just set as previous
                previous = current
        
        # Delete the duplicate snapshots
        count = len(to_delete)
        if count > 0:
            for snapshot in to_delete:
                db.session.delete(snapshot)
            
            db.session.commit()
            logger.info(f"Deleted {count} duplicate snapshots")
        else:
            logger.info("No duplicate snapshots found")
        
        return count
        
    except Exception as e:
        logger.error(f"Error during duplicate snapshot cleanup: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        # Make sure to rollback any partial changes
        db.session.rollback()
        return 0