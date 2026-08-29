from functools import wraps
from flask import request,jsonify,g
from bson import ObjectId
import jwt
from app.extensions import mongo
from app.config import Config

def current_user():
    h=request.headers.get('Authorization','')
    if not h.startswith('Bearer '):return None
    try:
        p=jwt.decode(h[7:],Config.JWT_SECRET,algorithms=['HS256'])
        if p.get('type')!='access':return None
        return mongo.db.users.find_one({'_id':ObjectId(p['sub'])},{'password_hash':0})
    except Exception:return None

def required(fn):
    @wraps(fn)
    def w(*a,**kw):
        u=current_user()
        if not u:return jsonify({'error':'authentication_required'}),401
        now=__import__('datetime').datetime.now(__import__('datetime').timezone.utc)
        until=u.get('suspended_until')
        if u.get('deleted_at'): return jsonify({'error':'account_deleted'}),403
        if u.get('platform_banned'): return jsonify({'error':'account_banned'}),403
        if until and until > now: return jsonify({'error':'account_suspended','until':until.isoformat()}),403
        g.user=u
        return fn(*a,**kw)
    return w

def admin_required(fn):
    @wraps(fn)
    def w(*a,**kw):
        u=current_user()
        if not u:return jsonify({'error':'authentication_required'}),401
        if u.get('platform_role')!='admin':return jsonify({'error':'forbidden'}),403
        g.user=u
        return fn(*a,**kw)
    return w

def staff_required(fn):
    @wraps(fn)
    def w(*a,**kw):
        u=current_user()
        if not u:return jsonify({'error':'authentication_required'}),401
        if u.get('platform_role') not in ('moderator','admin'):return jsonify({'error':'forbidden'}),403
        g.user=u
        return fn(*a,**kw)
    return w
