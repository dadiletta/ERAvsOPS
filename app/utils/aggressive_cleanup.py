# app/utils/aggressive_cleanup.py

import json
import logging
from datetime import datetime, timezone, timedelta
from flask import current_app
from app import db
from app.models.mlb_snapshot import MLBSnapshot
from app.utils.snapshot_cleanup import compare_snapshots

logger = logging.getLogger(__name__)

def identify_partial_snapshots():
    """
    Identify snapshots that have fewer than the expected 30 teams
    
    Returns:
        List of snapshot IDs that are partial
    """
    partial_ids = []
    
    try:
        snapshots = MLBSnapshot.query.all()
        
        for snapshot in snapshots:
            teams = json.loads(snapshot.data)
            
            # MLB has 30 teams, anything less is partial
            # Allow 28 as minimum in case 1-2 teams have API issues
            if len(teams) < 28:
                partial_ids.append(snapshot.id)
                logger.info(f"Partial snapshot ID {snapshot.id} has only {len(teams)} teams")
        
        logger.info(f"Found {len(partial_ids)} partial snapshots")
        return partial_ids
        
    except Exception as e:
        logger.error(f"Error identifying partial snapshots: {str(e)}")
        return []

def identify_rapid_duplicates():
    """
    Identify snapshots created within a short time window that are duplicates
    
    Returns:
        List of snapshot IDs to delete (keeping the oldest in each group)
    """
    to_delete = []
    
    try:
        # Get all snapshots ordered by timestamp
        snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.asc()).all()
        
        if len(snapshots) <= 1:
            return []
        
        # Group snapshots by time windows (e.g., within 5 minutes of each other)
        time_window = timedelta(minutes=5)
        
        i = 0
        while i < len(snapshots):
            # Start a new group
            group_start = snapshots[i]
            group = [group_start]
            
            # Find all snapshots within the time window
            j = i + 1
            while j < len(snapshots) and (snapshots[j].timestamp_aware - group_start.timestamp_aware) <= time_window:
                group.append(snapshots[j])
                j += 1
            
            # If we have multiple snapshots in this group
            if len(group) > 1:
                # Check if they're duplicates
                group_data = []
                for snapshot in group:
                    try:
                        data = json.loads(snapshot.data)
                        group_data.append((snapshot, data))
                    except:
                        # If we can't parse, mark for deletion
                        to_delete.append(snapshot.id)
                        continue
                
                # Compare all snapshots in the group
                if group_data:
                    # Keep the first one, check others for duplicates
                    base_snapshot, base_data = group_data[0]
                    
                    for snapshot, data in group_data[1:]:
                        if compare_snapshots(base_data, data):
                            to_delete.append(snapshot.id)
                            logger.info(f"Rapid duplicate: ID {snapshot.id} duplicates ID {base_snapshot.id}")
            
            # Move to next ungrouped snapshot
            i = j
        
        logger.info(f"Found {len(to_delete)} rapid duplicate snapshots")
        return to_delete
        
    except Exception as e:
        logger.error(f"Error identifying rapid duplicates: {str(e)}")
        return []

def identify_hourly_redundancy():
    """
    Keep only one snapshot per hour (the last one in each hour)
    
    Returns:
        List of snapshot IDs to delete
    """
    to_delete = []
    
    try:
        # Get all snapshots ordered by timestamp
        snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.asc()).all()
        
        # Group by hour
        hourly_groups = {}
        
        for snapshot in snapshots:
            # Create hour key (YYYY-MM-DD-HH)
            hour_key = snapshot.timestamp_aware.strftime("%Y-%m-%d-%H")
            
            if hour_key not in hourly_groups:
                hourly_groups[hour_key] = []
            hourly_groups[hour_key].append(snapshot)
        
        # For each hour, keep only the last snapshot
        for hour_key, group in hourly_groups.items():
            if len(group) > 1:
                # Sort by timestamp to ensure we keep the last one
                group.sort(key=lambda s: s.timestamp_aware)
                
                # Mark all but the last for deletion
                for snapshot in group[:-1]:
                    to_delete.append(snapshot.id)
        
        logger.info(f"Found {len(to_delete)} redundant hourly snapshots")
        return to_delete
        
    except Exception as e:
        logger.error(f"Error identifying hourly redundancy: {str(e)}")
        return []

def aggressive_snapshot_cleanup(keep_recent_hours=24, hourly_after_days=1, daily_after_days=7):
    """
    Perform aggressive cleanup of snapshots
    
    Args:
        keep_recent_hours: Keep all snapshots from the last N hours
        hourly_after_days: After N days, keep only one per hour
        daily_after_days: After N days, keep only one per day
        
    Returns:
        Tuple of (count_before, count_after, count_deleted)
    """
    try:
        count_before = MLBSnapshot.query.count()
        logger.info(f"Starting aggressive cleanup with {count_before} snapshots")
        
        now = datetime.now(timezone.utc)
        total_deleted = 0
        
        # Step 1: Delete all partial snapshots
        partial_ids = identify_partial_snapshots()
        if partial_ids:
            MLBSnapshot.query.filter(MLBSnapshot.id.in_(partial_ids)).delete(synchronize_session=False)
            db.session.commit()
            total_deleted += len(partial_ids)
            logger.info(f"Deleted {len(partial_ids)} partial snapshots")
        
        # Step 2: Delete rapid duplicates
        rapid_duplicate_ids = identify_rapid_duplicates()
        if rapid_duplicate_ids:
            MLBSnapshot.query.filter(MLBSnapshot.id.in_(rapid_duplicate_ids)).delete(synchronize_session=False)
            db.session.commit()
            total_deleted += len(rapid_duplicate_ids)
            logger.info(f"Deleted {len(rapid_duplicate_ids)} rapid duplicates")
        
        # Step 3: Apply time-based retention policy
        snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).all()
        
        # Group snapshots by time period
        to_delete_ids = []
        daily_groups = {}
        hourly_groups = {}
        
        for snapshot in snapshots:
            age = now - snapshot.timestamp_aware
            
            # Keep all recent snapshots
            if age < timedelta(hours=keep_recent_hours):
                continue
            
            # For snapshots older than daily_after_days, keep only one per day
            elif age > timedelta(days=daily_after_days):
                day_key = snapshot.timestamp_aware.strftime("%Y-%m-%d")
                if day_key not in daily_groups:
                    daily_groups[day_key] = snapshot
                else:
                    # We already have one for this day, delete this one
                    to_delete_ids.append(snapshot.id)
            
            # For snapshots between hourly_after_days and daily_after_days, keep one per hour
            elif age > timedelta(days=hourly_after_days):
                hour_key = snapshot.timestamp_aware.strftime("%Y-%m-%d-%H")
                if hour_key not in hourly_groups:
                    hourly_groups[hour_key] = snapshot
                else:
                    # We already have one for this hour, delete this one
                    to_delete_ids.append(snapshot.id)
        
        # Delete the identified snapshots
        if to_delete_ids:
            # Delete in batches to avoid memory issues
            batch_size = 100
            for i in range(0, len(to_delete_ids), batch_size):
                batch = to_delete_ids[i:i + batch_size]
                MLBSnapshot.query.filter(MLBSnapshot.id.in_(batch)).delete(synchronize_session=False)
                db.session.commit()
            
            total_deleted += len(to_delete_ids)
            logger.info(f"Deleted {len(to_delete_ids)} snapshots based on retention policy")
        
        count_after = MLBSnapshot.query.count()
        
        logger.info(f"Aggressive cleanup complete: {count_before} -> {count_after} (deleted {total_deleted})")
        return count_before, count_after, total_deleted
        
    except Exception as e:
        logger.error(f"Error during aggressive cleanup: {str(e)}")
        db.session.rollback()
        import traceback
        logger.error(traceback.format_exc())
        return count_before, count_before, 0

def emergency_cleanup(target_count=500):
    """
    Emergency cleanup when database is severely bloated
    Keeps only the most recent snapshots and a sparse history
    
    Args:
        target_count: Target number of snapshots to keep
        
    Returns:
        Tuple of (count_before, count_after, count_deleted)
    """
    try:
        count_before = MLBSnapshot.query.count()
        
        if count_before <= target_count:
            logger.info(f"No emergency cleanup needed. Current count {count_before} is below target {target_count}")
            return count_before, count_before, 0
        
        logger.warning(f"EMERGENCY CLEANUP: Reducing {count_before} snapshots to {target_count}")
        
        # Get all snapshots ordered by timestamp descending
        all_snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).all()
        
        # Strategy: Keep recent snapshots and sparse historical data
        snapshots_to_keep = []
        
        # Keep the most recent 100 snapshots
        snapshots_to_keep.extend(all_snapshots[:100])
        
        # For the rest, keep a sparse selection
        remaining = all_snapshots[100:]
        if remaining:
            # Calculate interval to achieve target count
            total_historical = target_count - 100
            if total_historical > 0 and len(remaining) > total_historical:
                # Keep every Nth snapshot
                interval = len(remaining) // total_historical
                for i in range(0, len(remaining), interval):
                    if len(snapshots_to_keep) < target_count:
                        snapshots_to_keep.append(remaining[i])
            else:
                # Keep all remaining if under target
                snapshots_to_keep.extend(remaining[:total_historical])
        
        # Get IDs to keep
        keep_ids = {s.id for s in snapshots_to_keep}
        
        # Delete everything else
        deleted_count = 0
        batch_size = 100
        
        for snapshot in all_snapshots:
            if snapshot.id not in keep_ids:
                # Collect IDs to delete
                to_delete = []
                for s in all_snapshots:
                    if s.id not in keep_ids:
                        to_delete.append(s.id)
                        if len(to_delete) >= batch_size:
                            MLBSnapshot.query.filter(MLBSnapshot.id.in_(to_delete)).delete(synchronize_session=False)
                            db.session.commit()
                            deleted_count += len(to_delete)
                            to_delete = []
                
                # Delete remaining batch
                if to_delete:
                    MLBSnapshot.query.filter(MLBSnapshot.id.in_(to_delete)).delete(synchronize_session=False)
                    db.session.commit()
                    deleted_count += len(to_delete)
                break
        
        count_after = MLBSnapshot.query.count()
        
        logger.warning(f"EMERGENCY CLEANUP complete: {count_before} -> {count_after} (deleted {count_before - count_after})")
        return count_before, count_after, count_before - count_after
        
    except Exception as e:
        logger.error(f"Error during emergency cleanup: {str(e)}")
        db.session.rollback()
        import traceback
        logger.error(traceback.format_exc())
        return count_before, count_before, 0