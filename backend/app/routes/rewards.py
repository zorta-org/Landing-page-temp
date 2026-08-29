from flask import Blueprint,request,g
from bson import ObjectId
from datetime import datetime,timezone
from app.extensions import mongo
from app.utils.auth import required,staff_required
from app.utils.serial import doc
from app.services import credits
from app.services.notifications import notify
from app.utils.rate_limit import limited
bp=Blueprint('rewards',__name__)
def oid(x):return ObjectId(x)

@bp.get('/credits/balance')
@required
def balance():return {'balance':credits.balance(g.user['_id'])}

@bp.get('/credits/history')
@required
def history():
 limit=min(max(int(request.args.get('limit',50)),1),200)
 return {'entries':[doc(x) for x in mongo.db.credits.find({'user_id':g.user['_id']}).sort([('created_at',-1),('_id',-1)]).limit(limit)]}

@bp.get('/rewards')
def catalog():
 return {'rewards':[doc(x) for x in mongo.db.rewards.find({'active':True}).sort('cost',1)]}

@bp.get('/admin/rewards')
@staff_required
def admin_catalog():
 return {'rewards':[doc(x) for x in mongo.db.rewards.find({}).sort([('active',-1),('cost',1)])]}

@bp.post('/rewards')
@staff_required
def create_reward():
 d=request.get_json() or {}
 x={'title':d.get('title',''),'description':d.get('description',''),'category':d.get('category','other'),'cost':int(d.get('cost',0) or 0),'stock':int(d.get('stock',0) or 0),'active':True,'created_at':datetime.now(timezone.utc)}
 if x['cost']<=0:return {'error':'invalid_cost'},400
 r=mongo.db.rewards.insert_one(x);return {'reward':doc({**x,'_id':r.inserted_id})},201

@bp.patch('/rewards/<rid>')
@staff_required
def update_reward(rid):
 d=request.get_json() or {};allowed=['title','description','category','cost','stock','active'];changes={k:d[k] for k in allowed if k in d}
 mongo.db.rewards.update_one({'_id':oid(rid)},{'$set':changes});return {'reward':doc(mongo.db.rewards.find_one({'_id':oid(rid)}))}

@bp.post('/rewards/<rid>/redeem')
@required
@limited('reward_redeem', 20, 3600)
def redeem(rid):
 item=mongo.db.rewards.find_one({'_id':oid(rid)})
 if not item or not item.get('active'):return {'error':'not_found'},404
 if item.get('stock',0)<=0:return {'error':'out_of_stock'},400
 if credits.balance(g.user['_id'])<item['cost']:return {'error':'insufficient_credits'},400
 if not credits.spend(g.user['_id'],item['cost'],reason='redemption',order_id=None):return {'error':'insufficient_credits'},400
 upd=mongo.db.rewards.update_one({'_id':item['_id'],'stock':{'$gt':0}},{'$inc':{'stock':-1}})
 if upd.modified_count==0:
  credits.add(g.user['_id'],item['cost'],reason='redemption_stock_race_refund',order_id=None)
  return {'error':'out_of_stock'},400
 now=datetime.now(timezone.utc)
 red={'user_id':g.user['_id'],'reward_id':item['_id'],'reward_title':item['title'],'cost':item['cost'],'status':'pending_fulfillment','created_at':now}
 r=mongo.db.redemptions.insert_one(red)
 return {'redemption':doc({**red,'_id':r.inserted_id})},201

@bp.get('/redemptions')
@required
def my_redemptions():
 return {'redemptions':[doc(x) for x in mongo.db.redemptions.find({'user_id':g.user['_id']}).sort('created_at',-1)]}

@bp.get('/admin/redemptions')
@staff_required
def queue():
 status=request.args.get('status','pending_fulfillment')
 rows=list(mongo.db.redemptions.find({'status':status}).sort('created_at',1))
 uids=list({r['user_id'] for r in rows})
 unames={u['_id']:u.get('username') for u in mongo.db.users.find({'_id':{'$in':uids}},{'username':1})} if uids else {}
 out=[]
 for r in rows:
  x=doc(r);x['username']=unames.get(r['user_id']);out.append(x)
 return {'redemptions':out}

@bp.post('/admin/redemptions/<rid>/fulfill')
@staff_required
def fulfill(rid):
 red=mongo.db.redemptions.find_one({'_id':oid(rid)})
 if not red:return {'error':'not_found'},404
 d=request.get_json() or {};status=d.get('status','fulfilled')
 if status not in ('fulfilled','rejected'):return {'error':'invalid_status'},400
 mongo.db.redemptions.update_one({'_id':red['_id']},{'$set':{'status':status,'note':d.get('note',''),'resolved_by':g.user['_id'],'resolved_at':datetime.now(timezone.utc)}})
 if status=='rejected':credits.add(red['user_id'],red['cost'],reason='redemption_refund',order_id=None);mongo.db.rewards.update_one({'_id':red['reward_id']},{'$inc':{'stock':1}})
 notify(red['user_id'],'reward',f'Your redemption of "{red["reward_title"]}" was {status}',link='/notifications',entity_type='reward',entity_id=red['_id'],route={'kind':'notifications'})
 return {'redemption':doc(mongo.db.redemptions.find_one({'_id':red['_id']}))}
