from datetime import datetime
from portal import db


class TradeExecutions(db.Model):
    __tablename__ = 'trade_executions'

    execution_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    order_id = db.Column(db.Integer, db.ForeignKey('trade_orders.order_id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    stock_id = db.Column(db.Integer, db.ForeignKey('stocks.stock_id'), nullable=False, index=True)

    executed_quantity = db.Column(db.Numeric(15, 6), nullable=False)
    execution_price = db.Column(db.Numeric(15, 4), nullable=False)
    execution_amount = db.Column(db.Numeric(15, 2), nullable=False)   # qty * price

    # Fees for this specific execution
    commission = db.Column(db.Numeric(10, 4), default=0.0000)
    sec_fee = db.Column(db.Numeric(10, 4), default=0.0000)
    total_fee = db.Column(db.Numeric(10, 4), default=0.0000)
    net_amount = db.Column(db.Numeric(15, 2), nullable=False)         # execution_amount - total_fee

    # Exchange / routing info
    exchange = db.Column(db.String(50), nullable=True)
    routing = db.Column(db.String(100), nullable=True)                 # Market maker / routing venue
    external_execution_id = db.Column(db.String(255), nullable=True)  # Broker execution ID

    executed_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    created_on = db.Column(db.DateTime, default=datetime.now)

    # Relationships
    order = db.relationship('TradeOrders', back_populates='executions')

    def __repr__(self):
        return f"<TradeExecution execution_id={self.execution_id} order_id={self.order_id} price={self.execution_price}>"

    def save(self):
        db.session.add(self)
        db.session.commit()

    def update(self):
        db.session.commit()

    def delete(self):
        db.session.delete(self)
        db.session.commit()
