"""
Seeds — run once to insert default Roles and an ADMIN user.
Usage:
    flask shell
    >>> from portal.seeds import seed_all; seed_all()
Or directly:
    python -c "from app import app; app.app_context().push(); from portal.seeds import seed_all; seed_all()"
"""
from werkzeug.security import generate_password_hash
from portal.models import db
from portal.models.roles import Roles, RoleTypes
from portal.models.users import Users
from portal.models.wallet import Wallet


def seed_roles():
    for name, desc in [
        (RoleTypes.ADMIN, 'Platform administrator with full access'),
        (RoleTypes.USER,  'Regular trader / investor'),
    ]:
        if not Roles.query.filter_by(role_name=name).first():
            r             = Roles()
            r.role_name   = name
            r.description = desc
            db.session.add(r)
    db.session.commit()
    print('Roles seeded.')


def seed_admin():
    admin_role = Roles.query.filter_by(role_name=RoleTypes.ADMIN).first()
    if not admin_role:
        print('Admin role not found — run seed_roles() first.')
        return

    if Users.query.filter_by(email='admin@stockmarket.com').first():
        print('Admin user already exists.')
        return

    user               = Users()
    user.full_name     = 'Platform Admin'
    user.email         = 'ramana@stockmarket.com'
    user.mobile        = '7095329074'
    user.password      = generate_password_hash('Ramana@123')
    user.role_id       = admin_role.role_id
    user.status        = 'ACTIVE'
    user.wallet_balance = 0
    db.session.add(user)
    db.session.flush()

    wallet         = Wallet()
    wallet.user_id = user.user_id
    wallet.balance = 0
    db.session.add(wallet)

    db.session.commit()
    print(f'Admin user created: ramana@stockmarket.com / Ramana@123')


def seed_all():
    seed_roles()
    seed_admin()
    print('All seeds complete.')
