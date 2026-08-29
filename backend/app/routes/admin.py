from flask import Blueprint, request, g
from bson import ObjectId
from datetime import datetime, timezone, timedelta
import re

from app.extensions import mongo
from app.utils.auth import admin_required
from app.utils.serial import doc

bp = Blueprint('admin', __name__)


def oid(value):
    try:
        return ObjectId(value)
    except Exception:
        raise ValueError('invalid_id')


@bp.get('/admin/overview')
@admin_required
def overview():
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)
    user_count = mongo.db.users.count_documents({})
    server_count = mongo.db.servers.count_documents({})
    report_count = mongo.db.reports.count_documents({'status': 'open'})

    active_ids = set()
    for collection, field in (('messages', 'author_id'), ('posts', 'author_id')):
        for row in mongo.db[collection].find(
            {'created_at': {'$gte': since}},
            {field: 1}
        ):
            if row.get(field):
                active_ids.add(str(row[field]))

    return {
        'stats': {
            'users': user_count,
            'servers': server_count,
            'active_users_24h': len(active_ids),
            'open_reports': report_count,
            'messages_24h': mongo.db.messages.count_documents({'created_at': {'$gte': since}}),
            'posts_24h': mongo.db.posts.count_documents({'created_at': {'$gte': since}}),
            'projects': mongo.db.workspaces.count_documents({}),
            'startups': mongo.db.startups.count_documents({}),
            'reports_7d': mongo.db.reports.count_documents({'created_at': {'$gte': now-timedelta(days=7)}}),
            'new_users_7d': mongo.db.users.count_documents({'created_at': {'$gte': now-timedelta(days=7)}}),
        }
    }


@bp.get('/admin/users')
@admin_required
def users():
    q = request.args.get('q', '').strip()
    page = max(int(request.args.get('page', 1)), 1)
    limit = min(max(int(request.args.get('limit', 25)), 1), 100)

    query = {}
    if q:
        query = {
            '$or': [
                {'username': {'$regex': re.escape(q), '$options': 'i'}},
                {'display_name': {'$regex': re.escape(q), '$options': 'i'}},
                {'email': {'$regex': re.escape(q), '$options': 'i'}},
            ]
        }

    total = mongo.db.users.count_documents(query)
    rows = mongo.db.users.find(query, {'password_hash': 0}).sort('created_at', -1).skip((page - 1) * limit).limit(limit)
    return {
        'users': [doc(x) for x in rows],
        'total': total,
        'page': page,
        'limit': limit,
        'pages': max((total + limit - 1) // limit, 1)
    }


@bp.post('/admin/users/<uid>/ban')
@admin_required
def ban_user(uid):
    try:
        user_id = oid(uid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    if user_id == g.user['_id']:
        return {'error': 'cannot_ban_self'}, 400
    u = mongo.db.users.find_one({'_id': user_id})
    if not u:
        return {'error': 'not_found'}, 404
    if u.get('platform_role') == 'admin':
        return {'error': 'cannot_ban_admin'}, 403
    reason = str((request.get_json() or {}).get('reason', 'Administrative action')).strip()[:300]
    now=datetime.now(timezone.utc)
    mongo.db.users.update_one(
        {'_id': user_id},
        {'$set': {'platform_banned': True, 'platform_ban_reason': reason, 'platform_banned_at': now}}
    )
    mongo.db.admin_activity.insert_one({'actor_id':g.user['_id'],'action':'ban_user','target_id':user_id,'reason':reason,'created_at':now})
    return {'ok': True}


@bp.post('/admin/users/<uid>/unban')
@admin_required
def unban_user(uid):
    try:
        user_id = oid(uid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    if not mongo.db.users.find_one({'_id': user_id}, {'_id': 1}):
        return {'error': 'not_found'}, 404
    now=datetime.now(timezone.utc)
    mongo.db.users.update_one(
        {'_id': user_id},
        {'$set': {'platform_banned': False}, '$unset': {'platform_ban_reason': '', 'platform_banned_at': ''}}
    )
    mongo.db.admin_activity.insert_one({'actor_id':g.user['_id'],'action':'unban_user','target_id':user_id,'created_at':now})
    return {'ok': True}


@bp.get('/admin/servers')
@admin_required
def admin_servers():
    rows = list(mongo.db.servers.find().sort('created_at', -1))
    owner_ids = list({x.get('owner_id') for x in rows if x.get('owner_id')})
    owners = {
        x['_id']: x for x in mongo.db.users.find(
            {'_id': {'$in': owner_ids}},
            {'display_name': 1, 'username': 1}
        )
    }
    result = []
    for s in rows:
        item = public = doc(s)
        item['member_count'] = len(s.get('members', []))
        owner = owners.get(s.get('owner_id'))
        item['owner'] = doc(owner) if owner else None
        result.append(item)
    return {'servers': result}


@bp.patch('/admin/servers/<sid>')
@admin_required
def edit_server(sid):
    try:
        server_id = oid(sid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    if not s:
        return {'error': 'not_found'}, 404
    d = request.get_json() or {}
    update = {}
    if 'name' in d:
        name = str(d['name']).strip()[:60]
        if len(name) < 2:
            return {'error': 'invalid_name'}, 400
        update['name'] = name
    if 'description' in d:
        update['description'] = str(d['description']).strip()[:500]
    if not update:
        return {'error': 'nothing_to_update'}, 400
    update['updated_at'] = datetime.now(timezone.utc)
    mongo.db.servers.update_one({'_id': server_id}, {'$set': update})
    return {'server': doc(mongo.db.servers.find_one({'_id': server_id}))}


@bp.delete('/admin/servers/<sid>')
@admin_required
def delete_server(sid):
    try:
        server_id = oid(sid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    if not mongo.db.servers.find_one({'_id': server_id}, {'_id': 1}):
        return {'error': 'not_found'}, 404
    channel_ids = [x['_id'] for x in mongo.db.channels.find({'server_id': server_id}, {'_id': 1})]
    mongo.db.messages.delete_many({'channel_id': {'$in': channel_ids}})
    mongo.db.channels.delete_many({'server_id': server_id})
    mongo.db.servers.delete_one({'_id': server_id})
    return {'ok': True}


@bp.get('/admin/reports')
@admin_required
def reports():
    status = request.args.get('status', 'open')
    query = {} if status == 'all' else {'status': status}
    rows = list(mongo.db.reports.find(query).sort('created_at', -1).limit(200))
    users = {
        x['_id']: x for x in mongo.db.users.find(
            {'_id': {'$in': [r.get('reporter_id') for r in rows if r.get('reporter_id')]}},
            {'display_name': 1, 'username': 1}
        )
    }
    result = []
    target_map = {
        'post': 'posts',
        'comment': 'comments',
        'message': 'messages',
        'message_thread': 'users',
        'message_thread': 'users',
        'workspace': 'workspaces',
        'profile': 'users',
    }
    for r in rows:
        item = doc(r)
        reporter = users.get(r.get('reporter_id'))
        item['reporter'] = doc(reporter) if reporter else None
        collection = target_map.get(r.get('target_type'))
        target = mongo.db[collection].find_one({'_id': r.get('target_id')}) if collection and r.get('target_id') else None
        if target:
            item['target'] = doc(target)
        elif r.get('target_snapshot'):
            item['target'] = r.get('target_snapshot')
        item['report_count_for_target'] = mongo.db.reports.count_documents({'target_id': r.get('target_id'), 'target_type': r.get('target_type')})
        item['reporters_count_for_target'] = len(mongo.db.reports.distinct('reporter_id', {'target_id': r.get('target_id'), 'target_type': r.get('target_type')}))
        result.append(item)
    return {'reports': result}


@bp.post('/admin/reports/<rid>/resolve')
@admin_required
def resolve_report(rid):
    try:
        report_id = oid(rid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    r = mongo.db.reports.find_one({'_id': report_id})
    if not r:
        return {'error': 'not_found'}, 404
    action = (request.get_json() or {}).get('action', 'dismiss')
    if action not in ('dismiss', 'remove_content', 'ban_user', 'warn_user'):
        return {'error': 'invalid_action'}, 400

    target_type = r.get('target_type')
    target_id = r.get('target_id')
    owner_id = None
    collection = {'post': 'posts', 'comment': 'comments', 'message': 'messages', 'profile': 'users', 'workspace': 'workspaces'}.get(target_type)

    if collection:
        target = mongo.db[collection].find_one({'_id': target_id})
        if target:
            owner_id = target.get('author_id') or (target.get('_id') if target_type in ('profile','message_thread') else None)
            if action == 'remove_content' and target_type != 'profile':
                mongo.db[collection].delete_one({'_id': target_id})
            elif action == 'ban_user' and owner_id:
                mongo.db.users.update_one({'_id': owner_id}, {'$set': {'platform_banned': True, 'platform_ban_reason': r.get('reason', 'Report action')}})
            elif action == 'warn_user' and owner_id:
                from app.services.notifications import notify
                notify(owner_id,'moderation','Moderation warning','A report concerning your activity was reviewed by an administrator.',entity_type=target_type,entity_id=target_id,route={'kind':'moderation'})

    mongo.db.reports.update_one(
        {'_id': report_id},
        {'$set': {
            'status': 'resolved',
            'action': action,
            'resolved_by': g.user['_id'],
            'resolved_at': datetime.now(timezone.utc)
        }}
    )
    return {'ok': True}



@bp.post('/admin/users/<uid>/credits')
@admin_required
def credit_user(uid):
    try:
        user_id = oid(uid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    u = mongo.db.users.find_one({'_id': user_id}, {'_id': 1, 'username': 1})
    if not u:
        return {'error': 'user_not_found'}, 404
    d = request.get_json() or {}
    try:
        amount = int(d.get('amount', 0))
    except (TypeError, ValueError):
        return {'error': 'invalid_amount'}, 400
    if amount <= 0 or amount > 1000000:
        return {'error': 'amount_must_be_between_1_and_1000000'}, 400
    reason = str(d.get('reason', 'Admin credit')).strip()[:200] or 'Admin credit'
    from app.services.credits import add
    add(user_id, amount, reason=reason)
    now = datetime.now(timezone.utc)
    mongo.db.admin_activity.insert_one({
        'actor_id': g.user['_id'],
        'action': 'credit_user',
        'target_id': user_id,
        'amount': amount,
        'reason': reason,
        'created_at': now
    })
    from app.services.notifications import notify
    notify(
        user_id,
        'credits_awarded',
        f'{amount:,} Zorta Coins added',
        reason,
        entity_type='credits',
        entity_id=user_id,
        route={'kind': 'rewards'}
    )
    return {'ok': True, 'amount': amount, 'reason': reason}

# ---------------------------------------------------------------------------
# User management / audit
# ---------------------------------------------------------------------------

@bp.get('/admin/users/<uid>')
@admin_required
def user_detail(uid):
    try: user_id = oid(uid)
    except ValueError: return {'error':'invalid_id'},400
    u=mongo.db.users.find_one({'_id':user_id},{'password_hash':0})
    if not u:return {'error':'not_found'},404
    recent=list(mongo.db.activity.find({'user_id':user_id}).sort([('created_at',-1),('_id',-1)]).limit(100))
    badges=list(mongo.db.user_badges.find({'user_id':user_id}).sort('awarded_at',-1))
    badge_ids=[b['badge_id'] for b in badges]
    defs={b['_id']:b for b in mongo.db.badge_definitions.find({'_id':{'$in':badge_ids}})} if badge_ids else {}
    from app.services.credits import balance
    return {'user':doc(u),'credit_balance':balance(user_id),'activity':[doc(x) for x in recent],'badges':[{'award':doc(x),'badge':doc(defs[x['badge_id']]) if defs.get(x['badge_id']) else None} for x in badges]}

@bp.patch('/admin/users/<uid>')
@admin_required
def edit_user(uid):
    try: user_id=oid(uid)
    except ValueError:return {'error':'invalid_id'},400
    u=mongo.db.users.find_one({'_id':user_id})
    if not u:return {'error':'not_found'},404
    d=request.get_json() or {}
    allowed=('display_name','bio','location','website','availability','pronouns','platform_role')
    changes={k:d[k] for k in allowed if k in d}
    if 'display_name' in changes:changes['display_name']=str(changes['display_name']).strip()[:80]
    if 'platform_role' in changes and changes['platform_role'] not in ('user','moderator','admin'):return {'error':'invalid_role'},400
    if not changes:return {'error':'nothing_to_update'},400
    changes['updated_at']=datetime.now(timezone.utc)
    mongo.db.users.update_one({'_id':user_id},{'$set':changes})
    mongo.db.admin_activity.insert_one({'actor_id':g.user['_id'],'action':'edit_user','target_id':user_id,'changes':changes,'created_at':datetime.now(timezone.utc)})
    return {'user':doc(mongo.db.users.find_one({'_id':user_id},{'password_hash':0}))}

@bp.post('/admin/users/<uid>/suspend')
@admin_required
def suspend_user(uid):
    try:user_id=oid(uid)
    except ValueError:return {'error':'invalid_id'},400
    if user_id==g.user['_id']:return {'error':'cannot_suspend_self'},400
    u=mongo.db.users.find_one({'_id':user_id})
    if not u:return {'error':'not_found'},404
    minutes=max(1,min(int((request.get_json() or {}).get('minutes',1440)),43200))
    reason=str((request.get_json() or {}).get('reason','Administrative action')).strip()[:300]
    until=datetime.now(timezone.utc)+timedelta(minutes=minutes)
    mongo.db.users.update_one({'_id':user_id},{'$set':{'suspended_until':until,'suspension_reason':reason}})
    mongo.db.admin_activity.insert_one({'actor_id':g.user['_id'],'action':'suspend_user','target_id':user_id,'reason':reason,'until':until,'created_at':datetime.now(timezone.utc)})
    return {'ok':True,'suspended_until':until}

@bp.post('/admin/users/<uid>/unsuspend')
@admin_required
def unsuspend_user(uid):
    try:user_id=oid(uid)
    except ValueError:return {'error':'invalid_id'},400
    mongo.db.users.update_one({'_id':user_id},{'$unset':{'suspended_until':'','suspension_reason':''}})
    return {'ok':True}

@bp.delete('/admin/users/<uid>')
@admin_required
def delete_user(uid):
    try:user_id=oid(uid)
    except ValueError:return {'error':'invalid_id'},400
    if user_id==g.user['_id']:return {'error':'cannot_delete_self'},400
    u=mongo.db.users.find_one({'_id':user_id})
    if not u:return {'error':'not_found'},404
    if u.get('platform_role')=='admin':return {'error':'cannot_delete_admin'},403
    now=datetime.now(timezone.utc)
    # Soft-delete to preserve referential integrity/history.
    mongo.db.users.update_one({'_id':user_id},{'$set':{'deleted_at':now,'display_name':'Deleted user','bio':'','avatar':'','cover':'','email':f'deleted-{user_id}@invalid.local'}})
    mongo.db.followers.delete_many({'$or':[{'follower_id':user_id},{'following_id':user_id}]})
    mongo.db.admin_activity.insert_one({'actor_id':g.user['_id'],'action':'delete_user','target_id':user_id,'created_at':now})
    return {'ok':True}

# ---------------------------------------------------------------------------
# Badge definitions and awards
# ---------------------------------------------------------------------------

def _badge_slug(value):
    return __import__('re').sub(r'[^a-z0-9]+','-',str(value).strip().lower()).strip('-')[:80]

@bp.get('/admin/badges')
@admin_required
def badge_list():
    defs=list(mongo.db.badge_definitions.find().sort([('active',-1),('name',1)]))
    return {'badges':[doc(x) for x in defs]}

@bp.post('/admin/badges')
@admin_required
def badge_create():
    d=request.get_json() or {}; name=str(d.get('name','')).strip()[:80]
    if not name:return {'error':'name_required'},400
    slug=_badge_slug(d.get('slug') or name)
    if not slug:return {'error':'slug_required'},400
    if mongo.db.badge_definitions.find_one({'slug':slug}):return {'error':'badge_exists'},409
    b={'slug':slug,'name':name,'icon':str(d.get('icon','BadgeCheck'))[:40],'description':str(d.get('description','')).strip()[:300],'criteria':d.get('criteria') or {},'active':bool(d.get('active',True)),'created_at':datetime.now(timezone.utc),'updated_at':datetime.now(timezone.utc),'created_by':g.user['_id']}
    r=mongo.db.badge_definitions.insert_one(b);b['_id']=r.inserted_id
    return {'badge':doc(b)},201

@bp.patch('/admin/badges/<bid>')
@admin_required
def badge_edit(bid):
    try:badge_id=oid(bid)
    except ValueError:return {'error':'invalid_id'},400
    d=request.get_json() or {}; changes={}
    for k in ('name','icon','description','criteria','active'):
        if k in d:changes[k]=d[k]
    if 'name' in changes:changes['name']=str(changes['name']).strip()[:80]
    if not changes:return {'error':'nothing_to_update'},400
    changes['updated_at']=datetime.now(timezone.utc)
    mongo.db.badge_definitions.update_one({'_id':badge_id},{'$set':changes})
    b=mongo.db.badge_definitions.find_one({'_id':badge_id})
    return {'badge':doc(b)} if b else ({'error':'not_found'},404)

@bp.delete('/admin/badges/<bid>')
@admin_required
def badge_delete(bid):
    try:badge_id=oid(bid)
    except ValueError:return {'error':'invalid_id'},400
    if not mongo.db.badge_definitions.find_one({'_id':badge_id},{'_id':1}):return {'error':'not_found'},404
    mongo.db.user_badges.delete_many({'badge_id':badge_id})
    mongo.db.badge_definitions.delete_one({'_id':badge_id})
    return {'ok':True}

@bp.post('/admin/users/<uid>/badges/<bid>')
@admin_required
def badge_award(uid,bid):
    try:user_id,badge_id=oid(uid),oid(bid)
    except ValueError:return {'error':'invalid_id'},400
    if not mongo.db.users.find_one({'_id':user_id},{'_id':1}):return {'error':'user_not_found'},404
    badge=mongo.db.badge_definitions.find_one({'_id':badge_id,'active':True})
    if not badge:return {'error':'badge_not_found'},404
    now=datetime.now(timezone.utc)
    r=mongo.db.user_badges.update_one({'user_id':user_id,'badge_id':badge_id},{'$setOnInsert':{'user_id':user_id,'badge_id':badge_id,'awarded_at':now,'awarded_by':g.user['_id']}},upsert=True)
    if r.upserted_id:
        from app.services.notifications import notify
        notify(user_id,'badge_awarded',f'Badge awarded: {badge["name"]}',badge.get('description',''),entity_type='badge',entity_id=badge_id,route={'kind':'profile','username':mongo.db.users.find_one({'_id':user_id},{'username':1}).get('username')})
    return {'ok':True,'awarded':bool(r.upserted_id)}

@bp.delete('/admin/users/<uid>/badges/<bid>')
@admin_required
def badge_revoke(uid,bid):
    try:user_id,badge_id=oid(uid),oid(bid)
    except ValueError:return {'error':'invalid_id'},400
    r=mongo.db.user_badges.delete_one({'user_id':user_id,'badge_id':badge_id})
    return {'ok':True,'revoked':bool(r.deleted_count)}

@bp.get('/admin/activity')
@admin_required
def admin_activity():
    q={}
    if request.args.get('target_id'):
        try:q['target_id']=oid(request.args['target_id'])
        except ValueError:return {'error':'invalid_id'},400
    rows=list(mongo.db.admin_activity.find(q).sort([('created_at',-1),('_id',-1)]).limit(200))
    return {'activity':[doc(x) for x in rows]}
