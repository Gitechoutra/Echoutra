import logging
import traceback
from datetime import datetime, timezone, date, timedelta

from flask import jsonify, request
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal.models.platform_statistics  import PlatformStatistics
from portal.models.platform_revenue     import PlatformRevenue
from portal.models.sector_performance   import SectorPerformance
from portal.models.country_statistics   import CountryStatistics
from portal.models.system_health_logs   import SystemHealthLogs, HealthStatus
from portal.models.admin_settings       import AdminSettings
from portal.models.feature_flags        import FeatureFlags, FlagRolloutType
from portal.models.audit_logs           import AuditLogs
from portal.models.admin_activity_logs  import AdminActivityLogs
from portal.models.users                import Users, UserStatus
from portal.models.portfolios           import Portfolios
from portal.models.portfolio_holdings   import PortfolioHoldings
from portal.models.stocks               import Stocks
from portal.models.stock_analytics      import StockAnalytics
from portal.models.trade_orders         import TradeOrders, OrderStatus
from portal.models.user_subscriptions   import UserSubscriptions, SubscriptionStatus
from portal.models.market_movers        import MarketMovers

from . import ns, logger



def _require_admin():
    claims = get_jwt()
    if claims.get('role') != 'ADMIN':
        return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})
    return None


#  
#  DASHBOARD
#  

@ns.route('/dashboard')
class AdminDashboard(Resource):
    @ns.doc(description='[ADMIN] Full admin dashboard: AUM, revenue, user metrics, plan distribution, top stocks.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            today      = date.today()
            yesterday  = today - timedelta(days=1)
            last_7d    = today - timedelta(days=7)
            last_30d   = today - timedelta(days=30)

            # Platform statistics snapshots
            stat_today = PlatformStatistics.query.filter_by(snapshot_date=today).first()
            stat_prev  = PlatformStatistics.query.filter_by(snapshot_date=yesterday).first()

            def _v(obj, field, default=0):
                return float(getattr(obj, field, default) or default) if obj else default

            # User counts
            total_users   = Users.query.count()
            active_users  = Users.query.filter_by(status=UserStatus.ACTIVE).count()
            new_today     = Users.query.filter(Users.created_on >= datetime.combine(today, datetime.min.time())).count()
            suspended     = Users.query.filter_by(status=UserStatus.SUSPENDED).count()

            # Plan distribution
            plan_dist = {}
            subs = UserSubscriptions.query.filter_by(status=SubscriptionStatus.ACTIVE).all()
            for s in subs:
                tier = s.plan.plan_tier if s.plan else 'FREE'
                plan_dist[tier] = plan_dist.get(tier, 0) + 1

            # AUM
            total_aum = 0.0
            for p in Portfolios.query.filter_by(is_active=True).all():
                total_aum += float(p.current_value or 0)

            # Revenue (last 30 days)
            from sqlalchemy import func
            from portal import db
            rev_30d = db.session.query(func.sum(PlatformRevenue.net_revenue)).filter(
                PlatformRevenue.snapshot_date >= last_30d
            ).scalar() or 0

            rev_7d = db.session.query(func.sum(PlatformRevenue.net_revenue)).filter(
                PlatformRevenue.snapshot_date >= last_7d
            ).scalar() or 0

            rev_today = db.session.query(func.sum(PlatformRevenue.net_revenue)).filter(
                PlatformRevenue.snapshot_date == today
            ).scalar() or 0

            # Trade volume today
            trades_today = TradeOrders.query.filter(
                TradeOrders.submitted_at >= datetime.combine(today, datetime.min.time()),
                TradeOrders.order_status == OrderStatus.FILLED
            ).count()

            # Top stocks by platform AUM
            top_stocks = (StockAnalytics.query
                          .order_by(StockAnalytics.platform_aum.desc())
                          .limit(5).all())

            # Recent users
            recent_users = (Users.query
                            .order_by(Users.created_on.desc())
                            .limit(5).all())

            return jsonify(bool=True, status=200, response={
                'users': {
                    'total':          total_users,
                    'active':         active_users,
                    'new_today':      new_today,
                    'suspended':      suspended,
                    'plan_distribution': plan_dist,
                },
                'financial': {
                    'total_aum':      round(total_aum, 2),
                    'revenue_today':  round(float(rev_today), 2),
                    'revenue_7d':     round(float(rev_7d), 2),
                    'revenue_30d':    round(float(rev_30d), 2),
                },
                'trading': {
                    'trades_today':   trades_today,
                },
                'top_stocks': [{
                    'stock_id':       a.stock_id,
                    'ticker_symbol':  a.stock.ticker_symbol if a.stock else None,
                    'company_name':   a.stock.company_name  if a.stock else None,
                    'logo_url':       a.stock.logo_url       if a.stock else None,
                    'total_holders':  a.total_holders,
                    'platform_aum':   float(a.platform_aum),
                    'platform_aum_percent': float(a.platform_aum_percent) if a.platform_aum_percent else 0,
                    'popularity_rank':a.popularity_rank,
                } for a in top_stocks],
                'recent_users': [{
                    'user_id':    u.user_id,
                    'email':      u.email,
                    'username':   u.username,
                    'status':     u.status,
                    'role':       u.role.role_name if u.role else None,
                    'created_on': str(u.created_on),
                } for u in recent_users],
                'as_of': str(datetime.now(timezone.utc)),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  ANALYTICS
#  

@ns.route('/analytics/aum_trend')
class AUMTrend(Resource):
    @ns.doc(description='[ADMIN] AUM trend over time for the main area chart.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('days',     type=int, default=30, location='args')
            p.add_argument('interval', type=str, default='DAILY', location='args')
            args = p.parse_args(strict=False)

            # INTRADAY: platform AUM = Σ every portfolio's value. The daily
            # PlatformStatistics snapshot is one row per day, so on the first day
            # the chart has nothing to draw. The intraday portfolio value ticks
            # (recorded every scheduler pass) are summed per capture instant to
            # give a real within-day AUM curve — mirroring the user portfolio chart.
            if args['interval'].upper() == 'INTRADAY':
                from portal import db
                from portal.models.portfolio_value_ticks import PortfolioValueTicks
                from sqlalchemy import func
                rows = (db.session.query(
                            PortfolioValueTicks.captured_at,
                            func.sum(PortfolioValueTicks.total_value))
                        .group_by(PortfolioValueTicks.captured_at)
                        .order_by(PortfolioValueTicks.captured_at.asc())
                        .limit(500).all())
                return jsonify(bool=True, status=200, response={
                    'interval': 'INTRADAY',
                    'data': [{'date': c.isoformat(), 'total_aum': float(v or 0)} for c, v in rows],
                    'count': len(rows),
                })

            since = date.today() - timedelta(days=min(365, args['days']))
            stats = (PlatformStatistics.query
                     .filter(PlatformStatistics.snapshot_date >= since)
                     .order_by(PlatformStatistics.snapshot_date.asc())
                     .all())

            return jsonify(bool=True, status=200, response={
                'data': [{
                    'date':        str(s.snapshot_date),
                    'total_aum':   float(s.total_aum),
                    'total_users': s.total_registered_users,
                    'new_users':   s.new_users_today,
                } for s in stats],
                'count': len(stats),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/analytics/user_growth')
class UserGrowth(Resource):
    @ns.doc(description='[ADMIN] User growth chart data — new signups and total users per day.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('days', type=int, default=30, location='args')
            args  = p.parse_args(strict=False)
            since = date.today() - timedelta(days=min(365, args['days']))

            stats = (PlatformStatistics.query
                     .filter(PlatformStatistics.snapshot_date >= since)
                     .order_by(PlatformStatistics.snapshot_date.asc())
                     .all())

            return jsonify(bool=True, status=200, response={
                'data': [{
                    'date':           str(s.snapshot_date),
                    'total_users':    s.total_registered_users,
                    'new_users':      s.new_users_today,
                    'active_users':   s.active_users_today,
                    'free_users':     s.free_plan_users,
                    'paid_users':     (s.basic_plan_users + s.pro_plan_users +
                                       s.premium_plan_users + s.enterprise_plan_users),
                } for s in stats],
                'count': len(stats),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/analytics/revenue')
class RevenueAnalytics(Resource):
    @ns.doc(description='[ADMIN] Revenue breakdown by type over time — for revenue charts and MRR/ARR.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('days',         type=int, default=30, location='args')
            p.add_argument('revenue_type', type=str, required=False, location='args')
            args  = p.parse_args(strict=False)
            since = date.today() - timedelta(days=min(365, args['days']))

            query = PlatformRevenue.query.filter(PlatformRevenue.snapshot_date >= since)
            if args.get('revenue_type'):
                query = query.filter(PlatformRevenue.revenue_type == args['revenue_type'].upper())

            revenues = query.order_by(PlatformRevenue.snapshot_date.asc()).all()

            # Aggregate totals
            from sqlalchemy import func
            from portal import db
            totals = db.session.query(
                PlatformRevenue.revenue_type,
                func.sum(PlatformRevenue.net_revenue).label('total')
            ).filter(PlatformRevenue.snapshot_date >= since).group_by(PlatformRevenue.revenue_type).all()

            return jsonify(bool=True, status=200, response={
                'data': [{
                    'date':             str(r.snapshot_date),
                    'revenue_type':     r.revenue_type,
                    'gross_revenue':    float(r.gross_revenue),
                    'net_revenue':      float(r.net_revenue),
                    'refunds':          float(r.refunds),
                    'transaction_count':r.transaction_count,
                    'plan_breakdown':   r.plan_breakdown,
                } for r in revenues],
                'totals_by_type': {t.revenue_type: float(t.total) for t in totals},
                'count': len(revenues),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/analytics/trade_volume')
class TradeVolumeAnalytics(Resource):
    @ns.doc(description='[ADMIN] Platform-wide trade volume and order count stats.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('days', type=int, default=30, location='args')
            args  = p.parse_args(strict=False)
            since = date.today() - timedelta(days=min(365, args['days']))

            stats = (PlatformStatistics.query
                     .filter(PlatformStatistics.snapshot_date >= since)
                     .order_by(PlatformStatistics.snapshot_date.asc())
                     .all())

            return jsonify(bool=True, status=200, response={
                'data': [{
                    'date':              str(s.snapshot_date),
                    'trades_today':      s.total_trades_today,
                    'trade_volume':      float(s.total_trade_volume_today),
                } for s in stats],
                'count': len(stats),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/analytics/sector_performance')
class SectorPerformanceAPI(Resource):
    @ns.doc(description='[ADMIN] Sector performance data for charts.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('snapshot_date', type=str, required=False, location='args')
            args = p.parse_args(strict=False)

            snap_date = (date.fromisoformat(args['snapshot_date'])
                         if args.get('snapshot_date') else date.today())

            sectors = (SectorPerformance.query
                       .filter_by(snapshot_date=snap_date)
                       .order_by(SectorPerformance.platform_aum_in_sector.desc())
                       .all())

            if not sectors:
                # Fallback to most recent available
                latest = SectorPerformance.query.order_by(SectorPerformance.snapshot_date.desc()).first()
                if latest:
                    snap_date = latest.snapshot_date
                    sectors   = SectorPerformance.query.filter_by(snapshot_date=snap_date).all()

            return jsonify(bool=True, status=200, response={
                'snapshot_date': str(snap_date),
                'sectors': [{
                    'sector_name':           s.sector_name,
                    'day_change_percent':     float(s.day_change_percent)     if s.day_change_percent     else None,
                    'month_change_percent':   float(s.month_change_percent)   if s.month_change_percent   else None,
                    'ytd_change_percent':     float(s.ytd_change_percent)     if s.ytd_change_percent     else None,
                    'platform_aum':           float(s.platform_aum_in_sector) if s.platform_aum_in_sector else None,
                    'platform_aum_percent':   float(s.platform_aum_percent)   if s.platform_aum_percent   else None,
                    'total_stocks':           s.total_stocks_in_sector,
                    'total_users':            s.total_users_in_sector,
                    'sentiment':              s.sentiment,
                } for s in sectors],
                'count': len(sectors),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/analytics/country_stats')
class CountryStatsAPI(Resource):
    @ns.doc(description='[ADMIN] Users and revenue by country for the world-map chart.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            snap_date = date.today()
            stats = CountryStatistics.query.filter_by(snapshot_date=snap_date).all()

            if not stats:
                latest = CountryStatistics.query.order_by(CountryStatistics.snapshot_date.desc()).first()
                if latest:
                    snap_date = latest.snapshot_date
                    stats     = CountryStatistics.query.filter_by(snapshot_date=snap_date).all()

            return jsonify(bool=True, status=200, response={
                'snapshot_date': str(snap_date),
                'countries': [{
                    'country_name':   s.country_name,
                    'country_code':   s.country_code,
                    'total_users':    s.total_users,
                    'active_users':   s.active_users,
                    'new_users':      s.new_users,
                    'paid_users':     s.paid_users,
                    'total_aum':      float(s.total_aum),
                    'total_revenue':  float(s.total_revenue),
                    'total_trades':   s.total_trades,
                } for s in stats],
                'count': len(stats),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/analytics/leaderboard')
class UserLeaderboard(Resource):
    @ns.doc(description='[ADMIN] Top users ranked by portfolio value / return %.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('sort_by', type=str, default='current_value', location='args')
            p.add_argument('limit',   type=int, default=10,              location='args')
            args = p.parse_args(strict=False)

            sort_col = (Portfolios.total_return_percent
                        if args['sort_by'] == 'return_percent'
                        else Portfolios.current_value)

            top = (Portfolios.query
                   .filter_by(is_active=True, is_default=True)
                   .order_by(sort_col.desc())
                   .limit(min(50, args['limit']))
                   .all())

            return jsonify(bool=True, status=200, response={
                'leaderboard': [{
                    'rank':                 i + 1,
                    'user_id':              p.user_id,
                    'username':             p.user.username if p.user else None,
                    'avatar_url':           p.user.profile.avatar_url if p.user and p.user.profile else None,
                    'portfolio_value':      float(p.current_value),
                    'total_return':         float(p.total_return),
                    'total_return_percent': float(p.total_return_percent),
                    'holdings_count':       p.total_holdings_count,
                } for i, p in enumerate(top)],
                'total': len(top),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  ALL STOCKS OVERVIEW  (Admin All Stocks screen)
#  

@ns.route('/stocks/overview')
class AdminStocksOverview(Resource):
    @ns.doc(description='[ADMIN] All stocks held across ALL users — popularity rank, holder count, platform AUM.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('page',     type=int, default=1,              location='args')
            p.add_argument('per_page', type=int, default=20,             location='args')
            p.add_argument('sort_by',  type=str, default='platform_aum', location='args')
            p.add_argument('search',   type=str, required=False,         location='args')
            args     = p.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])

            sort_col = getattr(StockAnalytics, args.get('sort_by', 'platform_aum'), StockAnalytics.platform_aum)
            query    = StockAnalytics.query.join(Stocks, StockAnalytics.stock_id == Stocks.stock_id)

            if args.get('search'):
                s = f"%{args['search']}%"
                query = query.filter(
                    (Stocks.ticker_symbol.ilike(s)) | (Stocks.company_name.ilike(s))
                )

            paginated = query.order_by(sort_col.desc()).paginate(page=page, per_page=per_page, error_out=False)

            return jsonify(bool=True, status=200, response={
                'stocks': [{
                    'stock_id':           a.stock_id,
                    'ticker_symbol':      a.stock.ticker_symbol if a.stock else None,
                    'company_name':       a.stock.company_name  if a.stock else None,
                    'sector':             a.stock.sector         if a.stock else None,
                    'logo_url':           a.stock.logo_url       if a.stock else None,
                    'current_price':      float(a.stock.current_price) if a.stock and a.stock.current_price else None,
                    'price_change_pct':   float(a.stock.price_change_percent) if a.stock and a.stock.price_change_percent else None,
                    'total_holders':      a.total_holders,
                    'total_watchers':     a.total_watchers,
                    'platform_aum':       float(a.platform_aum),
                    'platform_aum_percent': float(a.platform_aum_percent) if a.platform_aum_percent else 0,
                    'popularity_rank':    a.popularity_rank,
                    'total_trades':       a.total_trades_count,
                    'return_1d':          float(a.return_1d) if a.return_1d else None,
                    'return_1m':          float(a.return_1m) if a.return_1m else None,
                    'consensus_rating':   a.consensus_rating,
                } for a in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  ADMIN SETTINGS
#  

@ns.route('/settings')
class AdminSettingsList(Resource):
    @ns.doc(description='[ADMIN] List all platform settings.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('category', type=str, required=False, location='args')
            args     = p.parse_args(strict=False)
            query    = AdminSettings.query
            if args.get('category'):
                query = query.filter_by(category=args['category'].upper())

            settings = query.order_by(AdminSettings.category.asc(), AdminSettings.setting_key.asc()).all()

            return jsonify(bool=True, status=200, response={
                'settings': [{
                    'setting_id':    s.setting_id,
                    'setting_key':   s.setting_key,
                    'setting_value': s.setting_value if not s.is_sensitive else '***',
                    'default_value': s.default_value,
                    'data_type':     s.data_type,
                    'category':      s.category,
                    'label':         s.label,
                    'description':   s.description,
                    'is_editable':   s.is_editable,
                    'is_public':     s.is_public,
                    'is_sensitive':  s.is_sensitive,
                    'updated_on':    str(s.updated_on),
                } for s in settings],
                'total': len(settings),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/settings/<string:setting_key>')
class AdminSettingDetail(Resource):
    @ns.doc(description='[ADMIN] Get a setting by key.')
    @jwt_required()
    def get(self, setting_key):
        try:
            err = _require_admin()
            if err:
                return err

            setting = AdminSettings.query.filter_by(setting_key=setting_key).first()
            if not setting:
                return jsonify(bool=False, status=404, response={'message': f"Setting '{setting_key}' not found."})

            return jsonify(bool=True, status=200, response={
                'setting_key':   setting.setting_key,
                'setting_value': setting.setting_value if not setting.is_sensitive else '***',
                'data_type':     setting.data_type,
                'category':      setting.category,
                'label':         setting.label,
                'description':   setting.description,
                'is_editable':   setting.is_editable,
                'updated_on':    str(setting.updated_on),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Update a platform setting value.')
    @jwt_required()
    def put(self, setting_key):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('setting_value', type=str, required=True, location='json')
            args = p.parse_args(strict=False)

            setting = AdminSettings.query.filter_by(setting_key=setting_key).first()
            if not setting:
                return jsonify(bool=False, status=404, response={'message': f"Setting '{setting_key}' not found."})
            if not setting.is_editable:
                return jsonify(bool=False, status=403, response={'message': 'This setting is read-only.'})

            claims = get_jwt()
            old_val = setting.setting_value
            setting.setting_value    = args['setting_value']
            setting.last_modified_by = claims.get('user_id')
            setting.update()

            log = AdminActivityLogs()
            log.admin_user_id = claims.get('user_id')
            log.action_type   = 'MODIFY_SETTING'
            log.description   = f"Setting '{setting_key}' updated."
            log.before_state  = {'value': old_val}
            log.after_state   = {'value': args['setting_value']}
            log.save()

            return jsonify(bool=True, status=200, response={'message': f"Setting '{setting_key}' updated."})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Create a new platform setting.')
    @jwt_required()
    def post(self, setting_key):
        try:
            err = _require_admin()
            if err:
                return err

            if AdminSettings.query.filter_by(setting_key=setting_key).first():
                return jsonify(bool=False, status=400, response={'message': 'Setting key already exists.'})

            p = reqparse.RequestParser()
            p.add_argument('setting_value', type=str, required=True,  location='json')
            p.add_argument('data_type',     type=str, required=False, location='json', default='STRING')
            p.add_argument('category',      type=str, required=False, location='json')
            p.add_argument('label',         type=str, required=False, location='json')
            p.add_argument('description',   type=str, required=False, location='json')
            p.add_argument('is_sensitive',  type=bool, required=False, location='json', default=False)
            p.add_argument('is_public',     type=bool, required=False, location='json', default=False)
            args = p.parse_args(strict=False)

            claims   = get_jwt()
            setting  = AdminSettings()
            setting.setting_key    = setting_key
            setting.setting_value  = args['setting_value']
            setting.data_type      = args.get('data_type', 'STRING')
            setting.category       = args.get('category', '').upper()
            setting.label          = args.get('label', '')
            setting.description    = args.get('description', '')
            setting.is_sensitive   = args.get('is_sensitive', False)
            setting.is_public      = args.get('is_public', False)
            setting.last_modified_by = claims.get('user_id')
            setting.save()

            return jsonify(bool=True, status=200, response={
                'message':    'Setting created.',
                'setting_id': setting.setting_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  FEATURE FLAGS
#  

@ns.route('/feature_flags')
class FeatureFlagsList(Resource):
    @ns.doc(description='[ADMIN] List all feature flags.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            flags = FeatureFlags.query.order_by(FeatureFlags.category.asc(), FeatureFlags.flag_key.asc()).all()
            return jsonify(bool=True, status=200, response={
                'flags': [{
                    'flag_id':            f.flag_id,
                    'flag_key':           f.flag_key,
                    'flag_name':          f.flag_name,
                    'description':        f.description,
                    'category':           f.category,
                    'is_enabled':         f.is_enabled,
                    'rollout_type':       f.rollout_type,
                    'rollout_percentage': f.rollout_percentage,
                    'enabled_for_plans':  f.enabled_for_plans or [],
                    'starts_at':          str(f.starts_at) if f.starts_at else None,
                    'ends_at':            str(f.ends_at)   if f.ends_at   else None,
                    'owner':              f.owner,
                    'updated_on':         str(f.updated_on),
                } for f in flags],
                'total': len(flags),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Create a new feature flag.')
    @jwt_required()
    def post(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('flag_key',            type=str,  required=True,  location='json')
            p.add_argument('flag_name',           type=str,  required=True,  location='json')
            p.add_argument('description',         type=str,  required=False, location='json')
            p.add_argument('category',            type=str,  required=False, location='json')
            p.add_argument('is_enabled',          type=bool, required=False, location='json', default=False)
            p.add_argument('rollout_type',        type=str,  required=False, location='json', default='ALL_USERS')
            p.add_argument('rollout_percentage',  type=int,  required=False, location='json')
            p.add_argument('enabled_for_plans',   type=list, required=False, location='json')
            p.add_argument('owner',               type=str,  required=False, location='json')
            p.add_argument('jira_ticket',         type=str,  required=False, location='json')
            args = p.parse_args(strict=False)

            if FeatureFlags.query.filter_by(flag_key=args['flag_key']).first():
                return jsonify(bool=False, status=400, response={'message': 'Flag key already exists.'})

            claims = get_jwt()
            flag   = FeatureFlags()
            for field in ['flag_key','flag_name','description','category','is_enabled',
                          'rollout_type','rollout_percentage','enabled_for_plans','owner','jira_ticket']:
                if args.get(field) is not None:
                    setattr(flag, field, args[field])
            flag.last_modified_by = claims.get('user_id')
            flag.save()

            return jsonify(bool=True, status=200, response={
                'message': 'Feature flag created.',
                'flag_id': flag.flag_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/feature_flags/<string:flag_key>')
class FeatureFlagDetail(Resource):
    @ns.doc(description='[ADMIN] Toggle or update a feature flag.')
    @jwt_required()
    def put(self, flag_key):
        try:
            err = _require_admin()
            if err:
                return err

            flag = FeatureFlags.query.filter_by(flag_key=flag_key).first()
            if not flag:
                return jsonify(bool=False, status=404, response={'message': f"Flag '{flag_key}' not found."})

            p = reqparse.RequestParser()
            p.add_argument('is_enabled',         type=bool, required=False, location='json')
            p.add_argument('rollout_type',        type=str,  required=False, location='json')
            p.add_argument('rollout_percentage',  type=int,  required=False, location='json')
            p.add_argument('enabled_for_plans',   type=list, required=False, location='json')
            p.add_argument('enabled_for_user_ids',type=list, required=False, location='json')
            p.add_argument('description',         type=str,  required=False, location='json')
            args   = p.parse_args(strict=False)
            claims = get_jwt()

            for field in ['is_enabled','rollout_type','rollout_percentage',
                          'enabled_for_plans','enabled_for_user_ids','description']:
                if args.get(field) is not None:
                    setattr(flag, field, args[field])
            flag.last_modified_by = claims.get('user_id')
            flag.update()

            log = AdminActivityLogs()
            log.admin_user_id = claims.get('user_id')
            log.action_type   = 'CHANGE_FEATURE_FLAG'
            log.description   = f"Feature flag '{flag_key}' updated. enabled={flag.is_enabled}"
            log.after_state   = {'is_enabled': flag.is_enabled, 'rollout_type': flag.rollout_type}
            log.save()

            return jsonify(bool=True, status=200, response={
                'message':    f"Flag '{flag_key}' updated.",
                'is_enabled': flag.is_enabled,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Delete a feature flag.')
    @jwt_required()
    def delete(self, flag_key):
        try:
            err = _require_admin()
            if err:
                return err

            flag = FeatureFlags.query.filter_by(flag_key=flag_key).first()
            if not flag:
                return jsonify(bool=False, status=404, response={'message': f"Flag '{flag_key}' not found."})
            flag.delete()
            return jsonify(bool=True, status=200, response={'message': f"Flag '{flag_key}' deleted."})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  SYSTEM HEALTH
#  

@ns.route('/system_health')
class SystemHealth(Resource):
    @ns.doc(description='[ADMIN] Current health status of all platform services.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            # Latest health log per service
            from sqlalchemy import func
            from portal import db
            subq = (db.session.query(
                        SystemHealthLogs.service_name,
                        func.max(SystemHealthLogs.checked_at).label('latest'))
                    .group_by(SystemHealthLogs.service_name)
                    .subquery())

            logs = (SystemHealthLogs.query
                    .join(subq, (SystemHealthLogs.service_name == subq.c.service_name) &
                                (SystemHealthLogs.checked_at  == subq.c.latest))
                    .all())

            overall = (HealthStatus.HEALTHY
                       if all(l.status == HealthStatus.HEALTHY for l in logs)
                       else HealthStatus.DEGRADED
                       if any(l.status == HealthStatus.DEGRADED for l in logs)
                       else HealthStatus.DOWN)

            return jsonify(bool=True, status=200, response={
                'overall_status': overall,
                'services': [{
                    'service_name':       l.service_name,
                    'service_type':       l.service_type,
                    'status':             l.status,
                    'status_message':     l.status_message,
                    'response_time_ms':   l.response_time_ms,
                    'cpu_usage_percent':  float(l.cpu_usage_percent)    if l.cpu_usage_percent    else None,
                    'memory_usage_percent': float(l.memory_usage_percent) if l.memory_usage_percent else None,
                    'error_rate_percent': float(l.error_rate_percent)   if l.error_rate_percent   else None,
                    'uptime_seconds':     l.uptime_seconds,
                    'version':            l.version,
                    'checked_at':         str(l.checked_at),
                } for l in logs],
                'checked_at': str(datetime.now(timezone.utc)),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Log a system health check result.')
    @jwt_required()
    def post(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('service_name',          type=str,   required=True,  location='json')
            p.add_argument('service_type',          type=str,   required=True,  location='json')
            p.add_argument('status',                type=str,   required=True,  location='json')
            p.add_argument('status_message',        type=str,   required=False, location='json')
            p.add_argument('response_time_ms',      type=int,   required=False, location='json')
            p.add_argument('cpu_usage_percent',     type=float, required=False, location='json')
            p.add_argument('memory_usage_percent',  type=float, required=False, location='json')
            p.add_argument('disk_usage_percent',    type=float, required=False, location='json')
            p.add_argument('error_rate_percent',    type=float, required=False, location='json')
            p.add_argument('uptime_seconds',        type=int,   required=False, location='json')
            p.add_argument('version',               type=str,   required=False, location='json')
            p.add_argument('region',                type=str,   required=False, location='json')
            args = p.parse_args(strict=False)

            log = SystemHealthLogs()
            for field in ['service_name','service_type','status','status_message',
                          'response_time_ms','cpu_usage_percent','memory_usage_percent',
                          'disk_usage_percent','error_rate_percent','uptime_seconds','version','region']:
                if args.get(field) is not None:
                    setattr(log, field, args[field])
            log.checked_at = datetime.now(timezone.utc)
            log.save()

            return jsonify(bool=True, status=200, response={'message': 'Health log recorded.', 'health_log_id': log.health_log_id})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  AUDIT LOGS
#  

@ns.route('/audit_logs')
class AuditLogsList(Resource):
    @ns.doc(description='[ADMIN] Browse the platform audit log.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('page',     type=int, default=1,  location='args')
            p.add_argument('per_page', type=int, default=20, location='args')
            p.add_argument('user_id',  type=int, required=False, location='args')
            p.add_argument('action',   type=str, required=False, location='args')
            p.add_argument('category', type=str, required=False, location='args')
            p.add_argument('from_date',type=str, required=False, location='args')
            args     = p.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])
            query    = AuditLogs.query

            if args.get('user_id'):
                query = query.filter_by(user_id=args['user_id'])
            if args.get('action'):
                query = query.filter(AuditLogs.action.ilike(f"%{args['action']}%"))
            if args.get('category'):
                query = query.filter_by(action_category=args['category'].upper())
            if args.get('from_date'):
                query = query.filter(AuditLogs.created_on >= datetime.fromisoformat(args['from_date']))

            paginated = query.order_by(AuditLogs.created_on.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'logs': [{
                    'log_id':          l.log_id,
                    'user_id':         l.user_id,
                    'action':          l.action,
                    'action_category': l.action_category,
                    'entity_type':     l.entity_type,
                    'entity_id':       l.entity_id,
                    'description':     l.description,
                    'ip_address':      l.ip_address,
                    'status':          l.status,
                    'created_on':      str(l.created_on),
                } for l in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/admin_activity_logs')
class AdminActivityLogsList(Resource):
    @ns.doc(description='[ADMIN] Browse admin-specific activity log.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('page',        type=int, default=1,  location='args')
            p.add_argument('per_page',    type=int, default=20, location='args')
            p.add_argument('action_type', type=str, required=False, location='args')
            p.add_argument('admin_id',    type=int, required=False, location='args')
            p.add_argument('target_user', type=int, required=False, location='args')
            args     = p.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])
            query    = AdminActivityLogs.query

            if args.get('admin_id'):
                query = query.filter_by(admin_user_id=args['admin_id'])
            if args.get('target_user'):
                query = query.filter_by(target_user_id=args['target_user'])
            if args.get('action_type'):
                query = query.filter(AdminActivityLogs.action_type.ilike(f"%{args['action_type']}%"))

            paginated = query.order_by(AdminActivityLogs.created_on.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'logs': [{
                    'activity_id':       l.activity_id,
                    'admin_user_id':     l.admin_user_id,
                    'action_type':       l.action_type,
                    'target_user_id':    l.target_user_id,
                    'description':       l.description,
                    'reason':            l.reason,
                    'before_state':      l.before_state,
                    'after_state':       l.after_state,
                    'ip_address':        l.ip_address,
                    'status':            l.status,
                    'created_on':        str(l.created_on),
                } for l in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


#  
#  PLATFORM STATISTICS SNAPSHOT (write daily via cron)
#  

@ns.route('/platform_stats/snapshot')
class PlatformStatsSnapshot(Resource):
    @ns.doc(description='[ADMIN] Trigger a manual platform statistics snapshot for today.')
    @jwt_required()
    def post(self):
        try:
            err = _require_admin()
            if err:
                return err

            from portal import db
            from sqlalchemy import func

            today = date.today()
            stat  = PlatformStatistics.query.filter_by(snapshot_date=today).first()
            if not stat:
                stat = PlatformStatistics()
                stat.snapshot_date = today

            stat.total_registered_users = Users.query.count()
            stat.active_users_today     = Users.query.filter_by(status=UserStatus.ACTIVE).count()
            stat.suspended_users        = Users.query.filter_by(status=UserStatus.SUSPENDED).count()
            stat.new_users_today        = Users.query.filter(
                Users.created_on >= datetime.combine(today, datetime.min.time())
            ).count()

            # Plan breakdown
            for tier, attr in [
                ('FREE','free_plan_users'), ('BASIC','basic_plan_users'),
                ('PRO','pro_plan_users'),   ('PREMIUM','premium_plan_users'),
                ('ENTERPRISE','enterprise_plan_users')
            ]:
                count = (UserSubscriptions.query
                         .join(UserSubscriptions.plan)
                         .filter(UserSubscriptions.status == SubscriptionStatus.ACTIVE)
                         .filter_by(plan_tier=tier)
                         .count())
                setattr(stat, attr, count)

            # AUM
            aum = db.session.query(func.sum(Portfolios.current_value)).filter_by(is_active=True).scalar() or 0
            stat.total_aum = aum

            stat.total_portfolios = Portfolios.query.filter_by(is_active=True).count()
            stat.total_holdings   = PortfolioHoldings.query.filter_by(is_active=True).count()
            stat.total_unique_stocks = (db.session.query(func.count(func.distinct(PortfolioHoldings.stock_id)))
                                        .filter_by(is_active=True).scalar() or 0)

            from datetime import datetime as dt
            today_start = dt.combine(today, dt.min.time())
            stat.total_trades_today = TradeOrders.query.filter(
                TradeOrders.submitted_at >= today_start,
                TradeOrders.order_status == OrderStatus.FILLED
            ).count()

            if not stat.stat_id:
                stat.save()
            else:
                stat.update()

            return jsonify(bool=True, status=200, response={
                'message':        'Snapshot recorded.',
                'stat_id':        stat.stat_id,
                'snapshot_date':  str(today),
                'total_users':    stat.total_registered_users,
                'total_aum':      float(stat.total_aum),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


@ns.route('/platform_stats')
class PlatformStatsList(Resource):
    @ns.doc(description='[ADMIN] List historical platform statistics snapshots.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            p = reqparse.RequestParser()
            p.add_argument('days', type=int, default=30, location='args')
            args  = p.parse_args(strict=False)
            since = date.today() - timedelta(days=min(365, args['days']))

            stats = (PlatformStatistics.query
                     .filter(PlatformStatistics.snapshot_date >= since)
                     .order_by(PlatformStatistics.snapshot_date.desc())
                     .all())

            return jsonify(bool=True, status=200, response={
                'stats': [{
                    'stat_id':              s.stat_id,
                    'snapshot_date':        str(s.snapshot_date),
                    'total_registered_users':s.total_registered_users,
                    'active_users_today':   s.active_users_today,
                    'new_users_today':      s.new_users_today,
                    'total_aum':            float(s.total_aum),
                    'total_revenue_today':  float(s.total_revenue_today),
                    'total_trades_today':   s.total_trades_today,
                    'free_plan_users':      s.free_plan_users,
                    'pro_plan_users':       s.pro_plan_users,
                    'premium_plan_users':   s.premium_plan_users,
                } for s in stats],
                'total': len(stats),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
