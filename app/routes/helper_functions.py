# app/routes/helper_functions.py

import json
import os
import logging
from datetime import datetime, timezone, timedelta
from flask import current_app
from app import db, validate_mlb_data
from app.models.mlb_snapshot import MLBSnapshot
from app.services.mlb_data import MLBDataFetcher

# Set up logging
logger = logging.getLogger(__name__)

# Global update status
update_status = {
    "in_progress": False,
    "teams_updated": 0,
    "total_teams": 0,
    "last_updated": None,
    "snapshot_count": 0,
    "error": None,
    "collected_data": [],  # New: Store collected team data during batch updates
}

def ensure_division_info(teams):
    """
    Ensure all teams have division and league information
    
    Args:
        teams: List of team data dictionaries
    
    Returns:
        List of team data with division info
    """
    # Division mapping reference
    division_map = {
        # AL East
        110: {'division': 'AL East', 'league': 'American League'},  # Orioles
        111: {'division': 'AL East', 'league': 'American League'},  # Red Sox
        147: {'division': 'AL East', 'league': 'American League'},  # Yankees
        139: {'division': 'AL East', 'league': 'American League'},  # Rays
        141: {'division': 'AL East', 'league': 'American League'},  # Blue Jays
        
        # AL Central
        145: {'division': 'AL Central', 'league': 'American League'},  # White Sox
        114: {'division': 'AL Central', 'league': 'American League'},  # Guardians
        116: {'division': 'AL Central', 'league': 'American League'},  # Tigers
        118: {'division': 'AL Central', 'league': 'American League'},  # Royals
        142: {'division': 'AL Central', 'league': 'American League'},  # Twins
        
        # AL West
        108: {'division': 'AL West', 'league': 'American League'},  # Angels
        117: {'division': 'AL West', 'league': 'American League'},  # Astros
        133: {'division': 'AL West', 'league': 'American League'},  # Athletics
        136: {'division': 'AL West', 'league': 'American League'},  # Mariners
        140: {'division': 'AL West', 'league': 'American League'},  # Rangers
        
        # NL East
        144: {'division': 'NL East', 'league': 'National League'},  # Braves
        146: {'division': 'NL East', 'league': 'National League'},  # Marlins
        121: {'division': 'NL East', 'league': 'National League'},  # Mets
        143: {'division': 'NL East', 'league': 'National League'},  # Phillies
        120: {'division': 'NL East', 'league': 'National League'},  # Nationals
        
        # NL Central
        112: {'division': 'NL Central', 'league': 'National League'},  # Cubs
        113: {'division': 'NL Central', 'league': 'National League'},  # Reds
        158: {'division': 'NL Central', 'league': 'National League'},  # Brewers
        134: {'division': 'NL Central', 'league': 'National League'},  # Pirates
        138: {'division': 'NL Central', 'league': 'National League'},  # Cardinals
        
        # NL West
        109: {'division': 'NL West', 'league': 'National League'},  # Diamondbacks
        115: {'division': 'NL West', 'league': 'National League'},  # Rockies
        119: {'division': 'NL West', 'league': 'National League'},  # Dodgers
        135: {'division': 'NL West', 'league': 'National League'},  # Padres
        137: {'division': 'NL West', 'league': 'National League'},  # Giants
    }
    
    # Add division info to any teams that are missing it
    for team in teams:
        team_id = team.get('id')
        
        # If division info is missing but we have the team ID
        if (('division' not in team or 'league' not in team) and 
            team_id and team_id in division_map):
            # Add division info
            team['division'] = division_map[team_id]['division']
            team['league'] = division_map[team_id]['league']
    
    return teams

def get_latest_data(must_exist=False):
    """Get the latest team data from the database with validation"""
    logger.info("Retrieving latest data from database")
    
    try:
        # Get snapshot count
        count = MLBSnapshot.query.count()
        update_status["snapshot_count"] = count
        
        # Get the most recent snapshot
        snapshot = MLBSnapshot.get_latest()
        
        if snapshot:
            # Check if data is fresh using intelligent rules
            timestamp = snapshot.timestamp_aware
            now = datetime.now(timezone.utc)
            cache_age = now - timestamp 
            is_fresh = determine_data_freshness(timestamp, now)
            
            # Get teams and validate
            teams = snapshot.teams
            
            # Validate teams on retrieval
            teams = validate_mlb_data(teams)
            
            # Ensure all teams have division info
            teams = ensure_division_info(teams)
            
            # If data is valid and fresh, update the cache file
            if teams and is_fresh:
                cache_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data_cache.json')
                try:
                    with open(cache_file, 'w') as f:
                        json.dump(teams, f)
                    logger.info("Updated cache file with fresh data")
                except Exception as e:
                    logger.error(f"Failed to update cache file: {str(e)}")
            
            # Add context about why data is considered fresh
            context = ""
            if is_fresh and not (cache_age.total_seconds() < current_app.config['CACHE_TIMEOUT']):
                if not is_mlb_season_active(now):
                    context = " (offseason)"
                elif not are_games_likely_being_played(now):
                    context = " (no games in progress)"
            
            logger.info(f"Latest snapshot found from {timestamp}. Fresh: {is_fresh}{context}, Age: {cache_age.total_seconds()} seconds, Valid teams: {len(teams)}")
            return teams, True, is_fresh, timestamp.strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        error_msg = f"Error reading from database: {str(e)}"
        logger.error(error_msg)
        current_app.logger.error(error_msg)
    
    # If no valid data found in database, try to use cache file
    logger.info("No valid data found in database, checking cache file")
    cache_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data_cache.json')
    
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r') as f:
                teams = json.load(f)
                
            # Validate teams from cache
            teams = validate_mlb_data(teams)
            
            # Ensure all teams have division info
            teams = ensure_division_info(teams)
            
            if teams:
                # Check cache file age
                cache_mtime = datetime.fromtimestamp(os.path.getmtime(cache_file), timezone.utc)
                cache_age = datetime.now(timezone.utc) - cache_mtime
                is_fresh = cache_age.total_seconds() < current_app.config['CACHE_TIMEOUT']
                
                logger.info(f"Loaded {len(teams)} teams from cache file. Cache age: {cache_age.total_seconds()} seconds")
                return teams, False, is_fresh, cache_mtime.strftime("%Y-%m-%d %H:%M:%S")
        except Exception as e:
            error_msg = f"Error reading cache file: {str(e)}"
            logger.error(error_msg)
    
    # If must_exist is True and we couldn't find data, raise an exception
    if must_exist:
        raise Exception("No MLB data found in database or cache file")
        
    # Otherwise, return an empty list with appropriate flags
    return [], False, False, "No data available"

def cleanup_old_snapshots(limit):
    """Remove old snapshots exceeding the limit"""
    try:
        # Get total count of snapshots
        count = MLBSnapshot.query.count()
        
        # If we're over the limit, delete the oldest ones
        if count > limit:
            # Calculate how many to delete
            to_delete = count - limit
            
            # Get the oldest snapshots
            oldest_snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.asc()).limit(to_delete).all()
            
            # Delete them
            for snapshot in oldest_snapshots:
                db.session.delete(snapshot)
            
            db.session.commit()
            logger.info(f"Cleaned up {len(oldest_snapshots)} old snapshots, keeping most recent {limit}")
    except Exception as e:
        error_msg = f"Error cleaning up old snapshots: {str(e)}"
        logger.error(error_msg)

def update_mlb_data(step=1, total_steps=30):
    """Update MLB data in larger batches with optimized processing"""
    global update_status
    
    # Create MLB data fetcher instance
    fetcher = MLBDataFetcher()
    
    # Check if MLB Stats API is available
    if not fetcher.api_available:
        error_msg = "MLB Stats API is not available. Cannot update data."
        logger.error(error_msg)
        update_status["error"] = error_msg
        update_status["in_progress"] = False
        return False
    
    # Get total team count if not already set
    if update_status["total_teams"] == 0:
        update_status["total_teams"] = len(fetcher.get_mlb_teams())
    
    # Calculate start index
    start_index = update_status["teams_updated"]
    
    # Skip if already completed
    if start_index >= update_status["total_teams"]:
        logger.info("Update already completed")
        update_status["in_progress"] = False
        return True
    
    logger.info(f"Processing teams starting at index {start_index} with step size {step}")
    
    try:
        # Get a batch of team stats
        batch = fetcher.get_team_stats_batch(start_index, step)
        
        # Log the batch results
        logger.info(f"Received batch of {len(batch)} teams")
        
        # Update progress
        update_status["teams_updated"] += len(batch)
        
        # If made progress, collect the data
        if len(batch) > 0:
            # Add batch to collected data
            update_status["collected_data"].extend(batch)
            logger.info(f"Added {len(batch)} teams to collected data, total now: {len(update_status['collected_data'])}")
            
            # Create incremental snapshot for immediate UI visibility
            # This allows historical data to be immediately available
            try:
                # Get existing data
                existing_data, _, _, _ = get_latest_data()
                
                # Update existing data with new team data - just this batch
                updated = False
                for new_team in batch:  # Only process this batch, not all collected data
                    # Find matching team in existing data
                    for i, existing_team in enumerate(existing_data):
                        if existing_team.get('id') == new_team.get('id'):
                            # Update team
                            existing_data[i] = new_team
                            updated = True
                            break
                    else:
                        # Team not found, add it
                        existing_data.append(new_team)
                        updated = True
                
                # If updates were made, validate and save to database
                if updated:
                    # Validate again
                    validated_data = validate_mlb_data(existing_data)
                    
                    # Save to database as a new snapshot (once per batch)
                    snapshot = MLBSnapshot(
                        timestamp=datetime.now(timezone.utc),
                        data=json.dumps(validated_data)
                    )
                    db.session.add(snapshot)
                    db.session.commit()
                    
                    logger.info(f"Created an incremental snapshot with {len(validated_data)} teams")
                    
                    # Update snapshot count in status
                    update_status["snapshot_count"] = MLBSnapshot.query.count()
            except Exception as e:
                logger.error(f"Error creating incremental snapshot: {str(e)}")
                # Continue despite error - this is just for immediate updates
        else:
            logger.warning(f"No teams were processed in this batch (start_index={start_index}, step={step})")
            update_status["error"] = "No teams processed in batch"
        
        # If all teams updated, perform final cleanup
        if update_status["teams_updated"] >= update_status["total_teams"]:
            try:
                # Reset collected data for next update
                update_status["collected_data"] = []
                
                # Update status
                timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                update_status["in_progress"] = False
                update_status["last_updated"] = timestamp
                logger.info(f"Update completed at {timestamp}")
                
                # Reset for next update
                update_status["teams_updated"] = 0
                update_status["total_teams"] = 0
                
                # Check if we need to clean up old snapshots
                history_limit = current_app.config.get('HISTORY_LIMIT', 30)
                if history_limit > 0:
                    cleanup_old_snapshots(history_limit)
                
            except Exception as e:
                error_msg = f"Error in final update cleanup: {str(e)}"
                logger.error(error_msg)
                import traceback
                logger.error(traceback.format_exc())
                update_status["error"] = error_msg
        
        return True
        
    except Exception as e:
        error_msg = f"Error in update process: {str(e)}"
        logger.error(error_msg)
        import traceback
        logger.error(traceback.format_exc())
        update_status["error"] = error_msg
        return False

def is_mlb_season_active(date=None):
    """
    Determine if the date falls within the active MLB season
    
    Args:
        date: Optional date to check (defaults to current date)
    
    Returns:
        Boolean indicating if MLB season is active
    """
    if date is None:
        date = datetime.now(timezone.utc)
    
    # MLB season typically runs from early April to early October
    # These dates can be adjusted each year
    year = date.year
    season_start = datetime(year, 4, 1, tzinfo=timezone.utc)  # April 1st
    season_end = datetime(year, 10, 15, tzinfo=timezone.utc)  # October 15th
    
    return season_start <= date <= season_end

def are_games_likely_being_played(date=None):
    """
    Determine if MLB games are likely being played at this time
    
    Args:
        date: Optional datetime to check (defaults to current datetime)
    
    Returns:
        Boolean indicating if games are likely being played
    """
    if date is None:
        date = datetime.now(timezone.utc)
    
    # Check if we're in season first
    if not is_mlb_season_active(date):
        return False
    
    # Convert to US Eastern time (where most MLB decisions are based)
    # This is a simplified approach - for proper timezone conversion you'd use pytz
    # Assuming date is in UTC, ET is UTC-4 during daylight saving time
    et_hour = (date.hour - 4) % 24
    
    # Most MLB games occur between 1pm and 11pm ET
    # Also, fewer games on Monday than other days
    if date.weekday() == 0:  # Monday
        # Fewer games on Mondays, often evening only
        return 18 <= et_hour <= 23  # 6pm to 11pm ET
    else:
        # Other days have afternoon and evening games
        return 13 <= et_hour <= 23  # 1pm to 11pm ET

def determine_data_freshness(timestamp, now=None):
    """
    Determine if data is fresh based on intelligent rules
    
    Args:
        timestamp: The timestamp of the data
        now: Optional current datetime (defaults to current time)
    
    Returns:
        Boolean indicating if data is fresh
    """
    if now is None:
        now = datetime.now(timezone.utc)
    
    cache_age = now - timestamp
    cache_age_seconds = cache_age.total_seconds()
    
    # Regular cache timeout (1 hour by default)
    regular_timeout = current_app.config['CACHE_TIMEOUT']
    
    # Longer timeout for off-hours/season (24 hours)
    extended_timeout = 86400  # 24 hours in seconds
    
    # Use regular timeout during active game times
    if is_mlb_season_active(now) and are_games_likely_being_played(now):
        return cache_age_seconds < regular_timeout
    
    # Use extended timeout for off-hours/season
    return cache_age_seconds < extended_timeout
