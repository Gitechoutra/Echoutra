from datetime import datetime
from portal import db


class UserProfiles(db.Model):
    __tablename__ = 'user_profiles'

    profile_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, unique=True)

    first_name   = db.Column(db.String(100), nullable=True)
    last_name    = db.Column(db.String(100), nullable=True)
    display_name = db.Column(db.String(150), nullable=True)
    # Text column so it can store both URL strings and base64 data URIs
    avatar_url   = db.Column(db.Text, nullable=True)
    bio          = db.Column(db.Text, nullable=True)

    phone_number      = db.Column(db.String(20), nullable=True)
    phone_country_code= db.Column(db.String(10), nullable=True)
    is_phone_verified = db.Column(db.Boolean, default=False)

    date_of_birth = db.Column(db.Date, nullable=True)
    gender        = db.Column(db.String(20), nullable=True)   # MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY

    # Address
    address_line1 = db.Column(db.String(255), nullable=True)
    address_line2 = db.Column(db.String(255), nullable=True)
    city          = db.Column(db.String(100), nullable=True)
    state         = db.Column(db.String(100), nullable=True)
    postal_code   = db.Column(db.String(20),  nullable=True)
    country       = db.Column(db.String(100), nullable=True)
    country_code  = db.Column(db.String(5),   nullable=True)

    timezone = db.Column(db.String(100), nullable=True, default='Asia/Kolkata')
    locale   = db.Column(db.String(20),  nullable=True, default='en-IN')
    # FIX: Default changed from 'USD' to 'INR' — users on this platform are
    # Indian investors. All prices, balances and transactions are displayed in ₹.
    # Individual users who hold USD-denominated assets can update this field.
    currency_preference = db.Column(db.String(10), nullable=True, default='INR')

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    user = db.relationship('Users', back_populates='profile')

    def __repr__(self):
        return f"<UserProfile user_id={self.user_id}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()






















# from datetime import datetime
# from portal import db


# class UserProfiles(db.Model):
#     __tablename__ = 'user_profiles'

#     profile_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
#     user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, unique=True)

#     first_name = db.Column(db.String(100), nullable=True)
#     last_name = db.Column(db.String(100), nullable=True)
#     display_name = db.Column(db.String(150), nullable=True)
#     # avatar_url = db.Column(db.String(500), nullable=True)
#     avatar_url = db.Column(db.Text, nullable=True)
#     bio = db.Column(db.Text, nullable=True)

#     phone_number = db.Column(db.String(20), nullable=True)
#     phone_country_code = db.Column(db.String(10), nullable=True)
#     is_phone_verified = db.Column(db.Boolean, default=False)

#     date_of_birth = db.Column(db.Date, nullable=True)
#     gender = db.Column(db.String(20), nullable=True)  # MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY

#     # Address
#     address_line1 = db.Column(db.String(255), nullable=True)
#     address_line2 = db.Column(db.String(255), nullable=True)
#     city = db.Column(db.String(100), nullable=True)
#     state = db.Column(db.String(100), nullable=True)
#     postal_code = db.Column(db.String(20), nullable=True)
#     country = db.Column(db.String(100), nullable=True)
#     country_code = db.Column(db.String(5), nullable=True)

#     timezone = db.Column(db.String(100), nullable=True, default='UTC')
#     locale = db.Column(db.String(20), nullable=True, default='en-US')
#     currency_preference = db.Column(db.String(10), nullable=True, default='USD')

#     created_on = db.Column(db.DateTime, default=datetime.now)
#     updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

#     # Relationships
#     user = db.relationship('Users', back_populates='profile')

#     def __repr__(self):
#         return f"<UserProfile user_id={self.user_id}>"

#     def save(self):
#         db.session.add(self)
#         db.session.commit()

#     def update(self):
#         db.session.commit()

#     def delete(self):
#         db.session.delete(self)
#         db.session.commit()
