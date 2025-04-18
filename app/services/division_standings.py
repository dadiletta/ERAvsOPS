# app/services/division_standings.py
import logging
from collections import defaultdict

# Configure logging
logger = logging.getLogger('division_standings')

def calculate_division_standings(teams):
    """
    Calculate standings for each division based on team wins and losses
    
    Args:
        teams: List of team data dictionaries
    
    Returns:
        Dictionary with division standings
    """
    # Group teams by division
    divisions = defaultdict(list)
    
    for team in teams:
        division = team.get('division', 'Unknown')
        if division != 'Unknown':
            # Create a team record object with essential data
            team_record = {
                'id': team.get('id'),
                'name': team.get('name', 'Unknown'),
                'full_name': team.get('full_name', team.get('name', 'Unknown')),
                'abbreviation': team.get('abbreviation', ''),
                'wins': team.get('wins', 0),
                'losses': team.get('losses', 0),
                'logo': team.get('logo', f"/static/logos/{team.get('name', 'unknown').lower()}.png")
            }
            
            # Calculate winning percentage
            total_games = team_record['wins'] + team_record['losses']
            if total_games > 0:
                team_record['pct'] = round(team_record['wins'] / total_games, 3)
            else:
                team_record['pct'] = 0.000
                
            # Calculate games behind leader (will be filled in later)
            team_record['gb'] = 0.0
            
            divisions[division].append(team_record)
    
    # Sort teams in each division by winning percentage (descending)
    standings = {}
    for division, teams in divisions.items():
        # Sort by wins (descending), then by losses (ascending)
        sorted_teams = sorted(teams, key=lambda x: (-x['wins'], x['losses']))
        
        # Calculate games behind for each team
        if sorted_teams:
            leader = sorted_teams[0]
            leader_win_pct = leader['pct']
            
            for team in sorted_teams:
                if team == leader:
                    team['gb'] = '-'
                else:
                    # Calculate games behind (traditional formula)
                    gb = ((leader['wins'] - team['wins']) + (team['losses'] - leader['losses'])) / 2.0
                    team['gb'] = gb if gb == int(gb) else round(gb, 1)
        
        standings[division] = sorted_teams
    
    return standings

def get_division_cards_data(teams):
    """
    Prepare data for division cards display
    
    Args:
        teams: List of team data dictionaries
    
    Returns:
        List of division card data objects
    """
    # Calculate standings
    standings = calculate_division_standings(teams)
    
    # Prepare cards data
    cards = []
    
    # Define division order for consistent display
    division_order = [
        'AL East', 'AL Central', 'AL West',
        'NL East', 'NL Central', 'NL West'
    ]
    
    # Create card for each division in specified order
    for division in division_order:
        if division in standings:
            # Get league from division name
            league = 'American League' if division.startswith('AL') else 'National League'
            league_abbr = division.split(' ')[0]  # AL or NL
            
            card = {
                'division': division,
                'league': league,
                'league_abbr': league_abbr,
                'teams': standings[division]
            }
            cards.append(card)
    
    return cards