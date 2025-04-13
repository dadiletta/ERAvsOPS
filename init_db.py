#!/usr/bin/env python3
"""
Database initialization script for MLB ERA vs OPS Visualization.
Run this script once after setting up a new database to create all tables.
"""
import os
import json
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Create Flask app context
from app import create_app, db, validate_mlb_data
app = create_app()

with app.app_context():
    # Print connection info (without password)
    db_url = app.config['SQLALCHEMY_DATABASE_URI']
    if db_url.startswith('postgresql://'):
        # Extract parts to hide password
        parts = db_url.split('@')
        user_part = parts[0].split(':')[0]
        rest_part = '@'.join(parts[1:])
        print(f"Connecting to database: {user_part}:*****@{rest_part}")
    else:
        print(f"Connecting to database: {db_url}")
    
    # Create all tables
    print("Creating database tables...")
    db.create_all()
    
    # Check if we have any data
    from app.models.mlb_snapshot import MLBSnapshot
    count = MLBSnapshot.query.count()
    print(f"Found {count} existing snapshots in database")
    
    # Initialize with data_cache.json if empty
    if count == 0:
        try:
            print("Initializing database with data_cache.json...")
            
            # Load data from data_cache.json
            cache_file = os.path.join(os.path.dirname(__file__), 'data_cache.json')
            with open(cache_file, 'r') as f:
                initial_data = json.load(f)
            
            if initial_data and len(initial_data) > 0:
                # Validate the data
                initial_data = validate_mlb_data(initial_data)
                
                # Create a new snapshot with yesterday's date
                snapshot = MLBSnapshot(
                    timestamp=datetime.now(timezone.utc) - timedelta(days=1),
                    data=json.dumps(initial_data)
                )
                db.session.add(snapshot)
                db.session.commit()
                print(f"Successfully initialized database with {len(initial_data)} teams")
        except Exception as e:
            print(f"Error initializing database: {str(e)}")
            import traceback
            print(traceback.format_exc())
    
    print("Database initialization complete")