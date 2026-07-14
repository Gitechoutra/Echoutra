"""
portal/helpers/order_engine.py
==============================
Central execution + matching engine for trade orders.

Every fill — MARKET (immediate), LIMIT / STOP / STOP_LIMIT (queued and triggered
by live price) — flows through the single `execute_order()` routine so wallet,
holdings, ledgers and the portfolio are always updated consistently.

Public API
----------
* check_trigger(order, price)   -> bool      : is this pending order's price condition met?
* execute_order(order, fill_price, ...)       : fill an order and update every ledger
* process_pending_orders()      -> dict       : scan + fill all triggered pending orders
                                                 (called by the scheduler every ~10s)

Trigger semantics
-----------------
    SELL LIMIT (take-profit) : current_price >= limit_price   -> fill @ limit_price
    SELL STOP  (stop-loss)   : current_price <= stop_price    -> fill @ current_price
    BUY  LIMIT               : current_price <= limit_price   -> fill @ limit_price
    BUY  STOP                : current_price >= stop_price     -> fill @ current_price
    *    STOP_LIMIT          : stop level crossed, then behaves as LIMIT @ limit_price

Funding
-------
BUY LIMIT/STOP orders reserve `available_balance -> locked_balance` at placement
(see trade_orders route). On fill they are settled from the locked hold; call
`execute_order(..., funds_locked=True)`. MARKET buys placed with cash on hand use
`funds_locked=False`.
"""
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from portal import db
from portal.models.trade_orders       import TradeOrders, OrderType, OrderSide, OrderStatus, OrderDuration
from portal.models.trade_executions   import TradeExecutions
from portal.models.portfolio_holdings import PortfolioHoldings
from portal.models.portfolios         import Portfolios
from portal.models.wallets            import Wallets
from portal.models.wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus
from portal.models.transactions       import Transactions, TxnType, TxnStatus
from portal.models.stocks             import Stocks

logger = logging.getLogger('stockmarket')

COMMISSION_RATE = Decimal('0.001')          # 0.1% — matches the rest of the platform
_IST = timezone(timedelta(hours=5, minutes=30))

# Order statuses that are still "live" and eligible to be filled.
_OPEN_STATUSES = (OrderStatus.PENDING, OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED)
# Order types that are queued and matched against live prices.
_QUEUED_TYPES  = (OrderType.LIMIT, OrderType.STOP, OrderType.STOP_LIMIT)


def _d(v):
    """Coerce to Decimal safely."""
    return Decimal(str(v if v is not None else 0))


# ── Trigger check ────────────────────────────────────────────────────────────

def check_trigger(order: TradeOrders, price) -> bool:
    """Return True when `price` satisfies the order's trigger condition."""
    price = _d(price)
    if price <= 0:
        return False

    limit = _d(order.limit_price) if order.limit_price is not None else None
    stop  = _d(order.stop_price)  if order.stop_price  is not None else None
    side  = order.order_side
    otype = order.order_type

    if otype == OrderType.LIMIT:
        if limit is None:
            return False
        return price >= limit if side == OrderSide.SELL else price <= limit

    if otype == OrderType.STOP:
        if stop is None:
            return False
        return price <= stop if side == OrderSide.SELL else price >= stop

    if otype == OrderType.STOP_LIMIT:
        # Stop must trigger first; the fill is then governed by the limit price.
        if stop is None or limit is None:
            return False
        stop_hit = price <= stop if side == OrderSide.SELL else price >= stop
        if not stop_hit:
            return False
        return price >= limit if side == OrderSide.SELL else price <= limit

    return False


def resolve_fill_price(order: TradeOrders, price):
    """The price an order fills at once triggered."""
    price = _d(price)
    if order.order_type in (OrderType.LIMIT, OrderType.STOP_LIMIT) and order.limit_price is not None:
        return _d(order.limit_price)
    return price   # STOP (and any fallback) fills at the prevailing market price


# ── Execution ────────────────────────────────────────────────────────────────

def execute_order(order: TradeOrders, fill_price, funds_locked: bool = False):
    """
    Fill `order` at `fill_price` and update every downstream ledger:
    trade_executions, the order row, wallet + locked_balance, wallet_transactions,
    the master transactions ledger, portfolio_holdings, and the portfolio roll-up.

    Idempotent: returns None if the order is no longer fillable.
    `funds_locked=True`  -> settle a BUY from its reserved locked_balance hold.
    `funds_locked=False` -> BUY debits available cash directly (MARKET with cash on hand).
    """
    if order.order_status not in _OPEN_STATUSES:
        return None

    stock  = Stocks.query.get(order.stock_id)
    wallet = Wallets.query.filter_by(user_id=order.user_id).first()
    if not stock or not wallet:
        logger.error(f'[order_engine] cannot fill order {order.order_id}: missing stock/wallet')
        return None

    quantity         = _d(order.remaining_quantity if order.remaining_quantity is not None else order.quantity)
    if quantity <= 0:
        return None
    execution_price  = _d(fill_price)
    execution_amount = quantity * execution_price
    commission       = execution_amount * COMMISSION_RATE
    net_amount       = execution_amount + commission if order.order_side == OrderSide.BUY \
                       else execution_amount - commission
    now              = datetime.now(timezone.utc)

    # ── SELL: verify the shares are still there before filling ────────────────
    # Filter by trade_mode so DELIVERY holdings and INTRADAY positions in the same
    # stock stay completely separate (own quantities, own P&L, own open/close).
    trade_mode = order.trade_mode or 'DELIVERY'
    holding = PortfolioHoldings.query.filter_by(
        portfolio_id=order.portfolio_id, stock_id=order.stock_id,
        trade_mode=trade_mode, is_active=True
    ).first()
    if order.order_side == OrderSide.SELL:
        if not holding or _d(holding.quantity) < quantity:
            order.order_status     = OrderStatus.REJECTED
            order.rejection_reason = 'Insufficient shares at execution time.'
            order.cancelled_by     = 'SYSTEM'
            order.cancelled_at     = now
            order.update()
            logger.warning(f'[order_engine] order {order.order_id} rejected — shares no longer held')
            return None

    # ── Record execution fill ────────────────────────────────────────────────
    exec_rec                   = TradeExecutions()
    exec_rec.order_id          = order.order_id
    exec_rec.user_id           = order.user_id
    exec_rec.stock_id          = order.stock_id
    exec_rec.executed_quantity = quantity
    exec_rec.execution_price   = execution_price
    exec_rec.execution_amount  = execution_amount
    exec_rec.commission        = commission
    exec_rec.total_fee         = commission
    exec_rec.net_amount        = net_amount
    exec_rec.executed_at       = now
    exec_rec.save()

    # ── Update the order → FILLED ─────────────────────────────────────────────
    order.order_status       = OrderStatus.FILLED
    order.filled_quantity    = quantity
    order.remaining_quantity = Decimal('0')
    order.avg_fill_price     = execution_price
    order.filled_amount      = execution_amount
    order.total_fee          = commission
    order.filled_at          = now
    order.update()

    # ── Update wallet (respecting any locked hold) ────────────────────────────
    if order.order_side == OrderSide.BUY:
        wallet.balance -= net_amount
        if funds_locked:
            # Release the reservation made at placement; the invariant recompute
            # below returns any over-reserved remainder to available_balance.
            reserved = _d(order.estimated_amount) * (Decimal('1') + COMMISSION_RATE)
            wallet.locked_balance = max(Decimal('0'), _d(wallet.locked_balance) - reserved)
        else:
            wallet.available_balance -= net_amount
        wallet.total_invested = _d(wallet.total_invested) + net_amount
    else:  # SELL
        wallet.balance += net_amount

    # Keep the core invariant: available = balance - locked.
    wallet.available_balance   = _d(wallet.balance) - _d(wallet.locked_balance)
    wallet.last_transaction_at = now
    wallet.update()

    # ── Wallet transaction ledger ─────────────────────────────────────────────
    wt                  = WalletTransactions()
    wt.wallet_id        = wallet.wallet_id
    wt.user_id          = order.user_id
    wt.transaction_type = WalletTransactionType.BUY_STOCK if order.order_side == OrderSide.BUY \
                          else WalletTransactionType.SELL_STOCK
    wt.status           = WalletTransactionStatus.COMPLETED
    wt.amount           = execution_amount
    wt.fee              = commission
    wt.net_amount       = net_amount
    wt.description      = f'{order.order_type} {order.order_side} {quantity} {stock.ticker_symbol} @ {execution_price}'
    wt.reference_type   = 'TRADE_ORDER'
    wt.reference_id     = order.order_id
    wt.completed_at     = now
    wt.save()

    # ── Master transactions ledger ────────────────────────────────────────────
    txn                = Transactions()
    txn.user_id        = order.user_id
    txn.txn_type       = TxnType.BUY if order.order_side == OrderSide.BUY else TxnType.SELL
    txn.txn_status     = TxnStatus.COMPLETED
    txn.stock_id       = order.stock_id
    txn.order_id       = order.order_id
    txn.portfolio_id   = order.portfolio_id
    txn.wallet_txn_id  = wt.wallet_txn_id
    txn.quantity       = quantity
    txn.price_per_unit = execution_price
    txn.gross_amount   = execution_amount
    txn.fee            = commission
    txn.net_amount     = net_amount
    txn.transacted_at  = now
    txn.save()

    # ── Update the portfolio holding ──────────────────────────────────────────
    if order.order_side == OrderSide.BUY:
        if holding:
            old_qty  = _d(holding.quantity)
            old_cost = _d(holding.total_invested)
            new_qty  = old_qty + quantity
            new_cost = old_cost + execution_amount
            holding.quantity          = new_qty
            holding.total_invested    = new_cost
            holding.average_buy_price = new_cost / new_qty if new_qty > 0 else Decimal('0')
            holding.last_traded_at    = now
            holding.update()
        else:
            holding                   = PortfolioHoldings()
            holding.portfolio_id      = order.portfolio_id
            holding.stock_id          = order.stock_id
            holding.user_id           = order.user_id
            holding.trade_mode        = trade_mode
            holding.quantity          = quantity
            holding.average_buy_price = execution_price
            holding.total_invested    = execution_amount
            holding.first_bought_at   = now
            holding.last_traded_at    = now
            holding.save()
    else:  # SELL — reduce or close the holding
        sell_qty   = quantity
        cost_basis = _d(holding.average_buy_price) * sell_qty
        realized   = execution_amount - cost_basis
        new_qty    = _d(holding.quantity) - sell_qty
        holding.realized_pnl = _d(holding.realized_pnl) + realized
        if new_qty <= Decimal('0'):
            holding.quantity  = Decimal('0')
            holding.is_active = False
        else:
            holding.quantity       = new_qty
            holding.total_invested = new_qty * _d(holding.average_buy_price)
        holding.last_traded_at = now
        holding.update()

    # ── Re-value the whole portfolio from current market prices ────────────────
    portfolio = Portfolios.query.get(order.portfolio_id)
    if portfolio:
        revalue_portfolio(portfolio)

    logger.info(f'[order_engine] filled order {order.order_id} '
                f'({order.order_side} {order.order_type}) {quantity} @ {execution_price}')
    return exec_rec


def revalue_portfolio(portfolio: Portfolios):
    """Recompute every active holding's market value and the portfolio totals
    from current stock prices. Safe to call after any fill."""
    holdings      = PortfolioHoldings.query.filter_by(
        portfolio_id=portfolio.portfolio_id, is_active=True
    ).all()
    port_value    = Decimal('0')
    port_invested = Decimal('0')
    port_day_pnl  = Decimal('0')   # today's P&L = Σ (current_price − previous_close) × qty
    port_prev_val = Decimal('0')   # yesterday's value of the same holdings
    for h in holdings:
        stock = Stocks.query.get(h.stock_id)
        px    = _d(stock.current_price) if stock else Decimal('0')
        prev  = _d(stock.previous_close) if stock and stock.previous_close else px
        qty   = _d(h.quantity)
        inv   = _d(h.total_invested)
        val   = qty * px
        day   = (px - prev) * qty
        h.current_price          = px
        h.current_value          = val
        h.unrealized_pnl         = val - inv
        h.unrealized_pnl_percent = ((val - inv) / inv * 100) if inv > 0 else Decimal('0')
        h.day_change             = day
        h.day_change_percent     = ((px - prev) / prev * 100) if prev > 0 else Decimal('0')
        port_value    += val
        port_invested += inv
        port_day_pnl  += day
        port_prev_val += qty * prev
    for h in holdings:
        h.allocation_percent = ((_d(h.current_value) / port_value) * 100) if port_value > 0 else Decimal('0')

    portfolio.total_invested       = port_invested
    portfolio.current_value        = port_value
    portfolio.unrealized_pnl       = port_value - port_invested
    portfolio.total_return         = port_value - port_invested
    portfolio.total_return_percent = ((port_value - port_invested) / port_invested * 100) if port_invested > 0 else Decimal('0')
    portfolio.day_change           = port_day_pnl
    portfolio.day_change_percent   = (port_day_pnl / port_prev_val * 100) if port_prev_val > 0 else Decimal('0')
    portfolio.total_holdings_count = len(holdings)
    portfolio.update()


# ── Expiry helpers ───────────────────────────────────────────────────────────

def _release_hold_on_close(order: TradeOrders):
    """Give back a BUY order's locked funds when it is cancelled/expired unfilled."""
    if order.order_side == OrderSide.BUY and order.order_type != OrderType.MARKET and order.estimated_amount:
        wallet = Wallets.query.filter_by(user_id=order.user_id).first()
        if wallet:
            reserved = _d(order.estimated_amount) * (Decimal('1') + COMMISSION_RATE)
            wallet.locked_balance    = max(Decimal('0'), _d(wallet.locked_balance) - reserved)
            wallet.available_balance = _d(wallet.balance) - _d(wallet.locked_balance)
            wallet.update()


def _is_expired(order: TradeOrders, now_utc: datetime) -> bool:
    """A queued order expires when its explicit expiry passes, or — for DAY orders —
    once a new IST trading day has begun since it was submitted. (GTC never expires.)"""
    if order.expires_at and order.expires_at.replace(tzinfo=order.expires_at.tzinfo or timezone.utc) <= now_utc:
        return True
    if order.order_duration == OrderDuration.DAY and order.submitted_at:
        sub  = order.submitted_at
        if sub.tzinfo is None:
            sub = sub.replace(tzinfo=timezone.utc)
        return sub.astimezone(_IST).date() < now_utc.astimezone(_IST).date()
    return False


# ── The engine tick ──────────────────────────────────────────────────────────

def process_pending_orders() -> dict:
    """
    Scan every live queued order, fill the ones whose trigger price is met, and
    expire stale DAY orders. Each order is handled independently so one failure
    can't stall the rest. Returns a summary dict. Called by the scheduler.
    """
    from portal.helpers.notify import notify_user
    from portal.models.notifications import NotificationType, NotificationPriority

    filled = expired = errors = 0

    orders = TradeOrders.query.filter(
        TradeOrders.order_status.in_(_OPEN_STATUSES),
        TradeOrders.order_type.in_(_QUEUED_TYPES),
    ).all()
    if not orders:
        return {'checked': 0, 'filled': 0, 'expired': 0, 'errors': 0}

    now = datetime.now(timezone.utc)

    for order in orders:
        try:
            # 1) Expire stale orders first (releasing any hold).
            if _is_expired(order, now):
                order.order_status     = OrderStatus.EXPIRED
                order.cancelled_at     = now
                order.cancelled_by     = 'SYSTEM'
                order.rejection_reason = 'Order expired (duration lapsed).'
                order.update()
                _release_hold_on_close(order)
                expired += 1
                continue

            stock = Stocks.query.get(order.stock_id)
            price = _d(stock.current_price) if stock else Decimal('0')
            if price <= 0 or not check_trigger(order, price):
                continue

            fill_px  = resolve_fill_price(order, price)
            funds_locked = (order.order_side == OrderSide.BUY)
            exec_rec = execute_order(order, fill_px, funds_locked=funds_locked)
            if exec_rec is None:
                continue
            filled += 1

            # 2) Notify the user their order filled.
            try:
                notify_user(
                    order.user_id,
                    NotificationType.ORDER_FILLED,
                    f'{order.order_side} order filled',
                    f'Your {order.order_type} {order.order_side} order for '
                    f'{float(order.filled_quantity):g} {stock.ticker_symbol} '
                    f'executed at Rs {float(order.avg_fill_price):.2f}.',
                    priority=NotificationPriority.HIGH,
                    reference_type='TRADE_ORDER',
                    reference_id=order.order_id,
                )
            except Exception:
                logger.exception(f'[order_engine] notify failed for order {order.order_id}')

        except Exception:
            db.session.rollback()
            errors += 1
            logger.exception(f'[order_engine] error processing order {order.order_id}')

    if filled or expired:
        logger.info(f'[order_engine] tick: checked={len(orders)} filled={filled} expired={expired} errors={errors}')
    return {'checked': len(orders), 'filled': filled, 'expired': expired, 'errors': errors}
