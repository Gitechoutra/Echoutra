

import logging

from werkzeug.security import generate_password_hash

from portal import db

from portal.models.users import Users, UserStatus
from portal.models.roles import Roles, RoleTypes
from portal.models.user_profiles import UserProfiles
from portal.models.user_preferences import UserPreferences
from portal.models.user_security_settings import UserSecuritySettings
from portal.models.wallets import Wallets
from portal.models.notification_preferences import NotificationPreferences

logger = logging.getLogger(__name__)


def seed_admin():
    """
    Create or update the default ADMIN account.
    """

    admin_role = Roles.query.filter_by(
        role_name=RoleTypes.ADMIN
    ).first()

    if not admin_role:
        logger.warning(
            "[Seeder] ADMIN role not found. Run seed_roles() first."
        )
        return

    # Default Admin Credentials
    admin_email = "ramanarajmuddada20@gmail.com"
    admin_password = "Ramana@123"
    admin_username = "tradeflow_admin"

    existing_admin = Users.query.filter_by(
        role_id=admin_role.role_id
    ).first()

    #  ──────
    # UPDATE EXISTING ADMIN
    #  ──────
    if existing_admin:

        existing_admin.email = admin_email
        existing_admin.username = admin_username
        existing_admin.password_hash = generate_password_hash(
            admin_password
        )
        existing_admin.full_name = "TradeFlow Admin"
        existing_admin.status = UserStatus.ACTIVE
        existing_admin.is_email_verified = True

        db.session.commit()

        logger.info(
            f"[Seeder] Existing ADMIN updated: {admin_email}"
        )

        return

    #  ──────
    # CREATE NEW ADMIN
    #  ──────
    user = Users()
    user.email = admin_email
    user.username = admin_username
    user.password_hash = generate_password_hash(admin_password)
    user.full_name = "TradeFlow Admin"
    user.role_id = admin_role.role_id
    user.status = UserStatus.ACTIVE
    user.is_email_verified = True

    user.save()

    # Create User Profile
    profile = UserProfiles()
    profile.user_id = user.user_id
    profile.first_name = "TradeFlow"
    profile.last_name = "Admin"
    profile.save()

    # Create User Preferences
    prefs = UserPreferences()
    prefs.user_id = user.user_id
    prefs.save()

    # Create Security Settings
    sec = UserSecuritySettings()
    sec.user_id = user.user_id
    sec.save()

    # Create Wallet
    wallet = Wallets()
    wallet.user_id = user.user_id
    wallet.save()

    # Create Notification Preferences
    notif_pref = NotificationPreferences()
    notif_pref.user_id = user.user_id
    notif_pref.save()

    logger.info(
        f"[Seeder] ADMIN created successfully: {admin_email}"
    )

    logger.warning(
        "[Seeder] Default ADMIN password is active. "
        "Change it immediately in production."
    )





















