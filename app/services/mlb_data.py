# app/services/mlb_data.py
import json
import os
from datetime import datetime
from flask import current_app
import time
import logging
import random

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('mlb_data')

# Import the MLB Stats API
try:
    import statsapi
    MLB_STATS_API_AVAILABLE = True
    logger.info("MLB Stats API successfully imported")
except ImportError:
    MLB_STATS_API_AVAILABLE = False
    logger.error("MLB Stats API not available. Install with 'pip install MLB-StatsAPI'")
    print("MLB Stats API not available. Install with 'pip install MLB-StatsAPI'")

class MLBDataFetcher:
    """
    A class to fetch MLB team data using toddrob99's MLB-StatsAPI.
    """
    def __init__(self):
        # Check if MLB Stats API is available
        self.api_available = MLB_STATS_API_AVAILABLE
        logger.info(f"MLBDataFetcher initialized with API available: {self.api_available}")
        
        self.current_year = datetime.now().year
        
        # Hardcoded list of MLB team IDs with names (based on MLB API data)
        # This replaces the broken lookup_team() function
        self._mlb_teams = [
            {'id': 108, 'name': 'Angels', 'full_name': 'Los Angeles Angels', 'abbreviation': 'LAA'},
            {'id': 109, 'name': 'Diamondbacks', 'full_name': 'Arizona Diamondbacks', 'abbreviation': 'ARI'},
            {'id': 110, 'name': 'Orioles', 'full_name': 'Baltimore Orioles', 'abbreviation': 'BAL'},
            {'id': 111, 'name': 'Red Sox', 'full_name': 'Boston Red Sox', 'abbreviation': 'BOS'},
            {'id': 112, 'name': 'Cubs', 'full_name': 'Chicago Cubs', 'abbreviation': 'CHC'},
            {'id': 113, 'name': 'Reds', 'full_name': 'Cincinnati Reds', 'abbreviation': 'CIN'},
            {'id': 114, 'name': 'Guardians', 'full_name': 'Cleveland Guardians', 'abbreviation': 'CLE'},
            {'id': 115, 'name': 'Rockies', 'full_name': 'Colorado Rockies', 'abbreviation': 'COL'},
            {'id': 116, 'name': 'Tigers', 'full_name': 'Detroit Tigers', 'abbreviation': 'DET'},
            {'id': 117, 'name': 'Astros', 'full_name': 'Houston Astros', 'abbreviation': 'HOU'},
            {'id': 118, 'name': 'Royals', 'full_name': 'Kansas City Royals', 'abbreviation': 'KC'},
            {'id': 119, 'name': 'Dodgers', 'full_name': 'Los Angeles Dodgers', 'abbreviation': 'LAD'},
            {'id': 120, 'name': 'Nationals', 'full_name': 'Washington Nationals', 'abbreviation': 'WSH'},
            {'id': 121, 'name': 'Mets', 'full_name': 'New York Mets', 'abbreviation': 'NYM'},
            {'id': 133, 'name': 'Athletics', 'full_name': 'Oakland Athletics', 'abbreviation': 'OAK'},
            {'id': 134, 'name': 'Pirates', 'full_name': 'Pittsburgh Pirates', 'abbreviation': 'PIT'},
            {'id': 135, 'name': 'Padres', 'full_name': 'San Diego Padres', 'abbreviation': 'SD'},
            {'id': 136, 'name': 'Mariners', 'full_name': 'Seattle Mariners', 'abbreviation': 'SEA'},
            {'id': 137, 'name': 'Giants', 'full_name': 'San Francisco Giants', 'abbreviation': 'SF'},
            {'id': 138, 'name': 'Cardinals', 'full_name': 'St. Louis Cardinals', 'abbreviation': 'STL'},
            {'id': 139, 'name': 'Rays', 'full_name': 'Tampa Bay Rays', 'abbreviation': 'TB'},
            {'id': 140, 'name': 'Rangers', 'full_name': 'Texas Rangers', 'abbreviation': 'TEX'},
            {'id': 141, 'name': 'Blue Jays', 'full_name': 'Toronto Blue Jays', 'abbreviation': 'TOR'},
            {'id': 142, 'name': 'Twins', 'full_name': 'Minnesota Twins', 'abbreviation': 'MIN'},
            {'id': 143, 'name': 'Phillies', 'full_name': 'Philadelphia Phillies', 'abbreviation': 'PHI'},
            {'id': 144, 'name': 'Braves', 'full_name': 'Atlanta Braves', 'abbreviation': 'ATL'},
            {'id': 145, 'name': 'White Sox', 'full_name': 'Chicago White Sox', 'abbreviation': 'CWS'},
            {'id': 146, 'name': 'Marlins', 'full_name': 'Miami Marlins', 'abbreviation': 'MIA'},
            {'id': 147, 'name': 'Yankees', 'full_name': 'New York Yankees', 'abbreviation': 'NYY'},
            {'id': 158, 'name': 'Brewers', 'full_name': 'Milwaukee Brewers', 'abbreviation': 'MIL'}
        ]
        
        logger.info(f"Initialized with {len(self._mlb_teams)} hardcoded MLB teams")
        
        # Rate limiting settings
        self.last_request_time = 0
        self.min_request_interval = 2.0  # Minimum seconds between requests
        
    def get_mlb_teams(self):
        """Get all MLB teams"""
        return self._mlb_teams
    
    def _rate_limit_request(self):
        """Apply rate limiting to API requests"""
        current_time = time.time()
        elapsed_since_last = current_time - self.last_request_time
        
        if elapsed_since_last < self.min_request_interval:
            # Add a random component to avoid synchronized requests
            sleep_time = self.min_request_interval - elapsed_since_last + random.uniform(0.5, 1.5)
            logger.info(f"Rate limiting: Sleeping for {sleep_time:.2f} seconds")
            time.sleep(sleep_time)
        
        self.last_request_time = time.time()
        
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
        logger.info(f"Processing batch: start_index={start_index}, batch_size={batch_size}")
        current_app.logger.info(f"Processing batch: start_index={start_index}, batch_size={batch_size}")
        
        if season is None:
            season = self.current_year
            
        if not self.api_available:
            error_msg = "MLB Stats API not available for batch processing"
            logger.warning(error_msg)
            current_app.logger.warning(error_msg)
            return []
            
        # Get all teams
        mlb_teams = self.get_mlb_teams()
        total_teams = len(mlb_teams)
        
        logger.info(f"Total teams available: {total_teams}")
        
        # Validate indices
        if start_index >= total_teams:
            error_msg = f"Start index {start_index} exceeds team count {total_teams}"
            logger.warning(error_msg)
            current_app.logger.warning(error_msg)
            return []
            
        # Calculate end index - ONLY PROCESS ONE TEAM AT A TIME regardless of batch_size
        end_index = min(start_index + 1, total_teams)
        
        logger.info(f"Processing team at index {start_index}")
        
        # Process the batch - LIMIT TO 1 TEAM to avoid rate limits
        team_stats = []
        for index in range(start_index, end_index):
            try:
                team = mlb_teams[index]
                logger.info(f"Processing team {index+1}/{total_teams}: {team['name']}")
                
                # Try up to 3 times with increasing delays
                for attempt in range(3):
                    try:
                        team_data = self._fetch_team_stats(team, season)
                        if team_data:
                            team_stats.append(team_data)
                            logger.info(f"Successfully processed {team['name']} on attempt {attempt+1}")
                            break
                        else:
                            logger.warning(f"Failed to get stats for {team['name']} on attempt {attempt+1}")
                            time.sleep(2 + attempt * 2)  # Increase delay with each attempt
                    except Exception as e:
                        logger.error(f"Error on attempt {attempt+1}: {str(e)}")
                        time.sleep(2 + attempt * 2)  # Increase delay with each attempt
                
                # Add a delay after processing a team (successful or not)
                time.sleep(3.0 + random.uniform(1.0, 2.0))
                
            except Exception as e:
                error_msg = f"Error processing team at index {index}: {str(e)}"
                logger.error(error_msg)
                current_app.logger.error(error_msg)
        
        logger.info(f"Batch processing complete. Retrieved stats for {len(team_stats)} teams")
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
            logger.info(f"Fetching stats for {team_name} (ID: {team_id})")
            
            # Apply rate limiting before first request
            self._rate_limit_request()
            
            # Get team pitching stats (for ERA)
            logger.info(f"Fetching pitching stats for {team_name}")
            pitching_stats = statsapi.get(
                "team_stats",
                {"teamId": team_id, "group": "pitching", "stats": "season", "season": season}
            )
            
            # Apply rate limiting again before second request
            self._rate_limit_request()
            
            # Get team hitting stats (for OPS)
            logger.info(f"Fetching hitting stats for {team_name}")
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
                                logger.info(f"{team_name} ERA: {era}")
                                break
            
            # Extract OPS
            ops = None
            if hitting_stats and 'stats' in hitting_stats:
                for stat_group in hitting_stats['stats']:
                    if 'splits' in stat_group:
                        for split in stat_group['splits']:
                            if 'stat' in split and 'ops' in split['stat']:
                                ops = float(split['stat']['ops'])
                                logger.info(f"{team_name} OPS: {ops}")
                                break
            
            # Get proper logo filename from team name
            logo_name = team_name.lower()
            
            # Handle special cases for logo filenames
            if team_name == "Red Sox":
                logo_name = "redsox"
            elif team_name == "White Sox":
                logo_name = "whitesox"
            elif team_name == "Blue Jays":
                logo_name = "bluejays"
            
            # Only add teams with both ERA and OPS
            if era is not None and ops is not None:
                team_data = {
                    "id": team_id,
                    "name": team_name,
                    "full_name": team['full_name'],
                    "abbreviation": team_abbrev,
                    "era": era,
                    "ops": ops,
                    "logo": f"/static/logos/{logo_name}.png"
                }
                logger.info(f"Successfully processed {team_name}")
                return team_data
            else:
                logger.warning(f"Missing stats for {team_name} - ERA: {era}, OPS: {ops}")
                return None
                
        except Exception as e:
            error_msg = f"Error getting stats for {team_name}: {str(e)}"
            logger.error(error_msg)
            current_app.logger.error(error_msg)
            import traceback
            logger.error(traceback.format_exc())
            return None
    
    def _get_fallback_stats(self):
        """Return fallback stats from cache file if available"""
        logger.info("Using fallback stats")
        cache_file = current_app.config['CACHE_FILE']
        
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r') as f:
                    data = json.load(f)
                    logger.info(f"Loaded {len(data)} teams from cache file")
                    return data
            except Exception as e:
                error_msg = f"Error reading cache file: {str(e)}"
                logger.error(error_msg)
                current_app.logger.error(error_msg)
        
        # Return hardcoded fallback data if cache file not available
        logger.warning("Using hardcoded fallback data")
        current_app.logger.warning("Using hardcoded fallback data")
        return [
            {"id": 121, "name": "Mets", "full_name": "New York Mets", "abbreviation": "NYM", "era": 2.00, "ops": 0.700, "logo": "/static/logos/mets.png"},
            {"id": 137, "name": "Giants", "full_name": "San Francisco Giants", "abbreviation": "SF", "era": 2.55, "ops": 0.650, "logo": "/static/logos/giants.png"},
            {"id": 113, "name": "Reds", "full_name": "Cincinnati Reds", "abbreviation": "CIN", "era": 2.90, "ops": 0.610, "logo": "/static/logos/reds.png"},
            {"id": 118, "name": "Royals", "full_name": "Kansas City Royals", "abbreviation": "KC", "era": 3.00, "ops": 0.650, "logo": "/static/logos/royals.png"},
            {"id": 139, "name": "Rays", "full_name": "Tampa Bay Rays", "abbreviation": "TB", "era": 3.10, "ops": 0.700, "logo": "/static/logos/rays.png"},
            {"id": 119, "name": "Dodgers", "full_name": "Los Angeles Dodgers", "abbreviation": "LAD", "era": 3.10, "ops": 0.740, "logo": "/static/logos/dodgers.png"},
            {"id": 147, "name": "Yankees", "full_name": "New York Yankees", "abbreviation": "NYY", "era": 4.60, "ops": 0.850, "logo": "/static/logos/yankees.png"}
        ]