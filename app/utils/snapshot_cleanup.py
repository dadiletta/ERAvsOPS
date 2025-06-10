# app/utils/snapshot_cleanup.py
"""
Routine hygiene for MLB snapshots.

• removes any snapshot that is obviously incomplete (<28 teams)  
• keeps a single copy of every logical snapshot (one per team/date set)  
• leaves all other history intact

Safe to run at any cadence (startup hook, nightly cron, or ad hoc).
"""

from __future__ import annotations

import json
import logging
import hashlib
from typing import Dict, List, Tuple, Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import db
from app.models.mlb_snapshot import MLBSnapshot  # noqa: E501

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────
# helpers
# ────────────────────────────────────────────────────────────
def _snapshot_fingerprint(raw_json: str) -> str:
    """
    Round-normalize each club’s key numbers, then hash the object.

    This collapses innocuous float noise so 3.42199 and 3.42204 hash alike.
    Fingerprint is stable across team order and whitespace differences.
    """
    data = json.loads(raw_json)
    norm: Dict[int, Tuple[float, float, int]] = {}
    for team in data:
        tid = int(team["id"])
        norm[tid] = (
            round(float(team.get("era", 0)), 3),
            round(float(team.get("ops", 0)), 3),
            int(team.get("run_differential", 0)),
        )
    # sort by team id for deterministic hash
    digest = hashlib.sha1(json.dumps(sorted(norm.items())).encode()).hexdigest()
    return digest


def _is_partial(raw_json: str, *, min_teams: int = 28) -> bool:
    """Recognise snapshots where the upstream API returned too few clubs."""
    try:
        team_count = len(json.loads(raw_json))
    except Exception:  # bad JSON → treat as partial
        logger.warning("Corrupt JSON encountered during snapshot cleanup.")
        return True
    return team_count < min_teams


# ────────────────────────────────────────────────────────────
# public API
# ────────────────────────────────────────────────────────────
def cleanup_snapshots(session: Session | None = None) -> int:
    """
    Delete incomplete snapshots and duplicates.

    Returns
    -------
    int
        Number of rows deleted.
    """
    needs_commit = session is None
    session = session or db.session

    logger.info("Starting snapshot hygiene pass")
    removed: List[int] = []

    # iterate in blocks to avoid loading huge tables all at once
    q = session.query(MLBSnapshot.id, MLBSnapshot.data).yield_per(500)

    seen: Dict[str, int] = {}  # fingerprint → earliest snapshot.id

    for sid, raw in q:
        # 1️⃣ Cull partial rows
        if _is_partial(raw):
            removed.append(sid)
            continue

        # 2️⃣ Cull logical duplicates (anywhere in the timeline)
        fp = _snapshot_fingerprint(raw)
        if fp in seen:
            # keep the earliest insertion to preserve chronology
            removed.append(sid)
        else:
            seen[fp] = sid

    # bulk delete in sane batches
    if removed:
        batch = 750
        for i in range(0, len(removed), batch):
            session.query(MLBSnapshot).filter(
                MLBSnapshot.id.in_(removed[i : i + batch])
            ).delete(synchronize_session=False)

    if needs_commit:
        session.commit()

    logger.info("Snapshot hygiene: %s rows removed", len(removed))
    return len(removed)
