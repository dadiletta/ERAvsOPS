# app/services/division_standings.py

"""
Division standings calculation and playoff status determination.

Computes per-division standings from team snapshot data, including:
- Win/loss records, winning percentage, games behind leader
- Playoff status (division_leader / wild_card / eliminated / contending)
- Rank trend arrows by comparing to a previous snapshot

Used by:
- Main route (server-side initial render via get_division_cards_data)
- /api/division-standings endpoint (client-side season switching)
"""

import logging
from collections import defaultdict

logger = logging.getLogger('division_standings')


def calculate_division_standings(teams):
    """
    Calculate standings for each division from team snapshot data.

    Args:
        teams: List of team data dicts (from MLBSnapshot.teams or API response).
               Expected keys: division, id, name, full_name, abbreviation,
               wins, losses, run_differential, logo. Optional playoff keys:
               div_rank, wc_rank, wc_gb, elim_num.

    Returns:
        Dict mapping division name -> sorted list of team record dicts.
        Teams are sorted by wins (desc), then losses (asc).
    """
    divisions = defaultdict(list)

    for team in teams:
        division = team.get('division', 'Unknown')
        if division == 'Unknown':
            continue

        team_record = {
            'id': team.get('id'),
            'name': team.get('name', 'Unknown'),
            'full_name': team.get('full_name', team.get('name', 'Unknown')),
            'abbreviation': team.get('abbreviation', ''),
            'wins': team.get('wins', 0),
            'losses': team.get('losses', 0),
            'run_differential': team.get('run_differential', 0),
            'logo': team.get('logo', f"/static/logos/{team.get('name', 'unknown').lower()}.png"),
            # Playoff context — gracefully absent for old snapshots
            'div_rank': team.get('div_rank', '-'),
            'wc_rank': team.get('wc_rank', '-'),
            'wc_gb': team.get('wc_gb', '-'),
            'elim_num': team.get('elim_num', '-'),
        }

        # Winning percentage
        total_games = team_record['wins'] + team_record['losses']
        team_record['pct'] = round(team_record['wins'] / total_games, 3) if total_games > 0 else 0.000

        # Placeholder — filled after sorting
        team_record['gb'] = 0.0

        # Derive playoff status from rank/elimination fields
        team_record['playoff_status'] = _determine_playoff_status(team_record)

        divisions[division].append(team_record)

    # Sort and compute games behind within each division
    standings = {}
    for division, div_teams in divisions.items():
        sorted_teams = sorted(div_teams, key=lambda x: (-x['wins'], x['losses']))

        if sorted_teams:
            leader = sorted_teams[0]
            for t in sorted_teams:
                if t is leader:
                    t['gb'] = '-'
                else:
                    gb = ((leader['wins'] - t['wins']) + (t['losses'] - leader['losses'])) / 2.0
                    t['gb'] = gb if gb == int(gb) else round(gb, 1)

        standings[division] = sorted_teams

    return standings


def _determine_playoff_status(team_record):
    """
    Derive a playoff status string from the team's rank and elimination fields.

    Returns one of: 'division_leader', 'wild_card', 'eliminated', 'contending'.
    Old snapshots without these fields will default to 'contending'.
    """
    div_rank = str(team_record.get('div_rank', ''))
    elim_num = str(team_record.get('elim_num', ''))
    wc_rank = str(team_record.get('wc_rank', ''))

    if div_rank == '1':
        return 'division_leader'
    if elim_num.upper() == 'E':
        return 'eliminated'
    # MLB has 3 wild card spots per league
    if wc_rank in ('1', '2', '3'):
        return 'wild_card'
    return 'contending'


def get_division_cards_data(teams, previous_teams=None):
    """
    Prepare data for division cards display, including optional trend arrows.

    Args:
        teams: Current team data list.
        previous_teams: Optional list from a previous snapshot. When provided,
                        each team gets a 'trend' field ('up', 'down', or 'same')
                        indicating whether their division rank improved or dropped.

    Returns:
        List of division card dicts in display order (AL East -> NL West),
        each with keys: division, league, league_abbr, teams.
    """
    standings = calculate_division_standings(teams)

    # Build a lookup of previous division ranks for trend comparison
    prev_rank_map = {}
    if previous_teams:
        prev_standings = calculate_division_standings(previous_teams)
        for div, div_teams in prev_standings.items():
            for rank_index, t in enumerate(div_teams):
                prev_rank_map[t['id']] = rank_index + 1

    # Annotate current teams with trend arrows
    for division, div_teams in standings.items():
        for rank_index, t in enumerate(div_teams):
            current_rank = rank_index + 1
            prev_rank = prev_rank_map.get(t['id'])
            if prev_rank is not None:
                if current_rank < prev_rank:
                    t['trend'] = 'up'
                elif current_rank > prev_rank:
                    t['trend'] = 'down'
                else:
                    t['trend'] = 'same'
            else:
                t['trend'] = 'same'

    # Assemble cards in canonical display order
    division_order = [
        'AL East', 'AL Central', 'AL West',
        'NL East', 'NL Central', 'NL West'
    ]

    cards = []
    for division in division_order:
        if division in standings:
            league_abbr = division.split(' ')[0]
            cards.append({
                'division': division,
                'league': 'American League' if league_abbr == 'AL' else 'National League',
                'league_abbr': league_abbr,
                'teams': standings[division]
            })

    return cards
