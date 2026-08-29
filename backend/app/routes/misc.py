from flask import Blueprint,request,g,send_from_directory,current_app
from app.services.notifications import notify
from app.services.messaging import can_message
from app.utils.rate_limit import limited
from bson import ObjectId
from datetime import datetime,timezone,timedelta
from app.extensions import mongo
from app.utils.auth import required,current_user
from app.utils.serial import doc
from app.services.providers import hosting,payments
import os
import re
from werkzeug.utils import secure_filename
from app.services import credits as credits_service
from app.services.reputation import add
bp=Blueprint('misc',__name__)
def oid(x):return ObjectId(x)

def _compute_badges(u,ws_count,commit_count,posts_count,gigs_completed):
 rep=u.get('reputation',0)
 defs=[
  ('first_workspace','First Workspace','Created a first workspace','FolderGit2',ws_count>0),
  ('early_builder','Early Builder','Joined Zorta early','Sparkles',True),
  ('open_source','Open Source Contributor','Shipped a commit to a public workspace','GitCommit',commit_count>0),
  ('rep_100','100 Reputation','Reached 100 reputation','Star',rep>=100),
  ('rep_500','500 Reputation','Reached 500 reputation','Trophy',rep>=500),
  ('first_post','First Post','Shared a first post','MessageSquare',posts_count>0),
  ('freelancer','Proven Freelancer','Completed a freelance order','Briefcase',gigs_completed>0),
 ]
 return [{'id':k,'name':n,'description':d,'icon':i,'earned':e} for k,n,d,i,e in defs]

@bp.get('/profiles/<username>')
def profile(username):
 u=mongo.db.users.find_one({'username':username.lower()},{'password_hash':0})
 if not u:return {'error':'not_found'},404
 uid=u['_id']
 viewer=current_user()
 is_self=bool(viewer and viewer['_id']==uid)
 if request.args.get('compact')=='1':
  commit_count=mongo.db.commits.count_documents({'author_id':uid})
  gigs_completed=mongo.db.orders.count_documents({'freelancer_id':uid,'status':'completed'})
  followers_count=mongo.db.followers.count_documents({'following_id':uid})
  following_count=mongo.db.followers.count_documents({'follower_id':uid})
  posts_count=mongo.db.posts.count_documents({'author_id':uid})
  workspaces_count=mongo.db.workspaces.count_documents({'owner_id':uid})
  badges=_compute_badges(u,workspaces_count,commit_count,posts_count,gigs_completed)
  custom=list(mongo.db.user_badges.find({'user_id':uid}).sort('awarded_at',-1))
  if custom:
   ids=[x['badge_id'] for x in custom]; defs={x['_id']:x for x in mongo.db.badge_definitions.find({'_id':{'$in':ids},'active':True})}
   badges.extend([{'id':str(b['_id']),'name':defs[b['badge_id']]['name'],'description':defs[b['badge_id']].get('description',''),'icon':defs[b['badge_id']].get('icon','BadgeCheck'),'earned':True,'custom':True} for b in custom if b['badge_id'] in defs])
  out={'user':doc(u),'is_self':is_self,'badges':badges,'stats':{'posts':posts_count,'workspaces':workspaces_count,'gigs_completed':gigs_completed,'followers':followers_count if u.get('show_follow_counts',True) or is_self else None,'following':following_count if u.get('show_follow_counts',True) or is_self else None,'commits':commit_count}}
  if is_self:out['credits_balance']=credits_service.balance(uid)
  return out
 reviews=[doc(x) for x in mongo.db.reviews.find({'target_id':uid}).sort([('created_at',-1),('_id',-1)]).limit(20)]
 agg=list(mongo.db.reviews.aggregate([{'$match':{'target_id':uid}},{'$group':{'_id':None,'avg':{'$avg':'$rating'},'count':{'$sum':1}}}]))
 rating={'avg':round(agg[0]['avg'],2),'count':agg[0]['count']} if agg else {'avg':0,'count':0}
 posts=[doc(x) for x in mongo.db.posts.find({'author_id':uid}).sort([('created_at',-1),('_id',-1)]).limit(25)]
 workspaces=[doc(x) for x in mongo.db.workspaces.find({'owner_id':uid}).sort([('created_at',-1),('_id',-1)]).limit(25)]
 orders=[doc(x) for x in mongo.db.orders.find({'$or':[{'client_id':uid},{'freelancer_id':uid}]}).sort([('created_at',-1),('_id',-1)]).limit(20)]
 activity=[doc(x) for x in mongo.db.activity.find({'user_id':uid}).sort([('created_at',-1),('_id',-1)]).limit(30)]
 startups=[doc(x) for x in mongo.db.startups.find({'$or':[{'owner_id':uid},{'team.user_id':uid}]}).sort('created_at',-1).limit(25)]
 commit_count=mongo.db.commits.count_documents({'author_id':uid})
 gigs_completed=mongo.db.orders.count_documents({'freelancer_id':uid,'status':'completed'})
 followers_count=mongo.db.followers.count_documents({'following_id':uid})
 following_count=mongo.db.followers.count_documents({'follower_id':uid})
 badges=_compute_badges(u,len(workspaces),commit_count,len(posts),gigs_completed)
 custom_awards=list(mongo.db.user_badges.find({'user_id':uid}).sort('awarded_at',-1))
 if custom_awards:
  ids=[x['badge_id'] for x in custom_awards]
  defs={x['_id']:x for x in mongo.db.badge_definitions.find({'_id':{'$in':ids},'active':True})}
  badges.extend([{'id':str(b['_id']),'name':defs[b['badge_id']]['name'],'description':defs[b['badge_id']].get('description',''),'icon':defs[b['badge_id']].get('icon','BadgeCheck'),'earned':True,'custom':True} for b in custom_awards if b['badge_id'] in defs])
 out={
  'user':doc(u),'posts':posts,'workspaces':workspaces,'orders':orders,'activity':activity,
  'reviews':reviews,'rating':rating,'startups':startups,'badges':badges,'is_self':is_self,
  'stats':{'posts':len(posts),'workspaces':len(workspaces),'gigs_completed':gigs_completed,'followers':followers_count if u.get('show_follow_counts', True) or is_self else None,'following':following_count if u.get('show_follow_counts', True) or is_self else None,'commits':commit_count}
 }
 if is_self:out['credits_balance']=credits_service.balance(uid)
 return out

@bp.patch('/profiles/me')
@required
def update_profile():
 d=request.get_json() or {}
 allowed=['display_name','bio','avatar','cover','skills','interests','roles','links','onboarding_complete','location','website','availability','pronouns']
 changes={k:d[k] for k in allowed if k in d}
 if 'display_name' in changes:
  changes['display_name']=str(changes['display_name']).strip()[:80]
 for field in ('bio','location','website','availability','pronouns'):
  if field in changes: changes[field]=str(changes[field] or '').strip()[:1000]
 if 'onboarding_complete' in changes and changes['onboarding_complete'] and not g.user.get('age_confirmed'):
  return {'error':'age_confirmation_required'},400
 mongo.db.users.update_one({'_id':g.user['_id']},{'$set':changes})
 return {'user':doc(mongo.db.users.find_one({'_id':g.user['_id']},{'password_hash':0}))}

@bp.patch('/profiles/me/username')
@required
def change_username():
 d=request.get_json() or {}
 username=str(d.get('username','')).strip()
 if not re.fullmatch(r'[A-Za-z0-9]{3,24}',username):
  return {'error':'username_must_be_3_to_24_letters_or_numbers_only'},400
 current=mongo.db.users.find_one({'_id':g.user['_id']},{'username':1,'username_changed_at':1,'onboarding_complete':1})
 if not current:return {'error':'not_found'},404
 if username.lower()==current.get('username','').lower():return {'user':doc(g.user)}
 last=current.get('username_changed_at')
 if current.get('onboarding_complete') and last:
  last=last if last.tzinfo else last.replace(tzinfo=timezone.utc)
  if datetime.now(timezone.utc)-last < timedelta(days=30):
   return {'error':'username_change_available_every_30_days','next_change_at':(last+timedelta(days=30)).isoformat()},429
 if mongo.db.users.find_one({'username':username,'_id':{'$ne':g.user['_id']}},{'_id':1}):
  return {'error':'username_taken'},409
 now=datetime.now(timezone.utc)
 mongo.db.users.update_one({'_id':g.user['_id']},{'$set':{'username':username,'username_changed_at':now}})
 return {'user':doc(mongo.db.users.find_one({'_id':g.user['_id']},{'password_hash':0}))}

@bp.post('/profiles/me/media')
@required
def upload_profile_media():
 if 'file' not in request.files:return {'error':'file_required'},400
 f=request.files['file']
 if not f or not f.filename:return {'error':'file_required'},400
 if not (f.mimetype or '').startswith('image/'):return {'error':'image_required'},400
 if f.content_length and f.content_length>5*1024*1024:return {'error':'image_too_large'},413
 kind=request.form.get('kind','avatar')
 if kind not in ('avatar','cover'):return {'error':'invalid_media_kind'},400
 root=os.path.join(current_app.root_path,'uploads','profiles')
 os.makedirs(root,exist_ok=True)
 ext=os.path.splitext(secure_filename(f.filename))[1].lower()
 if ext not in ('.png','.jpg','.jpeg','.webp','.gif'):return {'error':'unsupported_image_type'},400
 name=f"{g.user['_id']}_{kind}_{int(datetime.now(timezone.utc).timestamp())}{ext}"
 path=os.path.join(root,name)
 f.save(path)
 url=f"{request.host_url.rstrip('/')}/api/profile-media/{name}"
 mongo.db.users.update_one({'_id':g.user['_id']},{'$set':{kind:url}})
 return {'url':url,'kind':kind,'user':doc(mongo.db.users.find_one({'_id':g.user['_id']},{'password_hash':0}))}

@bp.get('/profile-media/<filename>')
def profile_media(filename):
 filename=secure_filename(filename)
 root=os.path.join(current_app.root_path,'uploads','profiles')
 return send_from_directory(root,filename)

@bp.get('/notifications')
@required
def notifications():
 limit=min(max(int(request.args.get('limit',50)),1),100)
 kind=request.args.get('kind','').strip()
 q={'user_id':g.user['_id']}
 if kind:q['kind']=kind
 rows=[doc(x) for x in mongo.db.notifications.find(q,{'user_id':0}).sort([('created_at',-1),('_id',-1)]).limit(limit)]
 unread=mongo.db.notifications.count_documents({'user_id':g.user['_id'],'read':False})
 applications=[doc(x) for x in mongo.db.startup_applications.find({'applicant_id':g.user['_id']}).sort([('created_at',-1),('_id',-1)]).limit(50)]
 return {'notifications':rows,'unread':unread,'applications':applications}

@bp.get('/notifications/read-all')
@required
def notifications_count():
 return {'unread':mongo.db.notifications.count_documents({'user_id':g.user['_id'],'read':False})}

@bp.post('/notifications/<nid>/read')
@required
def mark_notification_read(nid):mongo.db.notifications.update_one({'_id':oid(nid),'user_id':g.user['_id']},{'$set':{'read':True}});return {'ok':True}
@bp.post('/notifications/read-all')
@required
def readall():
 mongo.db.notifications.update_many({'user_id':g.user['_id']},{'$set':{'read':True}})
 return {'ok':True}

@bp.get('/direct-messages')
@required
def direct_messages():
 other=request.args.get('with','').strip().lower()
 q={'$or':[{'sender_id':g.user['_id']},{'recipient_id':g.user['_id']}]}
 if other:
  target=mongo.db.users.find_one({'username':other},{'_id':1})
  if not target:return {'messages':[]}
  q={'$or':[
   {'sender_id':g.user['_id'],'recipient_id':target['_id']},
   {'sender_id':target['_id'],'recipient_id':g.user['_id']}
  ]}
  mongo.db.direct_messages.update_many(
   {'sender_id':target['_id'],'recipient_id':g.user['_id'],'read':{'$ne':True}},
   {'$set':{'read':True}}
  )
 rows=[doc(x) for x in mongo.db.direct_messages.find(q,{'_id':1,'sender_id':1,'recipient_id':1,'sender_username':1,'recipient_username':1,'body':1,'created_at':1,'read':1}).sort('created_at',1).limit(200)]
 return {'messages':rows}

@bp.get('/direct-messages/conversations')
@required
def dm_conversations():
 uid=g.user['_id']
 pipeline=[
  {'$match':{'$or':[{'sender_id':uid},{'recipient_id':uid}]}},
  {'$addFields':{'partner_id':{'$cond':[{'$eq':['$sender_id',uid]},'$recipient_id','$sender_id']}}},
  {'$sort':{'created_at':-1}},
  {'$group':{
   '_id':'$partner_id',
   'last_body':{'$first':'$body'},
   'last_at':{'$first':'$created_at'},
   'last_from_me':{'$first':{'$eq':['$sender_id',uid]}},
   'unread':{'$sum':{'$cond':[{'$and':[{'$eq':['$recipient_id',uid]},{'$ne':['$read',True]}]},1,0]}},
  }},
  {'$sort':{'last_at':-1}},
  {'$limit':50},
 ]
 rows=list(mongo.db.direct_messages.aggregate(pipeline))
 partner_ids=[r['_id'] for r in rows]
 users_by_id={u['_id']:u for u in mongo.db.users.find({'_id':{'$in':partner_ids}},{'password_hash':0})}
 out=[]
 for r in rows:
  u=users_by_id.get(r['_id'])
  if not u:continue
  out.append({
   'user':doc(u),
   'last_message':r.get('last_body',''),
   'last_at':r['last_at'].isoformat() if r.get('last_at') else None,
   'from_me':bool(r.get('last_from_me')),
   'unread':r.get('unread',0),
  })
 return {'conversations':out}

@bp.post('/direct-messages')
@required
@limited('dm_send', 120, 60)
def send_direct_message():
 d=request.get_json() or {}
 username=str(d.get('username','')).strip().lower()
 body=str(d.get('body','')).strip()
 if not username or not body:return {'error':'recipient_and_message_required'},400
 if len(body)>2000:return {'error':'message_too_long'},400
 target=mongo.db.users.find_one({'username':username},{'_id':1,'username':1,'display_name':1})
 if not target:return {'error':'recipient_not_found'},404
 if target['_id']==g.user['_id']:return {'error':'cannot_message_self'},400
 if mongo.db.blocks.find_one({'$or':[{'blocker_id':g.user['_id'],'blocked_id':target['_id']},{'blocker_id':target['_id'],'blocked_id':g.user['_id']}]},{'_id':1}):return {'error':'You cannot message this user'},403
 allowed, reason, context = can_message(g.user['_id'], target['_id'])
 if not allowed:return {'error':reason or 'messaging_not_allowed'},403
 now=datetime.now(timezone.utc)
 msg={'sender_id':g.user['_id'],'recipient_id':target['_id'],'sender_username':g.user['username'],'recipient_username':target['username'],'body':body,'created_at':now,'read':False}
 r=mongo.db.direct_messages.insert_one(msg)
 notify(target['_id'],'direct_message',f'New message from {g.user["display_name"]}',body[:160],entity_type='message',entity_id=r.inserted_id,route={'kind':'dm','username':g.user['username'],'context':context})
 return {'message':doc({**msg,'_id':r.inserted_id})},201

@bp.get('/search')
def search():
 q=request.args.get('q','').strip()
 if not q:return {'users':[],'posts':[],'workspaces':[],'gigs':[],'startups':[],'servers':[]}
 def c(cur):return [doc(x) for x in cur.limit(10)]
 text={'$text':{'$search':q}}
 return {'users':c(mongo.db.users.find(text,{'password_hash':0})),'posts':c(mongo.db.posts.find(text)),'workspaces':c(mongo.db.workspaces.find(text)),'gigs':c(mongo.db.gigs.find(text)),'startups':c(mongo.db.startups.find(text)),'servers':c(mongo.db.servers.find(text))}
@bp.get('/badges')
def badges():return {'badges':[doc(x) for x in mongo.db.badges.find()]}
@bp.post('/workspaces/<wid>/deploy')
@required
def deploy(wid):return hosting.deploy(wid),503
@bp.get('/deployments/<did>')
@required
def deployment(did):return hosting.status(did)
@bp.post('/payments/order')
@required
def payment():return payments.create_payment(request.get_json() or {}),503
