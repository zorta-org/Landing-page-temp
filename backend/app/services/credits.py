from datetime import datetime,timezone
from app.extensions import mongo

MILESTONES=[(100,50),(500,200),(1000,500),(5000,2000)]

def add(user_id,amount,reason='',order_id=None):
    if not amount:return
    amount=float(amount)
    mongo.db.credits.insert_one({'user_id':user_id,'amount':amount,'reason':reason,'order_id':order_id,'created_at':datetime.now(timezone.utc)})
    mongo.db.users.update_one({'_id':user_id},{'$inc':{'credit_balance':amount}})

def balance(user_id):
    u=mongo.db.users.find_one({'_id':user_id},{'credit_balance':1})
    if u and 'credit_balance' in u:return float(u.get('credit_balance') or 0)
    agg=list(mongo.db.credits.aggregate([{'$match':{'user_id':user_id}},{'$group':{'_id':None,'total':{'$sum':'$amount'}}}]))
    return float(agg[0]['total']) if agg else 0.0

def spend(user_id,amount,reason='',order_id=None):
    amount=float(amount)
    if amount<=0:return False
    now=datetime.now(timezone.utc)
    updated=mongo.db.users.update_one({'_id':user_id,'credit_balance':{'$gte':amount}},{'$inc':{'credit_balance':-amount}})
    if updated.modified_count != 1:return False
    try:
        mongo.db.credits.insert_one({'user_id':user_id,'amount':-amount,'reason':reason,'order_id':order_id,'created_at':now})
        return True
    except Exception:
        mongo.db.users.update_one({'_id':user_id},{'$inc':{'credit_balance':amount}})
        raise

def check_milestones(user_id):
    u=mongo.db.users.find_one({'_id':user_id},{'reputation':1,'credit_milestones':1})
    if not u:return
    rep=u.get('reputation',0);hit=set(u.get('credit_milestones',[]))
    for threshold,reward in MILESTONES:
        if rep>=threshold and threshold not in hit:
            add(user_id,reward,reason=f'reputation_milestone_{threshold}')
            mongo.db.users.update_one({'_id':user_id},{'$addToSet':{'credit_milestones':threshold}})
