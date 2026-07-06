from datetime import datetime
from portal import db


class UserDashboardLayouts(db.Model):
    """
    Stores each user's personal dashboard widget placement and configuration.
    Allows drag-and-drop customisation saved per user.
    """
    __tablename__ = 'user_dashboard_layouts'

    layout_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    widget_id = db.Column(db.Integer, db.ForeignKey('dashboard_widgets.widget_id'), nullable=False)

    # Grid position (12-column grid)
    grid_x = db.Column(db.Integer, default=0)
    grid_y = db.Column(db.Integer, default=0)
    grid_width = db.Column(db.Integer, default=4)
    grid_height = db.Column(db.Integer, default=2)

    is_visible = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)

    # Widget-specific configuration (e.g. chart period, selected portfolio, etc.)
    config = db.Column(db.JSON, nullable=True)

    created_on = db.Column(db.DateTime, default=datetime.now)
    updated_on = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'widget_id', name='uq_user_widget'),
    )

    # Relationships
    user = db.relationship('Users', back_populates='dashboard_layouts')
    widget = db.relationship('DashboardWidgets', back_populates='user_layouts')

    def __repr__(self):
        return f"<UserDashboardLayout layout_id={self.layout_id} user_id={self.user_id} widget_id={self.widget_id}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
