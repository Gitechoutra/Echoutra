"""
portal/helpers/price_alert_engine.py
====================================
Evaluates user price alerts against live prices and fires PRICE_ALERT notifications.

Alerts were previously created and stored by the price-alerts UI but nothing ever
checked them, so a PRICE_ALERT notification was never sent in the platform's life.
`process_price_alerts()` runs on the scheduler tick, right after live prices refresh.

Conditions
----------
    ABOVE        : price >= target
    BELOW        : price <= target
    PERCENT_UP   : gain from previous close >= target %
    PERCENT_DOWN : loss from previous close >= target %
    CROSSES      : price moved through the target in either direction since
                   the previous close

An alert fires once and moves to TRIGGERED, unless `repeat` is set — then it
re-arms until `max_triggers` is reached.
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal

from portal import db
from portal.models.price_alerts import PriceAlerts, PriceAlertCondition, PriceAlertStatus
from portal.models.stocks import Stocks
from portal.models.notifications import NotificationType, NotificationPriority

logger = logging.getLogger('stockmarket')


def _d(v):
    return Decimal(str(v if v is not None else 0))


def check_alert(alert: PriceAlerts, price: Decimal, prev_close: Decimal) -> bool:
    """True when this alert's condition is met at the given price."""
    target = _d(alert.target_value)
    if price <= 0:
        return False

    cond = (alert.condition or '').upper()
    if cond == PriceAlertCondition.ABOVE:
        return price >= target
    if cond == PriceAlertCondition.BELOW:
        return price <= target
    if cond == PriceAlertCondition.CROSSES:
        if prev_close <= 0:
            return False
        return (prev_close < target <= price) or (prev_close > target >= price)
    if cond in (PriceAlertCondition.PERCENT_UP, PriceAlertCondition.PERCENT_DOWN):
        if prev_close <= 0:
            return False
        change_pct = (price - prev_close) / prev_close * 100
        if cond == PriceAlertCondition.PERCENT_UP:
            return change_pct >= target
        return change_pct <= -abs(target)
    return False


def _fire(alert: PriceAlerts, stock: Stocks, price: Decimal):
    """Record the trigger and notify the user."""
    from portal.helpers.notify import notify_user

    now = datetime.now(timezone.utc)
    alert.trigger_count        = (alert.trigger_count or 0) + 1
    alert.last_triggered_at    = now
    alert.last_triggered_price = price
    if alert.first_triggered_at is None:
        alert.first_triggered_at = now

    # Re-arm only while the trigger budget lasts; otherwise close the alert out.
    exhausted = (alert.max_triggers is not None and alert.trigger_count >= alert.max_triggers)
    alert.status = PriceAlertStatus.ACTIVE if (alert.repeat and not exhausted) else PriceAlertStatus.TRIGGERED
    db.session.commit()

    symbol = stock.ticker_symbol if stock else 'Stock'
    cond   = (alert.condition or '').replace('_', ' ').lower()
    notify_user(
        alert.user_id,
        NotificationType.PRICE_ALERT,
        title=f'{symbol} price alert',
        body=(f'{symbol} is at ₹{price:.2f} — your "{cond} {alert.target_value}" alert triggered.'
              + (f' Note: {alert.note}' if alert.note else '')),
        priority=NotificationPriority.HIGH,
        action_url=f'/user/stocks/{alert.stock_id}',
        reference_type='PRICE_ALERT',
        reference_id=str(alert.price_alert_id),
    )


def process_price_alerts() -> dict:
    """
    Scan every ACTIVE alert, expire the stale ones, and fire those whose condition
    is met. Each alert is isolated so one failure can't stall the rest.
    """
    alerts = PriceAlerts.query.filter_by(status=PriceAlertStatus.ACTIVE).all()
    if not alerts:
        return {'checked': 0, 'triggered': 0, 'expired': 0, 'errors': 0}

    now = datetime.now(timezone.utc)
    triggered = expired = errors = 0

    for alert in alerts:
        try:
            exp = alert.expires_at
            if exp is not None:
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp < now:
                    alert.status = PriceAlertStatus.EXPIRED
                    db.session.commit()
                    expired += 1
                    continue

            stock = Stocks.query.get(alert.stock_id)
            if not stock:
                continue
            price = _d(stock.current_price)
            prev  = _d(stock.previous_close) if stock.previous_close else price

            if check_alert(alert, price, prev):
                _fire(alert, stock, price)
                triggered += 1
        except Exception as e:
            db.session.rollback()
            errors += 1
            logger.error(f'[price_alerts] alert {alert.price_alert_id} failed: {e}')

    if triggered or expired:
        logger.info(f'[price_alerts] {triggered} triggered, {expired} expired of {len(alerts)}')
    return {'checked': len(alerts), 'triggered': triggered, 'expired': expired, 'errors': errors}
