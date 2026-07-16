from datetime import datetime
from portal import db


class PayoutMethodType:
    UPI          = "UPI"
    BANK_ACCOUNT = "BANK_ACCOUNT"
    NET_BANKING  = "NET_BANKING"

    CHOICES = [UPI, BANK_ACCOUNT, NET_BANKING]


class PayoutMethods(db.Model):
    """
    A destination a user can withdraw wallet funds to (UPI ID, bank account, or
    net-banking). Registration collects no payment details, so users add these
    themselves from the Wallet section of Settings.

    Only the last 4 digits of an account number are ever returned to the client —
    see `to_dict()`. `is_primary` marks the default selection in the withdraw
    dropdown; at most one method per user carries it.
    """
    __tablename__ = 'payout_methods'

    payout_method_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id          = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    method_type = db.Column(db.String(20), nullable=False)
    label       = db.Column(db.String(100), nullable=True)   # user's nickname, e.g. "Salary account"

    # UPI
    upi_id = db.Column(db.String(150), nullable=True)

    # BANK_ACCOUNT / NET_BANKING
    account_holder = db.Column(db.String(150), nullable=True)
    bank_name      = db.Column(db.String(150), nullable=True)
    account_number = db.Column(db.String(50),  nullable=True)
    ifsc           = db.Column(db.String(20),  nullable=True)

    is_primary = db.Column(db.Boolean, default=False)
    is_active  = db.Column(db.Boolean, default=True)   # soft-deleted so past withdrawals still resolve

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    user = db.relationship('Users', back_populates='payout_methods')

    def __repr__(self):
        return (f"<PayoutMethod payout_method_id={self.payout_method_id} "
                f"user_id={self.user_id} type={self.method_type}>")

    @property
    def masked_account_number(self):
        """'123456781234' -> '••••1234'. Empty string when not set."""
        value = (self.account_number or '').strip()
        if not value:
            return ''
        if len(value) <= 4:
            return '•' * len(value)
        return '••••' + value[-4:]

    @property
    def display_name(self):
        """Human label for the withdraw dropdown."""
        if self.label:
            return self.label
        if self.method_type == PayoutMethodType.UPI:
            return self.upi_id or 'UPI'
        return self.bank_name or 'Bank account'

    @property
    def display_detail(self):
        """
        Secondary line under `display_name` — never the full account number. Empty
        when it would just repeat `display_name` (an unlabelled UPI method).
        """
        if self.method_type == PayoutMethodType.UPI:
            return self.upi_id if (self.label and self.upi_id) else ''
        return f'A/C: {self.masked_account_number}' if self.account_number else ''

    def to_dict(self) -> dict:
        return {
            'payout_method_id': self.payout_method_id,
            'method_type':      self.method_type,
            'label':            self.label,
            'upi_id':           self.upi_id,
            'account_holder':   self.account_holder,
            'bank_name':        self.bank_name,
            'account_number':   self.masked_account_number,   # masked, never raw
            'ifsc':             self.ifsc,
            'is_primary':       bool(self.is_primary),
            'display_name':     self.display_name,
            'display_detail':   self.display_detail,
            'created_on':       str(self.created_on),
        }

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
