# Sections to update in app/routes/main_routes.py

# 1. Update imports at the top of the file
from flask import Blueprint, render_template, current_app, jsonify, request
import json
import os
import logging
from datetime import datetime, timezone, timedelta
# Import the MLBDataFetcher service
from app.services.mlb_data import MLBDataFetcher
# Import database and models
from app import db
from app.models.mlb_snapshot import MLBSnapshot
from app import validate_mlb_data

# 2. Update get_latest_data function
def get_latest_data(must_exist=False):
    """Get the latest team data from the database with validation"""
    logger.info("Retrieving latest data from database")
    
    try:
        # Get snapshot count
        count = MLBSnapshot.query.count()
        update_status["snapshot_count"] = count
        
        # Get the most recent snapshot
        snapshot = MLBSnapshot.get_latest()
        
        if snapshot:
            # Check if data is fresh
            cache_age = datetime.now(timezone.utc) - snapshot.timestamp
            is_fresh = cache_age.total_seconds() < current_app.config['CACHE_TIMEOUT']
            
            # Get teams and validate
            teams = snapshot.teams
            
            # Validate teams on retrieval
            teams = validate_mlb_data(teams)
            
            logger.info(f"Latest snapshot found from {snapshot.timestamp}. Fresh: {is_fresh}, Age: {cache_age.total_seconds()} seconds, Valid teams: {len(teams)}")
            return teams, True, is_fresh, snapshot.timestamp.strftime("%Y-%m-%d %H:%M:%S")
    
    except Exception as e:
        error_msg = f"Error reading from database: {str(e)}"
        logger.error(error_msg)
        current_app.logger.error(error_msg)
    
    # Rest of the function remains the same...

# 3. Update update_mlb_data function - only the relevant parts where utcnow is used
def update_mlb_data(step=1, total_steps=30):
    """Update MLB data one team at a time to allow for progress tracking"""
    global update_status
    
    # ... existing code ...
    
    # When marking update as complete, replace utcnow()
    if update_status["teams_updated"] >= update_status["total_teams"] and not update_status.get("completed", False):
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        update_status["in_progress"] = False
        update_status["completed"] = True
        update_status["last_updated"] = timestamp
        
        # ... rest of the function ...