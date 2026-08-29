from flask import Blueprint,request,g
from bson import ObjectId
from datetime import datetime,timezone
from app.extensions import mongo
from app.utils.auth import required,staff_required
from app.utils.serial import doc
from app.services.notifications import notify
bp=Blueprint('moderation',__name__)
def oid(x):
 try:return ObjectId(x)
 except Exception:return None

TARGETS={
 'post':{'collection':'posts','owner_field':'author_id'},
 'comment':{'collection':'comments','owner_field':'author_id'},
 'message':{'collection':'messages','owner_field':'author_id'},
 'workspace':{'collection':'workspaces','owner_field':'owner_id'},
 'profile':{'collection':'users','owner_field':'_id'},
}

@bp.post('/report/<target_type>/<target_id>')
@required
def report(target_type,target_id):
 if target_type not in TARGETS:return {'error':'invalid_target_type'},400
 conf=TARGETS[target_type];tid=oid(target_id)
 if not tid:return {'error':'invalid_target_id'},400
 if not mongo.db[conf['collection']].find_one({'_id':tid},{'_id':1}):return {'error':'not_found'},404
 d=request.get_json() or {};reason=str(d.get('reason','other')).strip()[:80];details=str(d.get('details','')).strip()[:1000];evidence=str(d.get('evidence','')).strip()[:500]
 target=mongo.db[conf['collection']].find_one({'_id':tid}) or {}
 mongo.db.reports.update_one(
  {'target_id':tid,'target_type':target_type,'reporter_id':g.user['_id']},
  {'$set':{'reason':reason,'details':details,'evidence':evidence,'updated_at':datetime.now(timezone.utc)},'$setOnInsert':{'target_id':tid,'target_type':target_type,'reporter_id':g.user['_id'],'target_snapshot':{'title':target.get('title'),'name':target.get('name'),'body':str(target.get('body',''))[:500],'username':target.get('username'),'owner_id':target.get('owner_id') or target.get('author_id')},'created_at':datetime.now(timezone.utc),'status':'open'}},
  upsert=True)
 return {'ok':True,'status':'open'}

def _inline_target(r):
 conf=TARGETS.get(r['target_type'])
 if not conf:return None
 proj={'password_hash':0} if conf['collection']=='users' else None
 t=mongo.db[conf['collection']].find_one({'_id':r['target_id']},proj)
 return doc(t) if t else None

@bp.get('/moderation/reports')
@staff_required
def reports_queue():
 status=request.args.get('status','open')
 items=[doc(r) for r in mongo.db.reports.find({'status':status}).sort([('created_at',1)]).limit(200)]
 out=[]
 for r in items:
  r['target']=_inline_target({'target_type':r['target_type'],'target_id':oid(r['id'])})
  out.append(r)
 return {'reports':out}

@bp.post('/moderation/reports/<rid>/resolve')
@staff_required
def resolve(rid):
 r=mongo.db.reports.find_one({'_id':oid(rid)})
 if not r:return {'error':'not_found'},404
 d=request.get_json() or {};action=d.get('action')
 if action not in ('dismiss','remove_content','warn_user','ban_user'):return {'error':'invalid_action'},400
 conf=TARGETS.get(r['target_type'])
 target=mongo.db[conf['collection']].find_one({'_id':r['target_id']}) if conf else None
 owner_id=None
 if target:
  owner_id=target['_id'] if conf['owner_field']=='_id' else target.get(conf['owner_field'])
 if action=='remove_content':
  if not target:return {'error':'target_already_gone'},400
  if r['target_type']=='profile':return {'error':'cannot_remove_profile_use_ban'},400
  mongo.db[conf['collection']].delete_one({'_id':r['target_id']})
  if owner_id:notify(owner_id,'moderation',f'Your {r["target_type"]} was removed for violating community guidelines')
 elif action=='warn_user':
  if owner_id:notify(owner_id,'moderation',f'You received a warning regarding a reported {r["target_type"]}',body=d.get('note',''))
 elif action=='ban_user':
  if not owner_id:return {'error':'no_target_user'},400
  mongo.db.users.update_one({'_id':owner_id},{'$set':{'platform_banned':True,'platform_ban_reason':d.get('note',r.get('reason',''))}})
  notify(owner_id,'moderation','Your account was banned for violating community guidelines')
 mongo.db.reports.update_many({'target_id':r['target_id'],'target_type':r['target_type'],'status':'open'},{'$set':{'status':'resolved','action':action,'resolved_by':g.user['_id'],'resolved_at':datetime.now(timezone.utc)}})
 return {'ok':True,'action':action}

@bp.get('/moderation/roles')
@staff_required
def list_roles():
 return {'users':[doc(u) for u in mongo.db.users.find({'platform_role':{'$in':['moderator','admin']}},{'password_hash':0})]}

@bp.post('/moderation/roles/<username>')
@staff_required
def set_role(username):
 if g.user.get('platform_role')!='admin':return {'error':'forbidden'},403
 role=(request.get_json() or {}).get('role')
 if role not in ('user','moderator','admin'):return {'error':'invalid_role'},400
 u=mongo.db.users.find_one({'username':username.lower()},{'_id':1})
 if not u:return {'error':'not_found'},404
 mongo.db.users.update_one({'_id':u['_id']},{'$set':{'platform_role':role}})
 return {'ok':True}
