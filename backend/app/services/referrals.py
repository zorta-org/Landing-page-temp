import secrets
from app.extensions import mongo
from app.services import credits
from app.services.notifications import notify

# Coins are internally tracked as "credits" (see app/services/credits.py)
# and presented to users as "Zorta Coins" — same convention already used
# by the admin panel and marketplace.
REFERRAL_SIGNUP_REWARD = 50   # paid to the referrer
REFERRAL_WELCOME_BONUS = 20   # paid to the new signup

# No ambiguous characters (0/O, 1/I/L) so codes are easy to type/read aloud.
_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def generate_code(length=7):
    for _ in range(10):
        code = ''.join(secrets.choice(_ALPHABET) for _ in range(length))
        if not mongo.db.users.find_one({'referral_code': code}):
            return code
    # Vanishingly unlikely fallback if the loop above never finds a free code.
    return secrets.token_hex(6).upper()


def ensure_code(user_id):
    """Returns the user's referral code, generating and persisting one
    the first time it's needed (covers both new signups and any account
    that existed before this feature shipped)."""
    u = mongo.db.users.find_one({'_id': user_id}, {'referral_code': 1})
    if u and u.get('referral_code'):
        return u['referral_code']
    code = generate_code()
    mongo.db.users.update_one({'_id': user_id}, {'$set': {'referral_code': code}})
    return code


def apply_referral(new_user_id, new_username, code):
    """Called right after account creation. Links the new account to
    whoever owns `code` and pays out both sides. Silently no-ops on a
    missing/invalid/self-referral code so signup never fails because of
    a bad ref link."""
    if not code or not isinstance(code, str):
        return None

    referrer = mongo.db.users.find_one({'referral_code': code.strip().upper()})
    if not referrer or referrer['_id'] == new_user_id:
        return None

    mongo.db.users.update_one(
        {'_id': new_user_id},
        {'$set': {'referred_by': referrer['_id']}}
    )

    credits.add(referrer['_id'], REFERRAL_SIGNUP_REWARD, reason='referral_signup')
    credits.add(new_user_id, REFERRAL_WELCOME_BONUS, reason='referral_welcome')

    notify(
        referrer['_id'], 'referral',
        f'@{new_username} joined Zorta using your referral link — +{REFERRAL_SIGNUP_REWARD} coins',
        entity_type='user', entity_id=new_user_id,
        route={'kind': 'profile', 'username': new_username}
    )

    return referrer['_id']
