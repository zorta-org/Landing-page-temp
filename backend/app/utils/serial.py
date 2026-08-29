from bson import ObjectId
from datetime import datetime,date

def clean(v):
    if isinstance(v,ObjectId): return str(v)
    if isinstance(v,(datetime,date)): return v.isoformat()
    if isinstance(v,dict): return {k:clean(x) for k,x in v.items()}
    if isinstance(v,list): return [clean(x) for x in v]
    return v

def doc(v):
    if v is None:return None
    x=clean(dict(v))
    if '_id' in x:x['id']=x.pop('_id')
    return x
