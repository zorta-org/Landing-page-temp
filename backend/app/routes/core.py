from base64 import urlsafe_b64decode, urlsafe_b64encode
import json
from flask import Blueprint, request, g, send_from_directory, current_app
from bson import ObjectId
from pymongo.collection import ReturnDocument
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from werkzeug.utils import secure_filename
from app.extensions import mongo
from app.utils.auth import required, current_user
from app.utils.serial import doc
from app.services.reputation import add
from app.services.notifications import notify
import re

bp = Blueprint('core', __name__)


def oid(x):
    return ObjectId(x)


def encode_cursor(value):
    return urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).decode().rstrip('=')


def decode_cursor(value):
    if not value:
        return None
    try:
        return json.loads(urlsafe_b64decode(value + '=' * (-len(value) % 4)).decode())
    except Exception:
        return None


def _post_projection():
    return {'author_id': 1, 'author_username': 1, 'author_name': 1, 'author_avatar': 1, 'type': 1, 'title': 1, 'body': 1, 'tags': 1, 'workspace_id': 1, 'score': 1, 'comments_count': 1, 'created_at': 1, 'updated_at': 1, 'images': 1}


@bp.get('/feed')
def feed():
    sort = request.args.get('sort', 'new')
    q = request.args.get('q', '').strip()
    limit = min(max(int(request.args.get('limit', 25)), 1), 50)
    cursor = decode_cursor(request.args.get('cursor'))
    filters = {}
    if q:
        filters = {'$text': {'$search': q}}
    if cursor:
        if sort in ('top', 'trending'):
            score = float(cursor.get('score', 0)); cid = oid(cursor['id'])
            filters['$or'] = [{'score': {'$lt': score}}, {'score': score, '_id': {'$lt': cid}}]
        else:
            created = datetime.fromisoformat(cursor['created_at']); cid = oid(cursor['id'])
            filters['$or'] = [{'created_at': {'$lt': created}}, {'created_at': created, '_id': {'$lt': cid}}]
    ordering = [('score', -1), ('_id', -1)] if sort in ('top', 'trending') else [('created_at', -1), ('_id', -1)]
    raw_posts = list(mongo.db.posts.find(filters, _post_projection()).sort(ordering).limit(limit + 1))
    has_more = len(raw_posts) > limit
    raw_posts = raw_posts[:limit]

    user = current_user()
    user_votes, saved_ids = {}, set()
    if user and raw_posts:
        ids = [p['_id'] for p in raw_posts]
        for v in mongo.db.votes.find({'target_id': {'$in': ids}, 'user_id': user['_id'], 'target_type': 'post'}, {'target_id': 1, 'value': 1}):
            user_votes[v['target_id']] = v['value']
        saved_ids = {s['target_id'] for s in mongo.db.saves.find({'target_id': {'$in': ids}, 'user_id': user['_id'], 'target_type': 'post'}, {'target_id': 1})}

    posts = []
    for raw in raw_posts:
        p = doc(raw)
        p['my_vote'] = user_votes.get(raw['_id'], 0)
        p['saved'] = raw['_id'] in saved_ids
        posts.append(p)
    next_cursor = None
    if has_more and raw_posts:
        last = raw_posts[-1]
        next_cursor = encode_cursor({'id': str(last['_id']), 'score': last.get('score', 0), 'created_at': last['created_at'].isoformat()})
    return {'posts': posts, 'next_cursor': next_cursor, 'has_more': has_more}


@bp.post('/posts')
@required
def create_post():
    d = request.get_json() or {}; title = d.get('title', '').strip(); body = d.get('body', '').strip()
    if not title and not body: return {'error': 'post_content_required'}, 400
    now = datetime.now(timezone.utc)
    raw_tags=d.get('tags', [])
    if isinstance(raw_tags,str):
        raw_tags=re.split(r'[,\\n]+',raw_tags)
    tags=[]
    for tag in raw_tags if isinstance(raw_tags,list) else []:
        clean=re.sub(r'[^A-Za-z0-9_-]','',str(tag).strip().lstrip('#'))[:32]
        if clean and clean.lower() not in {x.lower() for x in tags}:
            tags.append(clean)
    tags=tags[:8]
    p = {'author_id': g.user['_id'], 'author_username': g.user['username'], 'author_name': g.user['display_name'], 'author_avatar': g.user.get('avatar', ''), 'type': d.get('type', 'discussion'), 'title': title, 'body': body, 'tags': tags, 'workspace_id': oid(d['workspace_id']) if d.get('workspace_id') else None, 'images': [str(x) for x in (d.get('images') or [])[:4]], 'score': 0, 'comments_count': 0, 'created_at': now, 'updated_at': now}
    r = mongo.db.posts.insert_one(p); add(g.user['_id'], 'post')
    return {'post': doc({**p, '_id': r.inserted_id})}, 201


@bp.get('/posts/<pid>')
def post(pid):
    post_id = oid(pid)
    p = mongo.db.posts.find_one({'_id': post_id}, _post_projection())
    if not p:
        return {'error': 'not_found'}, 404

    result = doc(p)
    user = current_user()
    result['my_vote'] = 0
    result['saved'] = False

    if user:
        v = mongo.db.votes.find_one(
            {'target_id': post_id, 'user_id': user['_id'], 'target_type': 'post'},
            {'value': 1}
        )
        s = mongo.db.saves.find_one(
            {'target_id': post_id, 'user_id': user['_id'], 'target_type': 'post'},
            {'_id': 1}
        )
        result['my_vote'] = v.get('value', 0) if v else 0
        result['saved'] = bool(s)

    return {'post': result}


@bp.patch('/posts/<pid>')
@required
def edit_post(pid):
    p = mongo.db.posts.find_one({'_id': oid(pid)})
    if not p: return {'error': 'not_found'}, 404
    if p['author_id'] != g.user['_id']: return {'error': 'forbidden'}, 403
    d = request.get_json() or {}; changes = {k: d[k] for k in ['title', 'body', 'tags', 'type'] if k in d}; changes['updated_at'] = datetime.now(timezone.utc)
    mongo.db.posts.update_one({'_id': oid(pid)}, {'$set': changes})
    return {'post': doc(mongo.db.posts.find_one({'_id': oid(pid)}, _post_projection()))}


@bp.delete('/posts/<pid>')
@required
def delete_post(pid):
    p = mongo.db.posts.find_one({'_id': oid(pid)})
    if not p: return {'error': 'not_found'}, 404
    if p['author_id'] != g.user['_id']: return {'error': 'forbidden'}, 403
    mongo.db.posts.delete_one({'_id': oid(pid)}); mongo.db.comments.delete_many({'post_id': oid(pid)}); mongo.db.votes.delete_many({'target_id': oid(pid), 'target_type': 'post'}); mongo.db.saves.delete_many({'target_id': oid(pid), 'target_type': 'post'}); return {'ok': True}


@bp.post('/posts/<pid>/vote')
@required
def vote(pid):
    post_id = oid(pid); value = 1 if int((request.get_json() or {}).get('value', 1)) > 0 else -1
    key = {'target_id': post_id, 'user_id': g.user['_id'], 'target_type': 'post'}
    old = mongo.db.votes.find_one(key, {'value': 1})
    if old and old['value'] == value:
        mongo.db.votes.delete_one(key); delta = -value; my = 0
    elif old:
        mongo.db.votes.update_one(key, {'$set': {'value': value}}); delta = value - old['value']; my = value
    else:
        try:
            mongo.db.votes.insert_one({**key, 'value': value}); delta = value; my = value
        except Exception:
            # Concurrent duplicate click: read the winning value and return it.
            current = mongo.db.votes.find_one(key, {'value': 1}); my = current['value'] if current else 0; delta = 0
    p = mongo.db.posts.find_one_and_update({'_id': post_id}, {'$inc': {'score': delta}}, return_document=ReturnDocument.AFTER)
    score = p.get('score', 0) if p else 0
    if my == 1 and p and p['author_id'] != g.user['_id']:
        add(p['author_id'], 'upvote_received', 3); notify(p['author_id'], 'upvote', f'{g.user["display_name"]} upvoted your post', link='/post/' + pid, entity_type='post', entity_id=p['_id'], route={'kind':'post','post_id':pid})
    return {'score': score, 'my_vote': my}


@bp.get('/posts/<pid>/comments')
def comments(pid):
    post_id = oid(pid); limit = min(max(int(request.args.get('limit', 30)), 1), 100); cursor = decode_cursor(request.args.get('cursor'))
    f = {'post_id': post_id}
    if cursor:
        created = datetime.fromisoformat(cursor['created_at']); cid = oid(cursor['id'])
        f['$or'] = [{'created_at': {'$gt': created}}, {'created_at': created, '_id': {'$gt': cid}}]
    rows = list(
        mongo.db.comments.find(f)
        .sort([('created_at', 1), ('_id', 1)])
        .limit(limit + 1)
    )
    more = len(rows) > limit
    rows = rows[:limit]

    user = current_user()
    user_votes = {}
    if user and rows:
        ids = [x['_id'] for x in rows]
        for v in mongo.db.votes.find(
            {
                'target_id': {'$in': ids},
                'user_id': user['_id'],
                'target_type': 'comment'
            },
            {'target_id': 1, 'value': 1}
        ):
            user_votes[v['target_id']] = v.get('value', 0)

    result = []
    for row in rows:
        item = doc(row)
        item['my_vote'] = user_votes.get(row['_id'], 0)
        result.append(item)

    next_cursor = encode_cursor({
        'created_at': rows[-1]['created_at'].isoformat(),
        'id': str(rows[-1]['_id'])
    }) if more and rows else None

    return {
        'comments': result,
        'next_cursor': next_cursor,
        'has_more': more
    }


@bp.post('/posts/<pid>/comments')
@required
def create_comment(pid):
    d = request.get_json() or {}; body = d.get('body', '').strip()
    if not body: return {'error': 'comment_required'}, 400
    post_id = oid(pid); p = mongo.db.posts.find_one({'_id': post_id}, {'author_id': 1, 'title': 1})
    if not p: return {'error': 'not_found'}, 404
    parent = oid(d['parent_id']) if d.get('parent_id') else None
    if parent and not mongo.db.comments.find_one({'_id': parent, 'post_id': post_id}, {'_id': 1}): return {'error': 'invalid_parent'}, 400
    now = datetime.now(timezone.utc); c = {'post_id': post_id, 'author_id': g.user['_id'], 'author_username': g.user['username'], 'author_name': g.user['display_name'], 'author_avatar': g.user.get('avatar', ''), 'body': body, 'parent_id': parent, 'score': 0, 'created_at': now, 'updated_at': now}
    r = mongo.db.comments.insert_one(c); mongo.db.posts.update_one({'_id': post_id}, {'$inc': {'comments_count': 1}}); add(g.user['_id'], 'comment')
    if p['author_id'] != g.user['_id']: notify(p['author_id'], 'comment', f'{g.user["display_name"]} commented on your post', link='/post/' + pid, entity_type='post', entity_id=p['_id'], route={'kind':'post','post_id':pid})
    if parent:
        parent_doc = mongo.db.comments.find_one({'_id': parent}, {'author_id': 1})
        if parent_doc and parent_doc['author_id'] not in (g.user['_id'], p['author_id']): notify(parent_doc['author_id'], 'reply', f'{g.user["display_name"]} replied to your comment', link='/post/' + pid, entity_type='post', entity_id=p['_id'], route={'kind':'post','post_id':pid})
    return {'comment': doc({**c, '_id': r.inserted_id})}, 201


@bp.patch('/comments/<cid>')
@required
def edit_comment(cid):
    c = mongo.db.comments.find_one({'_id': oid(cid)})
    if not c: return {'error': 'not_found'}, 404
    if c['author_id'] != g.user['_id']: return {'error': 'forbidden'}, 403
    body = (request.get_json() or {}).get('body', '').strip()
    if not body: return {'error': 'comment_required'}, 400
    mongo.db.comments.update_one({'_id': c['_id']}, {'$set': {'body': body, 'updated_at': datetime.now(timezone.utc)}})
    return {'comment': doc(mongo.db.comments.find_one({'_id': c['_id']}))}


@bp.delete('/comments/<cid>')
@required
def delete_comment(cid):
    c = mongo.db.comments.find_one({'_id': oid(cid)})
    if not c: return {'error': 'not_found'}, 404
    if c['author_id'] != g.user['_id']: return {'error': 'forbidden'}, 403
    mongo.db.comments.delete_one({'_id': c['_id']}); mongo.db.votes.delete_many({'target_id': c['_id'], 'target_type': 'comment'}); mongo.db.comments.delete_many({'parent_id': c['_id']}); mongo.db.posts.update_one({'_id': c['post_id'], 'comments_count': {'$gt': 0}}, {'$inc': {'comments_count': -1}}); return {'ok': True}


@bp.post('/comments/<cid>/vote')
@required
def comment_vote(cid):
    comment_id = oid(cid); c = mongo.db.comments.find_one({'_id': comment_id}, {'author_id': 1})
    if not c: return {'error': 'not_found'}, 404
    value = 1 if int((request.get_json() or {}).get('value', 1)) > 0 else -1; key = {'target_id': comment_id, 'user_id': g.user['_id'], 'target_type': 'comment'}; old = mongo.db.votes.find_one(key, {'value': 1})
    if old and old['value'] == value: mongo.db.votes.delete_one(key); delta = -value; my = 0
    elif old: mongo.db.votes.update_one(key, {'$set': {'value': value}}); delta = value - old['value']; my = value
    else: mongo.db.votes.update_one(key, {'$set': {'value': value}}, upsert=True); delta = value; my = value
    updated = mongo.db.comments.find_one_and_update({'_id': comment_id}, {'$inc': {'score': delta}}, return_document=ReturnDocument.AFTER)
    return {'score': updated.get('score', 0) if updated else 0, 'my_vote': my}


@bp.post('/posts/<pid>/save')
@required
def save(pid):
    k = {'user_id': g.user['_id'], 'target_id': oid(pid), 'target_type': 'post'}; old = mongo.db.saves.find_one(k)
    if old: mongo.db.saves.delete_one(k); saved = False
    else: mongo.db.saves.update_one(k, {'$setOnInsert': k}, upsert=True); saved = True
    return {'saved': saved}




# =========================================================
# FORUM IMAGE UPLOADS
# =========================================================

_ALLOWED_IMAGE_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
}

@bp.post('/uploads/forum-image')
@required
def upload_forum_image():
    file = request.files.get('image')
    if not file or not file.filename:
        return {'error': 'image_required'}, 400

    if not file.mimetype or file.mimetype.lower() not in _ALLOWED_IMAGE_TYPES:
        return {'error': 'unsupported_image_type'}, 400

    file.stream.seek(0, 2)
    size = file.stream.tell()
    file.stream.seek(0)

    if size <= 0 or size > 5 * 1024 * 1024:
        return {'error': 'image_too_large'}, 400

    # Basic signature checks; do not trust only the browser MIME type.
    header = file.stream.read(16)
    file.stream.seek(0)

    signatures = {
        'image/jpeg': header.startswith(b'\xff\xd8\xff'),
        'image/png': header.startswith(b'\x89PNG\r\n\x1a\n'),
        'image/gif': header.startswith(b'GIF87a') or header.startswith(b'GIF89a'),
        'image/webp': header.startswith(b'RIFF') and header[8:12] == b'WEBP',
    }

    if not signatures.get(file.mimetype.lower(), False):
        return {'error': 'invalid_image'}, 400

    upload_dir = Path(current_app.root_path) / 'uploads' / 'forum'
    upload_dir.mkdir(parents=True, exist_ok=True)

    extension = _ALLOWED_IMAGE_TYPES[file.mimetype.lower()]
    filename = f'{uuid4().hex}{extension}'
    file.save(upload_dir / filename)

    return {
        'url': request.host_url.rstrip('/') + f'/api/media/forum/{filename}',
        'filename': filename
    }, 201


@bp.get('/media/forum/<path:filename>')
def forum_image(filename):
    upload_dir = Path(current_app.root_path) / 'uploads' / 'forum'
    safe_name = secure_filename(filename)

    if safe_name != filename:
        return {'error': 'not_found'}, 404

    return send_from_directory(upload_dir, safe_name)


@bp.post('/posts/<pid>/report')
@required
def report_post(pid):
    from app.routes.moderation import report as generic_report
    return generic_report('post', pid)



@bp.get('/users/search')
@required
def search_users():
    q = str(request.args.get('q', '')).strip().lower()
    if len(q) < 2:
        return {'users': []}
    limit = min(max(int(request.args.get('limit', 8) or 8), 1), 12)
    # Username prefix search first; display-name regex is deliberately bounded.
    rx = re.compile('^' + re.escape(q), re.I)
    rows = list(mongo.db.users.find(
        {'$or': [{'username': rx}, {'display_name': rx}],
         '_id': {'$ne': g.user['_id']},
         'deleted_at': {'$exists': False}},
        {'password_hash': 0, 'email': 0, 'bio': 0}
    ).sort([('username', 1)]).limit(limit))
    from app.services.messaging import can_message
    out = []
    for u in rows:
        allowed, reason, context = can_message(g.user['_id'], u['_id'])
        out.append({
            **doc(u),
            'messageable': bool(allowed),
            'message_reason': reason,
            'message_context': context
        })
    return {'users': out}

@bp.get('/users/<username>/follow')
@required
def follow_get(username):
    u = mongo.db.users.find_one({'username': username.lower()}, {'_id': 1}); return {'following': bool(u and mongo.db.followers.find_one({'follower_id': g.user['_id'], 'following_id': u['_id']}, {'_id': 1}))}


@bp.post('/users/<username>/follow')
@required
def follow(username):
    u = mongo.db.users.find_one({'username': username.lower()}, {'_id': 1, 'display_name': 1})
    if not u: return {'error': 'not_found'}, 404
    if u['_id'] == g.user['_id']: return {'error': 'cannot_follow_self'}, 400
    k = {'follower_id': g.user['_id'], 'following_id': u['_id']}; old = mongo.db.followers.find_one(k)
    if old:
        mongo.db.followers.delete_one(k)
        following = False
    else:
        mongo.db.followers.update_one(k, {'$setOnInsert': k}, upsert=True)
        following = True
        notify(u['_id'], 'new_follower', f'{g.user["display_name"]} followed you', entity_type='profile', entity_id=u['_id'], route={'kind':'profile','username':g.user['username']})
        reciprocal = mongo.db.followers.find_one({'follower_id':u['_id'],'following_id':g.user['_id']},{'_id':1})
        if reciprocal:
            notify(u['_id'], 'mutual_follow', 'You can now message each other', 'You both follow each other.', entity_type='profile', entity_id=g.user['_id'], route={'kind':'dm','username':g.user['username']})
            notify(g.user['_id'], 'mutual_follow', 'You can now message each other', f'@{u["username"]} follows you back.', entity_type='profile', entity_id=u['_id'], route={'kind':'dm','username':u['username']})
    return {'following': following}


def _user_summary_projection():
    return {'username': 1, 'display_name': 1, 'avatar': 1, 'reputation': 1, 'bio': 1}


def _paginated_follow_list(filter_field, pick_field, username):
    target = mongo.db.users.find_one({'username': username.lower()}, {'_id': 1})
    if not target: return {'error': 'not_found'}, 404
    limit = min(max(int(request.args.get('limit', 20)), 1), 50)
    cursor = decode_cursor(request.args.get('cursor'))
    filters = {filter_field: target['_id']}
    if cursor: filters['_id'] = {'$lt': oid(cursor['id'])}
    rows = list(mongo.db.followers.find(filters, {pick_field: 1}).sort('_id', -1).limit(limit + 1))
    has_more = len(rows) > limit
    rows = rows[:limit]
    ids = [r[pick_field] for r in rows]
    users_by_id = {u['_id']: u for u in mongo.db.users.find({'_id': {'$in': ids}}, _user_summary_projection())}
    viewer = current_user()
    viewer_following_ids = set()
    if viewer and ids:
        viewer_following_ids = {f['following_id'] for f in mongo.db.followers.find({'follower_id': viewer['_id'], 'following_id': {'$in': ids}}, {'following_id': 1})}
    items = []
    for r in rows:
        u = users_by_id.get(r[pick_field])
        if not u: continue
        item = doc(u); item['viewer_following'] = r[pick_field] in viewer_following_ids
        items.append(item)
    next_cursor = encode_cursor({'id': str(rows[-1]['_id'])}) if (has_more and rows) else None
    return {'users': items, 'next_cursor': next_cursor, 'has_more': has_more}


@bp.get('/users/<username>/block')
@required
def block_status(username):
    u=mongo.db.users.find_one({'username':username.lower()},{'_id':1})
    if not u:return {'error':'not_found'},404
    return {'blocked':bool(mongo.db.blocks.find_one({'blocker_id':g.user['_id'],'blocked_id':u['_id']},{'_id':1}))}

@bp.post('/users/<username>/block')
@required
def block_user(username):
    u=mongo.db.users.find_one({'username':username.lower()},{'_id':1})
    if not u:return {'error':'not_found'},404
    if u['_id']==g.user['_id']:return {'error':'cannot_block_self'},400
    now=datetime.now(timezone.utc)
    mongo.db.blocks.update_one({'blocker_id':g.user['_id'],'blocked_id':u['_id']},{'$setOnInsert':{'blocker_id':g.user['_id'],'blocked_id':u['_id'],'created_at':now}},upsert=True)
    mongo.db.followers.delete_many({'$or':[{'follower_id':g.user['_id'],'following_id':u['_id']},{'follower_id':u['_id'],'following_id':g.user['_id']}]})
    return {'blocked':True}

@bp.delete('/users/<username>/block')
@required
def unblock_user(username):
    u=mongo.db.users.find_one({'username':username.lower()},{'_id':1})
    if not u:return {'error':'not_found'},404
    mongo.db.blocks.delete_one({'blocker_id':g.user['_id'],'blocked_id':u['_id']})
    return {'blocked':False}

@bp.get('/users/<username>/followers')
def list_followers(username):
    return _paginated_follow_list('following_id', 'follower_id', username)


@bp.get('/users/<username>/following')
def list_following(username):
    return _paginated_follow_list('follower_id', 'following_id', username)
