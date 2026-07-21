import logging
import traceback
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal.models.dashboard_widgets      import DashboardWidgets, WidgetRole
from portal.models.user_dashboard_layouts import UserDashboardLayouts
from portal.models.portfolios             import Portfolios
from portal.models.portfolio_holdings     import PortfolioHoldings
from portal.models.portfolio_performance_history import PortfolioPerformanceHistory
from portal.models.watchlist_items        import WatchlistItems
from portal.models.watchlists             import Watchlists
from portal.models.trade_orders           import TradeOrders, OrderStatus
from portal.models.stocks                 import Stocks
from portal.models.market_movers          import MarketMovers
from portal.models.sector_performance     import SectorPerformance
from portal.models.notifications          import Notifications
from portal.models.price_alerts           import PriceAlerts, PriceAlertStatus
from portal.models.market_news            import MarketNews
from portal.models.stock_news_mapping     import StockNewsMapping

from . import ns, logger


def _is_admin():
    return get_jwt().get('role') == 'ADMIN'


# ── Parsers  ─────────────

save_layout_parser = reqparse.RequestParser()
save_layout_parser.add_argument('layouts', type=list, required=True, location='json',
                                 help='Array of widget layout objects')

widget_config_parser = reqparse.RequestParser()
widget_config_parser.add_argument('widget_id',   type=int, required=True,  location='json')
widget_config_parser.add_argument('grid_x',      type=int, required=False, location='json', default=0)
widget_config_parser.add_argument('grid_y',      type=int, required=False, location='json', default=0)
widget_config_parser.add_argument('grid_width',  type=int, required=False, location='json', default=4)
widget_config_parser.add_argument('grid_height', type=int, required=False, location='json', default=2)
widget_config_parser.add_argument('is_visible',  type=bool, required=False, location='json', default=True)
widget_config_parser.add_argument('sort_order',  type=int, required=False, location='json', default=0)
widget_config_parser.add_argument('config',      type=dict, required=False, location='json')


#  
#  USER DASHBOARD  (main page — /dashboard)
#  

@ns.route('/user/summary')
class UserDashboardSummary(Resource):
    @ns.doc(
        description='User Dashboard main data: portfolio summary, top holdings, '
                    'day P&L, sector allocation, recent orders.'
    )
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())

            # ── Default portfolio ──────────────────────────────────────────────
            portfolio = Portfolios.query.filter_by(
                user_id=user_id, is_default=True, is_active=True
            ).first()
            if not portfolio:
                portfolio = Portfolios.query.filter_by(
                    user_id=user_id, is_active=True
                ).first()

            portfolio_data = None
            holdings_data  = []
            sector_alloc   = {}

            if portfolio:
                portfolio_data = {
                    'portfolio_id':         portfolio.portfolio_id,
                    'portfolio_name':       portfolio.portfolio_name,
                    'total_invested':       float(portfolio.total_invested),
                    'current_value':        float(portfolio.current_value),
                    'total_return':         float(portfolio.total_return),
                    'total_return_percent': float(portfolio.total_return_percent),
                    'day_change':           float(portfolio.day_change),
                    'day_change_percent':   float(portfolio.day_change_percent),
                    'unrealized_pnl':       float(portfolio.unrealized_pnl),
                    'realized_pnl':         float(portfolio.realized_pnl),
                    'holdings_count':       portfolio.total_holdings_count,
                    'sectors':              portfolio.sectors or {},
                }

                # Top 5 holdings by current value
                holdings = (PortfolioHoldings.query
                            .filter_by(portfolio_id=portfolio.portfolio_id, is_active=True)
                            .order_by(PortfolioHoldings.current_value.desc())
                            .limit(5).all())

                for h in holdings:
                    holdings_data.append({
                        'holding_id':             h.holding_id,
                        'stock_id':               h.stock_id,
                        'ticker_symbol':          h.stock.ticker_symbol if h.stock else None,
                        'company_name':           h.stock.company_name  if h.stock else None,
                        'logo_url':               h.stock.logo_url       if h.stock else None,
                        'sector':                 h.stock.sector         if h.stock else None,
                        'quantity':               float(h.quantity),
                        'average_buy_price':      float(h.average_buy_price),
                        'current_price':          float(h.current_price)         if h.current_price         else None,
                        'current_value':          float(h.current_value)         if h.current_value         else None,
                        'unrealized_pnl':         float(h.unrealized_pnl)        if h.unrealized_pnl        else None,
                        'unrealized_pnl_percent': float(h.unrealized_pnl_percent) if h.unrealized_pnl_percent else None,
                        'day_change':             float(h.day_change)             if h.day_change             else None,
                        'day_change_percent':     float(h.day_change_percent)     if h.day_change_percent     else None,
                        'allocation_percent':     float(h.allocation_percent)     if h.allocation_percent     else None,
                    })

                sector_alloc = portfolio.sectors or {}

            # ── Performance chart (last 30 days) ──────────────────────────────
            perf_data = []
            if portfolio:
                since = date.today() - timedelta(days=30)
                perfs = (PortfolioPerformanceHistory.query
                         .filter_by(portfolio_id=portfolio.portfolio_id, interval='DAILY')
                         .filter(PortfolioPerformanceHistory.snapshot_date >= since)
                         .order_by(PortfolioPerformanceHistory.snapshot_date.asc())
                         .all())
                perf_data = [{
                    'date':         str(p.snapshot_date),
                    'total_value':  float(p.total_value),
                    'daily_return': float(p.daily_return) if p.daily_return else None,
                } for p in perfs]

            # ── Recent orders (last 5) ─────────────────────────────────────────
            recent_orders = (TradeOrders.query
                             .filter_by(user_id=user_id)
                             .order_by(TradeOrders.submitted_at.desc())
                             .limit(5).all())

            # ── Unread notifications count ────────────────────────────────────
            unread_count = Notifications.query.filter_by(
                user_id=user_id, is_read=False, is_dismissed=False
            ).count()

            # ── Active price alerts count ─────────────────────────────────────
            active_alerts = PriceAlerts.query.filter_by(
                user_id=user_id, status=PriceAlertStatus.ACTIVE
            ).count()

            return jsonify(bool=True, status=200, response={
                'portfolio':      portfolio_data,
                'top_holdings':   holdings_data,
                'sector_allocation': sector_alloc,
                'performance_chart': perf_data,
                'recent_orders': [{
                    'order_id':      o.order_id,
                    'ticker_symbol': o.stock.ticker_symbol if o.stock else None,
                    'company_name':  o.stock.company_name  if o.stock else None,
                    'logo_url':      o.stock.logo_url       if o.stock else None,
                    'order_side':    o.order_side,
                    'order_type':    o.order_type,
                    'order_status':  o.order_status,
                    'quantity':      float(o.quantity),
                    'avg_fill_price':float(o.avg_fill_price) if o.avg_fill_price else None,
                    'filled_amount': float(o.filled_amount)  if o.filled_amount  else None,
                    'submitted_at':  str(o.submitted_at),
                } for o in recent_orders],
                'unread_notifications': unread_count,
                'active_price_alerts':  active_alerts,
                'as_of': str(datetime.now(timezone.utc)),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  MY STOCKS TODAY  (News screen sidebar widget)
#  

@ns.route('/user/my_stocks_today')
class MyStocksToday(Resource):
    @ns.doc(
        description='Returns the current user\'s own stock moves for the News screen '
                    '"My Stocks Today" sidebar. Shows only stocks the user holds.'
    )
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())

            holdings = (PortfolioHoldings.query
                        .filter_by(user_id=user_id, is_active=True)
                        .all())

            result = []
            for h in holdings:
                s = h.stock
                if not s:
                    continue
                result.append({
                    'stock_id':               h.stock_id,
                    'ticker_symbol':          s.ticker_symbol,
                    'company_name':           s.company_name,
                    'logo_url':               s.logo_url,
                    'current_price':          float(s.current_price)         if s.current_price         else None,
                    'price_change':           float(s.price_change)          if s.price_change          else None,
                    'price_change_percent':   float(s.price_change_percent)  if s.price_change_percent  else None,
                    'quantity':               float(h.quantity),
                    'day_change':             float(h.day_change)             if h.day_change             else None,
                    'day_change_percent':     float(h.day_change_percent)     if h.day_change_percent     else None,
                    'current_value':          float(h.current_value)         if h.current_value         else None,
                    'unrealized_pnl':         float(h.unrealized_pnl)        if h.unrealized_pnl        else None,
                    'unrealized_pnl_percent': float(h.unrealized_pnl_percent) if h.unrealized_pnl_percent else None,
                })

            result.sort(key=lambda x: abs(x.get('price_change_percent') or 0), reverse=True)

            return jsonify(bool=True, status=200, response={
                'my_stocks': result,
                'total':     len(result),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  MARKET MOVERS WIDGET
#  

@ns.route('/market_movers')
class MarketMoversWidget(Resource):
    @ns.doc(
        description='Market movers grouped by category: TOP_GAINER, TOP_LOSER, '
                    'MOST_ACTIVE, TRENDING, NEW_HIGH_52W, NEW_LOW_52W.'
    )
    @jwt_required()
    def get(self):
        try:
            p = reqparse.RequestParser()
            p.add_argument('limit', type=int, default=5, location='args')
            args  = p.parse_args(strict=False)
            limit = min(20, max(1, args['limit']))

            categories = ['TOP_GAINER', 'TOP_LOSER', 'MOST_ACTIVE', 'TRENDING']
            result     = {}

            for cat in categories:
                movers = (MarketMovers.query
                          .filter_by(category=cat)
                          .order_by(MarketMovers.snapshot_at.desc(), MarketMovers.rank.asc())
                          .limit(limit).all())
                result[cat] = [{
                    'rank':                 m.rank,
                    'stock_id':             m.stock_id,
                    'ticker_symbol':        m.stock.ticker_symbol if m.stock else None,
                    'company_name':         m.stock.company_name  if m.stock else None,
                    'logo_url':             m.stock.logo_url       if m.stock else None,
                    'sector':               m.stock.sector         if m.stock else None,
                    'price':                float(m.price)                if m.price                else None,
                    'price_change':         float(m.price_change)         if m.price_change         else None,
                    'price_change_percent': float(m.price_change_percent) if m.price_change_percent else None,
                    'volume':               m.volume,
                } for m in movers]

            return jsonify(bool=True, status=200, response={
                'market_movers': result,
                'as_of': str(datetime.now(timezone.utc)),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  SECTOR PERFORMANCE WIDGET
#  

@ns.route('/sector_performance')
class SectorPerformanceWidget(Resource):
    @ns.doc(description='Today\'s sector performance for the heatmap / bar widget.')
    @jwt_required()
    def get(self):
        try:
            snap_date = date.today()
            sectors   = (SectorPerformance.query
                         .filter_by(snapshot_date=snap_date)
                         .order_by(SectorPerformance.day_change_percent.desc())
                         .all())

            if not sectors:
                latest = SectorPerformance.query.order_by(
                    SectorPerformance.snapshot_date.desc()
                ).first()
                if latest:
                    snap_date = latest.snapshot_date
                    sectors   = (SectorPerformance.query
                                 .filter_by(snapshot_date=snap_date)
                                 .order_by(SectorPerformance.day_change_percent.desc())
                                 .all())

            return jsonify(bool=True, status=200, response={
                'snapshot_date': str(snap_date),
                'sectors': [{
                    'sector_name':          s.sector_name,
                    'day_change_percent':   float(s.day_change_percent)  if s.day_change_percent  else None,
                    'week_change_percent':  float(s.week_change_percent) if s.week_change_percent else None,
                    'month_change_percent': float(s.month_change_percent)if s.month_change_percent else None,
                    'ytd_change_percent':   float(s.ytd_change_percent)  if s.ytd_change_percent  else None,
                    'sentiment':            s.sentiment,
                    'platform_aum_percent': float(s.platform_aum_percent)if s.platform_aum_percent else None,
                } for s in sectors],
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  WIDGET CATALOGUE
#  

@ns.route('/widgets/catalogue')
class WidgetCatalogue(Resource):
    @ns.doc(description='List all available dashboard widgets for the current user\'s role.')
    @jwt_required()
    def get(self):
        try:
            role  = 'ADMIN' if _is_admin() else 'USER'
            query = DashboardWidgets.query.filter_by(is_active=True).filter(
                (DashboardWidgets.available_for_role == role) |
                (DashboardWidgets.available_for_role == WidgetRole.BOTH)
            )
            widgets = query.order_by(DashboardWidgets.widget_type.asc()).all()

            return jsonify(bool=True, status=200, response={
                'widgets': [{
                    'widget_id':          w.widget_id,
                    'widget_type':        w.widget_type,
                    'widget_name':        w.widget_name,
                    'description':        w.description,
                    'icon':               w.icon,
                    'available_for_role': w.available_for_role,
                    'default_width':      w.default_width,
                    'default_height':     w.default_height,
                    'min_width':          w.min_width,
                    'min_height':         w.min_height,
                    'max_width':          w.max_width,
                    'is_resizable':       w.is_resizable,
                    'is_removable':       w.is_removable,
                    'required_plan':      w.required_plan,
                    'config_schema':      w.config_schema,
                } for w in widgets],
                'total': len(widgets),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  USER DASHBOARD LAYOUT
#  

@ns.route('/layout')
class UserDashboardLayout(Resource):
    @ns.doc(description='Get the current user\'s saved dashboard layout.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            layouts = (UserDashboardLayouts.query
                       .filter_by(user_id=user_id, is_visible=True)
                       .order_by(UserDashboardLayouts.sort_order.asc())
                       .all())

            return jsonify(bool=True, status=200, response={
                'layout': [{
                    'layout_id':    l.layout_id,
                    'widget_id':    l.widget_id,
                    'widget_type':  l.widget.widget_type if l.widget else None,
                    'widget_name':  l.widget.widget_name if l.widget else None,
                    'icon':         l.widget.icon        if l.widget else None,
                    'grid_x':       l.grid_x,
                    'grid_y':       l.grid_y,
                    'grid_width':   l.grid_width,
                    'grid_height':  l.grid_height,
                    'is_visible':   l.is_visible,
                    'sort_order':   l.sort_order,
                    'config':       l.config or {},
                } for l in layouts],
                'total': len(layouts),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(
        description='Save (bulk upsert) the entire dashboard layout. '
                    'Pass a list of widget placement objects. Existing layout is replaced.'
    )
    @jwt_required()
    @ns.expect(save_layout_parser, validate=True)
    def put(self):
        try:
            from portal import db
            user_id = int(get_jwt_identity())
            args    = save_layout_parser.parse_args(strict=False)
            layouts = args['layouts']

            if not isinstance(layouts, list):
                return jsonify(bool=False, status=400, response={'message': '`layouts` must be a list.'})

            # Delete existing layout
            UserDashboardLayouts.query.filter_by(user_id=user_id).delete()
            db.session.commit()

            created = []
            for idx, item in enumerate(layouts):
                widget_id = item.get('widget_id')
                if not widget_id:
                    continue
                widget = DashboardWidgets.query.get(widget_id)
                if not widget:
                    continue

                row             = UserDashboardLayouts()
                row.user_id     = user_id
                row.widget_id   = widget_id
                row.grid_x      = item.get('grid_x', 0)
                row.grid_y      = item.get('grid_y', 0)
                row.grid_width  = item.get('grid_width',  widget.default_width)
                row.grid_height = item.get('grid_height', widget.default_height)
                row.is_visible  = item.get('is_visible', True)
                row.sort_order  = item.get('sort_order', idx)
                row.config      = item.get('config', {})
                db.session.add(row)
                created.append(widget_id)

            db.session.commit()

            return jsonify(bool=True, status=200, response={
                'message':        'Dashboard layout saved.',
                'widgets_saved':  len(created),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/layout/widget')
class AddWidgetToLayout(Resource):
    @ns.doc(description='Add a single widget to the dashboard layout.')
    @jwt_required()
    @ns.expect(widget_config_parser, validate=True)
    def post(self):
        try:
            from portal import db
            user_id = int(get_jwt_identity())
            args    = widget_config_parser.parse_args(strict=False)

            widget = DashboardWidgets.query.get(args['widget_id'])
            if not widget:
                return jsonify(bool=False, status=404, response={'message': 'Widget not found.'})

            existing = UserDashboardLayouts.query.filter_by(
                user_id=user_id, widget_id=args['widget_id']
            ).first()
            if existing:
                return jsonify(bool=False, status=400, response={'message': 'Widget already on dashboard.'})

            row             = UserDashboardLayouts()
            row.user_id     = user_id
            row.widget_id   = args['widget_id']
            row.grid_x      = args.get('grid_x', 0)
            row.grid_y      = args.get('grid_y', 0)
            row.grid_width  = args.get('grid_width',  widget.default_width)
            row.grid_height = args.get('grid_height', widget.default_height)
            row.is_visible  = args.get('is_visible', True)
            row.sort_order  = args.get('sort_order', 0)
            row.config      = args.get('config') or {}
            row.save()

            return jsonify(bool=True, status=200, response={
                'message':   'Widget added to dashboard.',
                'layout_id': row.layout_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/layout/widget/<int:layout_id>')
class UpdateRemoveWidget(Resource):
    @ns.doc(description='Update a widget\'s position/size/config in the dashboard.')
    @jwt_required()
    @ns.expect(widget_config_parser, validate=False)
    def put(self, layout_id):
        try:
            user_id = int(get_jwt_identity())
            row     = UserDashboardLayouts.query.filter_by(layout_id=layout_id, user_id=user_id).first()
            if not row:
                return jsonify(bool=False, status=404, response={'message': 'Layout entry not found.'})

            args = widget_config_parser.parse_args(strict=False)
            for field in ['grid_x','grid_y','grid_width','grid_height','is_visible','sort_order']:
                if args.get(field) is not None:
                    setattr(row, field, args[field])
            if args.get('config') is not None:
                row.config = args['config']
            row.update()

            return jsonify(bool=True, status=200, response={'message': 'Widget layout updated.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Remove a widget from the dashboard layout.')
    @jwt_required()
    def delete(self, layout_id):
        try:
            user_id = int(get_jwt_identity())
            row     = UserDashboardLayouts.query.filter_by(layout_id=layout_id, user_id=user_id).first()
            if not row:
                return jsonify(bool=False, status=404, response={'message': 'Layout entry not found.'})
            row.delete()
            return jsonify(bool=True, status=200, response={'message': 'Widget removed from dashboard.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  ADMIN DASHBOARD WIDGETS  (pre-built admin-specific widget data)
#  

@ns.route('/admin/platform_summary')
class AdminPlatformSummary(Resource):
    @ns.doc(description='[ADMIN] Quick platform summary numbers for admin dashboard cards.')
    @jwt_required()
    def get(self):
        try:
            if not _is_admin():
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            from portal.models.users          import Users, UserStatus
            from portal.models.wallets        import Wallets
            from portal import db
            from sqlalchemy import func

            today      = date.today()
            yesterday  = today - timedelta(days=1)
            last_30d   = today - timedelta(days=30)

            total_users     = Users.query.count()
            active_users    = Users.query.filter_by(status=UserStatus.ACTIVE).count()
            new_today       = Users.query.filter(
                Users.created_on >= datetime.combine(today, datetime.min.time())
            ).count()
            new_yesterday   = Users.query.filter(
                Users.created_on >= datetime.combine(yesterday, datetime.min.time()),
                Users.created_on <  datetime.combine(today,     datetime.min.time())
            ).count()

            total_aum = float(
                db.session.query(func.sum(Portfolios.current_value))
                .filter_by(is_active=True).scalar() or 0
            )

            from portal.models.transactions import Transactions, TxnType, TxnStatus
            rev_30d = float(
                db.session.query(func.sum(Transactions.fee))
                .filter(
                    Transactions.txn_type.in_([TxnType.BUY, TxnType.SELL]),
                    Transactions.txn_status == TxnStatus.COMPLETED,
                    Transactions.transacted_at >= datetime.combine(last_30d, datetime.min.time()),
                ).scalar() or 0
            )

            filled_today = TradeOrders.query.filter(
                TradeOrders.submitted_at >= datetime.combine(today, datetime.min.time()),
                TradeOrders.order_status == OrderStatus.FILLED
            ).count()

            return jsonify(bool=True, status=200, response={
                'total_users':      total_users,
                'active_users':     active_users,
                'new_users_today':  new_today,
                'new_users_yesterday': new_yesterday,
                'total_aum':        round(total_aum, 2),
                'revenue_30d':      round(rev_30d, 2),
                'trades_today':     filled_today,
                'as_of':            str(datetime.now(timezone.utc)),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin/recent_users')
class AdminRecentUsers(Resource):
    @ns.doc(description='[ADMIN] Recently registered users widget for admin dashboard.')
    @jwt_required()
    def get(self):
        try:
            if not _is_admin():
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            p = reqparse.RequestParser()
            p.add_argument('limit', type=int, default=10, location='args')
            args  = p.parse_args(strict=False)
            limit = min(50, max(1, args['limit']))

            from portal.models.users import Users
            users = (Users.query
                     .order_by(Users.created_on.desc())
                     .limit(limit).all())

            return jsonify(bool=True, status=200, response={
                'users': [{
                    'user_id':     u.user_id,
                    'email':       u.email,
                    'username':    u.username,
                    'full_name':   u.full_name,
                    'role':        u.role.role_name if u.role else None,
                    'status':      u.status,
                    'country':     u.profile.country if u.profile else None,
                    'avatar_url':  u.profile.avatar_url if u.profile else None,
                    'last_login':  str(u.last_login) if u.last_login else None,
                    'created_on':  str(u.created_on),
                } for u in users],
                'total': len(users),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#
#  WATCHLIST WIDGET  (quick watchlist for dashboard)
#

@ns.route('/user/watchlist_widget')
class WatchlistWidget(Resource):
    @ns.doc(description='Returns the user\'s default watchlist items with live prices for the dashboard widget.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            p = reqparse.RequestParser()
            p.add_argument('limit', type=int, default=10, location='args')
            args  = p.parse_args(strict=False)
            limit = min(30, max(1, args['limit']))

            default_wl = Watchlists.query.filter_by(
                user_id=user_id, is_default=True, is_active=True
            ).first()
            if not default_wl:
                default_wl = Watchlists.query.filter_by(
                    user_id=user_id, is_active=True
                ).order_by(Watchlists.sort_order.asc()).first()

            if not default_wl:
                return jsonify(bool=True, status=200, response={'watchlist': None, 'items': []})

            items = (WatchlistItems.query
                     .filter_by(watchlist_id=default_wl.watchlist_id)
                     .order_by(WatchlistItems.sort_order.asc())
                     .limit(limit).all())

            return jsonify(bool=True, status=200, response={
                'watchlist_id':   default_wl.watchlist_id,
                'watchlist_name': default_wl.watchlist_name,
                'items': [{
                    'item_id':              i.item_id,
                    'stock_id':             i.stock_id,
                    'ticker_symbol':        i.stock.ticker_symbol        if i.stock else None,
                    'company_name':         i.stock.company_name         if i.stock else None,
                    'logo_url':             i.stock.logo_url              if i.stock else None,
                    'current_price':        float(i.stock.current_price) if i.stock and i.stock.current_price else None,
                    'price_change':         float(i.stock.price_change)  if i.stock and i.stock.price_change  else None,
                    'price_change_percent': float(i.stock.price_change_percent) if i.stock and i.stock.price_change_percent else None,
                    'price_at_add':         float(i.price_at_add)        if i.price_at_add                  else None,
                    'sparkline_data':       i.sparkline_data or [],
                } for i in items],
                'total': len(items),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  PORTFOLIO MONTHLY RETURNS  (User Portfolio screen bar chart)
#  

@ns.route('/user/monthly_returns')
class MonthlyReturns(Resource):
    @ns.doc(description='Returns monthly return bars for the User Portfolio screen chart.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            p = reqparse.RequestParser()
            p.add_argument('portfolio_id', type=int, required=False, location='args')
            p.add_argument('months',       type=int, default=12,     location='args')
            args = p.parse_args(strict=False)

            if args.get('portfolio_id'):
                portfolio = Portfolios.query.filter_by(
                    portfolio_id=args['portfolio_id'], user_id=user_id
                ).first()
            else:
                # Prefer the default portfolio, but fall back to any active one —
                # users may have a portfolio that was never flagged is_default.
                portfolio = (Portfolios.query.filter_by(user_id=user_id, is_default=True, is_active=True).first()
                             or Portfolios.query.filter_by(user_id=user_id, is_active=True).first())

            # A user with no portfolio yet isn't an error — return empty data so
            # the dashboard widget renders cleanly instead of failing.
            if not portfolio:
                return jsonify(bool=True, status=200, response={'monthly_returns': []})

            since = date.today().replace(day=1) - timedelta(days=30 * min(24, args['months']))
            perfs  = (PortfolioPerformanceHistory.query
                      .filter_by(portfolio_id=portfolio.portfolio_id, interval='MONTHLY')
                      .filter(PortfolioPerformanceHistory.snapshot_date >= since)
                      .order_by(PortfolioPerformanceHistory.snapshot_date.asc())
                      .all())

            return jsonify(bool=True, status=200, response={
                'portfolio_id':   portfolio.portfolio_id,
                'portfolio_name': portfolio.portfolio_name,
                'monthly_returns': [{
                    'month':                  str(p.snapshot_date)[:7],  # YYYY-MM
                    'daily_return':           float(p.daily_return)           if p.daily_return           else None,
                    'daily_return_percent':   float(p.daily_return_percent)   if p.daily_return_percent   else None,
                    'cumulative_return':      float(p.cumulative_return)      if p.cumulative_return      else None,
                    'cumulative_return_pct':  float(p.cumulative_return_percent) if p.cumulative_return_percent else None,
                    'total_value':            float(p.total_value),
                } for p in perfs],
                'count': len(perfs),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  USER MARKET PAGE  (stocks with "My Holdings" column)
#  

@ns.route('/user/market_overview')
class UserMarketOverview(Resource):
    @ns.doc(
        description='Market browse page data. Returns paginated stocks with the '
                    'current user\'s position data injected per stock.'
    )
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())

            p = reqparse.RequestParser()
            p.add_argument('page',       type=int, default=1,    location='args')
            p.add_argument('per_page',   type=int, default=20,   location='args')
            p.add_argument('search',     type=str, required=False, location='args')
            p.add_argument('sector',     type=str, required=False, location='args')
            p.add_argument('sort_by',    type=str, default='current_price', location='args')
            p.add_argument('order',      type=str, default='desc', location='args')
            args     = p.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])

            from portal.models.stocks import StockStatus
            query = Stocks.query.filter_by(status=StockStatus.ACTIVE)

            if args.get('search'):
                s = f"%{args['search']}%"
                query = query.filter(
                    (Stocks.ticker_symbol.ilike(s)) |
                    (Stocks.company_name.ilike(s))
                )
            if args.get('sector'):
                query = query.filter(Stocks.sector.ilike(f"%{args['sector']}%"))

            sort_col = getattr(Stocks, args.get('sort_by', 'current_price'), Stocks.current_price)
            query    = query.order_by(sort_col.desc() if args['order'] == 'desc' else sort_col.asc())

            paginated = query.paginate(page=page, per_page=per_page, error_out=False)

            # Build a holdings lookup for this user
            user_holdings = {
                h.stock_id: h
                for h in PortfolioHoldings.query.filter_by(user_id=user_id, is_active=True).all()
            }

            stocks_data = []
            for s in paginated.items:
                h = user_holdings.get(s.stock_id)
                stocks_data.append({
                    'stock_id':             s.stock_id,
                    'ticker_symbol':        s.ticker_symbol,
                    'company_name':         s.company_name,
                    'logo_url':             s.logo_url,
                    'sector':               s.sector,
                    'exchange':             s.exchange,
                    'current_price':        float(s.current_price)         if s.current_price         else None,
                    'price_change_percent': float(s.price_change_percent)  if s.price_change_percent  else None,
                    'volume':               s.volume,
                    'my_holding': {
                        'quantity':               float(h.quantity),
                        'avg_buy_price':          float(h.average_buy_price),
                        'current_value':          float(h.current_value)         if h.current_value         else None,
                        'unrealized_pnl':         float(h.unrealized_pnl)        if h.unrealized_pnl        else None,
                        'unrealized_pnl_percent': float(h.unrealized_pnl_percent)if h.unrealized_pnl_percent else None,
                    } if h else None,
                })

            return jsonify(bool=True, status=200, response={
                'stocks':      stocks_data,
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
