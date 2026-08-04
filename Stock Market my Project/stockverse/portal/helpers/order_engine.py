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
* square_off_intraday_positions() -> dict     : settle every open intraday position
                                                 once the market has closed

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

Short selling (INTRADAY only)
-----------------------------
A SELL with no long position open opens a SHORT: shares sold first, bought back
later. The position profits when the price falls.

Collateral, not proceeds: the sale proceeds are NOT credited to the wallet at
open. Instead 100% of the notional moves from `available_balance` into
`locked_balance` and stays there until the position is covered. Crediting the
proceeds would let a user spend or withdraw money they still owe on a position
that can still move against them.

    open  (SELL) : balance -= commission ; locked += quantity × sell_price
    cover (BUY)  : locked  -= quantity × avg_entry_price
                   balance += (avg_entry_price − buy_price) × quantity − commission

Anything still short when the bell rings is bought back automatically — see
`square_off_intraday_positions()`, which settles every open intraday position at
the close, long and short alike.

Trading window
--------------
Fills happen only while the market is in continuous trading — the window between
market_calendar.MARKET_OPEN and MARKET_CLOSE on a trading day. Outside it the
stored price is a last traded price, and filling against it would execute a trade
at a price the market never offered. Queued INTRADAY orders that did not trigger during the
session are expired at the close rather than carried overnight; their reserved
buying power is released with them.
"""
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from portal import db
from portal.models.trade_orders       import (
    TradeOrders, OrderType, OrderSide, OrderStatus, OrderDuration, TradeMode,
    PositionEffect,
)
from portal.models.trade_executions   import TradeExecutions
from portal.models.portfolio_holdings import PortfolioHoldings, PositionSide
from portal.models.portfolios         import Portfolios
from portal.models.wallets            import Wallets, WalletStatus
from portal.models.wallet_transactions import WalletTransactions, WalletTransactionType, WalletTransactionStatus
from portal.models.transactions       import Transactions, TxnType, TxnStatus
from portal.models.stocks             import Stocks
from portal.helpers                   import market_calendar

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


# ── Positions ────────────────────────────────────────────────────────────────

def open_position(portfolio_id, stock_id, trade_mode):
    """The one live position for this (portfolio, stock, mode), long OR short.

    A stock is never simultaneously long and short in the same mode — selling
    into a long reduces it, and buying into a short covers it. That netting rule
    is what keeps the wallet arithmetic tractable.
    """
    return PortfolioHoldings.query.filter_by(
        portfolio_id=portfolio_id, stock_id=stock_id,
        trade_mode=trade_mode or TradeMode.DELIVERY, is_active=True,
    ).first()


def is_short(holding) -> bool:
    return bool(holding) and holding.position_side == PositionSide.SHORT


def short_margin(quantity, price):
    """Collateral required to sell `quantity` short at `price` — the full notional.

    100% means the buy-back is funded however far the price runs against the
    user, right up to a doubling. It is deliberately conservative: this platform
    has no margin-call machinery, so the alternative to over-collateralising is a
    wallet that can go negative.
    """
    return _d(quantity) * _d(price)


def position_pnl(side, entry_price, exit_price, quantity):
    """P&L from closing `quantity` of a position at `exit_price`.

    The single definition of the sign convention: a LONG earns (exit − entry), a
    SHORT earns (entry − exit). Used for both realized P&L on a fill and
    unrealized P&L during revaluation, so the two can never disagree.
    """
    entry, exit_, qty = _d(entry_price), _d(exit_price), _d(quantity)
    diff = (exit_ - entry) if side == PositionSide.LONG else (entry - exit_)
    return diff * qty


def settlement(action, quantity, price, entry_price=None):
    """Cash a fill moves, as (balance_delta, locked_delta, commission).

    Pure — no database, no order object. The whole money model for going long and
    short lives here so it can be checked directly:

        OPEN_LONG    pay the cost and the fee
        CLOSE_LONG   receive the proceeds less the fee
        OPEN_SHORT   pay the fee; the proceeds become locked collateral, NOT cash
        COVER_SHORT  release that collateral; settle the profit or loss
    """
    qty, px    = _d(quantity), _d(price)
    amount     = qty * px
    commission = amount * COMMISSION_RATE

    if action == 'OPEN_LONG':
        return -(amount + commission), Decimal('0'), commission
    if action == 'CLOSE_LONG':
        return amount - commission, Decimal('0'), commission
    if action == 'OPEN_SHORT':
        return -commission, amount, commission
    if action == 'COVER_SHORT':
        entry    = _d(entry_price)
        realized = position_pnl(PositionSide.SHORT, entry, px, qty)
        # Release exactly what this quantity locked at entry. Precise even for a
        # partial cover, because that is how the margin was accumulated.
        return realized - commission, -(entry * qty), commission

    raise ValueError(f'unknown settlement action: {action}')


def plan_position_effect(order_side, portfolio_id, stock_id, trade_mode):
    """Does this order OPEN a position or CLOSE one? Decided from what is open now.

    Returns (PositionEffect, holding-or-None) so callers can validate against the
    same position they are about to act on.
    """
    holding = open_position(portfolio_id, stock_id, trade_mode)

    if order_side == OrderSide.SELL:
        # Selling with a long open reduces it; otherwise it opens a short.
        if holding and not is_short(holding):
            return PositionEffect.CLOSE, holding
        return PositionEffect.OPEN, holding

    # BUY covers an open short, otherwise it opens/adds to a long.
    if is_short(holding):
        return PositionEffect.CLOSE, holding
    return PositionEffect.OPEN, holding


def _reserved_at_placement(order: TradeOrders) -> bool:
    """True when this queued order had wallet funds locked when it was placed.

    Legacy rows predate `position_effect`; for those, a queued BUY is the only
    thing that ever reserved, which is exactly what the old code did.
    """
    if order.order_type == OrderType.MARKET:
        return False
    if order.position_effect:
        return order.position_effect == PositionEffect.OPEN
    return order.order_side == OrderSide.BUY


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
    `funds_locked=True`  -> settle from the hold reserved at placement (queued
                            BUY-to-open, or queued SELL-to-open-short).
    `funds_locked=False` -> settle against available cash (a MARKET order).
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
    now              = datetime.now(timezone.utc)

    # ── Work out what this fill does to the position ─────────────────────────
    # Filter by trade_mode so DELIVERY holdings and INTRADAY positions in the same
    # stock stay completely separate (own quantities, own P&L, own open/close).
    #
    # Re-derived here rather than trusting order.position_effect: a queued order
    # can sit for hours, and the user may have covered or sold in the meantime.
    trade_mode = order.trade_mode or TradeMode.DELIVERY
    holding    = open_position(order.portfolio_id, order.stock_id, trade_mode)
    shorting   = is_short(holding)

    def _reject(reason):
        order.order_status     = OrderStatus.REJECTED
        order.rejection_reason = reason
        order.cancelled_by     = 'SYSTEM'
        order.cancelled_at     = now
        order.update()
        if funds_locked:
            _release_hold_on_close(order)
        logger.warning(f'[order_engine] order {order.order_id} rejected — {reason}')
        return None

    if order.order_side == OrderSide.SELL:
        if holding and not shorting:
            action = 'CLOSE_LONG'
            if _d(holding.quantity) < quantity:
                return _reject('Insufficient shares at execution time.')
        else:
            action = 'OPEN_SHORT'
            if trade_mode != TradeMode.INTRADAY:
                return _reject('Insufficient shares — short selling is intraday only.')
            # Re-check collateral at fill time; the wallet may have been drained
            # between placing a queued short and it triggering.
            required = short_margin(quantity, execution_price) + commission
            held     = _d(order.estimated_amount) * (Decimal('1') + COMMISSION_RATE) if funds_locked else Decimal('0')
            if _d(wallet.available_balance) + held < required:
                return _reject('Insufficient funds for short margin at execution time.')
    else:  # BUY
        if shorting:
            action = 'COVER_SHORT'
            if _d(holding.quantity) < quantity:
                return _reject('Cannot buy more than the open short quantity.')
        else:
            action = 'OPEN_LONG'

    # An order placed to CLOSE a position must never end up opening one. This is
    # the case that matters: a stop-loss left armed after the user has already
    # sold out by hand would, on trigger, sail through the SELL branch above and
    # open a brand-new short.
    if order.position_effect == PositionEffect.CLOSE and action.startswith('OPEN'):
        return _reject('Position already closed — this exit order is no longer needed.')

    # The cash this fill moves. `net_amount` keeps its historical meaning for a
    # long buy (the amount paid, a positive number); for everything else it is
    # the signed effect on the wallet.
    entry_price = _d(holding.average_buy_price) if action == 'COVER_SHORT' else None
    balance_delta, locked_delta, commission = settlement(
        action, quantity, execution_price, entry_price)
    net_amount = (execution_amount + commission) if action == 'OPEN_LONG' else balance_delta

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
    # Any reservation made at placement is released first; the invariant recompute
    # at the end returns whatever was over-reserved to available_balance.
    if funds_locked:
        reserved = _d(order.estimated_amount) * (Decimal('1') + COMMISSION_RATE)
        wallet.locked_balance = max(Decimal('0'), _d(wallet.locked_balance) - reserved)

    # `balance_delta` is negative on a losing short cover, and is deliberately not
    # clamped at zero: a wallet that quietly refuses to record a loss is worse
    # than one that shows the user what actually happened.
    wallet.balance        = _d(wallet.balance) + balance_delta
    wallet.locked_balance = max(Decimal('0'), _d(wallet.locked_balance) + locked_delta)

    if action == 'OPEN_LONG':
        wallet.total_invested = _d(wallet.total_invested) + net_amount

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
    wt.description      = (f'{_ACTION_LABELS[action]} {quantity} {stock.ticker_symbol} '
                           f'@ {execution_price} ({order.order_type})')
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
    # Opening adds at a weighted-average entry price; closing reduces and books
    # the realized P&L. The only difference between the two sides is the sign of
    # that P&L: a long earns (exit − entry), a short earns (entry − exit).
    if action in ('OPEN_LONG', 'OPEN_SHORT'):
        if holding:
            old_qty  = _d(holding.quantity)
            new_qty  = old_qty + quantity
            new_cost = _d(holding.total_invested) + execution_amount
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
            holding.position_side     = (PositionSide.SHORT if action == 'OPEN_SHORT'
                                         else PositionSide.LONG)
            holding.quantity          = quantity
            holding.average_buy_price = execution_price
            holding.total_invested    = execution_amount
            holding.first_bought_at   = now
            holding.last_traded_at    = now
            holding.save()
    else:  # CLOSE_LONG / COVER_SHORT — reduce or close the position
        entry    = _d(holding.average_buy_price)
        realized = ((execution_amount - entry * quantity) if action == 'CLOSE_LONG'
                    else (entry * quantity - execution_amount))
        new_qty  = _d(holding.quantity) - quantity
        holding.realized_pnl = _d(holding.realized_pnl) + realized
        if new_qty <= Decimal('0'):
            holding.quantity  = Decimal('0')
            holding.is_active = False
        else:
            holding.quantity       = new_qty
            holding.total_invested = new_qty * entry
        holding.last_traded_at = now
        holding.update()

    # ── Re-value the whole portfolio from current market prices ────────────────
    portfolio = Portfolios.query.get(order.portfolio_id)
    if portfolio:
        revalue_portfolio(portfolio)
        # Record today's performance point so the chart reflects the trade right
        # away rather than waiting for the nightly snapshot job. Never let a
        # reporting failure roll back a completed fill.
        try:
            from portal.helpers.portfolio_snapshot import (
                record_portfolio_snapshot, record_value_tick,
            )
            record_portfolio_snapshot(portfolio)
            record_value_tick(portfolio)
        except Exception as e:
            logger.error(f'[order_engine] snapshot after fill failed for '
                         f'portfolio {portfolio.portfolio_id}: {e}')

    # ── Arm the attached stop-loss ────────────────────────────────────────────
    # Only after the entry has actually filled — there is nothing to protect
    # until then. Never let a failure here roll back a completed fill; the
    # position is real either way and the user needs to know it is unprotected.
    if action in ('OPEN_LONG', 'OPEN_SHORT') and order.stop_loss_price:
        try:
            arm_stop_loss(order, quantity, action)
        except Exception:
            db.session.rollback()
            logger.exception(f'[order_engine] could not arm stop-loss for order {order.order_id}')

    logger.info(f'[order_engine] filled order {order.order_id} '
                f'[{action}] {quantity} @ {execution_price}')
    return exec_rec


def arm_stop_loss(order: TradeOrders, quantity, action):
    """Place the protective STOP once an entry order has filled.

    The stop-loss the user typed on the entry becomes a real order in its own
    right — visible in their order history, matched by the same engine, expiring
    at the close like any other intraday order. Modelling it as an order rather
    than as a flag on the position means there is exactly one code path that can
    sell a user's shares.

        long  entry → SELL STOP below the entry  (price falls → sell out)
        short entry → BUY  STOP above the entry  (price rises → cover)

    Returns the child order, or None when one already exists (idempotent, so a
    retried fill cannot arm two stops on the same position).
    """
    existing = TradeOrders.query.filter(
        TradeOrders.parent_order_id == order.order_id,
        TradeOrders.order_status.in_(_OPEN_STATUSES),
    ).first()
    if existing:
        return None

    child                    = TradeOrders()
    child.user_id            = order.user_id
    child.stock_id           = order.stock_id
    child.portfolio_id       = order.portfolio_id
    child.order_type         = OrderType.STOP
    # Exit the other way from the entry.
    child.order_side         = OrderSide.SELL if action == 'OPEN_LONG' else OrderSide.BUY
    child.trade_mode         = order.trade_mode or TradeMode.DELIVERY
    child.position_effect    = PositionEffect.CLOSE
    child.order_status       = OrderStatus.PENDING
    child.order_duration     = order.order_duration or OrderDuration.DAY
    child.quantity           = _d(quantity)
    child.filled_quantity    = Decimal('0')
    child.remaining_quantity = _d(quantity)
    child.stop_price         = _d(order.stop_loss_price)
    child.estimated_amount   = _d(quantity) * _d(order.stop_loss_price)
    child.parent_order_id    = order.order_id
    child.submitted_at       = datetime.now(timezone.utc)
    child.order_source       = 'SYSTEM'
    child.save()

    logger.info(f'[order_engine] armed stop-loss order {child.order_id} '
                f'@ {child.stop_price} for entry {order.order_id}')
    return child


_ACTION_LABELS = {
    'OPEN_LONG':   'BUY',
    'CLOSE_LONG':  'SELL',
    'OPEN_SHORT':  'SHORT SELL',
    'COVER_SHORT': 'BUY TO COVER',
}


def revalue_portfolio(portfolio: Portfolios):
    """Recompute every active position's market value and the portfolio totals
    from current stock prices. Safe to call after any fill.

    Shorts are valued in the opposite direction: they gain when the price falls.
    They also contribute differently to the portfolio total — a short's collateral
    lives in the wallet's `locked_balance` (already counted inside wallet.balance),
    so counting the notional here as well would double-count it. Only the short's
    unrealized P&L belongs to portfolio worth.
    """
    holdings      = PortfolioHoldings.query.filter_by(
        portfolio_id=portfolio.portfolio_id, is_active=True
    ).all()
    port_value    = Decimal('0')
    port_invested = Decimal('0')
    port_day_pnl  = Decimal('0')   # today's P&L across every position
    port_prev_val = Decimal('0')   # yesterday's value of the same positions
    long_value    = Decimal('0')   # denominator for allocation %
    for h in holdings:
        stock = Stocks.query.get(h.stock_id)
        px    = _d(stock.current_price) if stock else Decimal('0')
        prev  = _d(stock.previous_close) if stock and stock.previous_close else px
        qty   = _d(h.quantity)
        inv   = _d(h.total_invested)
        entry = _d(h.average_buy_price)

        if h.position_side == PositionSide.SHORT:
            val = qty * px                       # what it would cost to buy back
            pnl = position_pnl(PositionSide.SHORT, entry, px, qty)
            day = position_pnl(PositionSide.SHORT, prev, px, qty)
            h.current_price          = px
            h.current_value          = val
            h.unrealized_pnl         = pnl
            h.unrealized_pnl_percent = ((entry - px) / entry * 100) if entry > 0 else Decimal('0')
            h.day_change             = day
            h.day_change_percent     = ((prev - px) / prev * 100) if prev > 0 else Decimal('0')
            # Collateral is in the wallet, not here — contribute the P&L only.
            port_value    += pnl
            port_day_pnl  += day
            port_prev_val += qty * prev          # exposure the day move is measured against
        else:
            val = qty * px
            day = (px - prev) * qty
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
            long_value    += val
    for h in holdings:
        # Allocation is "share of capital deployed", which a short has none of.
        h.allocation_percent = (
            Decimal('0') if h.position_side == PositionSide.SHORT or long_value <= 0
            else (_d(h.current_value) / long_value) * 100
        )

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
    """Give back an order's locked funds when it is cancelled/expired/rejected.

    Covers both kinds of reservation: buying power held for a queued BUY, and
    short margin held for a queued SELL that would have opened a short. Missing
    the second would strand a user's collateral behind a cancelled order.
    """
    if not _reserved_at_placement(order) or not order.estimated_amount:
        return
    wallet = Wallets.query.filter_by(user_id=order.user_id).first()
    if wallet:
        reserved = _d(order.estimated_amount) * (Decimal('1') + COMMISSION_RATE)
        wallet.locked_balance    = max(Decimal('0'), _d(wallet.locked_balance) - reserved)
        wallet.available_balance = _d(wallet.balance) - _d(wallet.locked_balance)
        wallet.update()


def square_off_intraday_positions() -> dict:
    """Close EVERY intraday position still open once the market has shut.

    Intraday means "settled the same session". Once the bell has rung the user
    cannot close a position themselves — the order gate refuses trades outside
    hours — so anything left open would sit there overnight carrying the opening
    gap, and a short's collateral would stay locked with it. This is what a real
    broker does with open MIS positions at the close.

        LONG  → SELL at the last traded price
        SHORT → BUY  at the last traded price

    Each leg is routed through a real MARKET order and `execute_order`, so it
    lands in the order history, the executions table, the wallet, the master
    transactions ledger and the portfolio roll-up exactly like a manual trade.
    That is what books the final realized P&L and marks the position closed —
    there is no separate settlement path that could disagree with a hand-placed
    order.

    DELIVERY holdings are untouched: they are owned outright with no same-day
    obligation, and the user sells them whenever they choose.

    Idempotent: a squared-off position is `is_active=False`, so later ticks find
    nothing to do. Safe to call on every scheduler tick.
    """
    from portal.helpers.notify import notify_user
    from portal.models.notifications import NotificationType, NotificationPriority

    empty = {'checked': 0, 'squared_off': 0, 'errors': 0}
    if market_calendar.is_market_open():
        return empty

    positions = PortfolioHoldings.query.filter_by(
        trade_mode=TradeMode.INTRADAY,
        is_active=True,
    ).all()
    if not positions:
        return empty

    squared = errors = 0
    now = datetime.now(timezone.utc)

    for h in positions:
        try:
            stock = Stocks.query.get(h.stock_id)
            price = _d(stock.current_price) if stock else Decimal('0')
            qty   = _d(h.quantity)
            if price <= 0 or qty <= 0:
                # No price to settle against; leave it for the next tick rather
                # than booking a fill at zero and inventing a P&L.
                continue

            short = h.position_side == PositionSide.SHORT
            # Closing a short means buying it back; closing a long means selling.
            side  = OrderSide.BUY if short else OrderSide.SELL

            order                    = TradeOrders()
            order.user_id            = h.user_id
            order.stock_id           = h.stock_id
            order.portfolio_id       = h.portfolio_id
            order.order_type         = OrderType.MARKET
            order.order_side         = side
            order.trade_mode         = TradeMode.INTRADAY
            order.position_effect    = PositionEffect.CLOSE
            order.order_status       = OrderStatus.PENDING
            order.order_duration     = OrderDuration.DAY
            order.quantity           = qty
            order.filled_quantity    = Decimal('0')
            order.remaining_quantity = qty
            order.estimated_amount   = qty * price
            order.submitted_at       = now
            order.order_source       = 'SYSTEM'
            order.save()

            if execute_order(order, price, funds_locked=False) is None:
                continue
            squared += 1

            # Read the P&L back off the holding — execute_order has just booked
            # it, so this is the settled figure, not a re-derivation.
            pnl    = _d(h.realized_pnl)
            symbol = stock.ticker_symbol if stock else 'the stock'
            verb   = 'bought back' if short else 'sold'
            try:
                notify_user(
                    h.user_id,
                    NotificationType.ORDER_FILLED,
                    'Intraday position squared off at market close',
                    f'Your intraday {"short" if short else "long"} of {float(qty):g} '
                    f'{symbol} was {verb} at Rs {float(price):.2f} when the market '
                    f'closed at {market_calendar.CLOSE_LABEL} IST. '
                    f'Realised P&L: Rs {float(pnl):.2f}.',
                    priority=NotificationPriority.HIGH,
                    reference_type='TRADE_ORDER',
                    reference_id=order.order_id,
                )
            except Exception:
                logger.exception(f'[order_engine] square-off notify failed for holding {h.holding_id}')

        except Exception:
            db.session.rollback()
            errors += 1
            logger.exception(f'[order_engine] square-off failed for holding {h.holding_id}')

    if squared or errors:
        logger.info(f'[order_engine] intraday square-off: checked={len(positions)} '
                    f'squared_off={squared} errors={errors}')
    return {'checked': len(positions), 'squared_off': squared, 'errors': errors}


def _notify_intraday_expiry(order: TradeOrders):
    """Tell the user their intraday order was cancelled at the close.

    Silent cancellation is the failure mode that matters here — the user left a
    stop-loss running and needs to know it is no longer protecting them. Never
    let a notification failure undo the cancellation itself.
    """
    try:
        from portal.helpers.notify import notify_user
        from portal.models.notifications import NotificationType, NotificationPriority

        stock  = Stocks.query.get(order.stock_id)
        symbol = stock.ticker_symbol if stock else 'the stock'
        notify_user(
            order.user_id,
            NotificationType.ORDER_CANCELLED,
            'Intraday order cancelled at market close',
            f'Your intraday {order.order_type} {order.order_side} order for '
            f'{float(order.quantity):g} {symbol} did not trigger before the market '
            f'closed at {market_calendar.CLOSE_LABEL} IST and has been cancelled. '
            f'Any reserved funds are back in your wallet.',
            priority=NotificationPriority.MEDIUM,
            reference_type='TRADE_ORDER',
            reference_id=order.order_id,
        )
    except Exception:
        logger.exception(f'[order_engine] close-expiry notify failed for order {order.order_id}')


def _expires_at_close(order: TradeOrders, market_open: bool) -> bool:
    """True when a still-queued INTRADAY order must be killed because the session
    is over.

    An intraday order only makes sense inside the session it was placed in: the
    position it would open has to be closed the same day. Once the market is shut
    (after the close, on a weekend, or on a holiday) it can never legitimately fill,
    so it is expired instead of sitting there holding the user's buying power
    until the next IST date happens to roll over.
    """
    return not market_open and \
        (order.trade_mode or TradeMode.DELIVERY) == TradeMode.INTRADAY


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

    Fills only happen during continuous trading. Expiry still runs when the
    market is shut — that is precisely when queued intraday orders have to be
    cleared and their reserved funds handed back.
    """
    from portal.helpers.notify import notify_user
    from portal.models.notifications import NotificationType, NotificationPriority

    filled = expired = errors = 0
    market_open = market_calendar.is_market_open()

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
            at_close = _expires_at_close(order, market_open)
            if at_close or _is_expired(order, now):
                order.order_status     = OrderStatus.EXPIRED
                order.cancelled_at     = now
                order.cancelled_by     = 'SYSTEM'
                order.rejection_reason = (market_calendar.INTRADAY_CLOSE_EXPIRY_REASON
                                          if at_close else 'Order expired (duration lapsed).')
                order.update()
                _release_hold_on_close(order)
                expired += 1
                if at_close:
                    _notify_intraday_expiry(order)
                continue

            # 2) Nothing fills outside the session — the price on file is a last
            #    traded price, not a market anyone can trade against.
            if not market_open:
                continue

            # Orders placed before an admin froze the wallet must not keep filling
            # in the background. They stay queued and resume once it is unfrozen.
            w = Wallets.query.filter_by(user_id=order.user_id).first()
            if w and w.status != WalletStatus.ACTIVE:
                continue

            stock = Stocks.query.get(order.stock_id)
            price = _d(stock.current_price) if stock else Decimal('0')
            if price <= 0 or not check_trigger(order, price):
                continue

            fill_px  = resolve_fill_price(order, price)
            exec_rec = execute_order(order, fill_px,
                                     funds_locked=_reserved_at_placement(order))
            if exec_rec is None:
                continue
            filled += 1

            # 3) Notify the user their order filled.
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
