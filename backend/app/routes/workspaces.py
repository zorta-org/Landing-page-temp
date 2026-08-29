from flask import Blueprint, request, g
from bson import ObjectId
from datetime import datetime, timezone, timedelta
import re, requests, difflib, time
from collections import defaultdict, deque
from pymongo import ReturnDocument
from app.extensions import mongo
from app.utils.auth import required
from app.utils.serial import doc
from app.services.reputation import add
from app.services.notifications import notify

bp = Blueprint('workspaces', __name__)

# Lightweight per-process guard. It protects Mongo from bursts without adding a new dependency.
_RATE_BUCKETS=defaultdict(deque)
_RATE_LIMIT=60
_RATE_WINDOW=60
@bp.before_request
def _project_rate_limit():
    now=time.monotonic(); key=f"{request.remote_addr}:{request.endpoint or request.path}"; q=_RATE_BUCKETS[key]
    while q and now-q[0]>_RATE_WINDOW:q.popleft()
    if len(q)>=_RATE_LIMIT:return {'error':'rate_limited','retry_after':max(1,int(_RATE_WINDOW-(now-q[0])))} ,429
    q.append(now)

def oid(x):
    try:
        return ObjectId(x)
    except Exception:
        return None

GH_RE = re.compile(r'^(?:https?://github\.com/)?([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$')

def parse_repo(raw):
    m = GH_RE.match((raw or '').strip())
    return (m.group(1), m.group(2)) if m else (None, None)

def fetch_repo_snapshot(owner, name):
    try:
        r = requests.get(
            f'https://api.github.com/repos/{owner}/{name}',
            headers={'Accept': 'application/vnd.github+json'},
            timeout=6,
        )
    except requests.RequestException as e:
        return str(e), 502
    if r.status_code != 200:
        return r.text[:200], r.status_code
    j = r.json()
    now = datetime.now(timezone.utc).isoformat()
    return {
        'owner': owner, 'name': name, 'full_name': j.get('full_name'),
        'url': j.get('html_url'), 'description': j.get('description', ''),
        'language': j.get('language', ''), 'stars': j.get('stargazers_count', 0),
        'open_issues': j.get('open_issues_count', 0),
        'default_branch': j.get('default_branch', 'main'),
        'linked_at': now, 'fetched_at': now,
    }, 200

def clean_path(path):
    path = str(path or '').strip().replace('\\', '/')
    path = re.sub(r'/+', '/', path).lstrip('/')
    parts = [p for p in path.split('/') if p not in ('', '.')]
    if any(p == '..' for p in parts):
        return ''
    return '/'.join(parts)

def current_branch(d):
    return str(d.get('branch') or 'main').strip() or 'main'

def get_workspace(wid):
    ident = oid(wid)
    return mongo.db.workspaces.find_one({'_id': ident}) if ident else None

def is_owner(w):
    return bool(w and w.get('owner_id') == g.user['_id'])

def role_for(w, user_id):
    if not w:
        return None
    if w.get('owner_id') == user_id:
        return 'owner'
    c = mongo.db.collaborators.find_one({'workspace_id': w['_id'], 'user_id': user_id})
    return c.get('role') if c else None

def can_read(w, user_id=None):
    if not w:
        return False
    if user_id is not None and w.get('owner_id') == user_id:
        return True
    if w.get('visibility', 'public') == 'public':
        return True
    return role_for(w, user_id) is not None if user_id else False

def can_write(w):
    return role_for(w, g.user['_id']) in ('owner', 'contributor')

def can_manage(w):
    return role_for(w, g.user['_id']) == 'owner'

def diff_for(path, before, after):
    return ''.join(difflib.unified_diff(
        (before or '').splitlines(True),
        (after or '').splitlines(True),
        fromfile=f'a/{path}',
        tofile=f'b/{path}',
    ))

def make_commit(w, user, message, branch='main', files=None, parents=None):
    now = datetime.now(timezone.utc)
    commit = {
        'workspace_id': w['_id'],
        'message': (message or 'Update files').strip()[:200],
        'author_id': user['_id'],
        'author_username': user.get('username', 'builder'),
        'branch': branch,
        'files': files or [],
        'parents': parents or [],
        'created_at': now,
    }
    r = mongo.db.commits.insert_one(commit)
    commit['_id'] = r.inserted_id
    add(user['_id'], 'commit')
    return commit

def latest_commit(wid, branch='main'):
    return mongo.db.commits.find_one(
        {'workspace_id': wid, 'branch': branch},
        sort=[('created_at', -1), ('_id', -1)]
    )

def public_user(user_id):
    u = mongo.db.users.find_one({'_id': user_id}, {'username': 1, 'user_id': 1, 'display_name': 1, 'avatar': 1})
    return doc(u) if u else None

@bp.get('/workspaces')
@required
def list_ws():
    q = (request.args.get('q') or '').strip()
    sort = request.args.get('sort', 'latest')
    visibility = {'$or': [
        {'visibility': 'public'},
        {'owner_id': g.user['_id']},
        {'_id': {'$in': [x['workspace_id'] for x in mongo.db.collaborators.find({'user_id': g.user['_id']}, {'workspace_id': 1}).limit(200)]}}
    ]}
    if q:
        rx = re.compile(re.escape(q), re.I)
        visibility['$and'] = [{'$or': [{'name': rx}, {'description': rx}, {'language': rx}, {'tags': rx}]}]
    sort = request.args.get("sort", "latest")

    if sort == "popular":
        ordering = [("stars", -1), ("created_at", -1)]
    elif sort == "oldest":
        ordering = [("created_at", 1)]
    else:
        ordering = [("created_at", -1)]

    rows = list(
        mongo.db.workspaces
        .find(visibility)
        .sort(ordering)
        .limit(100)
    )
    ids=[w['_id'] for w in rows]
    cookie_counts={}
    for r in mongo.db.project_cookies.aggregate([{'$match':{'workspace_id':{'$in':ids}}},{'$group':{'_id':'$workspace_id','count':{'$sum':1}}}]):
        cookie_counts[r['_id']]=r['count']
    items=[]
    for w in rows:
        w.pop('owner_id',None); count=cookie_counts.get(w['_id'],0)
        w['cookies']=count;w['stars']=count
        items.append(doc(w))
    return {'workspaces': items}

@bp.get('/workspaces/search')
def search_ws():
    q = (request.args.get('q') or '').strip()
    if len(q) < 2:
        return {'workspaces': [], 'files': []}
    rx = re.compile(re.escape(q), re.I)
    ws = list(mongo.db.workspaces.find(
        {'visibility': 'public', '$or': [{'name': rx}, {'description': rx}, {'language': rx}, {'tags': rx}]},
        {'name': 1, 'description': 1, 'language': 1, 'visibility': 1, 'owner_username': 1}
    ).sort([('created_at', -1), ('_id', -1)]).limit(30))
    files = list(mongo.db.files.find(
        {'$or': [{'path': rx}, {'content': rx}]},
        {'workspace_id': 1, 'path': 1, 'branch': 1}
    ).limit(50))
    return {'workspaces': [doc(x) for x in ws], 'files': [doc(x) for x in files]}

@bp.post('/workspaces')
@required
def create():
    d = request.get_json() or {}
    name = str(d.get('name', '')).strip()
    if not name:
        return {'error': 'name_required'}, 400
    now = datetime.now(timezone.utc)
    w = {
        'owner_id': g.user['_id'], 'owner_username': g.user['username'],
        'name': name[:100], 'description': str(d.get('description', ''))[:2000],
        'visibility': d.get('visibility', 'public') if d.get('visibility') in ('public', 'private') else 'public',
        'language': str(d.get('language', ''))[:50], 'tags': list(d.get('tags', []))[:20],
        'stars': 0, 'forks': 0, 'watchers': 0, 'default_branch': 'main', 'open_for_collaborators': bool(d.get('open_for_collaborators')), 'hiring': bool(d.get('hiring')), 'tech_stack': list(d.get('tech_stack', []))[:20],
        'created_at': now,
    }
    r = mongo.db.workspaces.insert_one(w)
    make_commit({**w, '_id': r.inserted_id}, g.user, 'Initial commit', 'main', [])
    add(g.user['_id'], 'workspace')
    return {'workspace': doc({**w, '_id': r.inserted_id})}, 201

@bp.get('/workspaces/<wid>')
@required
def get(wid):
    w = get_workspace(wid)
    if not w:
        return {'error': 'not_found'}, 404
    if not can_read(w, getattr(g, 'user', {}).get('_id')):
        return {'error': 'forbidden'}, 403

    branches = [doc(x) for x in mongo.db.branches.find({'workspace_id': w['_id']}).sort('name', 1)]
    if not branches:
        branches = [{'name': 'main', 'protected': True, 'workspace_id': str(w['_id'])}]
    branch = request.args.get('branch') or w.get('default_branch', 'main')
    files = list(mongo.db.files.find(
        {'workspace_id': w['_id'], '$or': [{'branch': branch}, {'branch': {'$exists': False}}]},
        {'content': 0}
    ).sort('path', 1).limit(1000))
    commits = list(mongo.db.commits.find(
        {'workspace_id': w['_id'], 'branch': branch}
    ).sort([('created_at', -1), ('_id', -1)]).limit(50))
    issues = list(mongo.db.issues.find({'workspace_id': w['_id']}).sort([('created_at', -1), ('_id', -1)]).limit(50))
    prs = list(mongo.db.pull_requests.find({'workspace_id': w['_id']}).sort([('created_at', -1), ('_id', -1)]).limit(50))
    collaborators = list(mongo.db.collaborators.find({'workspace_id': w['_id']}).sort('created_at', 1))
    cookies = mongo.db.project_cookies.count_documents({'workspace_id': w['_id']})
    watchers = mongo.db.project_watches.count_documents({'workspace_id': w['_id']})
    forks = mongo.db.workspaces.count_documents({'forked_from': w['_id']})
    readme_file = mongo.db.files.find_one({'workspace_id': w['_id'], 'branch': branch, 'path': re.compile(r'^readme\\.md$', re.I)}, {'content': 1})
    return {
        'workspace': doc({**w, 'cookies': cookies, 'stars': cookies, 'watchers': watchers, 'forks': forks}),
        'files': [doc(x) for x in files],
        'commits': [doc(x) for x in commits],
        'issues': [doc(x) for x in issues],
        'pull_requests': [doc(x) for x in prs],
        'branches': branches,
        'collaborators': [doc(x) for x in collaborators],
        'viewer_role': role_for(w, getattr(g, 'user', {}).get('_id')) if getattr(g, 'user', None) else None,
        'viewer_cookie': bool(getattr(g, 'user', None) and mongo.db.project_cookies.find_one({'workspace_id': w['_id'], 'user_id': g.user['_id']})),
        'viewer_starred': bool(getattr(g, 'user', None) and mongo.db.project_cookies.find_one({'workspace_id': w['_id'], 'user_id': g.user['_id']})),
        'viewer_watching': bool(getattr(g, 'user', None) and mongo.db.project_watches.find_one({'workspace_id': w['_id'], 'user_id': g.user['_id']})),
        'readme': (readme_file or {}).get('content', ''),
    }

@bp.post('/workspaces/<wid>/files')
@required
def create_file(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_write(w): return {'error': 'forbidden'}, 403
    d = request.get_json() or {}
    path = clean_path(d.get('path'))
    if not path: return {'error': 'path_required'}, 400
    branch = current_branch(d)
    if mongo.db.files.find_one({'workspace_id': w['_id'], 'path': path, 'branch': branch}):
        return {'error': 'file_exists'}, 409
    now = datetime.now(timezone.utc)
    content = str(d.get('content', ''))
    f = {'workspace_id': w['_id'], 'path': path, 'content': content, 'branch': branch, 'updated_at': now, 'created_at': now}
    r = mongo.db.files.insert_one(f); f['_id'] = r.inserted_id
    try:
        c = make_commit(w, g.user, d.get('message') or f'Add {path}', branch, [{'path': path, 'action': 'Add', 'diff': diff_for(path, None, content)}])
    except Exception:
        mongo.db.files.delete_one({'_id': r.inserted_id})
        raise
    return {'file': doc(f), 'commit': doc(c)}, 201

@bp.get('/workspaces/<wid>/files/<fid>')
def get_file(wid, fid):
    w = get_workspace(wid); ident = oid(fid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_read(w, getattr(g, 'user', {}).get('_id')): return {'error': 'forbidden'}, 403
    f = mongo.db.files.find_one({'_id': ident, 'workspace_id': w['_id']})
    return {'file': doc(f)} if f else ({'error': 'not_found'}, 404)

@bp.patch('/workspaces/<wid>/files/<fid>')
@required
def edit_file(wid, fid):
    w = get_workspace(wid); ident = oid(fid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_write(w): return {'error': 'forbidden'}, 403
    f = mongo.db.files.find_one({'_id': ident, 'workspace_id': w['_id']})
    if not f: return {'error': 'not_found'}, 404
    d = request.get_json() or {}
    before = f.get('content', '')
    new_content = str(d.get('content', before))
    new_path = clean_path(d.get('path', f['path'])) or f['path']
    branch = current_branch(d) if d.get('branch') else f.get('branch', 'main')
    duplicate = mongo.db.files.find_one({'workspace_id': w['_id'], 'path': new_path, 'branch': branch, '_id': {'$ne': ident}})
    if duplicate: return {'error': 'file_exists'}, 409
    now = datetime.now(timezone.utc)
    mongo.db.files.update_one({'_id': ident}, {'$set': {'content': new_content, 'path': new_path, 'branch': branch, 'updated_at': now}})
    changes = []
    if f['path'] != new_path:
        changes.append({'path': f['path'], 'action': 'Rename', 'diff': diff_for(f['path'], before, None)})
    changes.append({'path': new_path, 'action': 'Update', 'diff': diff_for(new_path, before, new_content)})
    try:
        c = make_commit(w, g.user, d.get('message') or f'Update {new_path}', branch, changes)
    except Exception:
        mongo.db.files.update_one({'_id': ident}, {'$set': {'content': before, 'path': f['path'], 'branch': f.get('branch','main'), 'updated_at': f.get('updated_at', now)}})
        raise
    updated = mongo.db.files.find_one({'_id': ident})
    return {'file': doc(updated), 'commit': doc(c)}

@bp.delete('/workspaces/<wid>/files/<fid>')
@required
def delete_file(wid, fid):
    w = get_workspace(wid); ident = oid(fid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_write(w): return {'error': 'forbidden'}, 403
    f = mongo.db.files.find_one({'_id': ident, 'workspace_id': w['_id']})
    if not f: return {'error': 'not_found'}, 404
    branch = f.get('branch', 'main')
    c = make_commit(w, g.user, f'Delete {f["path"]}', branch, [{'path': f['path'], 'action': 'Delete', 'diff': diff_for(f['path'], f.get('content', ''), None)}])
    mongo.db.files.delete_one({'_id': ident})
    return {'ok': True, 'commit': doc(c)}

@bp.post('/workspaces/<wid>/commits')
@required
def commit(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_write(w): return {'error': 'forbidden'}, 403
    d = request.get_json() or {}
    branch = current_branch(d)
    if not mongo.db.branches.find_one({'workspace_id': w['_id'], 'name': branch}) and branch != 'main':
        return {'error': 'branch_not_found'}, 404
    c = make_commit(w, g.user, d.get('message', 'Update files'), branch, d.get('files', []))
    return {'commit': doc(c)}, 201

@bp.get('/workspaces/<wid>/commits/<cid>')
def get_commit(wid, cid):
    w = get_workspace(wid); ident = oid(cid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_read(w, getattr(g, 'user', {}).get('_id')): return {'error': 'forbidden'}, 403
    c = mongo.db.commits.find_one({'_id': ident, 'workspace_id': w['_id']})
    if not c: return {'error': 'not_found'}, 404
    return {'commit': doc(c)}

@bp.get('/workspaces/<wid>/branches')
def list_branches(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_read(w, getattr(g, 'user', {}).get('_id')): return {'error': 'forbidden'}, 403
    branches = list(mongo.db.branches.find({'workspace_id': w['_id']}).sort('name', 1))
    if not branches:
        branches = [{'workspace_id': w['_id'], 'name': 'main', 'protected': True, 'created_at': w['created_at']}]
    return {'branches': [doc(x) for x in branches]}

@bp.post('/workspaces/<wid>/branches')
@required
def create_branch(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_write(w): return {'error': 'forbidden'}, 403
    d = request.get_json() or {}
    name = re.sub(r'[^A-Za-z0-9._/-]+', '-', str(d.get('name', '')).strip()).strip('-/')
    source = str(d.get('source') or w.get('default_branch', 'main')).strip()
    if not name or name == 'main': return {'error': 'invalid_branch'}, 400
    if mongo.db.branches.find_one({'workspace_id': w['_id'], 'name': name}): return {'error': 'branch_exists'}, 409
    source_files = list(mongo.db.files.find({'workspace_id': w['_id'], '$or': [{'branch': source}, {'branch': {'$exists': False}}]}))
    now = datetime.now(timezone.utc)
    mongo.db.branches.insert_one({'workspace_id': w['_id'], 'name': name, 'source': source, 'protected': False, 'created_by': g.user['_id'], 'created_at': now})
    for f in source_files:
        clone = {k: v for k, v in f.items() if k not in ('_id',)}
        clone['branch'] = name; clone['created_at'] = now; clone['updated_at'] = now
        mongo.db.files.update_one({'workspace_id': w['_id'], 'branch': name, 'path': f['path']}, {'$set': clone}, upsert=True)
    return {'branch': doc(mongo.db.branches.find_one({'workspace_id': w['_id'], 'name': name}))}, 201

@bp.post('/workspaces/<wid>/branches/<branch>/merge')
@required
def merge_branch(wid, branch):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_write(w): return {'error': 'forbidden'}, 403
    target = str((request.get_json() or {}).get('target') or w.get('default_branch', 'main'))
    if branch == target: return {'error': 'same_branch'}, 400
    if not mongo.db.branches.find_one({'workspace_id': w['_id'], 'name': branch}) and branch != 'main':
        return {'error': 'branch_not_found'}, 404
    source_files = list(mongo.db.files.find({'workspace_id': w['_id'], 'branch': branch}))
    target_files = {f['path']: f for f in mongo.db.files.find({'workspace_id': w['_id'], '$or': [{'branch': target}, {'branch': {'$exists': False}}]})}
    changes = []
    for f in source_files:
        before = target_files.get(f['path'], {}).get('content', '')
        if before != f.get('content', ''):
            changes.append({'path': f['path'], 'action': 'Merge', 'diff': diff_for(f['path'], before, f.get('content', ''))})
        payload = {'workspace_id': w['_id'], 'path': f['path'], 'content': f.get('content', ''), 'branch': target, 'updated_at': datetime.now(timezone.utc)}
        mongo.db.files.update_one({'workspace_id': w['_id'], 'path': f['path'], '$or': [{'branch': target}, {'branch': {'$exists': False}}]}, {'$set': payload}, upsert=True)
    c = make_commit(w, g.user, (request.get_json() or {}).get('message') or f'Merge {branch} into {target}', target, changes)
    return {'commit': doc(c), 'merged_files': len(changes)}

@bp.post('/workspaces/<wid>/collaborators')
@required
def add_collaborator(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_manage(w): return {'error': 'forbidden'}, 403
    d = request.get_json() or {}
    username = str(d.get('username', '')).strip()
    role = d.get('role', 'contributor')
    if role not in ('contributor', 'viewer'): return {'error': 'invalid_role'}, 400
    u = mongo.db.users.find_one({'username': username})
    if not u: return {'error': 'user_not_found'}, 404
    if u['_id'] == w['owner_id']: return {'error': 'owner_cannot_be_collaborator'}, 400
    c = mongo.db.collaborators.find_one_and_update(
        {'workspace_id': w['_id'], 'user_id': u['_id']},
        {'$set': {'role': role, 'username': u['username'], 'zorta_user_id': u.get('user_id'), 'updated_at': datetime.now(timezone.utc)}, '$setOnInsert': {'created_at': datetime.now(timezone.utc)}},
        upsert=True, return_document=ReturnDocument.AFTER
    )
    return {'collaborator': doc(c)}

@bp.patch('/workspaces/<wid>/collaborators/<uid>')
@required
def update_collaborator(wid, uid):
    w = get_workspace(wid); user_id = oid(uid)
    if not w or not user_id: return {'error': 'not_found'}, 404
    if not can_manage(w): return {'error': 'forbidden'}, 403
    role = (request.get_json() or {}).get('role')
    if role not in ('contributor', 'viewer'): return {'error': 'invalid_role'}, 400
    c = mongo.db.collaborators.find_one_and_update({'workspace_id': w['_id'], 'user_id': user_id}, {'$set': {'role': role, 'updated_at': datetime.now(timezone.utc)}}, return_document=ReturnDocument.AFTER)
    return {'collaborator': doc(c)} if c else ({'error': 'not_found'}, 404)

@bp.delete('/workspaces/<wid>/collaborators/<uid>')
@required
def remove_collaborator(wid, uid):
    w = get_workspace(wid); user_id = oid(uid)
    if not w or not user_id: return {'error': 'not_found'}, 404
    if not can_manage(w): return {'error': 'forbidden'}, 403
    r = mongo.db.collaborators.delete_one({'workspace_id': w['_id'], 'user_id': user_id})
    return {'ok': bool(r.deleted_count)}

def toggle_project_collection(collection, wid):
    w = get_workspace(wid)
    if not w: return None, ({'error': 'not_found'}, 404)
    ident = g.user['_id']
    existing = mongo.db[collection].find_one({'workspace_id': w['_id'], 'user_id': ident})
    if existing:
        mongo.db[collection].delete_one({'_id': existing['_id']}); active = False
    else:
        mongo.db[collection].insert_one({'workspace_id': w['_id'], 'user_id': ident, 'created_at': datetime.now(timezone.utc)}); active = True
    return active, None


@bp.patch('/workspaces/<wid>/visibility')
@required
def set_visibility(wid):
    w=get_workspace(wid)
    if not w:return {'error':'not_found'},404
    if not can_manage(w):return {'error':'forbidden'},403
    visibility=(request.get_json() or {}).get('visibility')
    if visibility not in ('public','private'):return {'error':'invalid_visibility'},400
    x=mongo.db.workspaces.find_one_and_update({'_id':w['_id']},{'$set':{'visibility':visibility}},return_document=ReturnDocument.AFTER)
    return {'workspace':doc(x)}

@bp.post('/workspaces/<wid>/access')
@required
def grant_access(wid):
    return add_collaborator(wid)

@bp.post('/workspaces/<wid>/comments')
@required
def add_workspace_comment(wid):
    w=get_workspace(wid)
    if not w or not can_read(w,g.user['_id']):return {'error':'forbidden'},403
    body=str((request.get_json() or {}).get('body','')).strip()
    if not body:return {'error':'body_required'},400
    now=datetime.now(timezone.utc)
    c={'workspace_id':w['_id'],'author_id':g.user['_id'],'author_username':g.user['username'],'author_user_id':g.user.get('user_id'),'body':body[:5000],'created_at':now}
    r=mongo.db.workspace_comments.insert_one(c);c['_id']=r.inserted_id
    return {'comment':doc(c)},201

@bp.get('/workspaces/<wid>/comments')
def workspace_comments(wid):
    w=get_workspace(wid)
    if not w or not can_read(w,getattr(g,'user',{}).get('_id')):return {'error':'forbidden'},403
    rows=mongo.db.workspace_comments.find({'workspace_id':w['_id']}).sort([('created_at',1),('_id',1)]).limit(200)
    return {'comments':[doc(x) for x in rows]}

@bp.post('/workspaces/<wid>/cookies')
@required
def cookies(wid):
    active, err = toggle_project_collection('project_cookies', wid)
    if err:return err
    w=get_workspace(wid)
    count=mongo.db.project_cookies.count_documents({'workspace_id':w['_id']})
    mongo.db.workspaces.update_one({'_id':w['_id']},{'$set':{'cookies':count,'stars':count}})
    if active and count in (10,50,100,500):
        notify(w.get('owner_id'),'project_cookie_milestone',f'{w.get("name","Project")} reached {count} Cookies',entity_type='workspace',entity_id=w['_id'],route={'kind':'workspace','workspace_id':str(w['_id'])})
    return {'cookie':active,'cookies':count}

@bp.post('/workspaces/<wid>/star')
@required
def star_legacy(wid):
    return cookies(wid)

@bp.post('/workspaces/<wid>/watch')
@required
def watch(wid):
    active, err = toggle_project_collection('project_watches', wid)
    if err: return err
    w = get_workspace(wid)
    return {'watching': active, 'watchers': mongo.db.project_watches.count_documents({'workspace_id': w['_id']})}

@bp.post('/workspaces/<wid>/fork')
@required
def fork(wid):
    source = get_workspace(wid)
    if not source: return {'error': 'not_found'}, 404
    if not can_read(source, g.user['_id']): return {'error': 'forbidden'}, 403
    name = str((request.get_json() or {}).get('name') or f"{source['name']}-fork").strip()[:100]
    now = datetime.now(timezone.utc)
    clone = {k: v for k, v in source.items() if k not in ('_id', 'owner_id', 'owner_username', 'stars', 'forks', 'watchers')}
    clone.update({'owner_id': g.user['_id'], 'owner_username': g.user['username'], 'name': name, 'forked_from': source['_id'], 'stars': 0, 'forks': 0, 'watchers': 0, 'created_at': now})
    r = mongo.db.workspaces.insert_one(clone); clone['_id'] = r.inserted_id
    files = list(mongo.db.files.find({'workspace_id': source['_id']}))
    for f in files:
        nf = {k: v for k, v in f.items() if k != '_id'}; nf['workspace_id'] = r.inserted_id
        mongo.db.files.insert_one(nf)
    return {'workspace': doc(clone)}, 201

@bp.post('/workspaces/<wid>/issues')
@required
def issue(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_read(w, g.user['_id']): return {'error': 'forbidden'}, 403
    d = request.get_json() or {}
    title = str(d.get('title', '')).strip()
    if not title: return {'error': 'title_required'}, 400
    now = datetime.now(timezone.utc)
    i = {'workspace_id': w['_id'], 'author_id': g.user['_id'], 'author_username': g.user['username'], 'title': title[:200], 'body': str(d.get('body', ''))[:10000], 'status': 'open', 'labels': list(d.get('labels', []))[:10], 'created_at': now, 'updated_at': now}
    r = mongo.db.issues.insert_one(i)
    return {'issue': doc({**i, '_id': r.inserted_id})}, 201

@bp.patch('/workspaces/<wid>/issues/<iid>')
@required
def update_issue(wid, iid):
    w = get_workspace(wid); ident = oid(iid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_write(w): return {'error': 'forbidden'}, 403
    status = (request.get_json() or {}).get('status')
    if status not in ('open', 'closed'): return {'error': 'invalid_status'}, 400
    x = mongo.db.issues.find_one_and_update({'_id': ident, 'workspace_id': w['_id']}, {'$set': {'status': status, 'updated_at': datetime.now(timezone.utc)}}, return_document=ReturnDocument.AFTER)
    return {'issue': doc(x)} if x else ({'error': 'not_found'}, 404)

@bp.post('/workspaces/<wid>/issues/<iid>/comments')
@required
def issue_comment(wid, iid):
    w = get_workspace(wid); ident = oid(iid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_read(w, g.user['_id']): return {'error': 'forbidden'}, 403
    body = str((request.get_json() or {}).get('body', '')).strip()
    if not body: return {'error': 'body_required'}, 400
    c = {'workspace_id': w['_id'], 'issue_id': ident, 'author_id': g.user['_id'], 'author_username': g.user['username'], 'body': body[:5000], 'created_at': datetime.now(timezone.utc)}
    r = mongo.db.issue_comments.insert_one(c)
    return {'comment': doc({**c, '_id': r.inserted_id})}, 201

@bp.get('/workspaces/<wid>/issues/<iid>/comments')
def issue_comments(wid, iid):
    w = get_workspace(wid); ident = oid(iid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_read(w, getattr(g, 'user', {}).get('_id')): return {'error': 'forbidden'}, 403
    return {'comments': [doc(x) for x in mongo.db.issue_comments.find({'workspace_id': w['_id'], 'issue_id': ident}).sort([('created_at', 1), ('_id', 1)]).limit(200)]}

@bp.post('/workspaces/<wid>/pull-requests')
@required
def create_pr(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_write(w): return {'error': 'forbidden'}, 403
    d = request.get_json() or {}
    source = str(d.get('source', '')).strip(); target = str(d.get('target') or w.get('default_branch', 'main')).strip()
    if not source or source == target: return {'error': 'invalid_branches'}, 400
    pr = {'workspace_id': w['_id'], 'author_id': g.user['_id'], 'author_username': g.user['username'], 'title': str(d.get('title') or f'Merge {source} into {target}')[:200], 'body': str(d.get('body', ''))[:10000], 'source': source, 'target': target, 'status': 'open', 'reviewers': [], 'created_at': datetime.now(timezone.utc), 'updated_at': datetime.now(timezone.utc)}
    r = mongo.db.pull_requests.insert_one(pr)
    return {'pull_request': doc({**pr, '_id': r.inserted_id})}, 201

@bp.patch('/workspaces/<wid>/pull-requests/<pid>')
@required
def update_pr(wid, pid):
    w = get_workspace(wid); ident = oid(pid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_write(w): return {'error': 'forbidden'}, 403
    d = request.get_json() or {}; status = d.get('status')
    if status not in ('open', 'closed', 'merged'): return {'error': 'invalid_status'}, 400
    pr = mongo.db.pull_requests.find_one({'_id': ident, 'workspace_id': w['_id']})
    if not pr: return {'error': 'not_found'}, 404
    if status == 'merged':
        result = merge_branch(wid, pr['source'])
        if isinstance(result, tuple): return result
    x = mongo.db.pull_requests.find_one_and_update({'_id': ident}, {'$set': {'status': status, 'updated_at': datetime.now(timezone.utc)}}, return_document=ReturnDocument.AFTER)
    return {'pull_request': doc(x)}

@bp.post('/workspaces/<wid>/pull-requests/<pid>/comments')
@required
def pr_comment(wid, pid):
    w = get_workspace(wid); ident = oid(pid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_read(w, g.user['_id']): return {'error': 'forbidden'}, 403
    body = str((request.get_json() or {}).get('body', '')).strip()
    if not body: return {'error': 'body_required'}, 400
    c = {'workspace_id': w['_id'], 'pull_request_id': ident, 'author_id': g.user['_id'], 'author_username': g.user['username'], 'body': body[:5000], 'created_at': datetime.now(timezone.utc)}
    r = mongo.db.pr_comments.insert_one(c)
    return {'comment': doc({**c, '_id': r.inserted_id})}, 201

@bp.get('/workspaces/<wid>/pull-requests/<pid>/comments')
def pr_comments(wid, pid):
    w = get_workspace(wid); ident = oid(pid)
    if not w or not ident: return {'error': 'not_found'}, 404
    if not can_read(w, getattr(g, 'user', {}).get('_id')): return {'error': 'forbidden'}, 403
    return {'comments': [doc(x) for x in mongo.db.pr_comments.find({'workspace_id': w['_id'], 'pull_request_id': ident}).sort([('created_at', 1), ('_id', 1)]).limit(200)]}

@bp.post('/workspaces/<wid>/repo')
@required
def link_repo(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_manage(w): return {'error': 'forbidden'}, 403
    d = request.get_json() or {}; owner, name = parse_repo(d.get('repo', ''))
    if not owner: return {'error': 'invalid_repo'}, 400
    snap, status = fetch_repo_snapshot(owner, name)
    if status != 200: return {'error': 'github_lookup_failed', 'detail': snap}, 502
    mongo.db.workspaces.update_one({'_id': w['_id']}, {'$set': {'repo': snap}})
    return {'workspace': doc(mongo.db.workspaces.find_one({'_id': w['_id']}))}

@bp.post('/workspaces/<wid>/repo/refresh')
@required
def refresh_repo(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_manage(w): return {'error': 'forbidden'}, 403
    repo = w.get('repo')
    if not repo: return {'error': 'no_repo_linked'}, 400
    fetched = repo.get('fetched_at') or repo.get('linked_at')
    if fetched:
        try:
            if datetime.now(timezone.utc) - datetime.fromisoformat(fetched.replace('Z', '+00:00')) < timedelta(minutes=5):
                return {'workspace': doc(w), 'cached': True}
        except ValueError:
            pass
    snap, status = fetch_repo_snapshot(repo['owner'], repo['name'])
    if status != 200: return {'error': 'github_lookup_failed', 'detail': snap}, 502
    mongo.db.workspaces.update_one({'_id': w['_id']}, {'$set': {'repo': snap}})
    return {'workspace': doc(mongo.db.workspaces.find_one({'_id': w['_id']}))}

@bp.delete('/workspaces/<wid>/repo')
@required
def unlink_repo(wid):
    w = get_workspace(wid)
    if not w: return {'error': 'not_found'}, 404
    if not can_manage(w): return {'error': 'forbidden'}, 403
    mongo.db.workspaces.update_one({'_id': w['_id']}, {'$unset': {'repo': ''}})
    return {'workspace': doc(mongo.db.workspaces.find_one({'_id': w['_id']}))}


@bp.get('/workspaces/<wid>/discussions')
@required
def discussions(wid):
    w=get_workspace(wid)
    if not w:return {'error':'not_found'},404
    if not can_read(w,g.user['_id']):return {'error':'forbidden'},403
    limit=min(max(int(request.args.get('limit',30)),1),100)
    rows=list(mongo.db.project_discussions.find({'workspace_id':w['_id']}).sort([('last_activity_at',-1),('_id',-1)]).limit(limit))
    return {'discussions':[doc(x) for x in rows]}

@bp.post('/workspaces/<wid>/discussions')
@required
def create_discussion(wid):
    w=get_workspace(wid)
    if not w:return {'error':'not_found'},404
    if not can_read(w,g.user['_id']):return {'error':'forbidden'},403
    d=request.get_json() or {}; title=str(d.get('title','')).strip(); body=str(d.get('body','')).strip()
    if len(title)<3:return {'error':'title_required'},400
    if not body:return {'error':'body_required'},400
    now=datetime.now(timezone.utc)
    x={'workspace_id':w['_id'],'author_id':g.user['_id'],'author_username':g.user['username'],'title':title[:200],'body':body[:10000],'reply_count':0,'last_activity_at':now,'created_at':now,'updated_at':now}
    r=mongo.db.project_discussions.insert_one(x);x['_id']=r.inserted_id
    return {'discussion':doc(x)},201

@bp.get('/workspaces/<wid>/discussions/<did>/replies')
@required
def discussion_replies(wid,did):
    w=get_workspace(wid); ident=oid(did)
    if not w or not ident:return {'error':'not_found'},404
    if not can_read(w,g.user['_id']):return {'error':'forbidden'},403
    rows=list(mongo.db.project_discussion_replies.find({'workspace_id':w['_id'],'discussion_id':ident}).sort([('created_at',1),('_id',1)]).limit(500))
    return {'replies':[doc(x) for x in rows]}

@bp.post('/workspaces/<wid>/discussions/<did>/replies')
@required
def discussion_reply(wid,did):
    w=get_workspace(wid); ident=oid(did)
    if not w or not ident:return {'error':'not_found'},404
    if not can_read(w,g.user['_id']):return {'error':'forbidden'},403
    discussion=mongo.db.project_discussions.find_one({'_id':ident,'workspace_id':w['_id']})
    if not discussion:return {'error':'not_found'},404
    body=str((request.get_json() or {}).get('body','')).strip()
    if not body:return {'error':'body_required'},400
    now=datetime.now(timezone.utc)
    x={'workspace_id':w['_id'],'discussion_id':ident,'author_id':g.user['_id'],'author_username':g.user['username'],'body':body[:5000],'created_at':now}
    r=mongo.db.project_discussion_replies.insert_one(x);x['_id']=r.inserted_id
    mongo.db.project_discussions.update_one({'_id':ident},{'$inc':{'reply_count':1},'$set':{'last_activity_at':now,'updated_at':now}})
    if discussion.get('author_id') != g.user['_id']:
        notify(discussion['author_id'],'discussion_reply',f'{g.user["display_name"]} replied to {discussion["title"]}',body[:160],entity_type='project_discussion',entity_id=ident,route={'kind':'workspace_discussion','workspace_id':str(w['_id']),'discussion_id':str(ident)})
    return {'reply':doc(x)},201
