#!/usr/bin/env python3
"""
Script to update the data_cache.json file with correct logo paths
"""
import json
import os

def fix_cache_file():
    # Path to the cache file
    cache_file = "data_cache.json"
    
    # Check if file exists
    if not os.path.exists(cache_file):
        print(f"Error: {cache_file} not found")
        return False
    
    # Load the current data
    try:
        with open(cache_file, 'r') as f:
            teams = json.load(f)
    except json.JSONDecodeError:
        print(f"Error: {cache_file} contains invalid JSON")
        return False
    
    # Update the logo paths
    for team in teams:
        # Get team name in lowercase
        team_name = team["name"].lower()
        
        # Handle special cases
        if team_name == "sox" and "white" in team.get("full_name", "").lower():
            team_name = "whitesox"
        elif team_name == "sox" and "red" in team.get("full_name", "").lower():
            team_name = "redsox"
        elif team_name == "jays":
            team_name = "bluejays"
        
        # Update logo path with leading slash
        team["logo"] = f"/static/logos/{team_name}.png"
    
    # Save the updated data
    try:
        with open(cache_file, 'w') as f:
            json.dump(teams, f, indent=2)
        print(f"Successfully updated {cache_file}")
        return True
    except Exception as e:
        print(f"Error saving {cache_file}: {str(e)}")
        return False

if __name__ == "__main__":
    fix_cache_file()