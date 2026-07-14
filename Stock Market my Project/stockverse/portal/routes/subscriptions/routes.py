import logging
import traceback
from datetime import datetime, timezone, timedelta

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from portal.models.subscription_plans  import SubscriptionPlans
from portal.models.user_subscriptions  import UserSubscriptions, SubscriptionStatus
from portal.models.billing_transactions import BillingTransactions, TransactionStatus
from portal.models.admin_activity_logs  import AdminActivityLogs

from . import ns, logger

subscribe_parser = reqparse.RequestParser()
subscribe_parser.add_argument('plan_id',       type=int, required=True,  location='json')
subscribe_parser.add_argument('billing_cycle', type=str, required=True,  location='json')
subscribe_parser.add_argument('promo_code',    type=str, required=False, location='json')
subscribe_parser.add_argument('payment_method',type=str, required=False, location='json', default='CARD')
subscribe_parser.add_argument('card_last4',    type=str, required=False, location='json')
subscribe_parser.add_argument('card_brand',    type=str, required=False, location='json')

cancel_parser = reqparse.RequestParser()
cancel_parser.add_argument('reason', type=str, required=False, location='json')

admin_upgrade_parser = reqparse.RequestParser()
admin_upgrade_parser.add_argument('user_id',       type=int, required=True, location='json')
admin_upgrade_parser.add_argument('plan_id',       type=int, required=True, location='json')
admin_upgrade_parser.add_argument('billing_cycle', type=str, required=True, location='json')
admin_upgrade_parser.add_argument('note',          type=str, required=False, location='json')


def _billing_cycle_days(cycle: str) -> int:
    return {'MONTHLY': 30, 'QUARTERLY': 90, 'HALFYEARLY': 180, 'ANNUALLY': 365}.get(cycle.upper(), 30)


def _plan_dict(p: SubscriptionPlans) -> dict:
    return {
        'plan_id':           p.plan_id,
        'plan_name':         p.plan_name,
        'plan_tier':         p.plan_tier,
        'description':       p.description,
        'tagline':           p.tagline,
        'price_monthly':     float(p.price_monthly),
        'price_quarterly':   float(p.price_quarterly),
        'price_halfyearly':  float(p.price_halfyearly) if p.price_halfyearly is not None else 0.0,
        'price_annually':    float(p.price_annually),
        'currency':          p.currency,
        'max_watchlist_items': p.max_watchlist_items,
        'max_portfolios':    p.max_portfolios,
        'max_price_alerts':  p.max_price_alerts,
        'real_time_data':    p.real_time_data,
        'advanced_charts':   p.advanced_charts,
        'analyst_ratings':   p.analyst_ratings,
        'news_access':       p.news_access,
        'api_access':        p.api_access,
        'priority_support':  p.priority_support,
        'features':          p.features or [],
        'is_popular':        p.is_popular,
        'is_active':         p.is_active,
        'sort_order':        p.sort_order,
    }


def _sub_dict(s: UserSubscriptions) -> dict:
    return {
        'subscription_id':      s.subscription_id,
        'user_id':              s.user_id,
        'plan':                 _plan_dict(s.plan) if s.plan else None,
        'status':               s.status,
        'billing_cycle':        s.billing_cycle,
        'amount_paid':          float(s.amount_paid) if s.amount_paid else None,
        'currency':             s.currency,
        'discount_applied':     float(s.discount_applied),
        'promo_code':           s.promo_code,
        'auto_renew':           s.auto_renew,
        'trial_start':          str(s.trial_start)            if s.trial_start            else None,
        'trial_end':            str(s.trial_end)              if s.trial_end              else None,
        'current_period_start': str(s.current_period_start),
        'current_period_end':   str(s.current_period_end),
        'next_billing_date':    str(s.next_billing_date)      if s.next_billing_date      else None,
        'cancelled_at':         str(s.cancelled_at)           if s.cancelled_at           else None,
        'cancellation_reason':  s.cancellation_reason,
        'upgraded_by_admin':    s.upgraded_by_admin,
        'created_on':           str(s.created_on),
    }


# ── List Plans  ──────────

@ns.route('/plans')
class ListPlans(Resource):
    @ns.doc(description='Get all available subscription plans (pricing page).')
    @jwt_required()
    def get(self):
        try:
            plans = (SubscriptionPlans.query
                     .filter_by(is_active=True)
                     .order_by(SubscriptionPlans.sort_order.asc())
                     .all())
            return jsonify(bool=True, status=200, response={
                'plans': [_plan_dict(p) for p in plans],
                'total': len(plans),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get Plan by ID  ──────

@ns.route('/plans/<int:plan_id>')
class PlanDetail(Resource):
    @ns.doc(description='Get a specific plan by ID.')
    @jwt_required()
    def get(self, plan_id):
        try:
            plan = SubscriptionPlans.query.get(plan_id)
            if not plan:
                return jsonify(bool=False, status=404, response={'message': 'Plan not found.'})
            return jsonify(bool=True, status=200, response=_plan_dict(plan))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Subscribe  ───────────

@ns.route('/subscribe')
class Subscribe(Resource):
    @ns.doc(description='Subscribe to a plan. Creates subscription + billing transaction.')
    @jwt_required()
    @ns.expect(subscribe_parser, validate=True)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = subscribe_parser.parse_args(strict=False)

            plan = SubscriptionPlans.query.get(args['plan_id'])
            if not plan or not plan.is_active:
                return jsonify(bool=False, status=404, response={'message': 'Plan not found or inactive.'})

            billing_cycle = args['billing_cycle'].upper()
            price_map     = {
                'MONTHLY':    plan.price_monthly,
                'QUARTERLY':  plan.price_quarterly,
                'HALFYEARLY': plan.price_halfyearly,
                'ANNUALLY':   plan.price_annually,
            }
            amount        = price_map.get(billing_cycle, plan.price_monthly)

            # Cancel existing active subscription
            existing = (UserSubscriptions.query
                        .filter_by(user_id=user_id, status=SubscriptionStatus.ACTIVE)
                        .first())
            if existing:
                existing.status        = SubscriptionStatus.CANCELLED
                existing.cancelled_at  = datetime.now(timezone.utc)
                existing.cancellation_reason = 'Upgraded/changed plan'
                existing.update()

            now     = datetime.now(timezone.utc)
            days    = _billing_cycle_days(billing_cycle)
            sub                       = UserSubscriptions()
            sub.user_id               = user_id
            sub.plan_id               = plan.plan_id
            sub.status                = SubscriptionStatus.ACTIVE
            sub.billing_cycle         = billing_cycle
            sub.amount_paid           = amount
            sub.currency              = plan.currency
            sub.current_period_start  = now
            sub.current_period_end    = now + timedelta(days=days)
            sub.next_billing_date     = now + timedelta(days=days)
            sub.auto_renew            = True
            sub.promo_code            = args.get('promo_code')
            sub.save()

            # Billing transaction
            txn                       = BillingTransactions()
            txn.user_id               = user_id
            txn.subscription_id       = sub.subscription_id
            txn.transaction_type      = 'SUBSCRIPTION'
            txn.status                = TransactionStatus.SUCCESS
            txn.amount                = amount
            txn.tax_amount            = 0
            txn.total_amount          = amount
            txn.currency              = plan.currency
            txn.payment_method        = args.get('payment_method', 'CARD')
            txn.card_last4            = args.get('card_last4')
            txn.card_brand            = args.get('card_brand')
            txn.description           = f'Subscription to {plan.plan_name} ({billing_cycle})'
            import uuid
            txn.invoice_number        = f'INV-{uuid.uuid4().hex[:10].upper()}'
            txn.save()

            return jsonify(bool=True, status=200, response={
                'message':         'Subscription activated.',
                'subscription_id': sub.subscription_id,
                'plan_name':       plan.plan_name,
                'billing_cycle':   billing_cycle,
                'amount_paid':     float(amount),
                'period_end':      str(sub.current_period_end),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── My Subscription  ─────

@ns.route('/my')
class MySubscription(Resource):
    @ns.doc(description='Get the current user\'s active subscription.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            sub     = (UserSubscriptions.query
                       .filter_by(user_id=user_id, status=SubscriptionStatus.ACTIVE)
                       .order_by(UserSubscriptions.created_on.desc())
                       .first())
            if not sub:
                return jsonify(bool=True, status=200, response={
                    'subscription': None,
                    'message':      'No active subscription. Free tier.',
                })
            return jsonify(bool=True, status=200, response=_sub_dict(sub))

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Cancel Subscription  ─

@ns.route('/cancel')
class CancelSubscription(Resource):
    @ns.doc(description='Cancel the current active subscription (effective at period end).')
    @jwt_required()
    @ns.expect(cancel_parser, validate=False)
    def post(self):
        try:
            user_id = int(get_jwt_identity())
            args    = cancel_parser.parse_args(strict=False)
            sub     = UserSubscriptions.query.filter_by(user_id=user_id, status=SubscriptionStatus.ACTIVE).first()
            if not sub:
                return jsonify(bool=False, status=404, response={'message': 'No active subscription found.'})

            sub.status               = SubscriptionStatus.CANCELLED
            sub.auto_renew           = False
            sub.cancelled_at         = datetime.now(timezone.utc)
            sub.cancellation_reason  = args.get('reason', 'User requested cancellation')
            sub.update()

            return jsonify(bool=True, status=200, response={
                'message':     'Subscription cancelled. Access continues until period end.',
                'access_until':str(sub.current_period_end),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Billing History  ─────

@ns.route('/billing_history')
class BillingHistory(Resource):
    @ns.doc(description='Get billing transaction history for the current user.')
    @jwt_required()
    def get(self):
        try:
            user_id = int(get_jwt_identity())
            txns    = (BillingTransactions.query
                       .filter_by(user_id=user_id)
                       .order_by(BillingTransactions.created_on.desc())
                       .limit(50).all())
            return jsonify(bool=True, status=200, response={
                'transactions': [{
                    'transaction_id':  t.transaction_id,
                    'transaction_type':t.transaction_type,
                    'status':          t.status,
                    'amount':          float(t.amount),
                    'total_amount':    float(t.total_amount),
                    'currency':        t.currency,
                    'payment_method':  t.payment_method,
                    'card_last4':      t.card_last4,
                    'card_brand':      t.card_brand,
                    'invoice_number':  t.invoice_number,
                    'invoice_url':     t.invoice_url,
                    'description':     t.description,
                    'created_on':      str(t.created_on),
                } for t in txns],
                'total': len(txns),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: Upgrade User Plan ───────────────────────────────────────────────────

@ns.route('/admin/upgrade')
class AdminUpgradeUser(Resource):
    @ns.doc(description='[ADMIN] Manually upgrade or change a user\'s subscription plan.')
    @jwt_required()
    @ns.expect(admin_upgrade_parser, validate=True)
    def post(self):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            args     = admin_upgrade_parser.parse_args(strict=False)
            user_id  = args['user_id']
            plan     = SubscriptionPlans.query.get(args['plan_id'])
            if not plan:
                return jsonify(bool=False, status=404, response={'message': 'Plan not found.'})

            billing_cycle = args['billing_cycle'].upper()
            days          = _billing_cycle_days(billing_cycle)
            now           = datetime.now(timezone.utc)

            # Cancel existing
            existing = UserSubscriptions.query.filter_by(user_id=user_id, status=SubscriptionStatus.ACTIVE).first()
            if existing:
                existing.status       = SubscriptionStatus.CANCELLED
                existing.cancelled_at = now
                existing.update()

            sub                      = UserSubscriptions()
            sub.user_id              = user_id
            sub.plan_id              = plan.plan_id
            sub.status               = SubscriptionStatus.ACTIVE
            sub.billing_cycle        = billing_cycle
            sub.amount_paid          = 0
            sub.current_period_start = now
            sub.current_period_end   = now + timedelta(days=days)
            sub.next_billing_date    = now + timedelta(days=days)
            sub.upgraded_by_admin    = True
            sub.admin_note           = args.get('note', '')
            sub.save()

            claims = get_jwt()
            log = AdminActivityLogs()
            log.admin_user_id  = claims.get('user_id')
            log.action_type    = 'UPGRADE_PLAN'
            log.target_user_id = user_id
            log.description    = f'Admin upgraded user {user_id} to {plan.plan_name}'
            log.after_state    = {'plan': plan.plan_name}
            log.save()

            # ── Notify the upgraded user (best-effort) ────────────────────────
            from portal.helpers.notify import notify_user
            from portal.models.notifications import NotificationType, NotificationPriority
            notify_user(
                user_id,
                NotificationType.SUBSCRIPTION,
                title=f"You've been upgraded to {plan.plan_name}!",
                body=f"Your account now has {plan.plan_name} access. Enjoy your new features.",
                priority=NotificationPriority.HIGH,
                action_url="/user/settings",
                reference_type="SUBSCRIPTION",
                reference_id=sub.subscription_id,
            )

            return jsonify(bool=True, status=200, response={
                'message':         f'User {user_id} upgraded to {plan.plan_name}.',
                'subscription_id': sub.subscription_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Admin: List All Subscriptions ─────────────────────────────────────────────

@ns.route('/admin/all')
class AdminAllSubscriptions(Resource):
    @ns.doc(description='[ADMIN] List all user subscriptions with pagination.')
    @jwt_required()
    def get(self):
        try:
            if get_jwt().get('role') != 'ADMIN':
                return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})

            from flask_restx import reqparse as rp
            p = rp.RequestParser()
            p.add_argument('page',     type=int, default=1,  location='args')
            p.add_argument('per_page', type=int, default=20, location='args')
            p.add_argument('status',   type=str, required=False, location='args')
            p.add_argument('plan_id',  type=int, required=False, location='args')
            p.add_argument('user_id',  type=int, required=False, location='args')
            args     = p.parse_args(strict=False)
            page     = max(1, args['page'])
            per_page = min(100, args['per_page'])
            query    = UserSubscriptions.query

            # FIX: honor user_id so per-user lookups (e.g. the admin All Users
            # list) return that user's subscription instead of everyone getting
            # the single newest active subscription in the system.
            if args.get('user_id'):
                query = query.filter_by(user_id=args['user_id'])
            if args.get('status'):
                query = query.filter(UserSubscriptions.status == args['status'].upper())
            if args.get('plan_id'):
                query = query.filter_by(plan_id=args['plan_id'])

            paginated = query.order_by(UserSubscriptions.created_on.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            return jsonify(bool=True, status=200, response={
                'subscriptions': [_sub_dict(s) for s in paginated.items],
                'total':         paginated.total,
                'page':          page,
                'per_page':      per_page,
                'total_pages':   paginated.pages,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
