from flask import Blueprint, request, g
from app.extensions import mongo
from app.utils.auth import required
from app.utils.serial import doc
from app.services import referrals

bp = Blueprint('referrals', __name__)


@bp.get('/referrals/me')
@required
def me():
    uid = g.user['_id']

    code = referrals.ensure_code(uid)

    referred_rows = list(
        mongo.db.users.find(
            {'referred_by': uid},
            {'username': 1, 'display_name': 1, 'avatar': 1, 'created_at': 1}
        ).sort('created_at', -1).limit(100)
    )

    earned = list(mongo.db.credits.aggregate([
        {'$match': {'user_id': uid, 'reason': 'referral_signup'}},
        {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
    ]))
    coins_earned = float(earned[0]['total']) if earned else 0.0

    origin = request.headers.get('Origin') or request.host_url.rstrip('/')

    return {
        'referral_code': code,
        'referral_link': f'{origin}/signup?ref={code}',
        'stats': {
            'total_referred': len(referred_rows),
            'coins_earned': coins_earned,
            'reward_per_referral': referrals.REFERRAL_SIGNUP_REWARD,
            'welcome_bonus': referrals.REFERRAL_WELCOME_BONUS
        },
        'referred': [doc(x) for x in referred_rows]
    }
