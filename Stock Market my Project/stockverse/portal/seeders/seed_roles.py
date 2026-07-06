"""
portal/seeders/seed_roles.py
────────────────────────────
Run once at app startup (or via CLI) to ensure the two
platform roles — ADMIN and USER — always exist in the DB.

Called from create_app() inside app.py:

    with app.app_context():
        from portal.seeders.seed_roles import seed_roles
        seed_roles()
"""

import logging
from portal.models.roles import Roles, RoleTypes

logger = logging.getLogger(__name__)


DEFAULT_ROLES = [
    {
        'role_name':   RoleTypes.ADMIN,
        'description': 'Platform administrator — full access to all users, analytics, and settings.',
        'is_active':   True,
    },
    {
        'role_name':   RoleTypes.USER,
        'description': 'Standard user — can only view and manage their own portfolio.',
        'is_active':   True,
    },
]


def seed_roles():
    """
    Idempotent: inserts only roles that don't already exist.
    Safe to call on every app boot.
    """
    created = []
    for role_data in DEFAULT_ROLES:
        existing = Roles.query.filter_by(role_name=role_data['role_name']).first()
        if not existing:
            role             = Roles()
            role.role_name   = role_data['role_name']
            role.description = role_data['description']
            role.is_active   = role_data['is_active']
            role.save()
            created.append(role_data['role_name'])
            logger.info(f"[Seeder] Role created: {role_data['role_name']}")
        else:
            logger.debug(f"[Seeder] Role already exists: {role_data['role_name']}")

    if created:
        logger.info(f"[Seeder] Roles seeded: {created}")
    else:
        logger.info("[Seeder] All roles already present — nothing to seed.")