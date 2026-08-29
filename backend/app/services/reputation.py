from datetime import datetime,timezone
from app.extensions import mongo

POINTS={'post':5,'comment':2,'upvote_received':3,'workspace':10,'commit':4,'freelance_completed':25,'review_positive':8,'startup_join':8}
def add(user_id,kind,amount=None,reason=''):
    pts=amount if amount is not None else POINTS.get(kind,0)
    if not pts:return
    mongo.db.users.update_one({'_id':user_id},{'$inc':{'reputation':pts}})
    mongo.db.activity.insert_one({'user_id':user_id,'kind':kind,'points':pts,'reason':reason,'created_at':datetime.now(timezone.utc)})
