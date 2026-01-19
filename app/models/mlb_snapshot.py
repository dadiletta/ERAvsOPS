# app/models/mlb_snapshot.py
from app import db
from datetime import datetime, timezone
import json
import hashlib

class MLBSnapshot(db.Model):
    """Model for storing historical MLB team statistics snapshots"""
    __tablename__ = 'mlb_snapshots'

    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    # Store the complete team data as JSON
    data = db.Column(db.Text, nullable=False)
    # Season tracking (e.g., 2025, 2026)
    season = db.Column(db.Integer, index=True)
    # Data quality metrics
    team_count = db.Column(db.Integer, default=0)
    data_hash = db.Column(db.String(64), index=True)  # For duplicate detection
    
    # Helper methods
    @property
    def teams(self):
        """Return the team data as a Python list"""
        return json.loads(self.data)
    
    @staticmethod
    def create_snapshot(teams_data, season=None):
        """Create a new snapshot from the current team data"""
        # Auto-determine season from current date if not provided
        if season is None:
            now = datetime.now(timezone.utc)
            # MLB season typically runs Apr-Oct, use year accordingly
            # If Jan-Mar, use previous year; Apr-Dec use current year
            season = now.year if now.month >= 4 else now.year - 1

        # Calculate hash for duplicate detection
        data_str = json.dumps(teams_data, sort_keys=True)
        data_hash = hashlib.sha256(data_str.encode()).hexdigest()

        return MLBSnapshot(
            data=data_str,
            season=season,
            team_count=len(teams_data) if isinstance(teams_data, list) else 0,
            data_hash=data_hash
        )
    
    @staticmethod
    def get_latest(season=None):
        """Get the most recent snapshot, optionally filtered by season"""
        query = MLBSnapshot.query
        if season:
            query = query.filter_by(season=season)
        return query.order_by(MLBSnapshot.timestamp.desc()).first()

    @staticmethod
    def get_current_season():
        """Determine the current MLB season year"""
        now = datetime.now(timezone.utc)
        # If Jan-Mar, use previous year; Apr-Dec use current year
        return now.year if now.month >= 4 else now.year - 1

    @staticmethod
    def get_available_seasons():
        """Get list of seasons that have data in the database"""
        result = db.session.query(MLBSnapshot.season).distinct().order_by(MLBSnapshot.season.desc()).all()
        return [row[0] for row in result if row[0] is not None]
    
    @property
    def timestamp_aware(self):
        """Return timestamp with timezone awareness if needed"""
        if self.timestamp.tzinfo is None:
            # If timestamp is naive, make it timezone-aware
            return self.timestamp.replace(tzinfo=timezone.utc)
        return self.timestamp
    
    @staticmethod
    def get_team_history(team_id, limit=365, season=None):
        """Get historical positions for a specific team

        Args:
            team_id: Team ID to get history for
            limit: Maximum number of snapshots to retrieve (default 365 for full season)
            season: Optional season filter (e.g., 2025, 2026)
        """
        # Convert team_id to integer for comparison
        team_id = int(team_id)

        # Build query
        query = MLBSnapshot.query
        if season:
            query = query.filter_by(season=season)

        # Get the most recent snapshots
        snapshots = query.order_by(MLBSnapshot.timestamp.desc()).limit(limit).all()
        
        # Extract team data from each snapshot
        history = []
        missing_snapshots = 0
        
        for snapshot in snapshots:
            found = False
            teams = snapshot.teams
            for team in teams:
                if isinstance(team, dict) and team.get('id') == team_id:
                    history.append({
                        'timestamp': snapshot.timestamp_aware.isoformat(),
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