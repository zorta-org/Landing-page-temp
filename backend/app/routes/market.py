from flask import Blueprint, request, g
from bson import ObjectId
from datetime import datetime, timezone
from app.extensions import mongo
from app.utils.auth import required
from app.utils.serial import doc
from app.services.notifications import notify
from app.services.providers import payments
from app.services import credits
from app.services.reputation import add as add_reputation
from app.utils.rate_limit import limited

bp = Blueprint('market', __name__)

TERMINAL_ORDER_STATES = {'completed', 'cancelled'}
ACTIVE_ORDER_STATES = {'in_progress', 'submitted', 'revision', 'disputed'}


def oid(value):
    try:
        return ObjectId(value)
    except Exception:
        raise ValueError('invalid_id')


def _parse_milestones(raw, total, deadline=None):
    raw = raw if isinstance(raw, list) else []
    if not raw:
        return [{
            'id': ObjectId(), 'title': 'Complete project', 'amount': float(total),
            'status': 'pending', 'due_date': deadline, 'submitted_at': None,
            'approved_at': None, 'paid_at': None,
        }]
    cleaned = []
    remaining = round(float(total), 2)
    for item in raw[:10]:
        try:
            amount = round(float(item.get('amount', 0) or 0), 2)
        except Exception:
            amount = 0
        if amount <= 0:
            continue
        amount = min(amount, remaining)
        if amount <= 0:
            break
        title = str(item.get('title') or 'Milestone').strip()[:120]
        cleaned.append({
            'id': ObjectId(), 'title': title, 'amount': amount, 'status': 'pending',
            'due_date': item.get('due_date') or item.get('dueDate') or deadline,
            'submitted_at': None, 'approved_at': None, 'paid_at': None,
        })
        remaining = round(remaining - amount, 2)
        if remaining <= 0.009:
            remaining = 0
            break
    if not cleaned or remaining > 0.009:
        if cleaned:
            cleaned[-1]['amount'] = round(cleaned[-1]['amount'] + remaining, 2)
        else:
            cleaned = [{
                'id': ObjectId(), 'title': 'Complete project', 'amount': float(total),
                'status': 'pending', 'due_date': deadline, 'submitted_at': None,
                'approved_at': None, 'paid_at': None,
            }]
    return cleaned


def _ensure_order_milestones(order):
    milestones = order.get('milestones')
    if milestones:
        return milestones
    milestones = _parse_milestones([], order.get('amount', 0), None)
    mongo.db.orders.update_one({'_id': order['_id']}, {'$set': {'milestones': milestones}})
    return milestones


def release_milestone(order_id, milestone_id):
    order = mongo.db.orders.find_one({'_id': order_id})
    if not order:
        raise ValueError('order_not_found')
    milestones = _ensure_order_milestones(order)
    target = next((m for m in milestones if str(m.get('id')) == str(milestone_id)), None)
    if not target:
        raise ValueError('milestone_not_found')
    if target.get('status') == 'paid':
        return order
    if target.get('status') != 'approved':
        raise ValueError('milestone_not_approved')

    now = datetime.now(timezone.utc)
    # The state transition is the idempotency barrier. Only the request that
    # changes approved -> paid is allowed to credit the freelancer.
    result = mongo.db.orders.update_one(
        {'_id': order_id, 'milestones': {'$elemMatch': {'id': target['id'], 'status': 'approved'}}},
        {'$set': {'milestones.$.status': 'paid', 'milestones.$.paid_at': now, 'updated_at': now}},
    )
    if result.modified_count == 0:
        fresh = mongo.db.orders.find_one({'_id': order_id})
        if fresh and any(str(m.get('id')) == str(milestone_id) and m.get('status') == 'paid' for m in fresh.get('milestones', [])):
            return fresh
        raise ValueError('milestone_not_approved')

    fresh = mongo.db.orders.find_one({'_id': order_id})
    all_paid = bool(fresh and fresh.get('milestones')) and all(m.get('status') == 'paid' for m in fresh['milestones'])
    if all_paid:
        mongo.db.orders.update_one({'_id': order_id, 'status': {'$ne': 'completed'}}, {'$set': {'status': 'completed', 'updated_at': now}})
    credits.add(order['freelancer_id'], float(target.get('amount', 0)), reason='milestone_released', order_id=order_id)
    if all_paid:
        add_reputation(order['freelancer_id'], 'freelance_completed')
    credits.check_milestones(order['freelancer_id'])
    return mongo.db.orders.find_one({'_id': order_id})


@bp.get('/gigs')
def gigs():
    """Marketplace listings.

    Backwards compatibility: documents without listing_type are treated as
    client job requests. Service listings are freelancer-owned and are shown
    in the Hire Talent view.
    """
    q = request.args.get('q', '').strip()
    skill = request.args.get('skill', '').strip()
    status = request.args.get('status', 'open').strip()
    listing_type = request.args.get('listing_type', '').strip()
    sort = request.args.get('sort', 'latest').strip()
    try:
        page = max(1, int(request.args.get('page', 1)))
        limit = min(50, max(1, int(request.args.get('limit', 24))))
    except Exception:
        page, limit = 1, 24
    query = {'status': status} if status else {}
    if listing_type in ('service', 'job_request'):
        if listing_type == 'job_request':
            query['$or'] = [{'listing_type': 'job_request'}, {'listing_type': {'$exists': False}}]
        else:
            query['listing_type'] = 'service'
    if q:
        query.setdefault('$and', []).append({'$or': [
            {'title': {'$regex': q, '$options': 'i'}},
            {'description': {'$regex': q, '$options': 'i'}},
            {'skills': {'$regex': q, '$options': 'i'}},
        ]})
    if skill:
        query['skills'] = {'$regex': skill, '$options': 'i'}
    ordering = [('budget', -1), ('created_at', -1), ('_id', -1)] if sort == 'budget' else [('created_at', -1), ('_id', -1)]
    rows = list(mongo.db.gigs.find(query).sort(ordering).skip((page-1)*limit).limit(limit))
    # Enrich cards with the correct poster identity and lightweight trust data.
    user_ids = []
    for row in rows:
        owner_id = row.get('freelancer_id') if row.get('listing_type') == 'service' else row.get('client_id')
        if owner_id: user_ids.append(owner_id)
    users = {u['_id']: u for u in mongo.db.users.find({'_id': {'$in': list(set(user_ids))}}, {'username':1,'display_name':1,'avatar':1,'reputation':1})} if user_ids else {}
    out=[]
    for row in rows:
        item=doc(row)
        owner_id=row.get('freelancer_id') if row.get('listing_type') == 'service' else row.get('client_id')
        owner=users.get(owner_id)
        item['listing_type']=row.get('listing_type','job_request')
        item['poster']=doc(owner) if owner else None
        item['poster_username']=(owner or {}).get('username') or row.get('client_username') or row.get('freelancer_username')
        item['poster_reputation']=int((owner or {}).get('reputation',0) or 0)
        item['is_service']=item['listing_type']=='service'
        out.append(item)
    return {'gigs': out, 'listing_type': listing_type or 'all', 'page': page, 'limit': limit, 'has_more': len(rows) == limit}


@bp.post('/gigs')
@required
@limited('market_listing_create', 20, 3600)
def create_gig():
    d = request.get_json() or {}
    title = str(d.get('title', '')).strip()[:120]
    description = str(d.get('description', '')).strip()[:5000]
    if len(title) < 3 or len(description) < 20:
        return {'error': 'title_and_description_required'}, 400
    listing_type = str(d.get('listing_type', 'job_request')).strip().lower()
    if listing_type not in ('service', 'job_request'):
        return {'error': 'invalid_listing_type'}, 400
    try:
        budget = float(d.get('budget', 0) or 0)
    except Exception:
        return {'error': 'invalid_budget'}, 400
    if budget <= 0:
        return {'error': 'budget_must_be_positive'}, 400
    skills = [str(x).strip()[:40] for x in (d.get('skills') or []) if str(x).strip()][:15]
    now = datetime.now(timezone.utc)
    x = {
        'listing_type': listing_type,
        'title': title, 'description': description, 'skills': skills,
        'budget': budget, 'deadline': d.get('deadline'),
        'requirements': str(d.get('requirements', '')).strip()[:3000],
        'category': str(d.get('category', 'General')).strip()[:60],
        'status': 'open', 'created_at': now, 'updated_at': now,
    }
    if listing_type == 'service':
        x.update({'freelancer_id': g.user['_id'], 'freelancer_username': g.user['username'], 'price': budget})
    else:
        x.update({'client_id': g.user['_id'], 'client_username': g.user['username']})
    r = mongo.db.gigs.insert_one(x)
    x['_id'] = r.inserted_id
    return {'gig': doc(x)}, 201


@bp.get('/gigs/<gid>')
def gig(gid):
    try:
        gid = oid(gid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    x = mongo.db.gigs.find_one({'_id': gid})
    if not x:
        return {'error': 'not_found'}, 404
    listing_type = x.get('listing_type','job_request')
    proposals = list(mongo.db.proposals.find({'gig_id': gid}).sort('created_at', -1))
    is_client_owner = bool(getattr(g, 'user', None) and x.get('client_id') == g.user['_id'])
    visible = proposals if is_client_owner and listing_type == 'job_request' else []
    owner_id = x.get('freelancer_id') if listing_type == 'service' else x.get('client_id')
    owner = mongo.db.users.find_one({'_id': owner_id}, {'username':1,'display_name':1,'avatar':1,'reputation':1}) if owner_id else None
    if listing_type == 'service':
        completed_orders = mongo.db.orders.count_documents({'freelancer_id': owner_id, 'status':'completed'}) if owner_id else 0
        history = {'completed_orders': completed_orders}
    else:
        posted = mongo.db.gigs.count_documents({'client_id': owner_id}) if owner_id else 0
        completed_orders = mongo.db.orders.count_documents({'client_id': owner_id, 'status':'completed'}) if owner_id else 0
        history = {'gigs_posted': posted, 'completed_orders': completed_orders}
    return {
        'gig': doc(x), 'proposal_count': len(proposals),
        'poster': doc(owner) if owner else None,
        'poster_history': history,
        'proposals': [doc(p) for p in visible]
    }


@bp.post('/gigs/<gid>/proposals')
@required
@limited('market_proposal_create', 30, 3600)
def proposal(gid):
    try:
        gid = oid(gid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    x = mongo.db.gigs.find_one({'_id': gid})
    d = request.get_json() or {}
    if not x:
        return {'error': 'not_found'}, 404
    if x.get('listing_type', 'job_request') != 'job_request':
        return {'error': 'service_listings_are_direct_hire'}, 400
    if x.get('client_id') == g.user['_id']:
        return {'error': 'cannot_apply_to_own_gig'}, 400
    if x.get('status') != 'open':
        return {'error': 'gig_not_open'}, 400
    existing = mongo.db.proposals.find_one({'gig_id': gid, 'freelancer_id': g.user['_id'], 'status': {'$in': ['pending', 'seen']}})
    if existing:
        return {'error': 'proposal_already_active'}, 409
    try:
        offer = float(d.get('offer', 0) or 0)
    except Exception:
        return {'error': 'invalid_offer'}, 400
    if offer <= 0:
        return {'error': 'invalid_offer'}, 400
    milestones = _parse_milestones(d.get('milestones'), offer, x.get('deadline'))
    p = {
        'gig_id': gid, 'freelancer_id': g.user['_id'], 'freelancer_username': g.user['username'],
        'offer': offer, 'message': str(d.get('message', '')).strip()[:3000],
        'milestones': milestones, 'status': 'pending', 'seen': False,
        'created_at': datetime.now(timezone.utc), 'updated_at': datetime.now(timezone.utc),
    }
    r = mongo.db.proposals.insert_one(p); p['_id'] = r.inserted_id
    notify(x['client_id'], 'proposal', f'{g.user["display_name"]} sent a proposal for {x["title"]}', entity_type='gig', entity_id=gid, route={'kind': 'gig', 'gig_id': str(gid)})
    return {'proposal': doc(p)}, 201


@bp.post('/gigs/<gid>/hire')
@required
@limited('market_hire', 30, 3600)
def hire_service(gid):
    """Direct hire flow for freelancer-authored service listings."""
    try:
        gid = oid(gid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    listing = mongo.db.gigs.find_one({'_id': gid})
    if not listing:
        return {'error': 'not_found'}, 404
    if listing.get('listing_type','job_request') != 'service':
        return {'error': 'only_service_listings_can_be_directly_hired'}, 400
    if listing.get('status') != 'open':
        return {'error': 'listing_not_open'}, 400
    if listing.get('freelancer_id') == g.user['_id']:
        return {'error': 'cannot_hire_your_own_service'}, 400
    try:
        amount=float((request.get_json() or {}).get('amount', listing.get('price', listing.get('budget',0))) or 0)
    except Exception:
        return {'error':'invalid_amount'},400
    if amount <= 0:
        return {'error':'invalid_amount'},400
    if credits.balance(g.user['_id']) < amount:
        return {'error':'insufficient_credits'},400
    now=datetime.now(timezone.utc)
    milestones=_parse_milestones((request.get_json() or {}).get('milestones'), amount, listing.get('deadline'))
    order_id=ObjectId()
    # Claim the listing before doing any expensive work. This prevents two
    # concurrent hires from creating two active orders for one service.
    claimed=mongo.db.gigs.update_one(
        {'_id':gid,'status':'open'},
        {'$set':{'status':'funding','active_order_id':order_id,'updated_at':now}},
    )
    if claimed.modified_count != 1:
        return {'error':'listing_not_open'},409
    order={'_id':order_id,'gig_id':gid,'proposal_id':None,'client_id':g.user['_id'],'freelancer_id':listing['freelancer_id'],
           'status':'funding','title':listing['title'],'amount':amount,'milestones':milestones,
           'listing_type':'service','created_at':now,'updated_at':now}
    mongo.db.orders.insert_one(order)
    if not credits.spend(g.user['_id'],amount,reason='order_funded',order_id=order_id):
        mongo.db.orders.delete_one({'_id':order_id})
        mongo.db.gigs.update_one({'_id':gid,'active_order_id':order_id},{'$set':{'status':'open','updated_at':datetime.now(timezone.utc)},'$unset':{'active_order_id':''}})
        return {'error':'insufficient_credits'},400
    mongo.db.orders.update_one(
    {'_id': order_id},
    {
        '$set': {
            'status': 'in_progress',
            'updated_at': datetime.now(timezone.utc)
        }
    }
)

    notify(
        listing['freelancer_id'],
        'order',
        f'You were hired for "{listing["title"]}"',
        entity_type='order',
        entity_id=order_id,
        route={
            'kind': 'orders',
            'order_id': str(order_id)
        }
    )

    return {'ok': True, 'order': doc(order)}, 201


@bp.get('/proposals')
@required
def my_proposals():
    rows=list(mongo.db.proposals.find({'freelancer_id': g.user['_id']}).sort('created_at', -1).limit(200))
    gig_ids=[x.get('gig_id') for x in rows if x.get('gig_id')]
    gigs={x['_id']:x for x in mongo.db.gigs.find({'_id':{'$in':gig_ids}},{'title':1,'deadline':1,'status':1})} if gig_ids else {}
    out=[]
    for x in rows:
        item=doc(x);gig=gigs.get(x.get('gig_id'))
        item['gig_title']=gig.get('title') if gig else 'Gig'
        item['gig_deadline']=gig.get('deadline') if gig else None
        item['gig_status']=gig.get('status') if gig else None
        out.append(item)
    return {'proposals': out}


@bp.post('/proposals/<pid>/seen')
@required
def proposal_seen(pid):
    try: pid = oid(pid)
    except ValueError: return {'error': 'invalid_id'}, 400
    p = mongo.db.proposals.find_one({'_id': pid})
    if not p: return {'error': 'not_found'}, 404
    gig = mongo.db.gigs.find_one({'_id': p['gig_id']})
    if not gig or gig['client_id'] != g.user['_id']: return {'error': 'forbidden'}, 403
    mongo.db.proposals.update_one({'_id': pid}, {'$set': {'seen': True, 'status': 'seen', 'seen_at': datetime.now(timezone.utc)}})
    return {'ok': True}


@bp.post('/proposals/<pid>/decision')
@required
@limited('market_proposal_decision', 60, 3600)
def decide(pid):
    try: pid = oid(pid)
    except ValueError: return {'error': 'invalid_id'}, 400
    p = mongo.db.proposals.find_one({'_id': pid})
    gigs = mongo.db.gigs.find_one({'_id': p['gig_id']}) if p else None
    if not p or not gigs: return {'error': 'not_found'}, 404
    if gigs.get('listing_type','job_request') != 'job_request': return {'error':'invalid_listing_type'},400
    if gigs.get('client_id') != g.user['_id']: return {'error': 'forbidden'}, 403
    status = (request.get_json() or {}).get('status')
    if status not in ('accepted', 'rejected'): return {'error': 'invalid_status'}, 400
    if p.get('status') in ('accepted', 'rejected'): return {'error': 'proposal_already_decided'}, 409
    if status == 'accepted':
        now = datetime.now(timezone.utc)
        milestones = p.get('milestones') or _parse_milestones([], p['offer'], gigs.get('deadline'))
        order_id = ObjectId()
        claimed = mongo.db.gigs.update_one(
            {'_id': gigs['_id'], 'status': 'open', 'active_order_id': {'$exists': False}},
            {'$set': {'status': 'funding', 'active_order_id': order_id, 'updated_at': now}},
        )
        if claimed.modified_count != 1:
            return {'error': 'gig_already_hired'}, 409
        order = {
            '_id': order_id, 'gig_id': gigs['_id'], 'proposal_id': p['_id'], 'client_id': gigs['client_id'],
            'freelancer_id': p['freelancer_id'], 'status': 'funding', 'title': gigs['title'],
            'amount': p['offer'], 'milestones': milestones, 'created_at': now, 'updated_at': now,
        }
        mongo.db.orders.insert_one(order)
        if not credits.spend(g.user['_id'], p['offer'], reason='order_funded', order_id=order_id):
            mongo.db.orders.delete_one({'_id':order_id})
            mongo.db.gigs.update_one({'_id':gigs['_id'],'active_order_id':order_id},{'$set':{'status':'open','updated_at':datetime.now(timezone.utc)},'$unset':{'active_order_id':''}})
            return {'error': 'insufficient_credits'}, 400
        mongo.db.proposals.update_one({'_id': p['_id'], 'status': {'$in':['pending','seen']}}, {'$set': {'status': 'accepted', 'seen': True, 'updated_at': now}})
        mongo.db.proposals.update_many({'gig_id': gigs['_id'], '_id': {'$ne': p['_id']}, 'status': {'$in': ['pending', 'seen']}}, {'$set': {'status': 'rejected', 'updated_at': now}})
        mongo.db.orders.update_one({'_id':order_id},{'$set':{'status':'in_progress','updated_at':datetime.now(timezone.utc)}})
        order=mongo.db.orders.find_one({'_id':order_id}) or order
        notify(p['freelancer_id'], 'proposal', f'Your proposal for "{gigs["title"]}" was accepted', entity_type='order', entity_id=order_id, route={'kind': 'orders', 'order_id': str(order_id)})
        return {'ok': True, 'order': doc(order)}
    mongo.db.proposals.update_one({'_id': p['_id']}, {'$set': {'status': 'rejected', 'updated_at': datetime.now(timezone.utc)}})
    notify(p['freelancer_id'], 'proposal', f'Your proposal for "{gigs["title"]}" was rejected', entity_type='gig', entity_id=gigs['_id'], route={'kind': 'gig', 'gig_id': str(gigs['_id'])})
    return {'ok': True}


@bp.get('/gigs/<gid>/proposals')
@required
def gig_proposals(gid):
    try: gid = oid(gid)
    except ValueError: return {'error': 'invalid_id'}, 400
    x = mongo.db.gigs.find_one({'_id': gid})
    if not x: return {'error': 'not_found'}, 404
    if x.get('listing_type','job_request') != 'job_request': return {'error': 'service_listings_do_not_accept_proposals'}, 400
    if x.get('client_id') != g.user['_id']: return {'error': 'forbidden'}, 403
    rows = list(mongo.db.proposals.find({'gig_id': gid}).sort([('status', 1), ('created_at', -1)]))
    freelancer_ids=[p.get('freelancer_id') for p in rows if p.get('freelancer_id')]
    users={u['_id']:u for u in mongo.db.users.find({'_id':{'$in':freelancer_ids}},{'username':1,'display_name':1,'avatar':1,'reputation':1})} if freelancer_ids else {}
    completed={}
    if freelancer_ids:
        for r in mongo.db.orders.aggregate([{'$match':{'freelancer_id':{'$in':freelancer_ids},'status':'completed'}},{'$group':{'_id':'$freelancer_id','count':{'$sum':1}}}]): completed[r['_id']]=r['count']
    out=[]
    for p in rows:
        if p.get('status') in ('pending', 'seen') and not p.get('seen'):
            p['seen'] = True
            mongo.db.proposals.update_one({'_id': p['_id']}, {'$set': {'seen': True, 'status': 'seen', 'seen_at': datetime.now(timezone.utc)}})
        item=doc(p);u=users.get(p.get('freelancer_id'))
        item['freelancer_profile']=doc(u) if u else None
        item['freelancer_reputation']=int((u or {}).get('reputation',0) or 0)
        item['completed_orders']=int(completed.get(p.get('freelancer_id'),0))
        out.append(item)
    return {'proposals': out}


@bp.get('/orders')
@required
def orders():
    rows = list(mongo.db.orders.find({'$or': [{'client_id': g.user['_id']}, {'freelancer_id': g.user['_id']}]}).sort('created_at', -1).limit(200))
    for row in rows:
        _ensure_order_milestones(row)
    ids={x for row in rows for x in (row.get('client_id'),row.get('freelancer_id')) if x}
    users={u['_id']:u for u in mongo.db.users.find({'_id':{'$in':list(ids)}},{'username':1,'display_name':1,'avatar':1})} if ids else {}
    out=[]
    for row in rows:
        fresh=mongo.db.orders.find_one({'_id':row['_id']}) or row
        item=doc(fresh)
        client=users.get(fresh.get('client_id')) or {}
        freelancer=users.get(fresh.get('freelancer_id')) or {}
        item['client_username']=client.get('username')
        item['client_name']=client.get('display_name')
        item['freelancer_username']=freelancer.get('username')
        item['freelancer_name']=freelancer.get('display_name')
        out.append(item)
    return {'orders': out}


@bp.post('/orders/<oidx>/milestones/<mid>/submit')
@required
@limited('market_milestone_submit', 60, 3600)
def submit_milestone(oidx, mid):
    try: oidv, midv = oid(oidx), oid(mid)
    except ValueError: return {'error': 'invalid_id'}, 400
    o = mongo.db.orders.find_one({'_id': oidv})
    if not o or o['freelancer_id'] != g.user['_id']: return {'error': 'forbidden'}, 403
    milestones = _ensure_order_milestones(o)
    target = next((m for m in milestones if str(m.get('id')) == str(midv)), None)
    if not target: return {'error': 'milestone_not_found'}, 404
    if target.get('status') not in ('pending', 'submitted', 'revision'): return {'error': 'invalid_milestone_state'}, 400
    d = request.get_json() or {}
    note = str(d.get('submission_note', d.get('note', ''))).strip()[:3000]
    delivery_url = str(d.get('delivery_url', d.get('url', ''))).strip()[:1000]
    now = datetime.now(timezone.utc)
    target['status'] = 'submitted'; target['submitted_at'] = now
    target['submission_note'] = note
    target['delivery_url'] = delivery_url
    mongo.db.orders.update_one({'_id': oidv}, {'$set': {'milestones': milestones, 'status': 'submitted', 'updated_at': now}})
    notify(o['client_id'], 'order', f'Milestone submitted for "{o["title"]}"', entity_type='order', entity_id=oidv, route={'kind': 'orders', 'order_id': str(oidv)})
    return {'order': doc(mongo.db.orders.find_one({'_id': oidv}))}


@bp.post('/orders/<oidx>/milestones/<mid>/approve')
@required
@limited('market_milestone_review', 60, 3600)
def approve_milestone(oidx, mid):
    try: oidv, midv = oid(oidx), oid(mid)
    except ValueError: return {'error': 'invalid_id'}, 400
    o = mongo.db.orders.find_one({'_id': oidv})
    if not o or o['client_id'] != g.user['_id']: return {'error': 'forbidden'}, 403
    milestones = _ensure_order_milestones(o)
    target = next((m for m in milestones if str(m.get('id')) == str(midv)), None)
    if not target: return {'error': 'milestone_not_found'}, 404
    if target.get('status') != 'submitted': return {'error': 'milestone_not_submitted'}, 400
    target['status'] = 'approved'; target['approved_at'] = datetime.now(timezone.utc)
    mongo.db.orders.update_one({'_id': oidv}, {'$set': {'milestones': milestones, 'updated_at': datetime.now(timezone.utc)}})
    released = release_milestone(oidv, midv)
    notify(o['freelancer_id'], 'order', f'Milestone approved and credits released for "{o["title"]}"', entity_type='order', entity_id=oidv, route={'kind': 'orders', 'order_id': str(oidv)})
    return {'order': doc(released)}


@bp.post('/orders/<oidx>/milestones/<mid>/revision')
@required
@limited('market_milestone_review', 60, 3600)
def milestone_revision(oidx, mid):
    try: oidv, midv = oid(oidx), oid(mid)
    except ValueError: return {'error': 'invalid_id'}, 400
    o = mongo.db.orders.find_one({'_id': oidv})
    if not o or o['client_id'] != g.user['_id']: return {'error': 'forbidden'}, 403
    milestones = _ensure_order_milestones(o)
    target = next((m for m in milestones if str(m.get('id')) == str(midv)), None)
    if not target: return {'error': 'milestone_not_found'}, 404
    if target.get('status') != 'submitted': return {'error': 'milestone_not_submitted'}, 400
    target['status'] = 'revision'
    mongo.db.orders.update_one({'_id': oidv}, {'$set': {'milestones': milestones, 'status': 'revision', 'updated_at': datetime.now(timezone.utc)}})
    notify(o['freelancer_id'], 'order', f'Revision requested for a milestone in "{o["title"]}"', entity_type='order', entity_id=oidv, route={'kind': 'orders', 'order_id': str(oidv)})
    return {'order': doc(mongo.db.orders.find_one({'_id': oidv}))}


@bp.post('/orders/<oidx>/status')
@required
@limited('market_order_status', 60, 3600)
def order_status(oidx):
    try: oidv = oid(oidx)
    except ValueError: return {'error': 'invalid_id'}, 400
    o = mongo.db.orders.find_one({'_id': oidv})
    if not o or g.user['_id'] not in (o['client_id'], o['freelancer_id']): return {'error': 'forbidden'}, 403
    status = (request.get_json() or {}).get('status')
    if status not in ['in_progress', 'submitted', 'revision', 'cancelled']: return {'error': 'invalid_status'}, 400
    old = o.get('status')
    if old in TERMINAL_ORDER_STATES: return {'error': 'order_terminal'}, 400
    if status == 'cancelled':
        # Refund only unreleased milestone funds. The client has already funded the full order.
        milestones = _ensure_order_milestones(o)
        unreleased = sum(float(m.get('amount', 0)) for m in milestones if m.get('status') != 'paid')
        if unreleased > 0:
            credits.add(o['client_id'], unreleased, reason='order_cancelled_refund', order_id=o['_id'])
        mongo.db.orders.update_one({'_id': oidv}, {'$set': {'status': 'cancelled', 'refunded_unreleased': unreleased, 'updated_at': datetime.now(timezone.utc)}})
    else:
        mongo.db.orders.update_one({'_id': oidv}, {'$set': {'status': status, 'updated_at': datetime.now(timezone.utc)}})
    other = o['freelancer_id'] if g.user['_id'] == o['client_id'] else o['client_id']
    notify(other, 'order', f'Order "{o["title"]}" marked {status}', entity_type='order', entity_id=o['_id'], route={'kind': 'orders', 'order_id': str(o['_id'])})
    return {'order': doc(mongo.db.orders.find_one({'_id': oidv}))}


@bp.post('/orders/<oidx>/dispute')
@required
@limited('market_order_status', 30, 3600)
def dispute(oidx):
    try: oidv = oid(oidx)
    except ValueError: return {'error': 'invalid_id'}, 400
    o = mongo.db.orders.find_one({'_id': oidv})
    if not o or g.user['_id'] not in (o['client_id'], o['freelancer_id']): return {'error': 'forbidden'}, 403
    if o.get('status') in ('completed', 'cancelled', 'disputed'): return {'error': 'invalid_status_for_dispute'}, 400
    reason = str((request.get_json() or {}).get('reason', '')).strip()[:1500]
    mongo.db.orders.update_one({'_id': oidv}, {'$set': {'status': 'disputed', 'dispute_reason': reason, 'disputed_by': g.user['_id'], 'updated_at': datetime.now(timezone.utc)}})
    other = o['freelancer_id'] if g.user['_id'] == o['client_id'] else o['client_id']
    notify(other, 'order', f'Order "{o["title"]}" was disputed', entity_type='order', entity_id=o['_id'], route={'kind': 'orders', 'order_id': str(o['_id'])})
    return {'order': doc(mongo.db.orders.find_one({'_id': oidv}))}


@bp.post('/orders/<oidx>/refund')
@required
@limited('market_order_status', 30, 3600)
def refund(oidx):
    try: oidv = oid(oidx)
    except ValueError: return {'error': 'invalid_id'}, 400
    o = mongo.db.orders.find_one({'_id': oidv})
    if not o: return {'error': 'not_found'}, 404
    if o['client_id'] != g.user['_id']: return {'error': 'forbidden'}, 403
    if o['status'] != 'disputed': return {'error': 'order_not_disputed'}, 400
    # Payment provider is intentionally still a stub. We refund the unreleased Zorta
    # credit escrow, while preserving provider_not_configured honestly.
    result = payments.refund(o.get('payment_id', str(o['_id'])))
    milestones = _ensure_order_milestones(o)
    unreleased = sum(float(m.get('amount', 0)) for m in milestones if m.get('status') != 'paid')
    if unreleased > 0:
        credits.add(o['client_id'], unreleased, reason='order_refunded', order_id=o['_id'])
    mongo.db.orders.update_one({'_id': oidv}, {'$set': {'status': 'cancelled', 'refund': result, 'refunded_unreleased': unreleased, 'updated_at': datetime.now(timezone.utc)}})
    notify(o['freelancer_id'], 'order', f'Order "{o["title"]}" was refunded', entity_type='order', entity_id=o['_id'], route={'kind': 'orders', 'order_id': str(o['_id'])})
    return {'order': doc(mongo.db.orders.find_one({'_id': oidv})), 'refund': result}


@bp.post('/orders/<oidx>/review')
@required
@limited('market_review', 20, 3600)
def review(oidx):
    try: oidv = oid(oidx)
    except ValueError: return {'error': 'invalid_id'}, 400
    o = mongo.db.orders.find_one({'_id': oidv})
    if not o or o['status'] != 'completed': return {'error': 'order_not_completed'}, 400
    if g.user['_id'] not in (o['client_id'], o['freelancer_id']): return {'error': 'forbidden'}, 403
    if mongo.db.reviews.find_one({'order_id': oidv, 'author_id': g.user['_id']}): return {'error': 'review_already_exists'}, 409
    d = request.get_json() or {}
    target = o['freelancer_id'] if g.user['_id'] == o['client_id'] else o['client_id']
    rating = max(1, min(5, int(d.get('rating', 5))))
    x = {'order_id': oidv, 'author_id': g.user['_id'], 'target_id': target, 'rating': rating, 'body': str(d.get('body', '')).strip()[:1500], 'created_at': datetime.now(timezone.utc)}
    r = mongo.db.reviews.insert_one(x); x['_id'] = r.inserted_id
    if rating >= 4:
        add_reputation(target, 'review_positive'); credits.add(target, 10, reason='review_positive', order_id=o['_id']); credits.check_milestones(target)
    return {'review': doc(x)}, 201


@bp.get('/marketplace/dashboard')
@required
def marketplace_dashboard():
    uid = g.user['_id']
    proposals = list(mongo.db.proposals.find({'freelancer_id': uid}).sort('created_at', -1).limit(100))
    orders = list(mongo.db.orders.find({'$or': [{'client_id': uid}, {'freelancer_id': uid}]}).sort('created_at', -1).limit(100))
    gigs = list(mongo.db.gigs.find({'$or': [{'client_id': uid}, {'freelancer_id': uid}]}).sort('created_at', -1).limit(100))
    return {
        'balance': credits.balance(uid),
        'proposals': [doc(x) for x in proposals],
        'orders': [doc(x) for x in orders],
        'gigs': [doc(x) for x in gigs],
        'role_signals': {'has_client_history': bool(gigs), 'has_freelancer_history': bool(proposals or orders)},
    }
