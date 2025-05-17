#!/usr/bin/env python3
"""
Script to export MLBSnapshot records into a Python-formatted seed file
"""
import json
import os
from datetime import datetime, timezone
import sys

# Add the project root to Python path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Create Flask app context
from app import create_app, db
from app.models.mlb_snapshot import MLBSnapshot

app = create_app()

def format_timestamp(dt):
    """Format datetime for Python code"""
    return f"datetime({dt.year}, {dt.month}, {dt.day}, {dt.hour}, {dt.minute}, {dt.second}, tzinfo=timezone.utc)"

def export_snapshots(output_file='db_seed_data.py'):
    """Export all snapshots to a Python file"""
    with app.app_context():
        print(f"Connecting to database: {app.config['SQLALCHEMY_DATABASE_URI']}")
        
        # Get all snapshots ordered by timestamp
        snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.asc()).all()
        print(f"Found {len(snapshots)} snapshots to export")
        
        # Prepare the Python file
        with open(output_file, 'w') as f:
            # Write header
            f.write("#!/usr/bin/env python3\n")
            f.write("# Generated seed data file - DO NOT EDIT\n")
            f.write("from datetime import datetime, timezone\n")
            f.write("import json\n\n")
            
            # Start snapshots list
            f.write("# List of seed snapshots with timestamp and data\n")
            f.write("SEED_SNAPSHOTS = [\n")
            
            # Write each snapshot
            for i, snapshot in enumerate(snapshots):
                # Get timestamp string
                ts_str = format_timestamp(snapshot.timestamp_aware)
                
                # Prepare data - minify the JSON to save space
                data_json = json.dumps(snapshot.teams, separators=(',', ':'))
                
                # Write the snapshot entry
                f.write(f"    # Snapshot {i+1} - {snapshot.timestamp}\n")
                f.write(f"    {{\n")
                f.write(f"        'timestamp': {ts_str},\n")
                f.write(f"        'data': json.dumps({json.dumps(snapshot.teams)})\n")
                f.write(f"    }},\n")
            
            # Close the list
            f.write("]\n")
        
        print(f"Successfully exported {len(snapshots)} snapshots to {output_file}")

if __name__ == "__main__":
    export_snapshots()
    print("Done!")