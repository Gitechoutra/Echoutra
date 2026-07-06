"""
DUEDOH SMS Helper
Supports: MSG91 (primary) → Fast2SMS (fallback)
"""
import os
import json
import logging
import requests

logger = logging.getLogger(__name__)

MSG91_OTP_URL = 'https://api.msg91.com/api/v5/otp'
MSG91_FLOW_URL = 'https://api.msg91.com/api/v5/flow/'
FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2'


def send_otp_sms(phone: str, otp: str, country_code: str = '91') -> dict:
    """
    Send OTP SMS via MSG91. Falls back to Fast2SMS if MSG91 fails.

    Args:
        phone: 10-digit mobile number (without country code)
        otp: OTP string to send
        country_code: country code digits (default '91' for India)

    Returns:
        dict with keys: success (bool), provider (str), message (str)
    """
    result = _send_via_msg91(phone, otp, country_code)
    if result['success']:
        return result

    logger.warning(f"MSG91 failed for {phone}, trying Fast2SMS fallback")
    result = _send_via_fast2sms(phone, otp)
    return result


def _send_via_msg91(phone: str, otp: str, country_code: str = '91') -> dict:
    """Send OTP via MSG91 API."""
    auth_key = os.environ.get('MSG91_AUTH_KEY', '')
    template_id = os.environ.get('MSG91_OTP_TEMPLATE_ID', '')

    if not auth_key or not template_id:
        logger.warning("MSG91 credentials not configured. Set MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID in .env")
        return {'success': False, 'provider': 'msg91', 'message': 'MSG91 not configured'}

    full_number = f"{country_code}{phone}"

    headers = {
        'authkey': auth_key,
        'accept': 'application/json',
        'content-type': 'application/json',
    }

    payload = {
        'template_id': template_id,
        'mobile': full_number,
        'VAR1': otp,           # OTP variable in your MSG91 template
        'otp': otp,
        'otp_length': str(len(otp)),
        'otp_expiry': '10',    # 10 minutes
    }

    try:
        resp = requests.post(MSG91_OTP_URL, headers=headers, json=payload, timeout=10)
        data = resp.json()

        if resp.status_code == 200 and data.get('type') == 'success':
            logger.info(f"MSG91 OTP sent to {full_number}")
            return {'success': True, 'provider': 'msg91', 'message': 'OTP sent via MSG91'}
        else:
            msg = data.get('message', resp.text)
            logger.error(f"MSG91 error for {full_number}: {msg}")
            return {'success': False, 'provider': 'msg91', 'message': msg}

    except requests.RequestException as e:
        logger.error(f"MSG91 request exception: {e}")
        return {'success': False, 'provider': 'msg91', 'message': str(e)}


def _send_via_fast2sms(phone: str, otp: str) -> dict:
    """Send OTP via Fast2SMS API (fallback)."""
    api_key = os.environ.get('FAST2SMS_API_KEY', '')

    if not api_key:
        logger.warning("Fast2SMS API key not configured. Set FAST2SMS_API_KEY in .env")
        return {'success': False, 'provider': 'fast2sms', 'message': 'Fast2SMS not configured'}

    headers = {
        'authorization': api_key,
        'Content-Type': 'application/json',
    }

    payload = {
        'variables_values': otp,
        'route': 'otp',
        'numbers': phone,
    }

    try:
        resp = requests.post(FAST2SMS_URL, headers=headers, json=payload, timeout=10)
        data = resp.json()

        if resp.status_code == 200 and data.get('return') is True:
            logger.info(f"Fast2SMS OTP sent to {phone}")
            return {'success': True, 'provider': 'fast2sms', 'message': 'OTP sent via Fast2SMS'}
        else:
            msg = data.get('message', [resp.text])
            if isinstance(msg, list):
                msg = ' | '.join(msg)
            logger.error(f"Fast2SMS error for {phone}: {msg}")
            return {'success': False, 'provider': 'fast2sms', 'message': msg}

    except requests.RequestException as e:
        logger.error(f"Fast2SMS request exception: {e}")
        return {'success': False, 'provider': 'fast2sms', 'message': str(e)}


def send_trip_confirmation_sms(phone: str, dude_name: str, trip_date: str, trip_time: str) -> dict:
    """Send trip confirmation SMS to traveler."""
    auth_key = os.environ.get('MSG91_AUTH_KEY', '')
    template_id = os.environ.get('MSG91_TRIP_CONFIRM_TEMPLATE_ID', '')

    if not auth_key or not template_id:
        # Fallback: send plain SMS via Fast2SMS
        message = (
            f"Your DUEDOH trip is confirmed! "
            f"DUDE: {dude_name}, Date: {trip_date} at {trip_time}. "
            f"Contact details will be shared 10 min before your trip. -DUEDOH"
        )
        return _send_plain_sms_fast2sms(phone, message)

    headers = {'authkey': auth_key, 'accept': 'application/json', 'content-type': 'application/json'}
    payload = {
        'template_id': template_id,
        'mobile': f'91{phone}',
        'VAR1': dude_name,
        'VAR2': trip_date,
        'VAR3': trip_time,
    }
    try:
        resp = requests.post(MSG91_FLOW_URL, headers=headers, json=payload, timeout=10)
        data = resp.json()
        success = resp.status_code == 200 and data.get('type') == 'success'
        return {'success': success, 'provider': 'msg91', 'message': data.get('message', '')}
    except Exception as e:
        logger.error(f"Trip confirmation SMS error: {e}")
        return {'success': False, 'provider': 'msg91', 'message': str(e)}


def _send_plain_sms_fast2sms(phone: str, message: str) -> dict:
    """Send a plain text SMS via Fast2SMS DLT route."""
    api_key = os.environ.get('FAST2SMS_API_KEY', '')
    if not api_key:
        return {'success': False, 'provider': 'fast2sms', 'message': 'Fast2SMS not configured'}

    headers = {'authorization': api_key, 'Content-Type': 'application/json'}
    payload = {'message': message, 'language': 'english', 'route': 'q', 'numbers': phone}
    try:
        resp = requests.post(FAST2SMS_URL, headers=headers, json=payload, timeout=10)
        data = resp.json()
        success = resp.status_code == 200 and data.get('return') is True
        return {'success': success, 'provider': 'fast2sms', 'message': str(data.get('message', ''))}
    except Exception as e:
        return {'success': False, 'provider': 'fast2sms', 'message': str(e)}
