# app/services/mlb_data.py

"""
MLB data fetching service using toddrob99's MLB-StatsAPI.

MLBDataFetcher handles:
- Season detection: Jan-Mar uses previous year (offseason), Apr-Dec uses current year.
- Per-team stat fetching: ERA (pitching), OPS (hitting), W/L record, run differential.
- Playoff context: div_rank, wc_rank, wc_gb, elim_num from standings_data().
- Standings cache: standings_data() is called once per update cycle (not per team)
  to avoid 30 duplicate API calls.
- Rate limiting: configurable delay between API requests (default 0.5s).
"""

import json
import os
from datetime import datetime, timezone
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
    Fetches MLB team data using toddrob99's MLB-StatsAPI.

    Each instance determines the current MLB season on init and caches
    standings_data() results for the duration of an update cycle so we
    only call that endpoint once (instead of 30 times, once per team).

    Key methods:
        get_all_team_stats(season) — fetch all 30 teams sequentially
        get_team_stats_batch(start, count) — fetch a batch of teams
    """
    def __init__(self):
        # Check if MLB Stats API is available
        self.api_available = MLB_STATS_API_AVAILABLE
        logger.info(f"MLBDataFetcher initialized with API available: {self.api_available}")

        # Determine current MLB season (not calendar year).
        # MLB Opening Day falls in late March, so treat March 20+ as the current season.
        # January through March 19 is considered the previous season (off-season).
        now = datetime.now(timezone.utc)
        self.current_year = now.year if (now.month > 3 or (now.month == 3 and now.day >= 20)) else now.year - 1
        logger.info(f"Using season year: {self.current_year} (current calendar year: {now.year}, month: {now.month}, day: {now.day})")
        
        # Hardcoded list of MLB team IDs with names and division information
        self._mlb_teams = [
            {'id': 108, 'name': 'Angels', 'full_name': 'Los Angeles Angels', 'abbreviation': 'LAA', 'division': 'AL West', 'league': 'American League'},
            {'id': 109, 'name': 'Diamondbacks', 'full_name': 'Arizona Diamondbacks', 'abbreviation': 'ARI', 'division': 'NL West', 'league': 'National League'},
            {'id': 110, 'name': 'Orioles', 'full_name': 'Baltimore Orioles', 'abbreviation': 'BAL', 'division': 'AL East', 'league': 'American League'},
            {'id': 111, 'name': 'Red Sox', 'full_name': 'Boston Red Sox', 'abbreviation': 'BOS', 'division': 'AL East', 'league': 'American League'},
            {'id': 112, 'name': 'Cubs', 'full_name': 'Chicago Cubs', 'abbreviation': 'CHC', 'division': 'NL Central', 'league': 'National League'},
            {'id': 113, 'name': 'Reds', 'full_name': 'Cincinnati Reds', 'abbreviation': 'CIN', 'division': 'NL Central', 'league': 'National League'},
            {'id': 114, 'name': 'Guardians', 'full_name': 'Cleveland Guardians', 'abbreviation': 'CLE', 'division': 'AL Central', 'league': 'American League'},
            {'id': 115, 'name': 'Rockies', 'full_name': 'Colorado Rockies', 'abbreviation': 'COL', 'division': 'NL West', 'league': 'National League'},
            {'id': 116, 'name': 'Tigers', 'full_name': 'Detroit Tigers', 'abbreviation': 'DET', 'division': 'AL Central', 'league': 'American League'},
            {'id': 117, 'name': 'Astros', 'full_name': 'Houston Astros', 'abbreviation': 'HOU', 'division': 'AL West', 'league': 'American League'},
            {'id': 118, 'name': 'Royals', 'full_name': 'Kansas City Royals', 'abbreviation': 'KC', 'division': 'AL Central', 'league': 'American League'},
            {'id': 119, 'name': 'Dodgers', 'full_name': 'Los Angeles Dodgers', 'abbreviation': 'LAD', 'division': 'NL West', 'league': 'National League'},
            {'id': 120, 'name': 'Nationals', 'full_name': 'Washington Nationals', 'abbreviation': 'WSH', 'division': 'NL East', 'league': 'National League'},
            {'id': 121, 'name': 'Mets', 'full_name': 'New York Mets', 'abbreviation': 'NYM', 'division': 'NL East', 'league': 'National League'},
            {'id': 133, 'name': 'Athletics', 'full_name': 'Oakland Athletics', 'abbreviation': 'OAK', 'division': 'AL West', 'league': 'American League'},
            {'id': 134, 'name': 'Pirates', 'full_name': 'Pittsburgh Pirates', 'abbreviation': 'PIT', 'division': 'NL Central', 'league': 'National League'},
            {'id': 135, 'name': 'Padres', 'full_name': 'San Diego Padres', 'abbreviation': 'SD', 'division': 'NL West', 'league': 'National League'},
            {'id': 136, 'name': 'Mariners', 'full_name': 'Seattle Mariners', 'abbreviation': 'SEA', 'division': 'AL West', 'league': 'American League'},
            {'id': 137, 'name': 'Giants', 'full_name': 'San Francisco Giants', 'abbreviation': 'SF', 'division': 'NL West', 'league': 'National League'},
            {'id': 138, 'name': 'Cardinals', 'full_name': 'St. Louis Cardinals', 'abbreviation': 'STL', 'division': 'NL Central', 'league': 'National League'},
            {'id': 139, 'name': 'Rays', 'full_name': 'Tampa Bay Rays', 'abbreviation': 'TB', 'division': 'AL East', 'league': 'American League'},
            {'id': 140, 'name': 'Rangers', 'full_name': 'Texas Rangers', 'abbreviation': 'TEX', 'division': 'AL West', 'league': 'American League'},
            {'id': 141, 'name': 'Blue Jays', 'full_name': 'Toronto Blue Jays', 'abbreviation': 'TOR', 'division': 'AL East', 'league': 'American League'},
            {'id': 142, 'name': 'Twins', 'full_name': 'Minnesota Twins', 'abbreviation': 'MIN', 'division': 'AL Central', 'league': 'American League'},
            {'id': 143, 'name': 'Phillies', 'full_name': 'Philadelphia Phillies', 'abbreviation': 'PHI', 'division': 'NL East', 'league': 'National League'},
            {'id': 144, 'name': 'Braves', 'full_name': 'Atlanta Braves', 'abbreviation': 'ATL', 'division': 'NL East', 'league': 'National League'},
            {'id': 145, 'name': 'White Sox', 'full_name': 'Chicago White Sox', 'abbreviation': 'CWS', 'division': 'AL Central', 'league': 'American League'},
            {'id': 146, 'name': 'Marlins', 'full_name': 'Miami Marlins', 'abbreviation': 'MIA', 'division': 'NL East', 'league': 'National League'},
            {'id': 147, 'name': 'Yankees', 'full_name': 'New York Yankees', 'abbreviation': 'NYY', 'division': 'AL East', 'league': 'American League'},
            {'id': 158, 'name': 'Brewers', 'full_name': 'Milwaukee Brewers', 'abbreviation': 'MIL', 'division': 'NL Central', 'league': 'National League'}
        ]
        
        logger.info(f"Initialized with {len(self._mlb_teams)} hardcoded MLB teams including division information")
        
        # Per-cycle cache for standings_data() — avoids calling the same
        # endpoint 30 times (once per team) during a single update cycle.
        self._standings_cache = {}

        # Rate limiting settings
        self.last_request_time = 0
        
        # Get rate limiting from config if available
        try:
            self.min_request_interval = current_app.config.get('API_RATE_LIMIT', 0.5)
        except:
            # If current_app is not available, use default value
            self.min_request_interval = 0.5
            
        logger.info(f"Using API rate limit of {self.min_request_interval} seconds between requests")
    
    def get_mlb_teams(self):
        """Get all MLB teams"""
        return self._mlb_teams
    
    def get_division_info(self, team_id):
        """
        Helper function to get division information for a specific team
        
        Args:
            team_id: MLB team ID
            
        Returns:
            Dictionary with division information or None if team not found
        """
        # Convert team_id to integer for comparison
        try:
            team_id = int(team_id)
        except ValueError:
            logger.error(f"Invalid team ID format: {team_id}")
            return None
        
        # Find the team in the hardcoded list
        for team in self._mlb_teams:
            if team['id'] == team_id:
                return {
                    'division': team.get('division', 'Unknown'),
                    'league': team.get('league', 'Unknown')
                }
        
        logger.warning(f"Team with ID {team_id} not found")
        return None
    
    def _rate_limit_request(self):
        """Apply rate limiting to API requests with reduced delay"""
        current_time = time.time()
        elapsed_since_last = current_time - self.last_request_time
        
        if elapsed_since_last < self.min_request_interval:
            # Reduced random component to minimum needed
            sleep_time = self.min_request_interval - elapsed_since_last + random.uniform(0.1, 0.3)
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
        """Get stats for a batch of teams with reduced delays
        
        Args:
            start_index: Starting index in teams list
            batch_size: Number of teams to process
            season: Optional season year
        """
        logger.info(f"Processing batch: start_index={start_index}, batch_size={batch_size}")
        
        if not hasattr(current_app, 'logger'):
            print(f"Processing batch: start_index={start_index}, batch_size={batch_size}")
        else:
            current_app.logger.info(f"Processing batch: start_index={start_index}, batch_size={batch_size}")
        
        if season is None:
            season = self.current_year
            
        if not self.api_available:
            error_msg = "MLB Stats API not available for batch processing"
            logger.warning(error_msg)
            if hasattr(current_app, 'logger'):
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
            if hasattr(current_app, 'logger'):
                current_app.logger.warning(error_msg)
            return []
            
        # Calculate end index based on batch size
        end_index = min(start_index + batch_size, total_teams)
        
        logger.info(f"Processing teams from index {start_index} to {end_index-1}")
        if hasattr(current_app, 'logger'):
            current_app.logger.info(f"Processing teams from index {start_index} to {end_index-1}")
        
        # Process the batch
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
                            time.sleep(1 + attempt)  # Reduced delay with each attempt
                    except Exception as e:
                        logger.error(f"Error on attempt {attempt+1}: {str(e)}")
                        time.sleep(1 + attempt)  # Reduced delay with each attempt
                
                # Reduced delay after processing a team (successful or not)
                time.sleep(0.5 + random.uniform(0.1, 0.5))  # Significantly reduced from 3.0 + random(1.0, 2.0)
                
            except Exception as e:
                error_msg = f"Error processing team at index {index}: {str(e)}"
                logger.error(error_msg)
                if hasattr(current_app, 'logger'):
                    current_app.logger.error(error_msg)
        
        logger.info(f"Batch processing complete. Retrieved stats for {len(team_stats)} teams")
        return team_stats
    
    def _fetch_team_stats(self, team, season):
        """Fetch stats for a specific team with improved validation and division information
        
        Args:
            team: Team dict with id, name, etc.
            season: Season year
        """
        team_id = team['id']
        team_name = team['name']
        team_abbrev = team['abbreviation']
        team_division = team.get('division', 'Unknown')
        team_league = team.get('league', 'Unknown')
        
        try:
            logger.info(f"Fetching stats for {team_name} (ID: {team_id})")
            
            # Apply rate limiting before making requests
            self._rate_limit_request()
            
            # Test if statsapi is available
            if not MLB_STATS_API_AVAILABLE:
                logger.error(f"MLB Stats API not available, cannot fetch stats for {team_name}")
                return None
            
            # This is the critical part - trying to use the MLB Stats API
            try:
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
                
                # Apply rate limiting again before third request
                self._rate_limit_request()
                
                # Get team record (wins/losses)
                logger.info(f"Fetching team record for {team_name}")
                
                # Get standings data (cached per season to avoid 30 duplicate API calls)
                try:
                    if season not in self._standings_cache:
                        self._standings_cache[season] = statsapi.standings_data(season=season)
                    standings_data = self._standings_cache[season]
                    team_record = {"wins": 0, "losses": 0}

                    # Find the team and extract record + playoff context fields
                    for division_data in standings_data.values():
                        for team_data in division_data['teams']:
                            if team_data['team_id'] == team_id:
                                team_record = {
                                    "wins": team_data.get('w', 0),
                                    "losses": team_data.get('l', 0),
                                    "div_rank": team_data.get('div_rank', '-'),
                                    "wc_rank": team_data.get('wc_rank', '-'),
                                    "wc_gb": team_data.get('wc_gb', '-'),
                                    "elim_num": team_data.get('elim_num', '-'),
                                    "league_rank": team_data.get('league_rank', '-'),
                                }
                                break
                except Exception as e:
                    logger.error(f"Error fetching team record for {team_name}: {str(e)}")
                    team_record = {"wins": 0, "losses": 0}
                
            except Exception as api_error:
                # API call failed — return None so this team is excluded from the
                # snapshot rather than polluting it with invented statistics.
                logger.error(f"MLB Stats API call failed for {team_name}: {str(api_error)}")
                return None
            
            # Extract ERA with improved validation
            era = None
            if pitching_stats and 'stats' in pitching_stats:
                for stat_group in pitching_stats['stats']:
                    if 'splits' in stat_group:
                        for split in stat_group['splits']:
                            if 'stat' in split and 'era' in split['stat']:
                                try:
                                    era_value = float(split['stat']['era'])
                                    # Wide range to accommodate early-season extremes
                                    # (e.g., shutout ERA=0.0, bad-start ERA=27.0)
                                    if 0.0 <= era_value <= 27.0:
                                        era = era_value
                                        logger.info(f"{team_name} ERA: {era}")
                                    else:
                                        logger.warning(f"Invalid ERA value for {team_name}: {era_value}, outside valid range")
                                except (ValueError, TypeError) as e:
                                    logger.error(f"Error converting ERA for {team_name}: {str(e)}")
                                break
            
            # Extract OPS with improved validation
            ops = None
            if hitting_stats and 'stats' in hitting_stats:
                for stat_group in hitting_stats['stats']:
                    if 'splits' in stat_group:
                        for split in stat_group['splits']:
                            if 'stat' in split and 'ops' in split['stat']:
                                try:
                                    ops_value = float(split['stat']['ops'])
                                    # Wide range to accommodate early-season extremes
                                    # (e.g., OPS=0.388 with few at-bats, OPS=2.000 hot start)
                                    if 0.0 <= ops_value <= 2.0:
                                        ops = ops_value
                                        logger.info(f"{team_name} OPS: {ops}")
                                    else:
                                        logger.warning(f"Invalid OPS value for {team_name}: {ops_value}, outside valid range")
                                except (ValueError, TypeError) as e:
                                    logger.error(f"Error converting OPS for {team_name}: {str(e)}")
                                break
            
            # Extract runs scored from hitting stats
            runs_scored = 0
            if hitting_stats and 'stats' in hitting_stats:
                for stat_group in hitting_stats['stats']:
                    if 'splits' in stat_group:
                        for split in stat_group['splits']:
                            if 'stat' in split and 'runs' in split['stat']:
                                try:
                                    runs_scored = int(split['stat']['runs'])
                                    logger.info(f"{team_name} Runs Scored: {runs_scored}")
                                except (ValueError, TypeError) as e:
                                    logger.error(f"Error converting runs scored for {team_name}: {str(e)}")
                                    runs_scored = 0
                                break
            
            # Extract runs allowed from pitching stats
            runs_allowed = 0
            if pitching_stats and 'stats' in pitching_stats:
                for stat_group in pitching_stats['stats']:
                    if 'splits' in stat_group:
                        for split in stat_group['splits']:
                            if 'stat' in split and 'runs' in split['stat']:
                                try:
                                    runs_allowed = int(split['stat']['runs'])
                                    logger.info(f"{team_name} Runs Allowed: {runs_allowed}")
                                except (ValueError, TypeError) as e:
                                    logger.error(f"Error converting runs allowed for {team_name}: {str(e)}")
                                    runs_allowed = 0
                                break
            
            # Calculate run differential
            run_differential = runs_scored - runs_allowed

            # Extract WHIP from pitching stats (Walks + Hits per Inning Pitched)
            whip = None
            if pitching_stats and 'stats' in pitching_stats:
                for stat_group in pitching_stats['stats']:
                    if 'splits' in stat_group:
                        for split in stat_group['splits']:
                            if 'stat' in split and 'whip' in split['stat']:
                                try:
                                    v = float(split['stat']['whip'])
                                    if 0.5 <= v <= 2.5:
                                        whip = round(v, 2)
                                        logger.info(f"{team_name} WHIP: {whip}")
                                except (ValueError, TypeError) as e:
                                    logger.error(f"Error converting WHIP for {team_name}: {str(e)}")
                                break

            # Extract batting average and home runs from hitting stats
            batting_avg = None
            home_runs = None
            if hitting_stats and 'stats' in hitting_stats:
                for stat_group in hitting_stats['stats']:
                    if 'splits' in stat_group:
                        for split in stat_group['splits']:
                            stat = split.get('stat', {})
                            if batting_avg is None and 'avg' in stat:
                                try:
                                    v = float(stat['avg'])
                                    if 0.1 <= v <= 0.4:
                                        batting_avg = round(v, 3)
                                        logger.info(f"{team_name} Batting Avg: {batting_avg}")
                                except (ValueError, TypeError) as e:
                                    logger.error(f"Error converting batting avg for {team_name}: {str(e)}")
                            if home_runs is None and 'homeRuns' in stat:
                                try:
                                    home_runs = int(stat['homeRuns'])
                                    logger.info(f"{team_name} Home Runs: {home_runs}")
                                except (ValueError, TypeError) as e:
                                    logger.error(f"Error converting home runs for {team_name}: {str(e)}")
                            if batting_avg is not None and home_runs is not None:
                                break

            # Additional validation: Both values must be present
            if era is None or ops is None:
                # A team without ERA or OPS hasn't pitched or batted yet (e.g., opening
                # day hasn't arrived). Exclude them from the snapshot entirely so they
                # don't appear on the chart with invented statistics.
                logger.info(f"Skipping {team_name} — no season data yet (ERA={era}, OPS={ops})")
                return None
            
            # Get proper logo filename from team name
            logo_name = team_name.lower()
            
            # Handle special cases for logo filenames
            if team_name == "Red Sox":
                logo_name = "redsox"
            elif team_name == "White Sox":
                logo_name = "whitesox"
            elif team_name == "Blue Jays":
                logo_name = "bluejays"
            
            team_data = {
                "id": team_id,
                "name": team_name,
                "full_name": team['full_name'],
                "abbreviation": team_abbrev,
                "division": team_division,
                "league": team_league,
                "era": era,
                "ops": ops,
                "wins": team_record.get("wins", 0),
                "losses": team_record.get("losses", 0),
                "runs_scored": runs_scored,
                "runs_allowed": runs_allowed,
                "run_differential": run_differential,
                # Advanced pitching/hitting stats (None for old snapshots without this data)
                "whip": whip,
                "batting_avg": batting_avg,
                "home_runs": home_runs,
                "logo": f"/static/logos/{logo_name}.png",
                # Playoff context — these fields are absent in old snapshots
                # and will gracefully default to '-' in the UI
                "div_rank": team_record.get("div_rank", "-"),
                "wc_rank": team_record.get("wc_rank", "-"),
                "wc_gb": team_record.get("wc_gb", "-"),
                "elim_num": team_record.get("elim_num", "-"),
                "league_rank": team_record.get("league_rank", "-"),
            }
            logger.info(f"Successfully processed {team_name}")
            return team_data
                
        except Exception as e:
            error_msg = f"Error getting stats for {team_name}: {str(e)}"
            logger.error(error_msg)
            if hasattr(current_app, 'logger'):
                current_app.logger.error(error_msg)
            import traceback
            logger.error(traceback.format_exc())
            return None
    
    def _get_fallback_stats(self):
        """Return fallback stats from cache file if available"""
        logger.info("Using fallback stats")
        
        cache_file = current_app.config.get('CACHE_FILE', 'data_cache.json')
        
        # If cache_file is just a filename, assume it's in the root directory
        if os.path.dirname(cache_file) == '':
            cache_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), cache_file)
        
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r') as f:
                    data = json.load(f)
                    
                    # Validate the data before returning
                    valid_data = []
                    for team in data:
                        # Skip teams with missing ERA or OPS
                        if team.get('era') is None or team.get('ops') is None:
                            logger.warning(f"Skipping team with incomplete data: {team.get('name', 'Unknown')}")
                            continue
                            
                        # Validate ERA — wide range for early-season extremes (0.0–27.0)
                        try:
                            era = float(team['era'])
                            if not (0.0 <= era <= 27.0):
                                logger.warning(f"Skipping team with invalid ERA {team['era']}: {team.get('name', 'Unknown')}")
                                continue
                        except (ValueError, TypeError):
                            logger.warning(f"Skipping team with non-numeric ERA {team.get('era')}: {team.get('name', 'Unknown')}")
                            continue
                            
                        # Validate OPS — wide range for early-season extremes (0.0–2.0)
                        try:
                            ops = float(team['ops'])
                            if not (0.0 <= ops <= 2.0):
                                logger.warning(f"Skipping team with invalid OPS {team['ops']}: {team.get('name', 'Unknown')}")
                                continue
                        except (ValueError, TypeError):
                            logger.warning(f"Skipping team with non-numeric OPS {team.get('ops')}: {team.get('name', 'Unknown')}")
                            continue
                        
                        # Add division info to fallback data if not present
                        if 'division' not in team or 'league' not in team:
                            division_info = self.get_division_info(team.get('id'))
                            if division_info:
                                team['division'] = division_info.get('division', 'Unknown')
                                team['league'] = division_info.get('league', 'Unknown')
                        
                        # Add wins/losses if not present with default values
                        if 'wins' not in team:
                            team['wins'] = random.randint(5, 20)
                        if 'losses' not in team:
                            team['losses'] = random.randint(5, 20)
                        
                        # Add valid team to result
                        valid_data.append(team)
                    
                    logger.info(f"Loaded {len(valid_data)} valid teams from cache file (filtered from {len(data)} total)")
                    return valid_data
            except Exception as e:
                error_msg = f"Error reading cache file: {str(e)}"
                logger.error(error_msg)
                if hasattr(current_app, 'logger'):
                    current_app.logger.error(error_msg)
        
        # Return hardcoded fallback data if cache file not available
        logger.warning("Using hardcoded fallback data")
        if hasattr(current_app, 'logger'):
            current_app.logger.warning("Using hardcoded fallback data")
            
        fallback_data = [
            {"id": 121, "name": "Mets", "full_name": "New York Mets", "abbreviation": "NYM", "division": "NL East", "league": "National League", "era": 2.00, "ops": 0.700, "wins": 12, "losses": 8, "logo": "/static/logos/mets.png"},
            {"id": 137, "name": "Giants", "full_name": "San Francisco Giants", "abbreviation": "SF", "division": "NL West", "league": "National League", "era": 2.55, "ops": 0.650, "wins": 14, "losses": 6, "logo": "/static/logos/giants.png"},
            {"id": 113, "name": "Reds", "full_name": "Cincinnati Reds", "abbreviation": "CIN", "division": "NL Central", "league": "National League", "era": 2.90, "ops": 0.610, "wins": 10, "losses": 10, "logo": "/static/logos/reds.png"},
            {"id": 118, "name": "Royals", "full_name": "Kansas City Royals", "abbreviation": "KC", "division": "AL Central", "league": "American League", "era": 3.00, "ops": 0.650, "wins": 9, "losses": 11, "logo": "/static/logos/royals.png"},
            {"id": 139, "name": "Rays", "full_name": "Tampa Bay Rays", "abbreviation": "TB", "division": "AL East", "league": "American League", "era": 3.10, "ops": 0.700, "wins": 15, "losses": 5, "logo": "/static/logos/rays.png"},
            {"id": 119, "name": "Dodgers", "full_name": "Los Angeles Dodgers", "abbreviation": "LAD", "division": "NL West", "league": "National League", "era": 3.10, "ops": 0.740, "wins": 16, "losses": 4, "logo": "/static/logos/dodgers.png"},
            {"id": 147, "name": "Yankees", "full_name": "New York Yankees", "abbreviation": "NYY", "division": "AL East", "league": "American League", "era": 4.60, "ops": 0.850, "wins": 13, "losses": 7, "logo": "/static/logos/yankees.png"}
        ]
        
        return fallback_data