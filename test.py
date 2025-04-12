# test_mlb_api.py
import statsapi
import logging

logging.basicConfig(level=logging.DEBUG)

# Try to get basic data
print("Trying to get MLB teams...")
try:
    teams = statsapi.lookup_team(active=True)
    print(f"Found {len(teams)} teams")
    if teams:
        print(f"Example team: {teams[0]}")
except Exception as e:
    print(f"Error: {str(e)}")

# Try to get stats for a specific team
print("\nTrying to get stats for team ID 147 (Yankees)...")
try:
    pitching = statsapi.get("team_stats", {"teamId": 147, "group": "pitching", "stats": "season", "season": 2024})
    print(f"Pitching stats: {pitching}")
except Exception as e:
    print(f"Error: {str(e)}")