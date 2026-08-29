from flask import Blueprint, request, g, Response, stream_with_context
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from base64 import urlsafe_b64decode, urlsafe_b64encode
import time, json, re
from app.services.reputation import add

from app.extensions import mongo
from app.utils.auth import required
from app.utils.serial import doc
from app.services.notifications import notify
from app.utils.rate_limit import limited

bp = Blueprint('community', __name__)

DEFAULT_CHANNELS = ('general', 'media', 'memes')


def encode_cursor(value):
    return urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).decode().rstrip('=')


def decode_cursor(value):
    if not value:
        return None
    try:
        return json.loads(urlsafe_b64decode(value + '=' * (-len(value) % 4)).decode())
    except Exception:
        return None


def oid(value):
    try:
        return ObjectId(value)
    except Exception:
        raise ValueError('invalid_id')


def is_staff(server, user_id):
    return server.get('owner_id') == user_id or user_id in server.get('admins', [])


def is_member(server, user_id):
    return user_id in server.get('members', [])

def is_banned(server,user_id):
    if user_id in server.get('banned',[]): return True
    now=datetime.now(timezone.utc)
    active=[]
    changed=False
    for item in server.get('banned_until',[]):
        try:
            until=item.get('until')
            if until and until>now: active.append(item)
            else: changed=True
        except Exception: changed=True
    if changed:mongo.db.servers.update_one({'_id':server['_id']},{'$set':{'banned_until':active}})
    return any(x.get('user_id')==user_id for x in active)


def is_timed_out(server, user_id):
    now = datetime.now(timezone.utc)
    changed = False
    active = []
    for item in server.get('timeouts', []):
        try:
            until = item.get('until')
            until = until if until and until.tzinfo else (until.replace(tzinfo=timezone.utc) if until else now)
            if until > now:
                active.append(item)
            else:
                changed = True
        except Exception:
            changed = True
    if changed:
        mongo.db.servers.update_one({'_id': server['_id']}, {'$set': {'timeouts': active}})
    return any(item.get('user_id') == user_id and item.get('until') and item['until'] > now for item in active)


def role_for(server, user_id):
    if server.get('owner_id') == user_id:
        return 'Owner'
    if user_id in server.get('admins', []):
        return 'Admin'
    return 'Member'


def ensure_default_channels(server_id):
    now = datetime.now(timezone.utc)
    existing = {x['name'] for x in mongo.db.channels.find({'server_id': server_id}, {'name': 1})}
    created = []
    for name in DEFAULT_CHANNELS:
        if name not in existing:
            c = {'server_id': server_id, 'name': name, 'kind': 'text', 'is_default': True, 'created_at': now}
            try:
                r = mongo.db.channels.insert_one(c)
                c['_id'] = r.inserted_id
                created.append(c)
            except Exception:
                pass
    return created


def public_server(server, user_id=None):
    result = doc(server)
    members = server.get('members', [])
    result['member_count'] = len(members)
    result['joined'] = bool(user_id and user_id in members)
    result['role'] = role_for(server, user_id) if user_id and user_id in members else None
    result['viewer_muted'] = bool(user_id and (user_id in server.get('muted', []) or any(x.get('user_id') == user_id and x.get('until') and x['until'] > datetime.now(timezone.utc) for x in server.get('muted_until', []))))
    result['viewer_timed_out'] = bool(user_id and is_timed_out(server, user_id))
    result.pop('banned', None)
    result.pop('muted', None)
    return result


def can_access_channel(channel, user_id):
    if not channel:
        return None
    server = mongo.db.servers.find_one({'_id': channel['server_id']})
    if not server or not is_member(server, user_id):
        return None
    if is_banned(server,user_id):
        return None
    if is_timed_out(server, user_id):
        return server, True
    if user_id in server.get('muted', []):
        return server, True
    active_muted=[x for x in server.get('muted_until', []) if x.get('until') and x['until'] > datetime.now(timezone.utc)]
    if len(active_muted) != len(server.get('muted_until', [])):
        mongo.db.servers.update_one({'_id':server['_id']},{'$set':{'muted_until':active_muted}})
    if any(x.get('user_id') == user_id for x in active_muted):
        return server, True
    return server, False


@bp.get('/servers')
def servers():
    user_id = None
    try:
        from app.utils.auth import current_user
        u = current_user()
        user_id = u['_id'] if u else None
    except Exception:
        pass

    mine = request.args.get('mine') == '1'
    query = {'members': user_id} if mine and user_id else {}

    limit = min(max(int(request.args.get('limit', 24) or 24), 1), 50)
    cursor = decode_cursor(request.args.get('cursor'))
    if cursor:
        try:
            created = datetime.fromisoformat(cursor['created_at'])
            cid = ObjectId(cursor['id'])
            query['$or'] = [
                {'created_at': {'$lt': created}},
                {'created_at': created, '_id': {'$lt': cid}}
            ]
        except Exception:
            pass

    rows = list(
        mongo.db.servers.find(query)
        .sort([('created_at', -1), ('_id', -1)])
        .limit(limit + 1)
    )
    has_more = len(rows) > limit
    rows = rows[:limit]

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = encode_cursor({
            'id': str(last['_id']),
            'created_at': last['created_at'].isoformat()
        })

    return {
        'servers': [public_server(x, user_id) for x in rows],
        'next_cursor': next_cursor,
        'has_more': has_more
    }


@bp.post('/servers')
@required
def create_server():
    d = request.get_json() or {}
    name = re.sub(r'\s+', ' ', str(d.get('name', '')).strip())[:60]
    description = str(d.get('description', '')).strip()[:500]
    if len(name) < 2:
        return {'error': 'server_name_required'}, 400

    now = datetime.now(timezone.utc)
    s = {
        'owner_id': g.user['_id'],
        'name': name,
        'description': description,
        'members': [g.user['_id']],
        'admins': [],
        'banned': [],
        'muted': [],
        'created_at': now,
        'updated_at': now,
    }
    r = mongo.db.servers.insert_one(s)
    s['_id'] = r.inserted_id
    ensure_default_channels(r.inserted_id)
    channels = list(mongo.db.channels.find({'server_id': r.inserted_id}).sort('created_at', 1))
    return {'server': public_server(s, g.user['_id']), 'channels': [doc(x) for x in channels]}, 201


@bp.post('/servers/<sid>/join')
@required
def join(sid):
    try:
        server_id = oid(sid)
    except ValueError:
        return {'error': 'invalid_server'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    if not s:
        return {'error': 'not_found'}, 404
    if is_banned(s,g.user['_id']):
        return {'error': 'banned'}, 403

    ensure_default_channels(server_id)
    mongo.db.servers.update_one({'_id': server_id}, {'$addToSet': {'members': g.user['_id'], 'muted': {'$each': []}}})
    updated = mongo.db.servers.find_one({'_id': server_id})
    add(g.user['_id'], 'community_join', 2, 'Joined a community')
    return {'ok': True, 'server': public_server(updated, g.user['_id'])}


@bp.post('/servers/<sid>/leave')
@required
def leave(sid):
    try:
        server_id = oid(sid)
    except ValueError:
        return {'error': 'invalid_server'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    if not s:
        return {'error': 'not_found'}, 404
    if s.get('owner_id') == g.user['_id']:
        return {'error': 'owner_cannot_leave'}, 400
    mongo.db.servers.update_one(
        {'_id': server_id},
        {'$pull': {'members': g.user['_id'], 'admins': g.user['_id'], 'muted': g.user['_id']}}
    )
    return {'ok': True}


@bp.get('/servers/<sid>')
@required
def server(sid):
    try:
        server_id = oid(sid)
    except ValueError:
        return {'error': 'invalid_server'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    if not s:
        return {'error': 'not_found'}, 404
    if not is_member(s, g.user['_id']):
        return {'error': 'membership_required'}, 403

    ensure_default_channels(server_id)
    channels = list(mongo.db.channels.find({'server_id': server_id}).sort([('is_default', -1), ('created_at', 1)]))
    return {'server': public_server(s, g.user['_id']), 'channels': [doc(x) for x in channels]}


@bp.get('/servers/<sid>/members')
@required
def members(sid):
    try:
        server_id = oid(sid)
    except ValueError:
        return {'error': 'invalid_server'}, 400
    s = mongo.db.servers.find_one({'_id': server_id}, {'members': 1, 'owner_id': 1, 'admins': 1, 'muted': 1, 'muted_until': 1, 'timeouts': 1})
    if not s:
        return {'error': 'not_found'}, 404
    if not is_member(s, g.user['_id']):
        return {'error': 'membership_required'}, 403

    return {'members': build_member_rows(s)}


def build_member_rows(server, users=None):
    ids = list(server.get('members', []))
    if users is None:
        users = list(mongo.db.users.find(
            {'_id': {'$in': ids}},
            {'password_hash': 0, 'email': 0}
        ))
    by_id = {u['_id']: u for u in users}
    now = datetime.now(timezone.utc)
    muted = set(server.get('muted', []))
    muted_until = {x.get('user_id'): x.get('until') for x in server.get('muted_until', []) if x.get('until') and x['until'] > now}
    timeouts = {x.get('user_id'): x.get('until') for x in server.get('timeouts', []) if x.get('until') and x['until'] > now}
    admins = set(server.get('admins', []))
    owner = server.get('owner_id')
    rows = []
    for uid in ids:
        u = by_id.get(uid)
        if not u:
            continue
        rows.append({
            **doc(u),
            'role': 'Owner' if uid == owner else ('Admin' if uid in admins else 'Member'),
            'muted': uid in muted or uid in muted_until,
            'muted_until': muted_until.get(uid),
            'timed_out': uid in timeouts,
            'timeout_until': timeouts.get(uid),
        })
    order = {'Owner': 0, 'Admin': 1, 'Member': 2}
    rows.sort(key=lambda x: (order.get(x['role'], 3), (x.get('display_name') or '').lower(), (x.get('username') or '').lower()))
    return rows


@bp.post('/servers/<sid>/channels')
@required
@limited('community_channel_create', 20, 3600)
def channel(sid):
    try:
        server_id = oid(sid)
    except ValueError:
        return {'error': 'invalid_server'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    if not s:
        return {'error': 'not_found'}, 404
    if not is_staff(s, g.user['_id']):
        return {'error': 'forbidden'}, 403

    name = re.sub(r'\s+', '-', str((request.get_json() or {}).get('name', '')).strip().lower())
    name = re.sub(r'[^a-z0-9_-]', '', name)[:40].strip('-_')
    if not name:
        return {'error': 'channel_name_required'}, 400
    if mongo.db.channels.find_one({'server_id': server_id, 'name': name}):
        return {'error': 'channel_exists'}, 409

    c = {'server_id': server_id, 'name': name, 'kind': 'text', 'is_default': False, 'created_at': datetime.now(timezone.utc)}
    r = mongo.db.channels.insert_one(c)
    c['_id'] = r.inserted_id
    return {'channel': doc(c)}, 201


@bp.delete('/servers/<sid>/channels/<cid>')
@required
def delete_channel(sid, cid):
    try:
        server_id, channel_id = oid(sid), oid(cid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    c = mongo.db.channels.find_one({'_id': channel_id, 'server_id': server_id})
    if not s or not c:
        return {'error': 'not_found'}, 404
    if not is_staff(s, g.user['_id']):
        return {'error': 'forbidden'}, 403
    if c.get('is_default') or c.get('name') in DEFAULT_CHANNELS:
        return {'error': 'default_channel_protected'}, 400

    mongo.db.channels.delete_one({'_id': channel_id})
    mongo.db.messages.delete_many({'channel_id': channel_id})
    return {'ok': True}


def can_moderate_target(server, actor_id, target_id):
    # Authorization is evaluated before target-specific errors so a normal
    # member cannot use the endpoint to probe or act on staff targets.
    if not is_staff(server, actor_id):
        return False, 'forbidden'
    if target_id == server.get('owner_id'):
        return False, 'cannot_moderate_owner'
    if target_id not in server.get('members', []):
        return False, 'not_a_member'
    actor_owner = actor_id == server.get('owner_id')
    target_admin = target_id in server.get('admins', [])
    if not actor_owner and target_admin:
        return False, 'admins_can_only_moderate_members'
    return True, None


def _change_member_role(sid, uid, role):
    try:
        server_id, target = oid(sid), oid(uid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    if not s:
        return {'error': 'not_found'}, 404
    # Role changes are deliberately owner-only. Admins can moderate members,
    # but cannot silently escalate/de-escalate another administrator.
    if s.get('owner_id') != g.user['_id']:
        return {'error': 'only_owner_can_change_roles'}, 403
    if target == s.get('owner_id'):
        return {'error': 'cannot_change_owner_role'}, 400
    if target not in s.get('members', []):
        return {'error': 'not_a_member'}, 400
    currently_admin = target in s.get('admins', [])
    if role == 'Admin' and currently_admin:
        return {'error': 'already_admin'}, 409
    if role == 'Member' and not currently_admin:
        return {'error': 'already_member'}, 409
    update = {'$addToSet': {'admins': target}} if role == 'Admin' else {'$pull': {'admins': target}}
    mongo.db.servers.update_one({'_id': server_id}, update)
    action = 'PROMOTE_ADMIN' if role == 'Admin' else 'DEMOTE_ADMIN'
    mongo.db.server_moderation_logs.insert_one({'server_id':server_id,'actor_id':g.user['_id'],'target_id':target,'action':action,'reason':'Role changed by server owner','duration_minutes':None,'created_at':datetime.now(timezone.utc)})
    label = 'promoted you to admin' if role == 'Admin' else 'demoted you to member'
    notify(target,'server_role',f'You were {label} in {s["name"]}',entity_type='server',entity_id=server_id,route={'kind':'server','server_id':str(server_id)})
    return {'ok': True, 'role': role}


@bp.post('/servers/<sid>/members/<uid>/promote')
@required
@limited('community_role_change', 30, 3600)
def promote(sid, uid):
    return _change_member_role(sid, uid, 'Admin')


@bp.post('/servers/<sid>/members/<uid>/demote')
@required
@limited('community_role_change', 30, 3600)
def demote(sid, uid):
    return _change_member_role(sid, uid, 'Member')


@bp.post('/servers/<sid>/members/<uid>/role')
@required
def set_member_role(sid, uid):
    role = (request.get_json() or {}).get('role')
    if role not in ('Admin', 'Member'):
        return {'error':'invalid_role'},400
    return _change_member_role(sid, uid, role)


@limited('community_moderation', 60, 60)
def moderate_member(sid, action):
    try:
        server_id = oid(sid)
    except ValueError:
        return {'error': 'invalid_server'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    if not s:
        return {'error': 'not_found'}, 404

    d = request.get_json() or {}
    try:
        target = oid(d.get('user_id', ''))
    except ValueError:
        return {'error': 'invalid_user'}, 400

    now = datetime.now(timezone.utc)
    if action == 'ban' and (
        target in s.get('banned', []) or
        any(x.get('user_id') == target and x.get('until') and x['until'] > now for x in s.get('banned_until', []))
    ):
        if not is_staff(s, g.user['_id']):
            return {'error': 'forbidden'}, 403
        return {'error': 'already_banned'}, 409

    allowed, error = can_moderate_target(s, g.user['_id'], target)
    if not allowed:
        status = 403 if error in ('forbidden', 'admins_can_only_moderate_members') else 400
        return {'error': error}, status

    reason = str(d.get('reason', '')).strip()[:500]
    try:
        duration = int(d.get('duration_minutes', d.get('minutes', 0)) or 0)
    except (TypeError, ValueError):
        return {'error': 'invalid_duration'}, 400
    duration = max(0, min(duration, 43200))

    is_currently_muted = target in s.get('muted', []) or any(
        x.get('user_id') == target and x.get('until') and x['until'] > now
        for x in s.get('muted_until', [])
    )
    is_currently_timed_out = any(
        x.get('user_id') == target and x.get('until') and x['until'] > now
        for x in s.get('timeouts', [])
    )

    if action == 'kick':
        update = {'$pull': {'members': target, 'admins': target, 'muted': target, 'muted_until': {'user_id': target}, 'timeouts': {'user_id': target}}}
        audit_action = 'KICK'
    elif action == 'ban':
        pull = {'members': target, 'admins': target, 'muted': target, 'muted_until': {'user_id': target}, 'timeouts': {'user_id': target}}
        if duration:
            update = {'$pull': {**pull, 'banned_until': {'user_id': target}}, '$addToSet': {'banned_until': {'user_id': target, 'until': now + timedelta(minutes=duration)}}}
        else:
            update = {'$pull': pull, '$addToSet': {'banned': target}}
        audit_action = 'BAN'
    elif action == 'mute':
        if is_currently_muted:
            return {'error': 'already_muted'}, 409
        if duration:
            update = {'$pull': {'muted': target, 'muted_until': {'user_id': target}}, '$addToSet': {'muted_until': {'user_id': target, 'until': now + timedelta(minutes=duration)}}}
        else:
            update = {'$addToSet': {'muted': target}, '$pull': {'muted_until': {'user_id': target}}}
        audit_action = 'MUTE'
    elif action == 'unmute':
        if not is_currently_muted:
            return {'error': 'not_muted'}, 409
        update = {'$pull': {'muted': target, 'muted_until': {'user_id': target}}}
        audit_action = 'UNMUTE'
    elif action == 'timeout':
        if is_currently_timed_out:
            return {'error': 'already_timed_out'}, 409
        try:
            minutes = max(1, min(int(d.get('minutes', 10)), 10080))
        except (TypeError, ValueError):
            return {'error': 'invalid_duration'}, 400
        duration = minutes
        update = {'$pull': {'muted': target}, '$addToSet': {'timeouts': {'user_id': target, 'until': now + timedelta(minutes=minutes)}}}
        audit_action = 'TIMEOUT'
    elif action == 'untimeout':
        if not is_currently_timed_out:
            return {'error': 'not_timed_out'}, 409
        update = {'$pull': {'timeouts': {'user_id': target}}}
        audit_action = 'REMOVE_TIMEOUT'
    else:
        return {'error': 'invalid_action'}, 400

    mongo.db.servers.update_one({'_id': server_id}, update)
    log = {
        'server_id': server_id,
        'actor_id': g.user['_id'],
        'target_id': target,
        'action': audit_action,
        'reason': reason,
        'duration_minutes': duration or None,
        'created_at': now,
    }
    mongo.db.server_moderation_logs.insert_one(log)
    label = {
        'KICK': 'kicked', 'BAN': 'banned', 'MUTE': 'muted', 'UNMUTE': 'unmuted',
        'TIMEOUT': 'timed out', 'REMOVE_TIMEOUT': 'had their timeout removed',
    }[audit_action]
    notify(
        target, 'server_moderation', f'You were {label} in {s["name"]}', reason,
        entity_type='server', entity_id=server_id,
        route={'kind': 'server', 'server_id': str(server_id)}
    )
    return {'ok': True, 'action': audit_action}


@bp.post('/servers/<sid>/kick')
@required
def kick(sid):
    return moderate_member(sid, 'kick')


@bp.post('/servers/<sid>/ban')
@required
def ban(sid):
    return moderate_member(sid, 'ban')


@bp.post('/servers/<sid>/mute')
@required
def mute(sid):
    return moderate_member(sid, 'mute')


@bp.post('/servers/<sid>/unmute')
@required
def unmute(sid):
    return moderate_member(sid, 'unmute')


@bp.post('/servers/<sid>/timeout')
@required
def timeout(sid):
    return moderate_member(sid, 'timeout')


@bp.post('/servers/<sid>/untimeout')
@required
def untimeout(sid):
    return moderate_member(sid, 'untimeout')


@bp.post('/servers/<sid>/unban')
@required
@limited('community_moderation', 60, 60)
def unban(sid):
    try:
        server_id = oid(sid)
        target = oid((request.get_json() or {}).get('user_id', ''))
    except ValueError:
        return {'error': 'invalid_id'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    if not s:
        return {'error': 'not_found'}, 404
    if not is_staff(s, g.user['_id']):
        return {'error': 'forbidden'}, 403
    mongo.db.servers.update_one({'_id': server_id}, {'$pull': {'banned': target, 'banned_until': {'user_id': target}}})
    reason=str((request.get_json() or {}).get('reason','')).strip()[:500]
    mongo.db.server_moderation_logs.insert_one({'server_id':server_id,'actor_id':g.user['_id'],'target_id':target,'action':'UNBAN','reason':reason,'duration_minutes':None,'created_at':datetime.now(timezone.utc)})
    notify(target,'server_moderation',f'You were unbanned from {s["name"]}',reason,entity_type='server',entity_id=server_id,route={'kind':'server','server_id':str(server_id)})
    return {'ok': True}


@bp.get('/channels/<cid>/messages')
@required
def messages(cid):
    try:
        channel_id = oid(cid)
    except ValueError:
        return {'error': 'invalid_channel'}, 400
    c = mongo.db.channels.find_one({'_id': channel_id})
    access = can_access_channel(c, g.user['_id'])
    if not access:
        return {'error': 'membership_required'}, 403

    limit = min(max(int(request.args.get('limit', 80)), 1), 100)
    rows = list(mongo.db.messages.find({'channel_id': channel_id}).sort([('created_at', -1), ('_id', -1)]).limit(limit))
    rows.reverse()
    return {'messages': [doc(x) for x in rows]}


@bp.post('/channels/<cid>/messages')
@required
@limited('community_message_send', 60, 60)
def send(cid):
    try:
        channel_id = oid(cid)
    except ValueError:
        return {'error': 'invalid_channel'}, 400
    c = mongo.db.channels.find_one({'_id': channel_id})
    access = can_access_channel(c, g.user['_id'])
    if not access:
        return {'error': 'membership_required'}, 403
    server, muted = access
    if muted:
        return {'error': 'member_muted'}, 403

    body = (request.get_json() or {}).get('body', '').strip()
    if not body:
        return {'error': 'message_required'}, 400
    if len(body) > 4000:
        return {'error': 'message_too_long'}, 400

    now = datetime.now(timezone.utc)
    x = {
        'channel_id': channel_id,
        'server_id': server['_id'],
        'author_id': g.user['_id'],
        'author_username': g.user['username'],
        'author_name': g.user['display_name'],
        'body': body,
        'created_at': now
    }
    r = mongo.db.messages.insert_one(x)
    add(g.user['_id'], 'community_message', 1, 'Community message')
    return {'message': doc({**x, '_id': r.inserted_id})}, 201


@bp.patch('/channels/<cid>/messages/<mid>')
@required
def edit_message(cid, mid):
    try:
        channel_id, message_id = oid(cid), oid(mid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    m = mongo.db.messages.find_one({'_id': message_id, 'channel_id': channel_id})
    c = mongo.db.channels.find_one({'_id': channel_id})
    access = can_access_channel(c, g.user['_id'])
    if not m or not access:
        return {'error': 'not_found'}, 404
    if m['author_id'] != g.user['_id']:
        return {'error': 'forbidden'}, 403
    body = (request.get_json() or {}).get('body', '').strip()
    if not body:
        return {'error': 'message_required'}, 400
    mongo.db.messages.update_one({'_id': m['_id']}, {'$set': {'body': body, 'edited_at': datetime.now(timezone.utc)}})
    return {'message': doc(mongo.db.messages.find_one({'_id': m['_id']}))}


@bp.delete('/channels/<cid>/messages/<mid>')
@required
def delete_message(cid, mid):
    try:
        channel_id, message_id = oid(cid), oid(mid)
    except ValueError:
        return {'error': 'invalid_id'}, 400
    m = mongo.db.messages.find_one({'_id': message_id, 'channel_id': channel_id})
    c = mongo.db.channels.find_one({'_id': channel_id})
    access = can_access_channel(c, g.user['_id'])
    if not m or not access:
        return {'error': 'not_found'}, 404
    server, _ = access
    if m['author_id'] != g.user['_id'] and not is_staff(server, g.user['_id']):
        return {'error': 'forbidden'}, 403
    mongo.db.messages.delete_one({'_id': m['_id']})
    return {'ok': True}


@bp.get('/channels/<cid>/stream')
def stream(cid):
    token = request.args.get('access_token', '')
    if not token:
        return {'error': 'authentication_required'}, 401
    # Reuse JWT validation through a temporary Authorization header.
    from app.utils.auth import current_user
    original = request.headers.get('Authorization')
    try:
        request.headers.environ['HTTP_AUTHORIZATION'] = f'Bearer {token}'
        user = current_user()
    finally:
        if original is None:
            request.headers.environ.pop('HTTP_AUTHORIZATION', None)
        else:
            request.headers.environ['HTTP_AUTHORIZATION'] = original
    if not user:
        return {'error': 'authentication_required'}, 401

    try:
        channel_id = oid(cid)
    except ValueError:
        return {'error': 'invalid_channel'}, 400
    c = mongo.db.channels.find_one({'_id': channel_id})
    access = can_access_channel(c, user['_id'])
    if not access:
        return {'error': 'membership_required'}, 403

    def gen():
        last = datetime.now(timezone.utc)
        idle = 0
        while idle < 300:
            rows = list(mongo.db.messages.find(
                {'channel_id': channel_id, 'created_at': {'$gt': last}}
            ).sort('created_at', 1))
            if rows:
                last = rows[-1]['created_at']
                idle = 0
                for m in rows:
                    yield f"data: {json.dumps(doc(m))}\n\n"
            else:
                idle += 1
                yield ": ping\n\n"
            time.sleep(1)

    return Response(
        stream_with_context(gen()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive'}
    )


@bp.get('/servers/<sid>/moderation/members')
@required
def moderation_members(sid):
    try:
        server_id = oid(sid)
    except ValueError:
        return {'error': 'invalid_server'}, 400
    s = mongo.db.servers.find_one({'_id': server_id})
    if not s:
        return {'error': 'not_found'}, 404
    if not is_staff(s, g.user['_id']):
        return {'error': 'forbidden'}, 403

    q = str(request.args.get('q', '')).strip()[:80]
    role = str(request.args.get('role', '')).strip().title()
    try:
        page = max(1, int(request.args.get('page', 1)))
        limit = min(100, max(10, int(request.args.get('limit', 50))))
    except (TypeError, ValueError):
        return {'error': 'invalid_pagination'}, 400

    ids = list(s.get('members', []))
    if role in ('Owner', 'Admin', 'Member'):
        if role == 'Owner': ids = [s.get('owner_id')] if s.get('owner_id') in ids else []
        elif role == 'Admin': ids = [uid for uid in ids if uid in s.get('admins', [])]
        else: ids = [uid for uid in ids if uid != s.get('owner_id') and uid not in s.get('admins', [])]

    user_query = {'_id': {'$in': ids}}
    if q:
        rx = {'$regex': re.escape(q), '$options': 'i'}
        user_query['$or'] = [{'username': rx}, {'display_name': rx}]
    users = list(mongo.db.users.find(user_query, {'password_hash': 0, 'email': 0}).sort([('display_name', 1), ('username', 1)]))
    rows = build_member_rows(s, users)
    total = len(rows)
    start_idx = (page - 1) * limit
    rows = rows[start_idx:start_idx + limit]
    return {
        'members': rows,
        'total': total,
        'page': page,
        'limit': limit,
        'pages': max(1, (total + limit - 1) // limit),
        'server': public_server(s, g.user['_id']),
    }

@bp.get('/servers/<sid>/moderation/audit')
@required
def moderation_audit(sid):
    try:server_id=oid(sid)
    except ValueError:return {'error':'invalid_server'},400
    s=mongo.db.servers.find_one({'_id':server_id})
    if not s:return {'error':'not_found'},404
    if not is_staff(s,g.user['_id']):return {'error':'forbidden'},403
    rows=list(mongo.db.server_moderation_logs.find({'server_id':server_id}).sort([('created_at',-1),('_id',-1)]).limit(200))
    ids={x for r in rows for x in (r.get('actor_id'),r.get('target_id')) if x}
    users={u['_id']:u for u in mongo.db.users.find({'_id':{'$in':list(ids)}},{'username':1,'display_name':1})}
    for r in rows:
        r['actor']=doc(users.get(r.get('actor_id'))) if users.get(r.get('actor_id')) else None
        r['target']=doc(users.get(r.get('target_id'))) if users.get(r.get('target_id')) else None
    return {'audit':[doc(x) for x in rows]}
