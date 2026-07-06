

from datetime import datetime

from portal import db


class PaymentStatus:
    CREATED = "CREATED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"

    CHOICES = [
        CREATED,
        COMPLETED,
        FAILED,
        REFUNDED
    ]


class PaymentTransactions(db.Model):
    __tablename__ = "payment_transactions"

    payment_id = db.Column(
        db.Integer,
        primary_key=True,
        autoincrement=True
    )

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.user_id"),
        nullable=False,
        index=True
    )

    razorpay_order_id = db.Column(
        db.String(100),
        unique=True,
        nullable=False,
        index=True
    )

    razorpay_payment_id = db.Column(
        db.String(100),
        nullable=True,
        unique=True
    )

    razorpay_signature = db.Column(
        db.String(255),
        nullable=True
    )

    amount = db.Column(
        db.Numeric(20, 2),
        nullable=False
    )

    currency = db.Column(
        db.String(10),
        default="INR"
    )

    status = db.Column(
        db.String(20),
        default=PaymentStatus.CREATED
    )

    payment_metadata = db.Column(
        db.JSON,
        nullable=True
    )

    created_on = db.Column(
        db.DateTime,
        default=datetime.now
    )

    completed_on = db.Column(
        db.DateTime,
        nullable=True
    )

    updated_on = db.Column(
        db.DateTime,
        default=datetime.now,
        onupdate=datetime.now
    )

    # Relationship
    user = db.relationship(
        "Users",
        back_populates="payment_transactions"
    )

    def __repr__(self):
        return f"<PaymentTransaction {self.payment_id} - {self.status}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()