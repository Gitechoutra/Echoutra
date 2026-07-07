"""
portal/helpers/notify.py
========================
Central, reusable notification dispatch layer.

Any part of the platform (especially admin actions that add new content —
stocks, news, plan upgrades, etc.) can call these helpers to create in-app
notifications that surface in the user's Notifications bell.

Design goals
------------
* **Never break the caller.** A failure to notify must never roll back or
  500 the primary admin action. Every public function swallows and logs its
  own errors and returns a count instead of raising.
* **Bulk-friendly.** Broadcasts insert in one flush/commit, not one commit
  per user, so notifying thousands of users stays fast.
* **Single source of truth.** All notification creation funnels through
  `_build` so the column mapping lives in exactly one place.
"""

import logging
import traceback
from datetime import datetime

from portal import db
from portal.models.notifications import Notifications, NotificationPriority

logger = logging.getLogger(__name__)


def _build(user_id, notification_type, title, body, *,
           priority=NotificationPriority.MEDIUM, action_url=None, icon=None,
           image_url=None, reference_type=None, reference_id=None):
    """Construct (but do not commit) a single Notifications row."""
    n                   = Notifications()
    n.user_id           = user_id
    n.notification_type = (notification_type or "SYSTEM").upper()
    n.priority          = (priority or NotificationPriority.MEDIUM).upper()
    n.title             = title
    n.body              = body
    n.action_url        = action_url or None
    n.icon              = icon or None
    n.image_url         = image_url or None
    n.reference_type    = reference_type or None
    n.reference_id      = reference_id or None
    n.is_read           = False
    n.is_dismissed      = False
    n.created_on        = datetime.now()
    return n


def notify_user(user_id, notification_type, title, body, **kwargs):
    """Create a notification for a single user. Returns True on success."""
    try:
        db.session.add(_build(user_id, notification_type, title, body, **kwargs))
        db.session.commit()
        return True
    except Exception as e:
        db.session.rollback()
        logger.error(f"[notify] notify_user failed for user {user_id}: {e}")
        traceback.print_exc()
        return False


def notify_users(user_ids, notification_type, title, body, **kwargs):
    """
    Create the same notification for many users in a single commit.
    Returns the number of notifications created.
    """
    user_ids = [uid for uid in dict.fromkeys(user_ids) if uid]  # de-dupe, drop falsy
    if not user_ids:
        return 0
    try:
        db.session.add_all([
            _build(uid, notification_type, title, body, **kwargs) for uid in user_ids
        ])
        db.session.commit()
        return len(user_ids)
    except Exception as e:
        db.session.rollback()
        logger.error(f"[notify] notify_users failed ({len(user_ids)} users): {e}")
        traceback.print_exc()
        return 0


def broadcast_to_all(notification_type, title, body, *, exclude_user_id=None, **kwargs):
    """
    Send a notification to every ACTIVE user on the platform.

    Used when the admin adds platform-wide content (a new stock listing,
    a market-wide news article, etc.). `exclude_user_id` lets you skip the
    admin who triggered the action.
    """
    try:
        from portal.models.users import Users, UserStatus
        q = Users.query.filter_by(status=UserStatus.ACTIVE)
        if exclude_user_id:
            q = q.filter(Users.user_id != exclude_user_id)
        user_ids = [u.user_id for u in q.with_entities(Users.user_id).all()]
        return notify_users(user_ids, notification_type, title, body, **kwargs)
    except Exception as e:
        logger.error(f"[notify] broadcast_to_all failed: {e}")
        traceback.print_exc()
        return 0


def notify_stock_watchers(stock_id, notification_type, title, body, *,
                          exclude_user_id=None, **kwargs):
    """
    Notify only users who have the given stock in a watchlist. Useful for
    news that is specific to a company rather than the whole market.
    Returns the number of users notified.
    """
    try:
        from portal.models.watchlist_items import WatchlistItems
        rows = (WatchlistItems.query
                .with_entities(WatchlistItems.user_id)
                .filter_by(stock_id=stock_id)
                .distinct()
                .all())
        user_ids = [r.user_id for r in rows if r.user_id != exclude_user_id]
        return notify_users(user_ids, notification_type, title, body, **kwargs)
    except Exception as e:
        logger.error(f"[notify] notify_stock_watchers failed (stock {stock_id}): {e}")
        traceback.print_exc()
        return 0
