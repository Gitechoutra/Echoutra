import logging
import traceback

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from portal.models.market_news      import MarketNews
from portal.models.news_categories  import NewsCategories
from portal.models.stock_news_mapping import StockNewsMapping
from portal.models.watchlist_items  import WatchlistItems

from . import ns, logger

# ── Parsers  ─────────────

list_parser = reqparse.RequestParser()
list_parser.add_argument('page',        type=int, default=1,    location='args')
list_parser.add_argument('per_page',    type=int, default=20,   location='args')
list_parser.add_argument('category_id', type=int, required=False, location='args')
list_parser.add_argument('sentiment',   type=str, required=False, location='args')
list_parser.add_argument('search',      type=str, required=False, location='args')
list_parser.add_argument('is_featured', type=bool, required=False, location='args')
list_parser.add_argument('is_breaking', type=bool, required=False, location='args')

create_parser = reqparse.RequestParser()
create_parser.add_argument('title',       type=str, required=True,  location='json')
create_parser.add_argument('summary',     type=str, required=False, location='json')
create_parser.add_argument('content',     type=str, required=False, location='json')
create_parser.add_argument('author',      type=str, required=False, location='json')
create_parser.add_argument('source_name', type=str, required=False, location='json')
create_parser.add_argument('source_url',  type=str, required=False, location='json')
create_parser.add_argument('image_url',   type=str, required=False, location='json')
create_parser.add_argument('sentiment',   type=str, required=False, location='json')
create_parser.add_argument('category_id', type=int, required=False, location='json')
create_parser.add_argument('tags',        type=list, required=False, location='json')
create_parser.add_argument('is_breaking', type=bool, required=False, location='json', default=False)
create_parser.add_argument('is_featured', type=bool, required=False, location='json', default=False)
create_parser.add_argument('published_at',type=str, required=False, location='json')
create_parser.add_argument('stock_ids',   type=list, required=False, location='json')

update_parser = reqparse.RequestParser()
update_parser.add_argument('title',       type=str,  required=False, location='json')
update_parser.add_argument('summary',     type=str,  required=False, location='json')
update_parser.add_argument('is_breaking', type=bool, required=False, location='json')
update_parser.add_argument('is_featured', type=bool, required=False, location='json')
update_parser.add_argument('is_active',   type=bool, required=False, location='json')
update_parser.add_argument('sentiment',   type=str,  required=False, location='json')


def _news_dict(n: MarketNews, brief=False) -> dict:
    data = {
        'news_id':     n.news_id,
        'title':       n.title,
        'summary':     n.summary,
        'author':      n.author,
        'source_name': n.source_name,
        'source_url':  n.source_url,
        'image_url':   n.image_url,
        'sentiment':   n.sentiment,
        'is_breaking': n.is_breaking,
        'is_featured': n.is_featured,
        'tags':        n.tags or [],
        'published_at':str(n.published_at),
        'view_count':  n.view_count,
        'category': {
            'category_id':   n.category.category_id   if n.category else None,
            'category_name': n.category.category_name if n.category else None,
            'color_hex':     n.category.color_hex     if n.category else None,
        } if n.category else None,
    }
    if not brief:
        data['content'] = n.content
        # Related stocks
        mappings = n.stock_mappings.all()
        data['related_stocks'] = [{
            'stock_id':      m.stock_id,
            'ticker_symbol': m.stock.ticker_symbol if m.stock else None,
            'company_name':  m.stock.company_name  if m.stock else None,
            'logo_url':      m.stock.logo_url       if m.stock else None,
            'sentiment':     m.sentiment,
            'relevance':     float(m.relevance_score) if m.relevance_score else None,
        } for m in mappings]
    return data


# ── List News  ───────────

@ns.route('/list')
class ListNews(Resource):
    @ns.doc(description='Browse market news with filters for category, sentiment and search.')
    @jwt_required()
    @ns.expect(list_parser)
    def get(self):
        try:
            args     = list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(50, args['per_page'])
            query    = MarketNews.query.filter_by(is_active=True)

            if args.get('category_id'):
                query = query.filter_by(category_id=args['category_id'])
            if args.get('sentiment'):
                query = query.filter(MarketNews.sentiment == args['sentiment'].upper())
            if args.get('is_featured'):
                query = query.filter_by(is_featured=True)
            if args.get('is_breaking'):
                query = query.filter_by(is_breaking=True)
            if args.get('search'):
                s = f"%{args['search']}%"
                query = query.filter(
                    (MarketNews.title.ilike(s)) |
                    (MarketNews.summary.ilike(s))
                )

            paginated = query.order_by(MarketNews.published_at.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'news':        [_news_dict(n, brief=True) for n in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── News Detail  ─────────

@ns.route('/<int:news_id>')
class NewsDetail(Resource):
    @ns.doc(description='Get full article including content and related stocks.')
    @jwt_required()
    def get(self, news_id):
        try:
            article = MarketNews.query.filter_by(news_id=news_id, is_active=True).first()
            if not article:
                return jsonify(bool=False, status=404, response={'message': 'Article not found.'})

            # Increment view count
            article.view_count = (article.view_count or 0) + 1
            article.update()

            return jsonify(bool=True, status=200, response=_news_dict(article, brief=False))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Update news article metadata.')
    @jwt_required()
    @ns.expect(update_parser, validate=False)
    def put(self, news_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            article = MarketNews.query.get(news_id)
            if not article:
                return jsonify(bool=False, status=404, response={'message': 'Article not found.'})

            args = update_parser.parse_args(strict=False)
            for field in ['title', 'summary', 'is_breaking', 'is_featured', 'is_active', 'sentiment']:
                if args.get(field) is not None:
                    setattr(article, field, args[field])
            article.update()

            return jsonify(bool=True, status=200, response={'message': 'Article updated.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Delete (deactivate) a news article.')
    @jwt_required()
    def delete(self, news_id):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            article = MarketNews.query.get(news_id)
            if not article:
                return jsonify(bool=False, status=404, response={'message': 'Article not found.'})

            article.is_active = False
            article.update()
            return jsonify(bool=True, status=200, response={'message': 'Article deleted.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── News by Stock  ───────

@ns.route('/stock/<int:stock_id>')
class NewsByStock(Resource):
    @ns.doc(description='Get news articles related to a specific stock.')
    @jwt_required()
    @ns.expect(list_parser)
    def get(self, stock_id):
        try:
            args     = list_parser.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(30, args['per_page'])

            mappings = (StockNewsMapping.query
                        .filter_by(stock_id=stock_id)
                        .order_by(StockNewsMapping.relevance_score.desc())
                        .all())

            news_ids = [m.news_id for m in mappings]
            query    = (MarketNews.query
                        .filter(MarketNews.news_id.in_(news_ids), MarketNews.is_active == True)
                        .order_by(MarketNews.published_at.desc()))

            paginated = query.paginate(page=page, per_page=per_page, error_out=False)
            return jsonify(bool=True, status=200, response={
                'stock_id':    stock_id,
                'news':        [_news_dict(n, brief=True) for n in paginated.items],
                'total':       paginated.total,
                'page':        page,
                'per_page':    per_page,
                'total_pages': paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── My Stocks News Sidebar ─────────────────────────────────────────────────────

@ns.route('/my_stocks')
class MyStocksNews(Resource):
    @ns.doc(description='Get news for stocks in the current user\'s watchlists and portfolios (News screen sidebar).')
    @jwt_required()
    def get(self):
        try:
            from portal.models.portfolio_holdings import PortfolioHoldings
            user_id = int(get_jwt_identity())

            # Collect stock IDs from holdings + watchlist
            holding_ids  = [h.stock_id for h in PortfolioHoldings.query.filter_by(user_id=user_id, is_active=True).all()]
            watchlist_ids= [w.stock_id for w in WatchlistItems.query.filter_by(user_id=user_id).all()]
            all_stock_ids= list(set(holding_ids + watchlist_ids))

            if not all_stock_ids:
                return jsonify(bool=True, status=200, response={'news': [], 'total': 0})

            mappings = (StockNewsMapping.query
                        .filter(StockNewsMapping.stock_id.in_(all_stock_ids))
                        .all())
            news_ids = list({m.news_id for m in mappings})

            articles = (MarketNews.query
                        .filter(MarketNews.news_id.in_(news_ids), MarketNews.is_active == True)
                        .order_by(MarketNews.published_at.desc())
                        .limit(20).all())

            return jsonify(bool=True, status=200, response={
                'news':  [_news_dict(n, brief=True) for n in articles],
                'total': len(articles),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── News Categories  ─────

@ns.route('/categories')
class NewsCategories_(Resource):
    @ns.doc(description='List all active news categories.')
    @jwt_required()
    def get(self):
        try:
            cats = NewsCategories.query.filter_by(is_active=True).order_by(NewsCategories.sort_order.asc()).all()
            return jsonify(bool=True, status=200, response={
                'categories': [{
                    'category_id':   c.category_id,
                    'category_name': c.category_name,
                    'slug':          c.slug,
                    'icon':          c.icon,
                    'color_hex':     c.color_hex,
                } for c in cats]
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Create News (Admin)  ─

@ns.route('/create')
class CreateNews(Resource):
    @ns.doc(description='[ADMIN] Create a new news article and tag related stocks.')
    @jwt_required()
    @ns.expect(create_parser, validate=True)
    def post(self):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            from datetime import datetime
            args    = create_parser.parse_args(strict=False)
            article = MarketNews()

            for field in ['title','summary','content','author','source_name',
                          'source_url','image_url','sentiment','category_id','tags',
                          'is_breaking','is_featured']:
                if args.get(field) is not None:
                    setattr(article, field, args[field])

            article.published_at = (
                datetime.fromisoformat(args['published_at'])
                if args.get('published_at')
                else datetime.utcnow()
            )
            article.save()

            # Link stocks
            stock_ids = args.get('stock_ids') or []
            for sid in stock_ids:
                mapping            = StockNewsMapping()
                mapping.stock_id   = sid
                mapping.news_id    = article.news_id
                mapping.is_primary = (sid == stock_ids[0])
                mapping.save()

            # ── Notify users about the new article (best-effort) ──────────────
            from portal.helpers.notify import broadcast_to_all
            from portal.models.notifications import NotificationType, NotificationPriority
            is_breaking = bool(args.get('is_breaking'))
            admin_id    = get_jwt().get('user_id')
            title       = ("🚨 Breaking: " if is_breaking else "") + article.title
            notified    = broadcast_to_all(
                NotificationType.NEWS_ALERT,
                title=title,
                body=article.summary or "Tap to read the latest market news on TradeFlow.",
                priority=NotificationPriority.HIGH if is_breaking else NotificationPriority.MEDIUM,
                action_url=f"/user/news",
                image_url=article.image_url,
                reference_type="NEWS",
                reference_id=article.news_id,
                exclude_user_id=admin_id,
            )

            return jsonify(bool=True, status=200, response={
                'message':        'Article created.',
                'news_id':        article.news_id,
                'users_notified': notified,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
