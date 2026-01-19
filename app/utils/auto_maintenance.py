# app/utils/auto_maintenance.py
"""
Automated database maintenance system for free-tier deployments.

This module provides self-managing database cleanup that runs automatically
without requiring console access or manual intervention. Designed for:
- Render free tier (limited console access)
- Supabase free tier (connection limits)
- Apps that are frequently offline/sleeping
"""

import logging
from datetime import datetime, timezone, timedelta
from app import db
from app.models.mlb_snapshot import MLBSnapshot
from sqlalchemy import func, text

logger = logging.getLogger(__name__)


class AutoMaintenance:
    """Self-managing database maintenance system"""

    # Maintenance configuration
    SNAPSHOT_LIMITS = {
        'emergency': 5000,      # Trigger emergency cleanup
        'aggressive': 3000,     # Trigger aggressive cleanup
        'normal': 2000,         # Trigger normal cleanup
        'target_emergency': 500,  # Target after emergency cleanup
        'target_aggressive': 1500,  # Target after aggressive cleanup
        'target_normal': 1800,  # Target after normal cleanup
    }

    RETENTION_POLICIES = {
        'current_season': {
            'recent': {'hours': 48, 'keep_every': 1},      # Keep all last 48 hours
            'week': {'days': 7, 'keep_every_hours': 1},    # Keep hourly for week
            'month': {'days': 30, 'keep_every_hours': 6},  # Keep every 6h for month
            'season': {'days': 240, 'keep_every_hours': 24}  # Keep daily for full season
        },
        'past_seasons': {
            'keep_every_hours': 168  # Keep weekly snapshots only
        }
    }

    @staticmethod
    def should_run_maintenance():
        """
        Determine if maintenance should run based on snapshot count.

        Returns:
            tuple: (should_run: bool, urgency: str, count: int)
        """
        try:
            count = MLBSnapshot.query.count()

            if count >= AutoMaintenance.SNAPSHOT_LIMITS['emergency']:
                return True, 'emergency', count
            elif count >= AutoMaintenance.SNAPSHOT_LIMITS['aggressive']:
                return True, 'aggressive', count
            elif count >= AutoMaintenance.SNAPSHOT_LIMITS['normal']:
                return True, 'normal', count

            return False, 'none', count

        except Exception as e:
            logger.error(f"Error checking maintenance status: {e}")
            return False, 'error', 0

    @staticmethod
    def get_maintenance_stats():
        """Get detailed database statistics for monitoring"""
        try:
            total_count = MLBSnapshot.query.count()

            # Count by season
            season_counts = db.session.query(
                MLBSnapshot.season,
                func.count(MLBSnapshot.id).label('count')
            ).group_by(MLBSnapshot.season).all()

            # Get oldest and newest snapshots
            oldest = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.asc()).first()
            newest = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).first()

            # Count duplicates (same hash)
            duplicates = db.session.query(
                MLBSnapshot.data_hash,
                func.count(MLBSnapshot.id).label('count')
            ).group_by(MLBSnapshot.data_hash).having(func.count(MLBSnapshot.id) > 1).count()

            # Count incomplete snapshots (< 30 teams)
            incomplete = MLBSnapshot.query.filter(MLBSnapshot.team_count < 30).count()

            return {
                'total': total_count,
                'by_season': {s: c for s, c in season_counts if s is not None},
                'oldest': oldest.timestamp_aware.isoformat() if oldest else None,
                'newest': newest.timestamp_aware.isoformat() if newest else None,
                'duplicates': duplicates,
                'incomplete': incomplete,
                'null_season': sum(1 for s, c in season_counts if s is None)
            }

        except Exception as e:
            logger.error(f"Error getting maintenance stats: {e}")
            return {'error': str(e)}

    @staticmethod
    def run_auto_maintenance(urgency='normal', dry_run=False):
        """
        Run automated maintenance based on urgency level.

        Args:
            urgency: 'normal', 'aggressive', or 'emergency'
            dry_run: If True, only report what would be deleted

        Returns:
            dict: Results of maintenance operation
        """
        logger.info(f"Starting auto-maintenance with urgency: {urgency}")

        results = {
            'started_at': datetime.now(timezone.utc).isoformat(),
            'urgency': urgency,
            'dry_run': dry_run,
            'removed_ids': [],
            'kept_ids': [],
            'errors': []
        }

        try:
            current_season = MLBSnapshot.get_current_season()

            # Step 1: Remove duplicates (same hash within 1 hour)
            duplicate_results = AutoMaintenance._remove_duplicates(dry_run)
            results['duplicates_removed'] = len(duplicate_results)
            results['removed_ids'].extend(duplicate_results)

            # Step 2: Remove incomplete snapshots (< 28 teams)
            incomplete_results = AutoMaintenance._remove_incomplete(dry_run)
            results['incomplete_removed'] = len(incomplete_results)
            results['removed_ids'].extend(incomplete_results)

            # Step 3: Apply retention policy based on urgency
            target_count = AutoMaintenance.SNAPSHOT_LIMITS[f'target_{urgency}']
            retention_results = AutoMaintenance._apply_retention_policy(
                current_season=current_season,
                urgency=urgency,
                target_count=target_count,
                dry_run=dry_run
            )
            results['retention_removed'] = len(retention_results['removed'])
            results['removed_ids'].extend(retention_results['removed'])
            results['kept_ids'] = retention_results['kept']

            # Commit if not dry run
            if not dry_run:
                db.session.commit()
                logger.info(f"Auto-maintenance committed: {len(results['removed_ids'])} removed")

                # Run VACUUM for SQLite to reclaim space
                try:
                    if 'sqlite' in db.engine.url.drivername:
                        db.session.execute(text('VACUUM'))
                        logger.info("SQLite VACUUM completed")
                except Exception as e:
                    logger.warning(f"VACUUM failed: {e}")

            results['finished_at'] = datetime.now(timezone.utc).isoformat()
            results['total_removed'] = len(results['removed_ids'])
            results['final_count'] = MLBSnapshot.query.count() if not dry_run else 'N/A (dry run)'

        except Exception as e:
            logger.error(f"Auto-maintenance error: {e}")
            results['errors'].append(str(e))
            db.session.rollback()

        return results

    @staticmethod
    def _remove_duplicates(dry_run=False):
        """Remove duplicate snapshots (same data_hash within 1 hour)"""
        removed = []

        try:
            # Find groups of duplicates
            duplicates = db.session.query(
                MLBSnapshot.data_hash,
                func.min(MLBSnapshot.id).label('keep_id')
            ).group_by(MLBSnapshot.data_hash).having(func.count(MLBSnapshot.id) > 1).all()

            for data_hash, keep_id in duplicates:
                # Delete all but the oldest (min id)
                to_delete = MLBSnapshot.query.filter(
                    MLBSnapshot.data_hash == data_hash,
                    MLBSnapshot.id != keep_id
                ).all()

                for snapshot in to_delete:
                    removed.append(snapshot.id)
                    if not dry_run:
                        db.session.delete(snapshot)

            logger.info(f"Duplicates: {len(removed)} snapshots marked for removal")

        except Exception as e:
            logger.error(f"Error removing duplicates: {e}")

        return removed

    @staticmethod
    def _remove_incomplete(dry_run=False):
        """Remove snapshots with < 28 teams (incomplete data)"""
        removed = []

        try:
            incomplete = MLBSnapshot.query.filter(MLBSnapshot.team_count < 28).all()

            for snapshot in incomplete:
                removed.append(snapshot.id)
                if not dry_run:
                    db.session.delete(snapshot)

            logger.info(f"Incomplete: {len(removed)} snapshots marked for removal")

        except Exception as e:
            logger.error(f"Error removing incomplete: {e}")

        return removed

    @staticmethod
    def _apply_retention_policy(current_season, urgency, target_count, dry_run=False):
        """Apply retention policy to reduce snapshot count to target"""
        removed = []
        kept = []

        try:
            # Get all snapshots ordered by timestamp
            all_snapshots = MLBSnapshot.query.order_by(MLBSnapshot.timestamp.desc()).all()
            current_count = len(all_snapshots)

            if current_count <= target_count:
                logger.info(f"Current count {current_count} <= target {target_count}, no retention needed")
                return {'removed': [], 'kept': [s.id for s in all_snapshots]}

            now = datetime.now(timezone.utc)

            for snapshot in all_snapshots:
                age = now - snapshot.timestamp_aware
                is_current_season = (snapshot.season == current_season)

                keep = False

                if is_current_season:
                    # Current season retention
                    if age <= timedelta(hours=48):
                        keep = True  # Keep all last 48 hours
                    elif age <= timedelta(days=7) and snapshot.timestamp.hour % 1 == 0:
                        keep = True  # Keep hourly for week
                    elif age <= timedelta(days=30) and snapshot.timestamp.hour % 6 == 0:
                        keep = True  # Keep every 6h for month
                    elif age <= timedelta(days=240) and snapshot.timestamp.hour == 12:
                        keep = True  # Keep daily (noon snapshot) for season
                else:
                    # Past seasons: keep weekly only
                    if snapshot.timestamp.weekday() == 0 and snapshot.timestamp.hour == 12:
                        keep = True  # Keep Monday noon snapshots

                # If we're in aggressive/emergency mode, be more strict
                if urgency == 'emergency' and age > timedelta(days=90):
                    keep = False  # Drop anything older than 90 days in emergency
                elif urgency == 'aggressive' and not is_current_season and age > timedelta(days=180):
                    keep = False  # Drop old past-season data in aggressive mode

                if keep:
                    kept.append(snapshot.id)
                else:
                    removed.append(snapshot.id)

                    # Stop if we've reached target
                    if current_count - len(removed) <= target_count:
                        # Keep all remaining
                        for remaining in all_snapshots[all_snapshots.index(snapshot) + 1:]:
                            kept.append(remaining.id)
                        break

            # Actually delete if not dry run
            if not dry_run:
                for snapshot_id in removed:
                    snapshot = MLBSnapshot.query.get(snapshot_id)
                    if snapshot:
                        db.session.delete(snapshot)

            logger.info(f"Retention policy: {len(removed)} to remove, {len(kept)} to keep")

        except Exception as e:
            logger.error(f"Error applying retention policy: {e}")

        return {'removed': removed, 'kept': kept}

    @staticmethod
    def backfill_metadata():
        """
        Backfill season, team_count, and data_hash for existing snapshots.
        Run this once after deploying the updated schema.
        """
        logger.info("Starting metadata backfill...")

        try:
            snapshots_to_update = MLBSnapshot.query.filter(
                (MLBSnapshot.season == None) |
                (MLBSnapshot.team_count == 0) |
                (MLBSnapshot.data_hash == None)
            ).all()

            updated = 0
            for snapshot in snapshots_to_update:
                try:
                    # Determine season from timestamp
                    if snapshot.season is None:
                        timestamp = snapshot.timestamp_aware
                        snapshot.season = timestamp.year if timestamp.month >= 4 else timestamp.year - 1

                    # Calculate team count
                    if snapshot.team_count == 0:
                        teams = snapshot.teams
                        snapshot.team_count = len(teams) if isinstance(teams, list) else 0

                    # Calculate hash
                    if snapshot.data_hash is None:
                        import hashlib
                        snapshot.data_hash = hashlib.sha256(snapshot.data.encode()).hexdigest()

                    updated += 1

                    # Commit in batches of 100
                    if updated % 100 == 0:
                        db.session.commit()
                        logger.info(f"Backfilled {updated} snapshots...")

                except Exception as e:
                    logger.error(f"Error backfilling snapshot {snapshot.id}: {e}")
                    db.session.rollback()

            # Final commit
            db.session.commit()
            logger.info(f"Metadata backfill complete: {updated} snapshots updated")

            return {'success': True, 'updated': updated}

        except Exception as e:
            logger.error(f"Metadata backfill failed: {e}")
            db.session.rollback()
            return {'success': False, 'error': str(e)}
