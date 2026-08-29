from flask import Blueprint, request, g
from bson import ObjectId
from datetime import datetime, timezone
import base64, json
from app.extensions import mongo
from app.utils.auth import required
from app.utils.serial import doc
from app.services.notifications import notify
from app.services.messaging import can_message
from app.utils.rate_limit import limited

bp = Blueprint('messages', __name__)

def oid(value):
    try: return ObjectId(value)
    except Exception: return None

def _cursor(value):
    if not value: return None
    try:
        raw = base64.urlsafe_b64decode(value.encode()).decode()
        d = json.loads(raw)
        return datetime.fromisoformat(d['created_at']), ObjectId(d['id'])
    except Exception: return None

def _next_cursor(row):
    payload = {'created_at': row['created_at'].isoformat(), 'id': str(row['_id'])}
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()

def _mutual(a, b):
    return can_message(a, b)[2] is not None and can_message(a, b)[2].get('kind') == 'mutual_follow'

def _user_summary(uid):
    u = mongo.db.users.find_one({'_id': uid}, {'password_hash': 0})
    return doc(u) if u else None

@bp.get('/messages/unread')
@required
def unread():
    return {'unread': mongo.db.direct_messages.count_documents({'recipient_id': g.user['_id'], 'read': {'$ne': True}})}

@bp.get('/messages/conversations')
@required
def conversations():
    uid = g.user['_id']
    pipeline = [
        {'$match': {'$or': [{'sender_id': uid}, {'recipient_id': uid}]}},
        {'$sort': {'created_at': -1, '_id': -1}},
        {'$addFields': {'partner_id': {'$cond': [{'$eq': ['$sender_id', uid]}, '$recipient_id', '$sender_id']}}},
        {'$group': {'_id': '$partner_id', 'last': {'$first': '$$ROOT'}, 'unread': {'$sum': {'$cond': [{'$and': [{'$eq': ['$recipient_id', uid]}, {'$ne': ['$read', True]}]}, 1, 0]}}}},
        {'$sort': {'last.created_at': -1, 'last._id': -1}}, {'$limit': 100},
    ]
    rows = list(mongo.db.direct_messages.aggregate(pipeline))
    ids = [r['_id'] for r in rows]
    users = {u['_id']: u for u in mongo.db.users.find({'_id': {'$in': ids}}, {'password_hash': 0})}
    outgoing={x['following_id'] for x in mongo.db.followers.find({'follower_id':uid,'following_id':{'$in':ids}},{'following_id':1})}
    incoming={x['follower_id'] for x in mongo.db.followers.find({'following_id':uid,'follower_id':{'$in':ids}},{'follower_id':1})}
    mutual=outgoing & incoming
    out=[]
    for r in rows:
        u=users.get(r['_id']); last=r.get('last',{})
        if not u: continue
        out.append({'user': doc(u), 'last_message': last.get('body',''), 'last_at': last.get('created_at'), 'from_me': last.get('sender_id') == uid, 'unread': r.get('unread',0), 'can_message': r['_id'] in mutual})
    return {'conversations': out}

@bp.get('/messages/<username>')
@required
def thread(username):
    target=mongo.db.users.find_one({'username': username.strip().lower()}, {'password_hash':0})
    if not target: return {'error':'recipient_not_found'}, 404
    uid, tid = g.user['_id'], target['_id']
    limit=min(max(int(request.args.get('limit',30)),1),100)
    cur=_cursor(request.args.get('cursor'))
    q={'$or':[{'sender_id':uid,'recipient_id':tid},{'sender_id':tid,'recipient_id':uid}]}
    if cur:
        dt, oidv=cur
        q['$and']=[{'$or':[{'created_at':{'$lt':dt}},{'created_at':dt,'_id':{'$lt':oidv}}]}]
    rows=list(mongo.db.direct_messages.find(q, {'sender_id':1,'recipient_id':1,'sender_username':1,'recipient_username':1,'body':1,'created_at':1,'read':1}).sort([('created_at',-1),('_id',-1)]).limit(limit+1))
    has_more=len(rows)>limit; rows=rows[:limit]; rows.reverse()
    mongo.db.direct_messages.update_many({'sender_id':tid,'recipient_id':uid,'read':{'$ne':True}}, {'$set':{'read':True,'read_at':datetime.now(timezone.utc)}})
    allowed, reason, context = can_message(uid, tid)
    return {'user':doc(target), 'messages':[doc(x) for x in rows], 'next_cursor':_next_cursor(rows[0]) if has_more and rows else None, 'can_message':allowed, 'message_permission_reason':reason, 'context':context}

@bp.post('/messages/<username>/read')
@required
def mark_read(username):
    target=mongo.db.users.find_one({'username':username.strip().lower()},{'_id':1})
    if not target:return {'error':'recipient_not_found'},404
    mongo.db.direct_messages.update_many({'sender_id':target['_id'],'recipient_id':g.user['_id'],'read':{'$ne':True}}, {'$set':{'read':True,'read_at':datetime.now(timezone.utc)}})
    return {'ok':True}

@bp.post('/messages')
@required
@limited('dm_send', 120, 60)
def send_message():
    d=request.get_json() or {}; username=str(d.get('username','')).strip().lower(); body=str(d.get('body','')).strip()
    if not username or not body:return {'error':'recipient_and_message_required'},400
    if len(body)>2000:return {'error':'message_too_long'},400
    target=mongo.db.users.find_one({'username':username},{'_id':1,'username':1,'display_name':1,'platform_banned':1,'deleted_at':1})
    if not target:return {'error':'recipient_not_found'},404
    if target['_id']==g.user['_id']:return {'error':'cannot_message_self'},400
    if target.get('platform_banned') or target.get('deleted_at'):return {'error':'recipient_unavailable'},403
    allowed, reason, context = can_message(g.user['_id'], target['_id'])
    if not allowed:
        return {'error': reason or 'messaging_not_allowed'},403

    now=datetime.now(timezone.utc)
    msg={'sender_id':g.user['_id'],'recipient_id':target['_id'],'sender_username':g.user['username'],'recipient_username':target['username'],'body':body,'created_at':now,'read':False}
    r=mongo.db.direct_messages.insert_one(msg); msg['_id']=r.inserted_id
    notify(target['_id'],'direct_message',f'New message from {g.user.get("display_name",g.user["username"])}',body[:160],entity_type='message',entity_id=r.inserted_id,route={'kind':'dm','username':g.user['username'],'context':context})
    return {'message':doc(msg)},201


@bp.post('/messages/<username>/block')
@required
def block_from_messages(username):
    target = mongo.db.users.find_one({'username': username.strip().lower()}, {'_id':1})
    if not target:
        return {'error':'recipient_not_found'},404
    if target['_id'] == g.user['_id']:
        return {'error':'cannot_block_self'},400
    mongo.db.blocks.update_one(
        {'blocker_id':g.user['_id'],'blocked_id':target['_id']},
        {'$setOnInsert':{'blocker_id':g.user['_id'],'blocked_id':target['_id'],'created_at':datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {'ok':True}


@bp.delete('/messages/<username>/block')
@required
def unblock_from_messages(username):
    target = mongo.db.users.find_one({'username': username.strip().lower()}, {'_id':1})
    if not target:
        return {'error':'recipient_not_found'},404
    mongo.db.blocks.delete_one({'blocker_id':g.user['_id'],'blocked_id':target['_id']})
    return {'ok':True}


@bp.post('/messages/<username>/report')
@required
def report_message_thread(username):
    target = mongo.db.users.find_one({'username': username.strip().lower()}, {'_id':1,'username':1,'display_name':1})
    if not target:
        return {'error':'recipient_not_found'},404
    d=request.get_json() or {}
    reason=str(d.get('reason','')).strip()[:500]
    if not reason:
        return {'error':'reason_required'},400
    report={
        'reporter_id':g.user['_id'],'target_id':target['_id'],'target_type':'message_thread',
        'reason':reason,'details':str(d.get('details','')).strip()[:1500],
        'target_snapshot':{'username':target.get('username'),'display_name':target.get('display_name')},
        'status':'open','created_at':datetime.now(timezone.utc)
    }
    try:
        r=mongo.db.reports.insert_one(report); report['_id']=r.inserted_id
    except Exception:
        return {'error':'thread_already_reported'},409
    return {'ok':True,'report':doc(report)}
