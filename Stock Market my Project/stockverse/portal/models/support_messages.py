from datetime import datetime
from portal import db


class SupportSenderRole:
    USER  = "USER"
    ADMIN = "ADMIN"

    CHOICES = [USER, ADMIN]


class SupportMessages(db.Model):
    """
    One-to-one support/chat thread per user.

    A conversation is identified by `user_id` (the investor the thread belongs
    to). Every message — whether typed by the user or by an admin replying —
    is a row here. `sender_role` says who wrote it; `sender_id` is the actual
    author's user_id (the admin's id on admin replies).
    """
    __tablename__ = 'support_messages'

    message_id  = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id     = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    sender_role = db.Column(db.String(10), nullable=False)   # USER | ADMIN
    sender_id   = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    message     = db.Column(db.Text, nullable=False)

    is_read_by_user  = db.Column(db.Boolean, default=False, index=True)
    is_read_by_admin = db.Column(db.Boolean, default=False, index=True)

    created_on  = db.Column(db.DateTime, default=datetime.now, index=True)

    def __repr__(self):
        return f"<SupportMessage id={self.message_id} user={self.user_id} role={self.sender_role}>"

    def to_dict(self):
        return {
            'message_id':  self.message_id,
            'user_id':     self.user_id,
            'sender_role': self.sender_role,
            'sender_id':   self.sender_id,
            'message':     self.message,
            'is_read_by_user':  self.is_read_by_user,
            'is_read_by_admin': self.is_read_by_admin,
            'created_on':  str(self.created_on),
        }

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
