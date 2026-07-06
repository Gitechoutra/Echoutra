from datetime import datetime
from portal import db


class RoleTypes:
    ADMIN = "ADMIN"
    USER = "USER"

    CHOICES = [ADMIN, USER]


class Roles(db.Model):
    __tablename__ = 'roles'

    role_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    role_name = db.Column(db.String(50), unique=True, nullable=False)  # ADMIN, USER
    description = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, default=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    users = db.relationship('Users', back_populates='role', lazy='dynamic')

    def __repr__(self):
        return f"<Role {self.role_name}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
