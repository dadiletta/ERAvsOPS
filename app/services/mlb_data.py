# app/services/mlb_data.py
import json
import os
from datetime import datetime
from flask import current_app
import time

# Import the MLB Stats API
try:
    import statsapi
    MLB_STATS_API_AVAILABLE = True
except ImportError:
    MLB_STATS_API_AVAILABLE = False
    print("MLB Stats API not available. Install with 'pip install MLB-StatsAPI'")

class MLBDataFetcher:
    """
    A class to fetch MLB team data using toddrob99's MLB-StatsAPI.
    """
    def __init__(self):
        # Check if MLB Stats API is available
        self.api_available = MLB_STATS_API_AVAILABLE
        self.current_year = datetime.now().year
        
    def get_all_team_stats(self, season=None, progress_callback=None):
        """Get ERA and OPS for all MLB teams using MLB Stats API
        
        Args:
            season: Optional season year
            progress_callback: Optional callback function(team_name, current, total)
              to report progress during updates
        """
        app = current_app._get_current_object()
        
        if season is None:
            season = self.current_year
            
        # Try to use MLB Stats API if available
        if self.api_available:
            app.logger.info(f"Fetching MLB team stats for season {season}")
            team_stats = self._get_stats_from_statsapi(season, progress_callback)
            if team_stats:
                app.logger.info(f"Retrieved {len(team_stats)} team stats from MLB Stats API")
                return team_stats
                
        # Fallback to cached data
        app.logger.warning("Falling back to cached data")
        return self._get_fallback_stats()
    
    def _get_stats_from_statsapi(self, season, progress_callback=None):
        """Get team stats from MLB Stats API with progress reporting"""
        team_stats = []
        app = current_app._get_current_object()
        
        try:
            # Get all active MLB teams
            app.logger.info("Looking up all active MLB teams...")
            teams = statsapi.lookup_team(active=True)
            
            # Filter to MLB teams only (sport_id=1)
            mlb_teams = [team for team in teams if team.get('sport', {}).get('id', 0) == 1]
            total_teams = len(mlb_teams)
            
            app.logger.info(f"Found {total_teams} MLB teams")
            
            for index, team in enumerate(mlb_teams):
                team_id = team['id']
                team_name = team['name']
                team_abbrev = team['abbreviation']
                
                # Current team number (1-based for display)
                current_team = index + 1
                
                try:
                    app.logger.info(f"Getting stats for {team_name} ({current_team}/{total_teams})...")
                    
                    # Call progress callback if provided
                    if progress_callback:
                        progress_callback(team_name, current_team, total_teams)
                    
                    # Get team pitching stats (for ERA)
                    pitching_stats = statsapi.get(
                        "team_stats",
                        {"teamId": team_id, "group": "pitching", "stats": "season", "season": season}
                    )
                    
                    # Get team hitting stats (for OPS)
                    hitting_stats = statsapi.get(
                        "team_stats",
                        {"teamId": team_id, "group": "hitting", "stats": "season", "season": season}
                    )
                    
                    # Extract ERA
                    era = None
                    if pitching_stats and 'stats' in pitching_stats:
                        for stat_group in pitching_stats['stats']:
                            if 'splits' in stat_group:
                                for split in stat_group['splits']:
                                    if 'stat' in split and 'era' in split['stat']:
                                        era = float(split['stat']['era'])
                                        break
                    
                    # Extract OPS
                    ops = None
                    if hitting_stats and 'stats' in hitting_stats:
                        for stat_group in hitting_stats['stats']:
                            if 'splits' in stat_group:
                                for split in stat_group['splits']:
                                    if 'stat' in split and 'ops' in split['stat']:
                                        ops = float(split['stat']['ops'])
                                        break
                    
                    # Get team nickname for logo filename
                    team_nickname = team_name.split()[-1]
                    
                    # Handle special cases for logo filenames
                    logo_name = team_nickname.lower()
                    if logo_name == "sox":
                        if "White" in team_name:
                            logo_name = "whitesox"
                        else:
                            logo_name = "redsox"
                    elif logo_name == "jays":
                        logo_name = "bluejays"
                    
                    # Only add teams with both ERA and OPS
                    if era is not None and ops is not None:
                        team_data = {
                            "id": team_id,
                            "name": team_nickname,
                            "full_name": team_name,
                            "abbreviation": team_abbrev,
                            "era": era,
                            "ops": ops,
                            "logo": f"/static/logos/{logo_name}.png"
                        }
                        team_stats.append(team_data)
                        app.logger.info(f"Added {team_name}: ERA={era:.2f}, OPS={ops:.3f}")
                    else:
                        app.logger.warning(f"Missing stats for {team_name} - ERA: {era}, OPS: {ops}")
                    
                    # Add a small delay to avoid hitting rate limits
                    time.sleep(0.5)
                    
                except Exception as e:
                    app.logger.error(f"Error getting stats for {team_name}: {str(e)}")
            
            app.logger.info(f"Completed: Retrieved stats for {len(team_stats)}/{total_teams} teams")
            
            return team_stats
            
        except Exception as e:
            app.logger.error(f"Error fetching teams from MLB Stats API: {str(e)}")
            import traceback
            app.logger.error(traceback.format_exc())
            return []
    
    def _get_fallback_stats(self):
        """Return fallback stats from cache file if available"""
        app = current_app._get_current_object()
        cache_file = app.config['CACHE_FILE']
        
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                app.logger.error(f"Error reading cache file: {str(e)}")
        
        # Return hardcoded fallback data if cache file not available
        app.logger.warning("Using hardcoded fallback data")
        return [
            {"id": 121, "name": "Mets", "full_name": "New York Mets", "abbreviation": "NYM", "era": 2.00, "ops": 0.700, "logo": "/static/logos/mets.png"},
            {"id": 137, "name": "Giants", "full_name": "San Francisco Giants", "abbreviation": "SF", "era": 2.55, "ops": 0.650, "logo": "/static/logos/giants.png"},
            {"id": 113, "name": "Reds", "full_name": "Cincinnati Reds", "abbreviation": "CIN", "era": 2.90, "ops": 0.610, "logo": "/static/logos/reds.png"},
            # Add remaining teams from your hardcoded fallback data...
            {"id": 134, "name": "Pirates", "full_name": "Pittsburgh Pirates", "abbreviation": "PIT", "era": 4.90, "ops": 0.600, "logo": "/static/logos/pirates.png"}
        ]