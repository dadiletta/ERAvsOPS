# app/models/mlb_snapshot.py
from app import db
from datetime import datetime
import json

class MLBSnapshot(db.Model):
    """Model for storing historical MLB team statistics snapshots"""
    __tablename__ = 'mlb_snapshots'
    
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    # Store the complete team data as JSON
    data = db.Column(db.Text, nullable=False)
    
    # Helper methods
    @property
    def teams(self):
        """Return the team data as a Python list"""
        return json.loads(self.data)
    
    @staticmethod
    def create_snapshot(teams_data):
        """Create a new snapshot from the current team data"""
        return MLBSnapshot(data=json.dumps(teams_data))
    
    @staticmethod
    def get_latest():
        """Get the most recent snapshot"""
        return MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).first()
    
    @staticmethod
    def get_team_history(team_id, limit=10):
        """Get historical positions for a specific team"""
        # Convert team_id to integer for comparison
        team_id = int(team_id)
        
        # Get the most recent snapshots
        snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).limit(limit).all()
        
        # Extract team data from each snapshot
        history = []
        missing_snapshots = 0
        
        for snapshot in snapshots:
            found = False
            teams = snapshot.teams
            for team in teams:
                if isinstance(team, dict) and team.get('id') == team_id:
                    history.append({
                        'timestamp': snapshot.timestamp.isoformat(),
                        'era': team.get('era', 0),
                        'ops': team.get('ops', 0)
                    })
                    found = True
                    break
            
            # Log if team not found in a snapshot
            if not found:
                missing_snapshots += 1
                import logging
                logging.getLogger('mlb_snapshot').warning(
                    f"Team ID {team_id} not found in snapshot from {snapshot.timestamp}"
                )
        
        if missing_snapshots > 0:
            import logging
            logging.getLogger('mlb_snapshot').warning(
                f"Team ID {team_id} was missing from {missing_snapshots} out of {len(snapshots)} snapshots"
            )
        
        # Return in chronological order (oldest first)
        history_sorted = sorted(history, key=lambda x: x['timestamp'])
        
        # Log the history data for debugging
        import logging
        logging.getLogger('mlb_snapshot').info(
            f"Returning {len(history_sorted)} history points for team {team_id}"
        )
        
        return history_sorted