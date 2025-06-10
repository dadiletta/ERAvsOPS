# app/utils/snapshot_cleanup.py
"""
Lightweight startup cleanup for MLB snapshots.
Processes a small batch each run to gradually reduce redundancies.
"""

import json
import logging
import hashlib
from typing import Set, List
from datetime import datetime, timedelta

from app import db
from app.models.mlb_snapshot import MLBSnapshot

logger = logging.getLogger(__name__)

def _snapshot_fingerprint(raw_json: str) -> str:
    """
    Create a fingerprint for snapshot data to detect duplicates.
    Normalizes small float differences and team order.
    """
    try:
        data = json.loads(raw_json)
        norm = {}
        for team in data:
            tid = int(team["id"])
            norm[tid] = (
                round(float(team.get("era", 0)), 3),
                round(float(team.get("ops", 0)), 3),
                int(team.get("wins", 0)),
                int(team.get("losses", 0))
            )
        # Sort by team id for consistent hash
        fingerprint = json.dumps(sorted(norm.items()))
        return hashlib.sha1(fingerprint.encode()).hexdigest()
    except Exception as e:
        logger.warning(f"Could not create fingerprint: {e}")
        return ""

def _is_incomplete(raw_json: str, min_teams: int = 28) -> bool:
    """Check if snapshot has insufficient team data."""
    try:
        data = json.loads(raw_json)
        return len(data) < min_teams
    except Exception:
        return True  # Treat unparseable JSON as incomplete

def lightweight_snapshot_cleanup(batch_size: int = 50) -> dict:
    """
    Lightweight cleanup that processes a small batch of recent snapshots.
    Removes duplicates and incomplete snapshots gradually over time.
    
    Args:
        batch_size: Maximum number of snapshots to process per run
        
    Returns:
        Dict with cleanup statistics
    """
    logger.info(f"Starting lightweight snapshot cleanup (batch size: {batch_size})")
    
    # Focus on recent snapshots (last 7 days) to keep it fast
    cutoff_date = datetime.utcnow() - timedelta(days=7)
    
    # Get a small batch of recent snapshots, ordered by timestamp
    snapshots = (MLBSnapshot.query
                 .filter(MLBSnapshot.timestamp >= cutoff_date)
                 .order_by(MLBSnapshot.timestamp.desc())
                 .limit(batch_size)
                 .all())
    
    if not snapshots:
        logger.info("No recent snapshots to process")
        return {"processed": 0, "removed": 0, "duplicates": 0, "incomplete": 0}
    
    fingerprints_seen: Set[str] = set()
    to_remove: List[int] = []
    duplicate_count = 0
    incomplete_count = 0
    
    for snapshot in snapshots:
        # Check for incomplete snapshots
        if _is_incomplete(snapshot.data):
            to_remove.append(snapshot.id)
            incomplete_count += 1
            logger.debug(f"Marking incomplete snapshot {snapshot.id} for removal")
            continue
        
        # Check for duplicates
        fingerprint = _snapshot_fingerprint(snapshot.data)
        if fingerprint and fingerprint in fingerprints_seen:
            to_remove.append(snapshot.id)
            duplicate_count += 1
            logger.debug(f"Marking duplicate snapshot {snapshot.id} for removal")
        else:
            fingerprints_seen.add(fingerprint)
    
    # Remove flagged snapshots
    removed_count = 0
    if to_remove:
        try:
            removed_count = (MLBSnapshot.query
                           .filter(MLBSnapshot.id.in_(to_remove))
                           .delete(synchronize_session=False))
            db.session.commit()
            logger.info(f"Removed {removed_count} snapshots ({duplicate_count} duplicates, {incomplete_count} incomplete)")
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error removing snapshots: {e}")
            removed_count = 0
    
    return {
        "processed": len(snapshots),
        "removed": removed_count,
        "duplicates": duplicate_count,
        "incomplete": incomplete_count
    }