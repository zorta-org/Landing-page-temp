from datetime import datetime, timezone
from app.extensions import mongo


def _mutual_follow(a, b):
    return bool(
        mongo.db.followers.find_one({'follower_id': a, 'following_id': b}, {'_id': 1}) and
        mongo.db.followers.find_one({'follower_id': b, 'following_id': a}, {'_id': 1})
    )


def can_message(a, b):
    """Return (allowed, reason, context).

    Normal DMs require a mutual follow. Marketplace relationships open a narrow
    professional messaging window while an order/proposal is genuinely active.
    Rejected proposals and terminal/cancelled orders never grant access.
    """
    if a == b:
        return False, 'cannot_message_self', None

    blocked = mongo.db.blocks.find_one({
        '$or': [
            {'blocker_id': a, 'blocked_id': b},
            {'blocker_id': b, 'blocked_id': a},
        ]
    }, {'_id': 1})
    if blocked:
        return False, 'You cannot message this user', None

    if _mutual_follow(a, b):
        return True, None, {'kind': 'mutual_follow'}

    active_order = mongo.db.orders.find_one({
        '$or': [
            {'client_id': a, 'freelancer_id': b},
            {'client_id': b, 'freelancer_id': a},
        ],
        'status': {'$in': ['in_progress', 'submitted', 'revision', 'disputed']},
    }, {'_id': 1, 'gig_id': 1, 'title': 1, 'status': 1})
    if active_order:
        return True, None, {
            'kind': 'professional_order',
            'order_id': active_order['_id'],
            'gig_id': active_order.get('gig_id'),
            'title': active_order.get('title'),
        }

    # Pre-hire window: client owns an open gig and the other user has a live proposal.
    gig_ids = [x['_id'] for x in mongo.db.gigs.find(
        {'client_id': a, 'status': 'open'}, {'_id': 1}
    ).limit(100)]
    if gig_ids:
        proposal = mongo.db.proposals.find_one({
            'gig_id': {'$in': gig_ids},
            'freelancer_id': b,
            'status': {'$in': ['pending', 'seen']},
        }, {'gig_id': 1})
        if proposal:
            gig = mongo.db.gigs.find_one({'_id': proposal['gig_id']}, {'title': 1})
            return True, None, {
                'kind': 'professional_proposal',
                'gig_id': proposal['gig_id'],
                'title': (gig or {}).get('title'),
            }

    gig_ids = [x['_id'] for x in mongo.db.gigs.find(
        {'client_id': b, 'status': 'open'}, {'_id': 1}
    ).limit(100)]
    if gig_ids:
        proposal = mongo.db.proposals.find_one({
            'gig_id': {'$in': gig_ids},
            'freelancer_id': a,
            'status': {'$in': ['pending', 'seen']},
        }, {'gig_id': 1})
        if proposal:
            gig = mongo.db.gigs.find_one({'_id': proposal['gig_id']}, {'title': 1})
            return True, None, {
                'kind': 'professional_proposal',
                'gig_id': proposal['gig_id'],
                'title': (gig or {}).get('title'),
            }

    return False, 'You can only message users who follow you back', None
