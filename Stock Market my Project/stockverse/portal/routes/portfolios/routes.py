import logging
import traceback

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal.models.portfolios                  import Portfolios, PortfolioType
from portal.models.portfolio_holdings          import PortfolioHoldings
from portal.models.portfolio_performance_history import PortfolioPerformanceHistory
from portal.models.stocks                      import Stocks

from . import ns, logger


create_parser = reqparse.RequestParser()
create_parser.add_argument('portfolio_name', type=str, required=True,  location='json')
create_parser.add_argument('portfolio_type', type=str, required=False, location='json', default='MAIN')
create_parser.add_argument('description',    type=str, required=False, location='json')

update_parser = reqparse.RequestParser()
update_parser.add_argument('portfolio_name', type=str, required=False, location='json')
update_parser.add_argument('description',    type=str, required=False, location='json')
update_parser.add_argument('is_default',     type=bool, required=False, location='json')

perf_parser = reqparse.RequestParser()
perf_parser.add_argument('interval',   type=str, default='DAILY', location='args')
perf_parser.add_argument('from_date',  type=str, required=False,  location='args')
perf_parser.add_argument('limit',      type=int, default=90,      location='args')

admin_list_parser = reqparse.RequestParser()
admin_list_parser.add_argument('user_id',  type=int, required=False, location='args')
admin_list_parser.add_argument('page',     type=int, default=1,      location='args')
admin_list_parser.add_argument('per_page', type=int, default=20,     location='args')


def _portfolio_dict(p: Portfolios) -> dict:
    return {
        'portfolio_id':         p.portfolio_id,
        'user_id':              p.user_id,
        'portfolio_name':       p.portfolio_name,
        'portfolio_type':       p.portfolio_type,
        'description':          p.description,
        'total_invested':       float(p.total_invested),
        'current_value':        float(p.current_value),
        'total_return':         float(p.total_return),
        'total_return_percent': float(p.total_return_percent),
        'realized_pnl':         float(p.realized_pnl),
        'unrealized_pnl':       float(p.unrealized_pnl),
        'day_change':           float(p.day_change),
        'day_change_percent':   float(p.day_change_percent),
        'total_holdings_count': p.total_holdings_count,
        'sectors':              p.sectors,
        'is_default':           p.is_default,
        'is_active':            p.is_active,
        'last_updated':         str(p.last_updated) if p.last_updated else None,
        'created_on':           str(p.created_on),
    }


def _holding_dict(h: PortfolioHoldings) -> dict:
    return {
        'holding_id':             h.holding_id,
        'stock_id':               h.stock_id,
        'ticker_symbol':          h.stock.ticker_symbol if h.stock else None,
        'company_name':           h.stock.company_name  if h.stock else None,
        'logo_url':               h.stock.logo_url      if h.stock else None,
        'sector':                 h.stock.sector        if h.stock else None,
        'trade_mode':             h.trade_mode or 'DELIVERY',
        # LONG (bought first) or SHORT (sold first, bought back to close). For a
        # SHORT, average_buy_price is the price it was SOLD at and the P&L runs
        # the other way — the position gains as the price falls.
        'position_side':          h.position_side or 'LONG',
        'is_short':               (h.position_side == 'SHORT'),
        'is_active':              bool(h.is_active),
        'position_status':        ('OPEN' if h.is_active else 'CLOSED'),
        'quantity':               float(h.quantity),
        'average_buy_price':      float(h.average_buy_price),
        'average_entry_price':    float(h.average_buy_price),   # clearer name for shorts
        'total_invested':         float(h.total_invested),
        'current_price':          float(h.current_price)  if h.current_price  else None,
        'previous_close':         float(h.stock.previous_close) if h.stock and h.stock.previous_close else None,
        'current_value':          float(h.current_value)  if h.current_value  else None,
        'unrealized_pnl':         float(h.unrealized_pnl) if h.unrealized_pnl else None,
        'unrealized_pnl_percent': float(h.unrealized_pnl_percent) if h.unrealized_pnl_percent else None,
        'day_change':             float(h.day_change)     if h.day_change     else None,
        'day_change_percent':     float(h.day_change_percent) if h.day_change_percent else None,
        'allocation_percent':     float(h.allocation_percent) if h.allocation_percent else None,
        'realized_pnl':           float(h.realized_pnl),
        'first_bought_at':        str(h.first_bought_at) if h.first_bought_at else None,
        'last_traded_at':         str(h.last_traded_at)  if h.last_traded_at  else None,
    }


# ── Create Portfolio  ────

@ns.route('/create')
class CreatePortfolio(Resource):
    @ns.doc(description='Create a new portfolio for the current user.')
    @jwt_required()
    @ns.expect(create_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = create_parser.parse_args(strict=False)

            portfolio               = Portfolios()
            portfolio.user_id       = user_id
            portfolio.portfolio_name= args['portfolio_name'].strip()
            portfolio.portfolio_type= args.get('portfolio_type', PortfolioType.MAIN).upper()
            portfolio.description   = args.get('description', '')
            portfolio.save()

            return jsonify(bool=True, status=200, response={
                'message':      'Portfolio created.',
                'portfolio_id': portfolio.portfolio_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── List My Portfolios  ──

@ns.route('/my')
class MyPortfolios(Resource):
    @ns.doc(description='List all portfolios of the current user.')
    @jwt_required()
    def get(self):
        try:
            user_id    = int(get_jwt_identity())
            portfolios = Portfolios.query.filter_by(user_id=user_id, is_active=True).all()
            return jsonify(bool=True, status=200, response={
                'portfolios': [_portfolio_dict(p) for p in portfolios],
                'total':      len(portfolios),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get / Update / Delete Portfolio ───────────────────────────────────────────

@ns.route('/<int:portfolio_id>')
class PortfolioDetail(Resource):
    @ns.doc(description='Get portfolio detail with holdings.')
    @jwt_required()
    def get(self, portfolio_id):
        try:
            user_id   = int(get_jwt_identity())
            claims    = get_jwt()
            portfolio = Portfolios.query.get(portfolio_id)
            if not portfolio:
                return jsonify(bool=False, status=404, response={'message': 'Portfolio not found.'})

            # Admin can view any; users only their own
            if portfolio.user_id != user_id and claims.get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Access denied.'})

            # ?include_closed=1 also returns CLOSED (fully-sold) intraday positions
            # so the Portfolio "Positions" view can show closed trades.
            from flask import request
            include_closed = request.args.get('include_closed') in ('1', 'true', 'True')
            hq = PortfolioHoldings.query.filter_by(portfolio_id=portfolio_id)
            if not include_closed:
                hq = hq.filter_by(is_active=True)

            data     = _portfolio_dict(portfolio)
            holdings = hq.order_by(PortfolioHoldings.is_active.desc(),
                                   PortfolioHoldings.last_traded_at.desc()).all()
            data['holdings'] = [_holding_dict(h) for h in holdings]

            return jsonify(bool=True, status=200, response=data)

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Update portfolio name, description or default flag.')
    @jwt_required()
    @ns.expect(update_parser, validate=False)
    def put(self, portfolio_id):
        try:
            user_id   = int(get_jwt_identity())
            portfolio = Portfolios.query.get(portfolio_id)
            if not portfolio or portfolio.user_id != user_id:
                return jsonify(bool=False, status=404, response={'message': 'Portfolio not found.'})

            args = update_parser.parse_args(strict=False)
            if args.get('portfolio_name'):
                portfolio.portfolio_name = args['portfolio_name'].strip()
            if args.get('description') is not None:
                portfolio.description    = args['description']
            if args.get('is_default'):
                # Unset other defaults
                Portfolios.query.filter_by(user_id=user_id).update({'is_default': False})
                portfolio.is_default = True
            portfolio.update()

            return jsonify(bool=True, status=200, response={'message': 'Portfolio updated.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='Delete (deactivate) a portfolio.')
    @jwt_required()
    def delete(self, portfolio_id):
        try:
            user_id   = int(get_jwt_identity())
            portfolio = Portfolios.query.get(portfolio_id)
            if not portfolio or portfolio.user_id != user_id:
                return jsonify(bool=False, status=404, response={'message': 'Portfolio not found.'})
            if portfolio.is_default:
                return jsonify(bool=False, status=400, response={'message': 'Cannot delete the default portfolio.'})

            portfolio.is_active = False
            portfolio.update()
            return jsonify(bool=True, status=200, response={'message': 'Portfolio deleted.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Performance History  ─

@ns.route('/<int:portfolio_id>/performance')
class PortfolioPerformance(Resource):
    @ns.doc(description='Get portfolio performance history for charting. Intervals: DAILY, WEEKLY, MONTHLY.')
    @jwt_required()
    @ns.expect(perf_parser)
    def get(self, portfolio_id):
        try:
            user_id   = int(get_jwt_identity())
            claims    = get_jwt()
            portfolio = Portfolios.query.get(portfolio_id)
            if not portfolio:
                return jsonify(bool=False, status=404, response={'message': 'Portfolio not found.'})
            if portfolio.user_id != user_id and claims.get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Access denied.'})

            args     = perf_parser.parse_args(strict=False)
            interval = args['interval'].upper()

            # INTRADAY reads the value ticks instead of the daily snapshots. A
            # portfolio only gets one snapshot per day, so on its first day the
            # DAILY series is a single point with no shape — the ticks carry the
            # real within-day movement.
            if interval == 'INTRADAY':
                from portal.models.portfolio_value_ticks import PortfolioValueTicks
                ticks = (PortfolioValueTicks.query
                         .filter_by(portfolio_id=portfolio_id)
                         .order_by(PortfolioValueTicks.captured_at.desc())
                         .limit(min(500, max(1, args['limit']))).all())
                ticks.reverse()   # oldest → newest for charting
                return jsonify(bool=True, status=200, response={
                    'portfolio_id': portfolio_id,
                    'interval':     'INTRADAY',
                    'count':        len(ticks),
                    'data': [{
                        'date':           t.captured_at.isoformat(),
                        'total_value':    float(t.total_value),
                        'total_invested': float(t.total_invested),
                    } for t in ticks],
                })

            query = PortfolioPerformanceHistory.query.filter_by(
                portfolio_id=portfolio_id, interval=interval
            )
            if args.get('from_date'):
                from datetime import date
                query = query.filter(PortfolioPerformanceHistory.snapshot_date >= date.fromisoformat(args['from_date']))

            records = (query
                       .order_by(PortfolioPerformanceHistory.snapshot_date.asc())
                       .limit(min(365, args['limit'])).all())

            return jsonify(bool=True, status=200, response={
                'portfolio_id': portfolio_id,
                'interval':     args['interval'].upper(),
                'count':        len(records),
                'data': [{
                    'date':                      str(r.snapshot_date),
                    'total_value':               float(r.total_value),
                    'total_invested':            float(r.total_invested),
                    'daily_return':              float(r.daily_return)              if r.daily_return              else None,
                    'daily_return_percent':      float(r.daily_return_percent)      if r.daily_return_percent      else None,
                    'cumulative_return':         float(r.cumulative_return)         if r.cumulative_return         else None,
                    'cumulative_return_percent': float(r.cumulative_return_percent) if r.cumulative_return_percent else None,
                    'holdings_count':            r.holdings_count,
                } for r in records],
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: All Portfolios ──────────────────────────────────────────────────────

@ns.route('/admin/all')
class AdminAllPortfolios(Resource):
    @ns.doc(description='[ADMIN] List all portfolios across all users, optionally filtered by user_id.')
    @jwt_required()
    @ns.expect(admin_list_parser)
    def get(self):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            args     = admin_list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(50, args['per_page'])
            query    = Portfolios.query.filter_by(is_active=True)

            if args.get('user_id'):
                query = query.filter_by(user_id=args['user_id'])

            paginated = query.order_by(Portfolios.current_value.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'portfolios':  [_portfolio_dict(p) for p in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
