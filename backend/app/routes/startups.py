from flask import Blueprint,request,g
from bson import ObjectId
from datetime import datetime,timezone
from app.extensions import mongo
from app.utils.auth import required
from app.utils.serial import doc
from app.services.notifications import notify
from app.services.reputation import add
bp=Blueprint('startups',__name__)
def oid(x):return ObjectId(x)
@bp.get('/startups')
def list_startups():
 q=request.args.get('q','').strip();sort=request.args.get('sort','latest');f={'$or':[{'name':{'$regex':q,'$options':'i'}},{'tagline':{'$regex':q,'$options':'i'}},{'description':{'$regex':q,'$options':'i'}}]} if q else {}; ordering=[('created_at',-1),('_id',-1)] if sort!='trending' else [('reputation',-1),('created_at',-1),('_id',-1)]; return {'startups':[doc(x) for x in mongo.db.startups.find(f).sort(ordering).limit(100)]}
@bp.post('/startups')
@required
def create():
 d=request.get_json() or {};now=datetime.now(timezone.utc);x={'owner_id':g.user['_id'],'owner_username':g.user['username'],'name':d.get('name',''),'logo':d.get('logo',''),'tagline':d.get('tagline',''),'description':d.get('description',''),'problem':d.get('problem',''),'solution':d.get('solution',''),'stage':d.get('stage','idea'),'tech_stack':d.get('tech_stack',[]),'roles_needed':d.get('roles_needed',[]),'team':[{'user_id':g.user['_id'],'username':g.user['username'],'role':'Founder'}],'created_at':now,'reputation':0};r=mongo.db.startups.insert_one(x);return {'startup':doc({**x,'_id':r.inserted_id})},201
@bp.get('/startups/<sid>')
def get(sid):
 x=mongo.db.startups.find_one({'_id':oid(sid)})
 if not x:return {'error':'not_found'},404
 viewer=g.user if hasattr(g,'user') else None
 apps=[]
 if viewer and viewer['_id']==x['owner_id']:
  apps=[doc(a) for a in mongo.db.startup_applications.find({'startup_id':oid(sid)}).sort('created_at',-1).limit(100)]
 comments=[doc(c) for c in mongo.db.startup_comments.find({'startup_id':oid(sid)}).sort([('created_at',1),('_id',1)]).limit(200)]
 return {'startup':doc(x),'applications':apps,'comments':comments}
@bp.post('/startups/<sid>/applications')
@required
def apply(sid):
 x=mongo.db.startups.find_one({'_id':oid(sid)});d=request.get_json() or {}
 if not x:return {'error':'not_found'},404
 if x['owner_id']==g.user['_id']:return {'error':'cannot_apply_to_own_startup'},400
 old=mongo.db.startup_applications.find_one({'startup_id':oid(sid),'applicant_id':g.user['_id']})
 if old:return {'error':'already_applied'},409
 a={'startup_id':oid(sid),'applicant_id':g.user['_id'],'applicant_username':g.user['username'],'applicant_name':g.user['display_name'],'role':d.get('role',''),'message':d.get('message',''),'status':'pending','created_at':datetime.now(timezone.utc)};r=mongo.db.startup_applications.insert_one(a);notify(x['owner_id'],'startup_application',f'{g.user["display_name"]} applied to {x["name"]}',entity_type='startup',entity_id=x['_id'],route={'kind':'startup','startup_id':sid});return {'application':doc({**a,'_id':r.inserted_id})},201
@bp.post('/startup-applications/<aid>/decision')
@required
def decision(aid):
 a=mongo.db.startup_applications.find_one({'_id':oid(aid)});s=mongo.db.startups.find_one({'_id':a['startup_id']}) if a else None
 if not a or not s:return {'error':'not_found'},404
 if s['owner_id']!=g.user['_id']:return {'error':'forbidden'},403
 status=(request.get_json() or {}).get('status');
 if status not in ('accepted','rejected'):return {'error':'invalid_status'},400
 mongo.db.startup_applications.update_one({'_id':a['_id']},{'$set':{'status':status}})
 if status=='accepted':mongo.db.startups.update_one({'_id':s['_id']},{'$push':{'team':{'user_id':a['applicant_id'],'username':a['applicant_username'],'role':a['role']}}})
 notify(a['applicant_id'],'startup_application',f'Your application was {status}',entity_type='startup',entity_id=a['startup_id'],route={'kind':'startup','startup_id':str(a['startup_id'])});return {'ok':True}


@bp.post('/startups/<sid>/comments')
@required
def comment(sid):
 x=mongo.db.startups.find_one({'_id':oid(sid)},{'_id':1,'owner_id':1,'name':1})
 if not x:return {'error':'not_found'},404
 body=str((request.get_json() or {}).get('body','')).strip()
 if not body:return {'error':'comment_required'},400
 if len(body)>2000:return {'error':'comment_too_long'},400
 now=datetime.now(timezone.utc)
 c={'startup_id':x['_id'],'author_id':g.user['_id'],'author_username':g.user['username'],'author_name':g.user['display_name'],'body':body,'created_at':now}
 r=mongo.db.startup_comments.insert_one(c)
 if x['owner_id']!=g.user['_id']:
  notify(x['owner_id'],'startup_comment',f'{g.user["display_name"]} commented on {x["name"]}',body[:160],f'/startups/{sid}',entity_type='startup',entity_id=x['_id'],route={'kind':'startup','startup_id':sid})
 return {'comment':doc({**c,'_id':r.inserted_id})},201

@bp.delete('/startups/<sid>/comments/<cid>')
@required
def delete_comment(sid,cid):
 c=mongo.db.startup_comments.find_one({'_id':oid(cid),'startup_id':oid(sid)})
 if not c:return {'error':'not_found'},404
 startup=mongo.db.startups.find_one({'_id':oid(sid)},{'owner_id':1})
 if c['author_id']!=g.user['_id'] and (not startup or startup['owner_id']!=g.user['_id']):return {'error':'forbidden'},403
 mongo.db.startup_comments.delete_one({'_id':c['_id']})
 return {'ok':True}
