# app/services/mlb_data.py
import requests
import json
from datetime import datetime
from flask import current_app

class MLBDataFetcher:
    """
    A class to fetch MLB team data using the MLB-StatsAPI.
    """
    def __init__(self):
        self.base_url = "https://statsapi.mlb.com/api/v1"
        
    def get_teams(self):
        """Get all active MLB teams"""
        endpoint = f"{self.base_url}/teams"
        params = {
            "sportId": 1,  # MLB
            "activeStatus": "Y"
        }
        
        response = requests.get(endpoint, params=params)
        if response.status_code == 200:
            return response.json().get('teams', [])
        return []
    
    def get_team_stats(self, team_id, season=None):
        """Get team stats for a specific team and season"""
        if season is None:
            # Use current year if no season is specified
            season = datetime.now().year
            
        endpoint = f"{self.base_url}/teams/{team_id}/stats"
        params = {
            "stats": "season",
            "season": season,
            "group": "pitching,hitting"
        }
        
        response = requests.get(endpoint, params=params)
        if response.status_code == 200:
            return response.json()
        return {}
    
    def calculate_team_era(self, pitching_stats):
        """Calculate ERA from team pitching stats"""
        try:
            # Find ERA in the stats
            for stat in pitching_stats.get('splits', []):
                stats = stat.get('stat', {})
                if 'era' in stats:
                    return float(stats['era'])
            return None
        except (KeyError, ValueError):
            return None
    
    def calculate_team_ops(self, hitting_stats):
        """Calculate OPS from team hitting stats"""
        try:
            # Find OPS in the stats
            for stat in hitting_stats.get('splits', []):
                stats = stat.get('stat', {})
                if 'ops' in stats:
                    return float(stats['ops'])
            return None
        except (KeyError, ValueError):
            return None
    
    def get_all_team_stats(self, season=None):
        """Get ERA and OPS for all MLB teams"""
        teams = self.get_teams()
        team_stats = []
        
        for team in teams:
            team_id = team.get('id')
            team_name = team.get('name')
            team_abbreviation = team.get('abbreviation')
            
            stats = self.get_team_stats(team_id, season)
            
            # Extract pitching and hitting stats
            pitching_stats = None
            hitting_stats = None
            
            if 'stats' in stats:
                for stat_group in stats['stats']:
                    if stat_group.get('group', {}).get('displayName') == 'pitching':
                        pitching_stats = stat_group
                    elif stat_group.get('group', {}).get('displayName') == 'hitting':
                        hitting_stats = stat_group
            
            era = self.calculate_team_era(pitching_stats) if pitching_stats else None
            ops = self.calculate_team_ops(hitting_stats) if hitting_stats else None
            
            # Build logo URL based on static files structure
            # Eventually you may want to use MLB's CDN or store logos locally
            logo_url = f"/static/logos/{team_abbreviation.lower()}.png"
            
            if era is not None and ops is not None:
                team_stats.append({
                    "id": team_id,
                    "name": team_name,
                    "abbreviation": team_abbreviation,
                    "era": era,
                    "ops": ops,
                    "logo": logo_url
                })
        
        return team_stats