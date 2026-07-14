import logging
import traceback

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal.models.stocks             import Stocks, StockStatus
from portal.models.stock_price_history import StockPriceHistory
from portal.models.stock_analytics    import StockAnalytics
from portal.models.stock_ratings      import StockRatings
from portal.models.portfolio_holdings import PortfolioHoldings
from portal.models.watchlist_items    import WatchlistItems

from . import ns, logger


# ── Parsers  ─────────────

list_parser = reqparse.RequestParser()
list_parser.add_argument('page',       type=int, default=1,    location='args')
list_parser.add_argument('per_page',   type=int, default=20,   location='args')
list_parser.add_argument('search',     type=str, required=False, location='args')
list_parser.add_argument('sector',     type=str, required=False, location='args')
list_parser.add_argument('exchange',   type=str, required=False, location='args')
list_parser.add_argument('asset_type', type=str, required=False, location='args')
list_parser.add_argument('sort_by',    type=str, default='current_price', location='args')
list_parser.add_argument('order',      type=str, default='desc', location='args')

history_parser = reqparse.RequestParser()
history_parser.add_argument('interval', type=str, default='1d',    location='args')
history_parser.add_argument('from_date',type=str, required=False,  location='args')
history_parser.add_argument('to_date',  type=str, required=False,  location='args')
history_parser.add_argument('limit',    type=int, default=100,     location='args')

create_parser = reqparse.RequestParser()
create_parser.add_argument('ticker_symbol',  type=str, required=True,  location='json')
create_parser.add_argument('company_name',   type=str, required=True,  location='json')
create_parser.add_argument('short_name',     type=str, required=False, location='json')
create_parser.add_argument('asset_type',     type=str, required=False, location='json', default='STOCK')
create_parser.add_argument('sector',         type=str, required=False, location='json')
create_parser.add_argument('industry',       type=str, required=False, location='json')
create_parser.add_argument('exchange',       type=str, required=False, location='json')
create_parser.add_argument('country',        type=str, required=False, location='json')
create_parser.add_argument('currency',       type=str, required=False, location='json', default='INR')
create_parser.add_argument('current_price',  type=float, required=False, location='json')
create_parser.add_argument('logo_url',       type=str, required=False, location='json')
create_parser.add_argument('website_url',    type=str, required=False, location='json')
create_parser.add_argument('description',    type=str, required=False, location='json')

update_price_parser = reqparse.RequestParser()
update_price_parser.add_argument('current_price',         type=float, required=True,  location='json')
update_price_parser.add_argument('previous_close',        type=float, required=False, location='json')
update_price_parser.add_argument('open_price',            type=float, required=False, location='json')
update_price_parser.add_argument('day_high',              type=float, required=False, location='json')
update_price_parser.add_argument('day_low',               type=float, required=False, location='json')
update_price_parser.add_argument('volume',                type=int,   required=False, location='json')


def _stock_dict(s: Stocks, include_position=False, user_id=None) -> dict:
    data = {
        'stock_id':           s.stock_id,
        'ticker_symbol':      s.ticker_symbol,
        'company_name':       s.company_name,
        'short_name':         s.short_name,
        'sector':             s.sector,
        'industry':           s.industry,
        'exchange':           s.exchange,
        'asset_type':         s.asset_type,
        'currency':           s.currency,
        'current_price':      float(s.current_price) if s.current_price else None,
        'open_price':         float(s.open_price) if s.open_price else None,
        'previous_close':     float(s.previous_close) if s.previous_close else None,
        'price_change':       float(s.price_change) if s.price_change else None,
        'price_change_percent': float(s.price_change_percent) if s.price_change_percent else None,
        'day_high':           float(s.day_high) if s.day_high else None,
        'day_low':            float(s.day_low) if s.day_low else None,
        'volume':             s.volume,
        'week_52_high':       float(s.week_52_high) if s.week_52_high else None,
        'week_52_low':        float(s.week_52_low) if s.week_52_low else None,
        'logo_url':           s.logo_url,
        'status':             s.status,
        'is_tradable':        s.is_tradable,
        'last_price_update':  str(s.last_price_update) if s.last_price_update else None,
    }
    if include_position and user_id:
        holding = PortfolioHoldings.query.filter_by(stock_id=s.stock_id, user_id=user_id, is_active=True).first()
        data['my_position'] = {
            'quantity':           float(holding.quantity)        if holding else 0,
            'avg_buy_price':      float(holding.average_buy_price) if holding else None,
            'current_value':      float(holding.current_value)   if holding and holding.current_value else 0,
            'unrealized_pnl':     float(holding.unrealized_pnl)  if holding and holding.unrealized_pnl else 0,
            'unrealized_pnl_pct': float(holding.unrealized_pnl_percent) if holding and holding.unrealized_pnl_percent else 0,
        } if holding else None
    return data


# ── List Stocks  ─────────

@ns.route('/list')
class ListStocks(Resource):
    @ns.doc(description='Browse all stocks with search, filter, and pagination. '
                        'Authenticated users see their own position in each stock.')
    @jwt_required()
    @ns.expect(list_parser)
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            args    = list_parser.parse_args(strict=False)
            page    = max(1, args['page'])
            per_page= min(100, args['per_page'])
            query   = Stocks.query.filter_by(status=StockStatus.ACTIVE)

            if args.get('search'):
                s = f"%{args['search']}%"
                query = query.filter(
                    (Stocks.ticker_symbol.ilike(s)) |
                    (Stocks.company_name.ilike(s))
                )
            if args.get('sector'):
                query = query.filter(Stocks.sector.ilike(f"%{args['sector']}%"))
            if args.get('exchange'):
                query = query.filter(Stocks.exchange == args['exchange'].upper())
            if args.get('asset_type'):
                query = query.filter(Stocks.asset_type == args['asset_type'].upper())

            sort_col = getattr(Stocks, args.get('sort_by', 'current_price'), Stocks.current_price)
            query    = query.order_by(sort_col.desc() if args['order'] == 'desc' else sort_col.asc())

            paginated = query.paginate(page=page, per_page=per_page, error_out=False)

            return jsonify(bool=True, status=200, response={
                'stocks':      [_stock_dict(s, include_position=True, user_id=user_id) for s in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get Stock Detail  ────

@ns.route('/<int:stock_id>')
class StockDetail(Resource):
    @ns.doc(description='Get full details of a stock including analytics, ratings and user position.')
    @jwt_required()
    def get(self, stock_id):
        try:
            user_id = int(get_jwt_identity())
            stock   = Stocks.query.get(stock_id)
            if not stock:
                return jsonify(bool=False, status=404, response={'message': 'Stock not found.'})

            data = _stock_dict(stock, include_position=True, user_id=user_id)

            # Analytics
            analytics = stock.analytics
            if analytics:
                data['analytics'] = {
                    'total_holders':    analytics.total_holders,
                    'total_watchers':   analytics.total_watchers,
                    'popularity_rank':  analytics.popularity_rank,
                    'return_1d':        float(analytics.return_1d) if analytics.return_1d else None,
                    'return_1w':        float(analytics.return_1w) if analytics.return_1w else None,
                    'return_1m':        float(analytics.return_1m) if analytics.return_1m else None,
                    'return_1y':        float(analytics.return_1y) if analytics.return_1y else None,
                    'sentiment':        analytics.news_sentiment,
                    'consensus_rating': analytics.consensus_rating,
                    'price_target_avg': float(analytics.price_target_avg) if analytics.price_target_avg else None,
                }

            # Analyst ratings (latest 5)
            ratings = (StockRatings.query
                       .filter_by(stock_id=stock_id)
                       .order_by(StockRatings.rating_date.desc())
                       .limit(5).all())
            data['analyst_ratings'] = [{
                'firm':         r.analyst_firm,
                'rating':       r.rating,
                'prev_rating':  r.previous_rating,
                'action':       r.action,
                'price_target': float(r.price_target) if r.price_target else None,
                'rating_date':  str(r.rating_date),
            } for r in ratings]

            # Is in watchlist?
            data['in_watchlist'] = WatchlistItems.query.filter_by(
                stock_id=stock_id, user_id=user_id).first() is not None

            return jsonify(bool=True, status=200, response=data)

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Update stock metadata.')
    @jwt_required()
    @ns.expect(create_parser, validate=False)
    def put(self, stock_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            stock = Stocks.query.get(stock_id)
            if not stock:
                return jsonify(bool=False, status=404, response={'message': 'Stock not found.'})

            args = create_parser.parse_args(strict=False)
            fields = ['company_name','short_name','sector','industry','exchange',
                      'country','currency','logo_url','website_url','description','asset_type']
            for f in fields:
                if args.get(f) is not None:
                    setattr(stock, f, args[f])
            stock.update()
            return jsonify(bool=True, status=200, response={'message': 'Stock updated.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get Stock by Ticker  ─

@ns.route('/ticker/<string:ticker>')
class StockByTicker(Resource):
    @ns.doc(description='Get stock by ticker symbol (e.g. AAPL).')
    @jwt_required()
    def get(self, ticker):
        try:
            user_id = int(get_jwt_identity())
            stock   = Stocks.query.filter_by(ticker_symbol=ticker.upper()).first()
            if not stock:
                return jsonify(bool=False, status=404, response={'message': f"Ticker '{ticker}' not found."})

            return jsonify(bool=True, status=200, response=_stock_dict(stock, include_position=True, user_id=user_id))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Price History  ───────

@ns.route('/<int:stock_id>/price_history')
class StockPriceHistoryAPI(Resource):
    @ns.doc(description='Get OHLCV price history for a stock. Intervals: 1m, 5m, 15m, 1h, 1d, 1w, 1mo')
    @jwt_required()
    @ns.expect(history_parser)
    def get(self, stock_id):
        try:
            args     = history_parser.parse_args(strict=False)
            interval = args.get('interval', '1d')
            limit    = min(1000, args.get('limit', 100))

            query = StockPriceHistory.query.filter_by(stock_id=stock_id, interval=interval)

            if args.get('from_date'):
                from datetime import datetime
                query = query.filter(StockPriceHistory.timestamp >= datetime.fromisoformat(args['from_date']))
            if args.get('to_date'):
                from datetime import datetime
                query = query.filter(StockPriceHistory.timestamp <= datetime.fromisoformat(args['to_date']))

            records = query.order_by(StockPriceHistory.timestamp.asc()).limit(limit).all()

            return jsonify(bool=True, status=200, response={
                'stock_id': stock_id,
                'interval': interval,
                'count':    len(records),
                'data': [{
                    'timestamp':   str(r.timestamp),
                    'open':        float(r.open_price),
                    'high':        float(r.high_price),
                    'low':         float(r.low_price),
                    'close':       float(r.close_price),
                    'volume':      r.volume,
                    'vwap':        float(r.vwap) if r.vwap else None,
                    'sma_20':      float(r.sma_20) if r.sma_20 else None,
                    'rsi':         float(r.rsi)    if r.rsi    else None,
                } for r in records]
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Update Price (Admin / Data Feed) ──────────────────────────────────────────

@ns.route('/<int:stock_id>/update_price')
class UpdateStockPrice(Resource):
    @ns.doc(description='[ADMIN] Update live price data for a stock.')
    @jwt_required()
    @ns.expect(update_price_parser, validate=True)
    def put(self, stock_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            stock = Stocks.query.get(stock_id)
            if not stock:
                return jsonify(bool=False, status=404, response={'message': 'Stock not found.'})

            args = update_price_parser.parse_args(strict=False)
            from datetime import datetime, timezone

            if args.get('previous_close') is None and stock.current_price:
                prev_close = float(stock.current_price)
            else:
                prev_close = args.get('previous_close')

            new_price = args['current_price']
            stock.current_price         = new_price
            stock.previous_close        = prev_close
            stock.open_price            = args.get('open_price', stock.open_price)
            stock.day_high              = args.get('day_high', stock.day_high)
            stock.day_low               = args.get('day_low', stock.day_low)
            stock.volume                = args.get('volume', stock.volume)
            if prev_close:
                stock.price_change         = new_price - prev_close
                stock.price_change_percent = ((new_price - prev_close) / prev_close) * 100
            stock.last_price_update     = datetime.now(timezone.utc)
            stock.update()

            return jsonify(bool=True, status=200, response={
                'message':      'Price updated.',
                'current_price':new_price,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Live-data status (any authenticated user) ─────────────────────────────────

@ns.route('/live_status')
class LiveDataStatus(Resource):
    @ns.doc(description='Report whether live market-data (Upstox) is configured.')
    @jwt_required()
    def get(self):
        from portal.helpers.market_data import is_configured
        return jsonify(bool=True, status=200, response={'live_data_enabled': is_configured()})


# ── Refresh ONE stock from the live provider (Admin) ──────────────────────────

@ns.route('/<int:stock_id>/refresh_price')
class RefreshStockPrice(Resource):
    @ns.doc(description='[ADMIN] Pull the latest live quote for one stock from Upstox and store it.')
    @jwt_required()
    def post(self, stock_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            from portal.helpers.market_data import is_configured, refresh_stock
            if not is_configured():
                return jsonify(bool=False, status=400,
                               response={'message': 'Live market data is not configured (missing UPSTOX_ACCESS_TOKEN).'})

            stock = Stocks.query.get(stock_id)
            if not stock:
                return jsonify(bool=False, status=404, response={'message': 'Stock not found.'})

            result = refresh_stock(stock)
            if not result['ok']:
                return jsonify(bool=False, status=502, response={
                    'message': f"Live fetch failed for {result['symbol']}: {result['error']}",
                    'code':    result.get('code'),
                })
            stock.update()
            return jsonify(bool=True, status=200, response={
                'message':          f"Live price updated for {stock.ticker_symbol}.",
                'stock':            _stock_dict(stock),
                'last_price_update':str(stock.last_price_update),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Refresh ALL active stocks from the live provider (Admin) ──────────────────

@ns.route('/refresh_live')
class RefreshAllLive(Resource):
    @ns.doc(description='[ADMIN] Pull the latest live quotes for all active stocks from Upstox.')
    @jwt_required()
    def post(self):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            from portal.helpers.market_data import is_configured, refresh_stocks
            if not is_configured():
                return jsonify(bool=False, status=400,
                               response={'message': 'Live market data is not configured (missing UPSTOX_ACCESS_TOKEN).'})

            from portal import db
            stocks  = Stocks.query.filter_by(status=StockStatus.ACTIVE).all()
            summary = refresh_stocks(stocks)
            db.session.commit()   # persist all successful updates in one commit

            msg = f"Refreshed {summary['updated']} of {summary['total']} stock(s) from live Upstox data."
            if summary.get('rate_limited'):
                msg += " The Upstox access token appears to have expired — please regenerate it."
            return jsonify(bool=True, status=200, response={'message': msg, **summary})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Create Stock (Admin)

@ns.route('/create')
class CreateStock(Resource):
    @ns.doc(description='[ADMIN] Add a new stock to the platform.')
    @jwt_required()
    @ns.expect(create_parser, validate=True)
    def post(self):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            args   = create_parser.parse_args(strict=False)
            ticker = args['ticker_symbol'].strip().upper()

            if Stocks.query.filter_by(ticker_symbol=ticker).first():
                return jsonify(bool=False, status=400, response={'message': f"Ticker '{ticker}' already exists."})

            stock = Stocks()
            for field in ['ticker_symbol','company_name','short_name','sector','industry',
                          'exchange','country','currency','logo_url','website_url','description','asset_type']:
                if args.get(field) is not None:
                    setattr(stock, field, args[field])

            stock.ticker_symbol  = ticker
            stock.current_price  = args.get('current_price')
            stock.currency       = 'INR'   # Platform trades exclusively in Indian Rupees
            stock.save()

            # Create analytics record
            analytics = StockAnalytics(); analytics.stock_id = stock.stock_id; analytics.save()

            # ── Notify all users about the new listing (best-effort) ──────────
            from portal.helpers.notify import broadcast_to_all
            from portal.models.notifications import NotificationType, NotificationPriority
            notified = broadcast_to_all(
                NotificationType.STOCK_LISTED,
                title=f"New stock listed: {ticker}",
                body=f"{stock.company_name} ({ticker}) is now available to trade on TradeFlow.",
                priority=NotificationPriority.MEDIUM,
                action_url=f"/user/stock/{ticker}",
                icon=stock.logo_url,
                reference_type="STOCK",
                reference_id=stock.stock_id,
                exclude_user_id=get_jwt().get('user_id'),
            )

            return jsonify(bool=True, status=200, response={
                'message':       'Stock created.',
                'stock_id':      stock.stock_id,
                'ticker':        ticker,
                'users_notified':notified,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Market Movers  ───────

@ns.route('/movers/<string:category>')
class StockMovers(Resource):
    @ns.doc(description='Get top market movers by category: TOP_GAINER, TOP_LOSER, MOST_ACTIVE, TRENDING')
    @jwt_required()
    def get(self, category):
        try:
            from portal.models.market_movers import MarketMovers
            movers = (MarketMovers.query
                      .filter_by(category=category.upper())
                      .order_by(MarketMovers.snapshot_at.desc(), MarketMovers.rank.asc())
                      .limit(10).all())

            return jsonify(bool=True, status=200, response={
                'category': category.upper(),
                'movers': [{
                    'rank':                 m.rank,
                    'stock_id':             m.stock_id,
                    'ticker_symbol':        m.stock.ticker_symbol,
                    'company_name':         m.stock.company_name,
                    'price':                float(m.price) if m.price else None,
                    'price_change':         float(m.price_change) if m.price_change else None,
                    'price_change_percent': float(m.price_change_percent) if m.price_change_percent else None,
                    'volume':               m.volume,
                    'logo_url':             m.stock.logo_url,
                } for m in movers]
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
