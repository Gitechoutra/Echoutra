"""
TradeFlow Razorpay Payment Gateway Helper
Handles: create order, verify signature, refund
"""
import os
import hmac
import hashlib
import logging

logger = logging.getLogger(__name__)


def _get_client():
    """Return an authenticated Razorpay client."""
    try:
        import razorpay
    except ImportError:
        raise RuntimeError("razorpay package not installed. Run: pip install razorpay")

    key_id = os.environ.get('RAZORPAY_KEY_ID', '')
    key_secret = os.environ.get('RAZORPAY_KEY_SECRET', '')

    if not key_id or not key_secret:
        raise RuntimeError("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env")

    return razorpay.Client(auth=(key_id, key_secret))


def create_order(amount_inr: float, reference_id: int, notes: dict = None) -> dict:
    """
    Create a Razorpay order.

    Args:
        amount_inr: Amount in INR (will be converted to paise)
        reference_id: Reference ID (stock_id or order_id)
        notes: Optional metadata dict

    Returns:
        dict with keys: success, order_id, amount, currency, key_id, error
    """
    try:
        client = _get_client()

        amount_paise = int(round(amount_inr * 100))   # Razorpay uses paise

        order_data = {
            'amount': amount_paise,
            'currency': 'INR',
            'receipt': f'tradeflow_ref_{reference_id}',
            'notes': notes or {'reference_id': str(reference_id), 'app': 'TradeFlow'},
            'payment_capture': 1,   # auto capture
        }

        order = client.order.create(data=order_data)
        logger.info(f"Razorpay order created: {order['id']} for ReferenceID={reference_id}")

        return {
            'success': True,
            'order_id': order['id'],
            'amount': amount_inr,
            'amount_paise': amount_paise,
            'currency': 'INR',
            'key_id': os.environ.get('RAZORPAY_KEY_ID', ''),
            'razorpay_order': order,
        }

    except Exception as e:
        logger.error(f"Razorpay create_order error: {e}")
        return {'success': False, 'error': str(e)}


def verify_payment_signature(razorpay_order_id: str, razorpay_payment_id: str, razorpay_signature: str) -> bool:
    """
    Verify Razorpay payment signature to confirm payment authenticity.

    The signature is HMAC-SHA256 of "order_id|payment_id" using the key_secret.
    """
    key_secret = os.environ.get('RAZORPAY_KEY_SECRET', '')
    if not key_secret:
        logger.error("RAZORPAY_KEY_SECRET not set. Cannot verify signature.")
        return False

    try:
        message = f"{razorpay_order_id}|{razorpay_payment_id}"
        expected_signature = hmac.new(
            key_secret.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        is_valid = hmac.compare_digest(expected_signature, razorpay_signature)
        if is_valid:
            logger.info(f"Razorpay signature verified for payment {razorpay_payment_id}")
        else:
            logger.warning(f"Razorpay signature MISMATCH for payment {razorpay_payment_id}")
        return is_valid

    except Exception as e:
        logger.error(f"Signature verification error: {e}")
        return False


def verify_webhook_signature(payload_body: bytes, webhook_signature: str) -> bool:
    """
    Verify Razorpay webhook signature.
    Use this in the /payments/webhook endpoint.
    """
    webhook_secret = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '')
    if not webhook_secret:
        logger.warning("RAZORPAY_WEBHOOK_SECRET not set. Skipping webhook verification.")
        return True  # permissive if not configured

    try:
        expected = hmac.new(
            webhook_secret.encode('utf-8'),
            payload_body,
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, webhook_signature)
    except Exception as e:
        logger.error(f"Webhook signature verification error: {e}")
        return False


def fetch_payment(razorpay_payment_id: str) -> dict:
    """Fetch payment details from Razorpay."""
    try:
        client = _get_client()
        payment = client.payment.fetch(razorpay_payment_id)
        return {'success': True, 'payment': payment}
    except Exception as e:
        logger.error(f"Razorpay fetch_payment error: {e}")
        return {'success': False, 'error': str(e)}


def initiate_refund(razorpay_payment_id: str, amount_inr: float, notes: str = '') -> dict:
    """
    Initiate a full or partial refund.

    Args:
        razorpay_payment_id: The Razorpay payment ID to refund
        amount_inr: Amount in INR to refund (0 for full refund)
        notes: Reason for refund
    """
    try:
        client = _get_client()

        refund_data = {'speed': 'normal', 'notes': {'reason': notes or 'Refund - TradeFlow'}}
        if amount_inr > 0:
            refund_data['amount'] = int(round(amount_inr * 100))

        refund = client.payment.refund(razorpay_payment_id, refund_data)
        logger.info(f"Razorpay refund initiated: {refund.get('id')} for payment {razorpay_payment_id}")
        return {'success': True, 'refund_id': refund.get('id'), 'refund': refund}

    except Exception as e:
        logger.error(f"Razorpay refund error: {e}")
        return {'success': False, 'error': str(e)}


















