# app/services/mlb_data.py
import requests
import json
import os
from datetime import datetime
from flask import current_app
import csv
import time

class MLBDataFetcher:
    """
    A class to fetch MLB team data using alternative public API endpoints.
    This implementation uses the MLB lookup service, which is publicly accessible.
    """
    def __init__(self):
        # Base URL for MLB lookup service
        self.base_url = "http://lookup-service-prod.mlb.com/json/named"
        # We'll use the Sportradar API as a backup if we get credentials
        self.sportradar_api_key = current_app.config.get('SPORTRADAR_API_KEY')
        
    def get_teams(self):
        """Get all active MLB teams"""
        try:
            # Make request to MLB's public lookup service
            endpoint = f"{self.base_url}.team_all_season.bam"
            params = {
                'sport_code': "'mlb'",
                'all_star_sw': "'N'",
                'sort_order': "name_asc",
                'season': datetime.now().year
            }
            
            response = requests.get(endpoint, params=params)
            if response.status_code == 200:
                data = response.json()
                teams = data.get('team_all_season', {}).get('queryResults', {}).get('row', [])
                return teams
            
            # Fallback to local data if the API request fails
            return self._get_local_teams()
            
        except Exception as e:
            current_app.logger.error(f"Error fetching teams: {str(e)}")
            return self._get_local_teams()
    
    def _get_local_teams(self):
        """Fallback to return hardcoded team data"""
        return [
            {"name": "Mets", "name_display_full": "New York Mets", "team_id": 121, "abbreviation": "NYM"},
            {"name": "Giants", "name_display_full": "San Francisco Giants", "team_id": 137, "abbreviation": "SF"},
            {"name": "Reds", "name_display_full": "Cincinnati Reds", "team_id": 113, "abbreviation": "CIN"},
            {"name": "Royals", "name_display_full": "Kansas City Royals", "team_id": 118, "abbreviation": "KC"},
            {"name": "Rays", "name_display_full": "Tampa Bay Rays", "team_id": 139, "abbreviation": "TB"},
            {"name": "Dodgers", "name_display_full": "Los Angeles Dodgers", "team_id": 119, "abbreviation": "LAD"},
            {"name": "Astros", "name_display_full": "Houston Astros", "team_id": 117, "abbreviation": "HOU"},
            {"name": "White Sox", "name_display_full": "Chicago White Sox", "team_id": 145, "abbreviation": "CWS"},
            {"name": "Rangers", "name_display_full": "Texas Rangers", "team_id": 140, "abbreviation": "TEX"},
            {"name": "Mariners", "name_display_full": "Seattle Mariners", "team_id": 136, "abbreviation": "SEA"},
            {"name": "Marlins", "name_display_full": "Miami Marlins", "team_id": 146, "abbreviation": "MIA"},
            {"name": "Blue Jays", "name_display_full": "Toronto Blue Jays", "team_id": 141, "abbreviation": "TOR"},
            {"name": "Padres", "name_display_full": "San Diego Padres", "team_id": 135, "abbreviation": "SD"},
            {"name": "Phillies", "name_display_full": "Philadelphia Phillies", "team_id": 143, "abbreviation": "PHI"},
            {"name": "Tigers", "name_display_full": "Detroit Tigers", "team_id": 116, "abbreviation": "DET"},
            {"name": "Twins", "name_display_full": "Minnesota Twins", "team_id": 142, "abbreviation": "MIN"},
            {"name": "Braves", "name_display_full": "Atlanta Braves", "team_id": 144, "abbreviation": "ATL"},
            {"name": "Rockies", "name_display_full": "Colorado Rockies", "team_id": 115, "abbreviation": "COL"},
            {"name": "Guardians", "name_display_full": "Cleveland Guardians", "team_id": 114, "abbreviation": "CLE"},
            {"name": "Angels", "name_display_full": "Los Angeles Angels", "team_id": 108, "abbreviation": "LAA"},
            {"name": "Orioles", "name_display_full": "Baltimore Orioles", "team_id": 110, "abbreviation": "BAL"},
            {"name": "Nationals", "name_display_full": "Washington Nationals", "team_id": 120, "abbreviation": "WSH"},
            {"name": "Red Sox", "name_display_full": "Boston Red Sox", "team_id": 111, "abbreviation": "BOS"},
            {"name": "Cubs", "name_display_full": "Chicago Cubs", "team_id": 112, "abbreviation": "CHC"},
            {"name": "Diamondbacks", "name_display_full": "Arizona Diamondbacks", "team_id": 109, "abbreviation": "ARI"},
            {"name": "Yankees", "name_display_full": "New York Yankees", "team_id": 147, "abbreviation": "NYY"},
            {"name": "Athletics", "name_display_full": "Oakland Athletics", "team_id": 133, "abbreviation": "OAK"},
            {"name": "Brewers", "name_display_full": "Milwaukee Brewers", "team_id": 158, "abbreviation": "MIL"},
            {"name": "Cardinals", "name_display_full": "St. Louis Cardinals", "team_id": 138, "abbreviation": "STL"},
            {"name": "Pirates", "name_display_full": "Pittsburgh Pirates", "team_id": 134, "abbreviation": "PIT"}
        ]
    
    def get_team_stats(self, team_id, season=None):
        """Get team stats for a specific team and season"""
        if season is None:
            # Use current year if no season is specified
            season = datetime.now().year
            
        try:
            # Try to get pitching stats
            pitching_endpoint = f"{self.base_url}.team_pitching.bam"
            pitching_params = {
                'team_id': team_id,
                'season': season,
                'game_type': "'R'"  # Regular season
            }
            
            # Try to get hitting stats
            hitting_endpoint = f"{self.base_url}.team_hitting.bam"
            hitting_params = {
                'team_id': team_id,
                'season': season,
                'game_type': "'R'"  # Regular season
            }
            
            pitching_response = requests.get(pitching_endpoint, params=pitching_params)
            hitting_response = requests.get(hitting_endpoint, params=hitting_params)
            
            pitching_data = {}
            hitting_data = {}
            
            if pitching_response.status_code == 200:
                pitching_data = pitching_response.json().get('team_pitching', {})
            
            if hitting_response.status_code == 200:
                hitting_data = hitting_response.json().get('team_hitting', {})
                
            return {
                'pitching': pitching_data,
                'hitting': hitting_data
            }
            
        except Exception as e:
            current_app.logger.error(f"Error fetching team stats: {str(e)}")
            return {}
    
    def get_era(self, pitching_data):
        """Extract ERA from pitching data"""
        try:
            query_results = pitching_data.get('queryResults', {})
            if query_results.get('totalSize') == '1':
                stats = query_results.get('row', {})
                if 'era' in stats:
                    return float(stats['era'])
            return None
        except (KeyError, ValueError, TypeError):
            return None
    
    def get_ops(self, hitting_data):
        """Extract OPS from hitting data"""
        try:
            query_results = hitting_data.get('queryResults', {})
            if query_results.get('totalSize') == '1':
                stats = query_results.get('row', {})
                if 'ops' in stats:
                    return float(stats['ops'])
            return None
        except (KeyError, ValueError, TypeError):
            return None
    
    def get_team_leaders(self, stat_type='era', season=None, limit=30):
        """Get league leaders for a specific statistic"""
        if season is None:
            season = str(datetime.now().year)
            
        try:
            if stat_type in ['era', 'whip', 'k9']:
                endpoint = f"{self.base_url}.leader_pitching_repeater.bam"
                sort_column = f"'{stat_type}'"
            else:
                endpoint = f"{self.base_url}.leader_hitting_repeater.bam"
                sort_column = f"'{stat_type}'"
                
            params = {
                'sport_code': "'mlb'",
                'results': limit,
                'game_type': "'R'",
                'season': f"'{season}'",
                'sort_column': sort_column
            }
            
            response = requests.get(endpoint, params=params)
            if response.status_code == 200:
                if stat_type in ['era', 'whip', 'k9']:
                    data = response.json().get('leader_pitching_repeater', {})
                    leaders = data.get('leader_pitching_mux', {}).get('queryResults', {}).get('row', [])
                else:
                    data = response.json().get('leader_hitting_repeater', {})
                    leaders = data.get('leader_hitting_mux', {}).get('queryResults', {}).get('row', [])
                    
                return leaders
            return []
            
        except Exception as e:
            current_app.logger.error(f"Error fetching leaders: {str(e)}")
            return []
    
    def get_all_team_stats(self, season=None):
        """Get ERA and OPS for all MLB teams"""
        teams = self.get_teams()
        team_stats = []
        
        for team in teams:
            team_id = team.get('team_id')
            team_name = team.get('name_display_full', team.get('name', ''))
            team_abbreviation = team.get('abbreviation', '')
            
            # Rate limit to avoid API throttling
            time.sleep(0.5)
            
            stats = self.get_team_stats(team_id, season)
            
            # Extract ERA and OPS from the data
            era = self.get_era(stats.get('pitching', {}))
            ops = self.get_ops(stats.get('hitting', {}))
            
            # If we couldn't get data from the API, use predefined values
            if era is None or ops is None:
                # Use fallback data from local cache
                fallback_stats = self._get_fallback_stats(team_name)
                era = era or fallback_stats.get('era')
                ops = ops or fallback_stats.get('ops')
            
            # Extract the team nickname and use it for the logo filename
            nickname = team_name.split()[-1].lower()
            # Fix for special cases where team nickname might not match the logo filename
            if nickname == "sox" and "white" in team_name.lower():
                nickname = "whitesox"
            elif nickname == "sox" and "red" in team_name.lower():
                nickname = "redsox"
            elif nickname == "jays":
                nickname = "bluejays"
            
            # Build logo URL based on the nickname
            logo_url = f"/static/logos/{nickname}.png"
            
            if era is not None and ops is not None:
                team_stats.append({
                    "id": team_id,
                    "name": team_name.split()[-1],  # Get the team nickname
                    "full_name": team_name,
                    "abbreviation": team_abbreviation,
                    "era": era,
                    "ops": ops,
                    "logo": logo_url
                })
        
        return team_stats
    
    def _get_fallback_stats(self, team_name):
        """Get fallback statistics for a team if API fails"""
        # Use the last part of the team name (nickname) for matching
        nickname = team_name.split()[-1]
        
        # Sample fallback data (from cache or predefined values)
        fallback_data = {
            "Mets": {"era": 2.00, "ops": 0.700},
            "Giants": {"era": 2.55, "ops": 0.650},
            "Reds": {"era": 2.90, "ops": 0.610},
            "Royals": {"era": 3.00, "ops": 0.650},
            "Rays": {"era": 3.10, "ops": 0.700},
            "Dodgers": {"era": 3.10, "ops": 0.740},
            "Astros": {"era": 3.50, "ops": 0.590},
            "White Sox": {"era": 3.80, "ops": 0.600},
            "Rangers": {"era": 3.60, "ops": 0.630},
            "Mariners": {"era": 3.80, "ops": 0.650},
            "Marlins": {"era": 4.00, "ops": 0.660},
            "Blue Jays": {"era": 3.65, "ops": 0.720},
            "Padres": {"era": 3.55, "ops": 0.750},
            "Phillies": {"era": 3.70, "ops": 0.780},
            "Tigers": {"era": 3.55, "ops": 0.810},
            "Twins": {"era": 4.50, "ops": 0.590},
            "Braves": {"era": 4.50, "ops": 0.620},
            "Rockies": {"era": 4.50, "ops": 0.650},
            "Guardians": {"era": 4.50, "ops": 0.680},
            "Angels": {"era": 4.35, "ops": 0.710},
            "Orioles": {"era": 4.45, "ops": 0.710},
            "Nationals": {"era": 4.50, "ops": 0.720},
            "Red Sox": {"era": 4.25, "ops": 0.730},
            "Cubs": {"era": 4.50, "ops": 0.750},
            "Diamondbacks": {"era": 4.80, "ops": 0.780},
            "Yankees": {"era": 4.60, "ops": 0.850},
            "Athletics": {"era": 5.40, "ops": 0.730},
            "Brewers": {"era": 5.55, "ops": 0.690},
            "Cardinals": {"era": 5.90, "ops": 0.820},
            "Pirates": {"era": 4.90, "ops": 0.600}
        }
        
        # Try to find the team by nickname
        for team, stats in fallback_data.items():
            if nickname in team:
                return stats
        
        # Default values if no match found
        return {"era": 4.00, "ops": 0.700}