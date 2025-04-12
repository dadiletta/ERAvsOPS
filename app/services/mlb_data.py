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
        self._mlb_teams = None
        
    def get_mlb_teams(self):
        """Get all active MLB teams"""
        if self._mlb_teams is None:
            try:
                # Get all active teams
                teams = statsapi.lookup_team(active=True)
                
                # Filter to MLB teams only (sport_id=1)
                self._mlb_teams = [team for team in teams if team.get('sport', {}).get('id', 0) == 1]
                current_app.logger.info(f"Found {len(self._mlb_teams)} MLB teams")
            except Exception as e:
                current_app.logger.error(f"Error fetching teams: {str(e)}")
                self._mlb_teams = []
                
        return self._mlb_teams
        
    def get_all_team_stats(self, season=None):
        """Get ERA and OPS for all MLB teams using MLB Stats API
        
        Args:
            season: Optional season year
        """
        if season is None:
            season = self.current_year
            
        # Try to use MLB Stats API if available
        if self.api_available:
            current_app.logger.info(f"Fetching MLB team stats for season {season}")
            team_stats = []
            
            # Get all teams
            mlb_teams = self.get_mlb_teams()
            total_teams = len(mlb_teams)
            
            # Process all teams
            for index, team in enumerate(mlb_teams):
                team_data = self._fetch_team_stats(team, season)
                if team_data:
                    team_stats.append(team_data)
            
            current_app.logger.info(f"Retrieved {len(team_stats)} team stats from MLB Stats API")
            return team_stats
                
        # Fallback to cached data
        current_app.logger.warning("MLB Stats API not available, falling back to cached data")
        return self._get_fallback_stats()
    
    def get_team_stats_batch(self, start_index=0, batch_size=1, season=None):
        """Get stats for a batch of teams
        
        Args:
            start_index: Starting index in teams list
            batch_size: Number of teams to process
            season: Optional season year
        """
        if season is None:
            season = self.current_year
            
        if not self.api_available:
            current_app.logger.warning("MLB Stats API not available")
            return []
            
        # Get all teams
        mlb_teams = self.get_mlb_teams()
        total_teams = len(mlb_teams)
        
        # Validate indices
        if start_index >= total_teams:
            current_app.logger.warning(f"Start index {start_index} exceeds team count {total_teams}")
            return []
            
        # Calculate end index
        end_index = min(start_index + batch_size, total_teams)
        
        # Process the batch
        team_stats = []
        for index in range(start_index, end_index):
            team = mlb_teams[index]
            team_data = self._fetch_team_stats(team, season)
            if team_data:
                team_stats.append(team_data)
                current_app.logger.info(f"Processed team {index+1}/{total_teams}: {team['name']}")
            
            # Add a small delay between API calls
            time.sleep(0.5)
            
        return team_stats
    
    def _fetch_team_stats(self, team, season):
        """Fetch stats for a specific team
        
        Args:
            team: Team dict with id, name, etc.
            season: Season year
        """
        team_id = team['id']
        team_name = team['name']
        team_abbrev = team['abbreviation']
        
        try:
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
                return team_data
            else:
                current_app.logger.warning(f"Missing stats for {team_name} - ERA: {era}, OPS: {ops}")
                return None
                
        except Exception as e:
            current_app.logger.error(f"Error getting stats for {team_name}: {str(e)}")
            return None
    
    def _get_fallback_stats(self):
        """Return fallback stats from cache file if available"""
        cache_file = current_app.config['CACHE_FILE']
        
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                current_app.logger.error(f"Error reading cache file: {str(e)}")
        
        # Return hardcoded fallback data if cache file not available
        current_app.logger.warning("Using hardcoded fallback data")
        return [
            {"id": 121, "name": "Mets", "full_name": "New York Mets", "abbreviation": "NYM", "era": 2.00, "ops": 0.700, "logo": "/static/logos/mets.png"},
            {"id": 137, "name": "Giants", "full_name": "San Francisco Giants", "abbreviation": "SF", "era": 2.55, "ops": 0.650, "logo": "/static/logos/giants.png"},
            {"id": 113, "name": "Reds", "full_name": "Cincinnati Reds", "abbreviation": "CIN", "era": 2.90, "ops": 0.610, "logo": "/static/logos/reds.png"},
            # Add remaining teams from your hardcoded fallback data...
            {"id": 134, "name": "Pirates", "full_name": "Pittsburgh Pirates", "abbreviation": "PIT", "era": 4.90, "ops": 0.600, "logo": "/static/logos/pirates.png"}
        ]