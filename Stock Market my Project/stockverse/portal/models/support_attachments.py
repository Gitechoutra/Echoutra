from datetime import datetime
from portal import db


class SupportAttachments(db.Model):
    """
    Image (and future file) attachments for support-chat messages.

    Each row belongs to exactly one `support_messages` row (one attachment per
    message — WhatsApp-style image bubbles). The physical file is stored on disk
    under `<UPLOAD_FOLDER>/support_chat/<stored_name>`; only metadata lives here.
    Access is authorised at serve time: the thread owner (`user_id`) or any admin.
    """
    __tablename__ = 'support_attachments'

    attachment_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # The message this attachment belongs to
    message_id    = db.Column(db.Integer, db.ForeignKey('support_messages.message_id', ondelete='CASCADE'),
                              nullable=False, index=True)

    # Thread owner (investor) — used for access control on the serve route
    user_id       = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    # Actual author of the attachment (the admin's id on admin uploads)
    uploaded_by   = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    file_name     = db.Column(db.String(255), nullable=False)   # original client filename
    stored_name   = db.Column(db.String(255), nullable=False)   # uuid.ext on disk
    mime_type     = db.Column(db.String(100), nullable=True)
    file_size     = db.Column(db.Integer, nullable=True)        # bytes

    created_on    = db.Column(db.DateTime, default=datetime.now, index=True)

    def __repr__(self):
        return f"<SupportAttachment id={self.attachment_id} msg={self.message_id} file={self.file_name}>"

    def to_dict(self):
        return {
            'attachment_id': self.attachment_id,
            'message_id':    self.message_id,
            'file_name':     self.file_name,
            'mime_type':     self.mime_type,
            'file_size':     self.file_size,
            # Relative API path; the client appends `?token=<jwt>` so <img> can load it.
            'url':           f'/support/attachment/{self.attachment_id}',
            'created_on':    str(self.created_on),
        }

    def save(self):
        db.session.add(self)
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
