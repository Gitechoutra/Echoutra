# TradeFlow — Flask-RESTX API Reference

## Architecture
- **Framework**: Flask + Flask-RESTX (Swagger auto-docs at `/docs`)
- **Auth**: JWT (flask-jwt-extended) — `Bearer <access_token>` on every protected route
- **Roles**: `ADMIN` (purple portal) · `USER` (cyan portal)
- **Response shape**: `{ bool, status, response: { ... } }` (matches demo pattern)
- **Total endpoints**: 132 across 18 namespaces

---

## Namespace Map

| # | Prefix | File | Endpoints | Description |
|---|--------|------|-----------|-------------|
| 1 | `/api/auth` | auth/routes.py | 9 | Register, Login, OTP, Forgot/Reset PW, Refresh, Logout, Me |
| 2 | `/api/roles` | roles/routes.py | 5 | CRUD roles (Admin only) |
| 3 | `/api/users` | users/routes.py | 9 | List, detail, suspend, status, role-change, reset-pw, sessions, revoke, delete |
| 4 | `/api/user_profiles` | user_profiles/routes.py | 4 | Get/Update own profile; Admin get/update any |
| 5 | `/api/user_preferences` | user_preferences/routes.py | 3 | Get/Update own prefs; Admin get any |
| 6 | `/api/user_security` | user_security/routes.py | 10 | 2FA setup/enable/disable, session list/revoke, IP whitelist, timeout |
| 7 | `/api/stocks` | stocks/routes.py | 9 | List, detail, by-ticker, price history, update price, create, market movers |
| 8 | `/api/portfolios` | portfolios/routes.py | 7 | CRUD portfolios, performance history, admin all-portfolios |
| 9 | `/api/watchlists` | watchlists/routes.py | 11 | CRUD watchlists + items + alerts |
| 10 | `/api/trade_orders` | trade_orders/routes.py | 7 | Place, cancel, detail, my orders, admin all orders, trade history |
| 11 | `/api/news` | market_news/routes.py | 8 | List, detail, by-stock, my-stocks, categories, create/update/delete |
| 12 | `/api/notifications` | notifications/routes.py | 8 | List, mark-read, mark-all-read, dismiss, unread count, prefs, admin send |
| 13 | `/api/price_alerts` | price_alerts/routes.py | 7 | Create, list, detail, update, delete, pause, resume |
| 14 | `/api/subscriptions` | subscriptions/routes.py | 8 | Plans, subscribe, my-sub, cancel, billing history, admin upgrade/list |
| 15 | `/api/wallets` | wallets/routes.py | 8 | Balance, deposit, withdraw, txn history, admin get/freeze/unfreeze |
| 16 | `/api/kyc` | kyc/routes.py | 7 | Status, submit, admin list/detail/review/mark-under-review |
| 17 | `/api/admin` | admin/routes.py | 22 | Dashboard, analytics (AUM/users/revenue/trade/sector/country/leaderboard), stocks overview, settings CRUD, feature flags CRUD, system health, audit logs, admin activity logs, platform stats snapshot |
| 18 | `/api/dashboard` | dashboard/routes.py | 12 | User summary, my-stocks-today, market movers, sector widget, widget catalogue, layout CRUD, admin summary/recent-users/plan-distribution, watchlist widget, monthly returns, market overview |

---

## Key Endpoints Quick Reference

### Auth
```
POST /api/auth/register          — 3-step sign-up step 1 (account creation)
POST /api/auth/login             — Login → returns access + refresh tokens
POST /api/auth/verify_otp        — Step 3 OTP verification
POST /api/auth/resend_otp        — Resend OTP
POST /api/auth/forgot_password   — Request password reset OTP
POST /api/auth/reset_password    — Reset password with OTP
POST /api/auth/change_password   — Change password (authenticated)
POST /api/auth/refresh           — Refresh access token
POST /api/auth/logout            — Logout (revoke session)
GET  /api/auth/me                — Get current user info
```

### Users (Admin)
```
GET  /api/users/list_users              — All users with filters/search/pagination
GET  /api/users/<id>                    — User detail + recent logins
POST /api/users/<id>/suspend            — Suspend user
PUT  /api/users/<id>/status             — Change status (ACTIVE/SUSPENDED/BANNED)
PUT  /api/users/<id>/role               — Change user role
POST /api/users/<id>/reset_password     — Force password reset
GET  /api/users/<id>/sessions           — User's active sessions
POST /api/users/<id>/revoke_sessions    — Revoke all sessions
DELETE /api/users/<id>/delete           — Delete user
```

### Stocks
```
GET  /api/stocks/list                   — Browse all stocks (with my position)
GET  /api/stocks/<id>                   — Full stock detail + analytics + ratings
GET  /api/stocks/ticker/<TICKER>        — Get by ticker symbol
GET  /api/stocks/<id>/price_history     — OHLCV candles (1m/5m/1h/1d/1w/1mo)
PUT  /api/stocks/<id>/update_price      — [Admin] Update live price
POST /api/stocks/create                 — [Admin] Add new stock
GET  /api/stocks/movers/<CATEGORY>      — Market movers by category
```

### Trade Orders
```
POST /api/trade_orders/place            — Place BUY/SELL order (MARKET executes instantly)
POST /api/trade_orders/<id>/cancel      — Cancel open order
GET  /api/trade_orders/<id>             — Order detail + executions
GET  /api/trade_orders/my               — My order history
GET  /api/trade_orders/history          — My trade transaction ledger
GET  /api/trade_orders/admin/all        — [Admin] All platform orders
```

### Portfolios
```
POST /api/portfolios/create             — Create portfolio
GET  /api/portfolios/my                 — List my portfolios
GET  /api/portfolios/<id>               — Portfolio + holdings
PUT  /api/portfolios/<id>               — Update portfolio
DELETE /api/portfolios/<id>             — Delete portfolio
GET  /api/portfolios/<id>/performance   — Performance history (DAILY/WEEKLY/MONTHLY)
GET  /api/portfolios/admin/all          — [Admin] All portfolios
```

### Watchlists
```
POST /api/watchlists/create                          — Create watchlist
GET  /api/watchlists/my                              — List my watchlists
GET  /api/watchlists/<id>                            — Watchlist + items
PUT  /api/watchlists/<id>                            — Update watchlist
DELETE /api/watchlists/<id>                          — Delete watchlist
POST /api/watchlists/<id>/items/add                  — Add stock
DELETE /api/watchlists/<id>/items/<item_id>/remove   — Remove stock
POST /api/watchlists/items/<item_id>/alerts/add      — Add alert to item
GET  /api/watchlists/items/<item_id>/alerts          — List alerts
POST /api/watchlists/alerts/<alert_id>/cancel        — Cancel alert
```

### Admin Dashboard & Analytics
```
GET  /api/admin/dashboard                  — Full dashboard (AUM, revenue, users, top stocks)
GET  /api/admin/analytics/aum_trend        — AUM over time
GET  /api/admin/analytics/user_growth      — User growth chart
GET  /api/admin/analytics/revenue          — Revenue breakdown
GET  /api/admin/analytics/trade_volume     — Trade volume stats
GET  /api/admin/analytics/sector_performance — Sector chart
GET  /api/admin/analytics/country_stats    — Users/revenue by country
GET  /api/admin/analytics/leaderboard      — Top users by portfolio value
GET  /api/admin/stocks/overview            — All stocks across all users
GET  /api/admin/settings                   — List platform settings
PUT  /api/admin/settings/<key>             — Update a setting
GET  /api/admin/feature_flags              — List feature flags
PUT  /api/admin/feature_flags/<key>        — Toggle/update a flag
GET  /api/admin/system_health              — Services health dashboard
GET  /api/admin/audit_logs                 — Platform audit trail
GET  /api/admin/admin_activity_logs        — Admin-specific activity log
POST /api/admin/platform_stats/snapshot    — Trigger daily stats snapshot
```

### Dashboard Widgets
```
GET  /api/dashboard/user/summary           — User dashboard main data
GET  /api/dashboard/user/my_stocks_today   — News sidebar: user's own stocks
GET  /api/dashboard/user/watchlist_widget  — Default watchlist for dashboard
GET  /api/dashboard/user/monthly_returns   — Monthly return bar chart
GET  /api/dashboard/user/market_overview   — Market page with my positions
GET  /api/dashboard/market_movers          — Movers widget (all 4 categories)
GET  /api/dashboard/sector_performance     — Sector heatmap widget
GET  /api/dashboard/widgets/catalogue      — Available widgets for role
GET  /api/dashboard/layout                 — Get saved layout
PUT  /api/dashboard/layout                 — Save full layout (bulk upsert)
POST /api/dashboard/layout/widget          — Add single widget
PUT  /api/dashboard/layout/widget/<id>     — Update widget position/config
DELETE /api/dashboard/layout/widget/<id>   — Remove widget
GET  /api/dashboard/admin/platform_summary — Admin card metrics
GET  /api/dashboard/admin/recent_users     — Admin recent users widget
GET  /api/dashboard/admin/plan_distribution— Admin donut chart
```

---

## Setup

```python
# app.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_restx import Api

db  = SQLAlchemy()
jwt = JWTManager()

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://user:pass@localhost/tradeflow'
    app.config['JWT_SECRET_KEY']          = 'your-secret-key'
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=2)

    db.init_app(app)
    jwt.init_app(app)

    api = Api(app, title='TradeFlow API', version='1.0',
              doc='/docs', authorizations={
                  'Bearer': {'type': 'apiKey', 'in': 'header', 'name': 'Authorization'}
              })

    from portal.apis import register_namespaces
    register_namespaces(api)

    with app.app_context():
        from portal import models
        db.create_all()

    return app
```

---

## Notes
- All money values use `Decimal` / `db.Numeric` for precision
- MARKET orders execute immediately via `_execute_market_order()` in `trade_orders/routes.py`
- LIMIT/STOP orders sit in `OPEN` status until a price-check worker fills them
- Admin guards use `get_jwt().get('role') == 'ADMIN'` pattern throughout
- `_require_admin()` helper returns a JSON 403 or `None` (consistent with demo pattern)
- Soft-delete pattern used on portfolios and watchlists (`is_active=False`)
- `save_layout_parser` bulk-replaces the entire dashboard layout atomically
