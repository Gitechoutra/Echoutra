"""
DUEDOH Firebase Cloud Messaging (FCM) Push Notification Helper
Handles: single device, multiple devices, topic notifications
"""
import os
import json
import logging

logger = logging.getLogger(__name__)

_fcm_app = None


def _get_fcm_app():
    """Initialize and return Firebase app (singleton)."""
    global _fcm_app
    if _fcm_app:
        return _fcm_app

    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError:
        raise RuntimeError("firebase-admin package not installed. Run: pip install firebase-admin")

    if firebase_admin._apps:
        _fcm_app = firebase_admin.get_app()
        return _fcm_app

    # Try JSON string first (for cloud deployments), then file path
    creds_json = os.environ.get('FIREBASE_CREDENTIALS_JSON', '')
    creds_path = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'config/firebase-service-account.json')

    if creds_json:
        try:
            cred_dict = json.loads(creds_json)
            cred = credentials.Certificate(cred_dict)
        except Exception as e:
            raise RuntimeError(f"Failed to parse FIREBASE_CREDENTIALS_JSON: {e}")
    elif os.path.exists(creds_path):
        cred = credentials.Certificate(creds_path)
    else:
        logger.warning(f"Firebase credentials not found at {creds_path}. Push notifications disabled.")
        return None

    _fcm_app = firebase_admin.initialize_app(cred)
    logger.info("Firebase app initialized")
    return _fcm_app


def send_to_device(token: str, title: str, body: str, data: dict = None) -> dict:
    """
    Send push notification to a single device.

    Args:
        token: FCM device registration token
        title: Notification title
        body: Notification body text
        data: Optional key-value data payload (all values must be strings)

    Returns:
        dict with keys: success (bool), message_id (str), error (str)
    """
    app = _get_fcm_app()
    if app is None:
        logger.warning(f"FCM not configured — skipping push to token {token[:20]}...")
        return {'success': False, 'error': 'FCM not configured'}

    try:
        from firebase_admin import messaging

        notification = messaging.Notification(title=title, body=body)
        android_config = messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                title=title,
                body=body,
                sound='default',
                click_action='FLUTTER_NOTIFICATION_CLICK',
            )
        )
        apns_config = messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(sound='default', badge=1)
            )
        )

        message = messaging.Message(
            token=token,
            notification=notification,
            android=android_config,
            apns=apns_config,
            data={k: str(v) for k, v in (data or {}).items()},
        )

        response = messaging.send(message)
        logger.info(f"FCM push sent to token {token[:20]}...: {response}")
        return {'success': True, 'message_id': response}

    except Exception as e:
        logger.error(f"FCM send_to_device error: {e}")
        return {'success': False, 'error': str(e)}


def send_to_multiple(tokens: list, title: str, body: str, data: dict = None) -> dict:
    """
    Send push notification to multiple devices (up to 500 tokens per call).

    Returns:
        dict with keys: success_count, failure_count, responses
    """
    if not tokens:
        return {'success_count': 0, 'failure_count': 0, 'responses': []}

    app = _get_fcm_app()
    if app is None:
        return {'success_count': 0, 'failure_count': len(tokens), 'responses': []}

    try:
        from firebase_admin import messaging

        notification = messaging.Notification(title=title, body=body)
        message = messaging.MulticastMessage(
            tokens=tokens,
            notification=notification,
            data={k: str(v) for k, v in (data or {}).items()},
            android=messaging.AndroidConfig(priority='high'),
        )

        response = messaging.send_each_for_multicast(message)
        logger.info(f"FCM multicast: {response.success_count} success, {response.failure_count} failure")
        return {
            'success_count': response.success_count,
            'failure_count': response.failure_count,
            'responses': [{'success': r.success, 'message_id': r.message_id, 'exception': str(r.exception) if r.exception else None} for r in response.responses],
        }

    except Exception as e:
        logger.error(f"FCM send_to_multiple error: {e}")
        return {'success_count': 0, 'failure_count': len(tokens), 'responses': [], 'error': str(e)}


def send_trip_confirmed_notification(user_token: str, dude_token: str, trip_id: int, dude_name: str, user_name: str) -> None:
    """Notify both traveler and DUDE when a trip is confirmed."""
    # Notify traveler
    if user_token:
        send_to_device(
            token=user_token,
            title='Your DUDE is Ready!',
            body=f"You're not alone on this trip anymore. {dude_name} will meet you soon.",
            data={'type': 'trip_confirmed', 'trip_id': str(trip_id)},
        )

    # Notify DUDE
    if dude_token:
        send_to_device(
            token=dude_token,
            title='New Trip Booking!',
            body=f"{user_name} has booked you. Check your trips for details.",
            data={'type': 'new_booking', 'trip_id': str(trip_id)},
        )


def send_contact_reveal_notification(user_token: str, dude_token: str, trip_id: int, dude_name: str, dude_phone: str, dude_avatar: str) -> None:
    """
    Notify traveler that DUDE contact is now visible (10 min before trip).
    Also alert DUDE to prepare.
    """
    if user_token:
        send_to_device(
            token=user_token,
            title=f'Your DUDE {dude_name} is on the way!',
            body='Contact details are now available. Tap to view.',
            data={
                'type': 'contact_reveal',
                'trip_id': str(trip_id),
                'dude_name': dude_name,
                'dude_phone': dude_phone,
                'dude_avatar': dude_avatar or '',
            },
        )

    if dude_token:
        send_to_device(
            token=dude_token,
            title='Trip starts in 10 minutes!',
            body="Head to the meeting point now. Your traveler has your contact.",
            data={'type': 'trip_starting', 'trip_id': str(trip_id)},
        )
