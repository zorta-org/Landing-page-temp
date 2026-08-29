from flask import Blueprint,request,jsonify,g,redirect
from werkzeug.security import generate_password_hash,check_password_hash
from datetime import datetime,timezone,timedelta
from bson import ObjectId
from urllib.parse import urlencode
import re, secrets
import jwt,requests
from app.extensions import mongo
from app.config import Config
from app.utils.tokens import access,refresh
from app.utils.auth import required
from app.utils.serial import doc
from app.utils.rate_limit import limited
from app.services import referrals
bp=Blueprint('auth',__name__)

@bp.post('/auth/signup')
@limited('auth_signup', 8, 3600)
def signup():
 d=request.get_json() or {}; email=d.get('email','').strip().lower(); username=d.get('username','').strip(); pw=d.get('password','')
 if not email or not username or not pw or not d.get('display_name') or not d.get('age_confirmed'):return {'error':'email, username, display_name, password and 13+ confirmation are required'},400
 if not re.fullmatch(r'[A-Za-z0-9]{3,24}', username):return {'error':'username_must_be_3_to_24_letters_or_numbers_only'},400
 if len(pw)<8:return {'error':'password_must_be_8_characters'},400
 if mongo.db.users.find_one({'$or':[{'email':email},{'username':username}]}):return {'error':'email_or_username_exists'},409
 now=datetime.now(timezone.utc);user_id='Z-'+secrets.token_hex(16).upper();u={'email':email,'username':username,'user_id':user_id,'display_name':d['display_name'].strip(),'password_hash':generate_password_hash(pw),'age_confirmed':True,'email_verified':False,'onboarding_complete':False,'bio':'','avatar':'','skills':[],'interests':[],'roles':[],'links':{},'reputation':0,'platform_role':'user','referral_code':referrals.generate_code(),'created_at':now}
 r=mongo.db.users.insert_one(u);u['_id']=r.inserted_id
 referrals.apply_referral(r.inserted_id, username, d.get('referral_code') or d.get('ref'))
 public_u={k:v for k,v in u.items() if k!='password_hash'}
 return {'user':doc(public_u),'access_token':access(r.inserted_id),'refresh_token':refresh(r.inserted_id)},201
@bp.post('/auth/login')
@limited('auth_login', 12, 900)
def login():
 d=request.get_json() or {};u=mongo.db.users.find_one({'email':d.get('email','').lower()})
 if not u or not check_password_hash(u.get('password_hash',''),d.get('password','')):return {'error':'invalid_credentials'},401
 if u.get('platform_banned'):return {'error':'account_banned'},403
 public_u={k:v for k,v in u.items() if k!='password_hash'}
 return {'user':doc(public_u),'access_token':access(u['_id']),'refresh_token':refresh(u['_id'])}
@bp.get('/auth/me')
@required
def me():return {'user':doc(g.user)}
@bp.post('/auth/refresh')
@limited('auth_refresh', 30, 3600)
def refresh_route():
 try:
  p=jwt.decode((request.get_json() or {}).get('refresh_token',''),Config.JWT_REFRESH_SECRET,algorithms=['HS256']);u=mongo.db.users.find_one({'_id':ObjectId(p['sub'])})
  if not u:raise ValueError()
  return {'access_token':access(u['_id'])}
 except Exception:return {'error':'invalid_refresh_token'},401
@bp.get('/auth/google')
def google():
 if not Config.GOOGLE_CLIENT_ID:return {'error':'google_provider_not_configured'},503
 q=urlencode({'client_id':Config.GOOGLE_CLIENT_ID,'redirect_uri':Config.GOOGLE_REDIRECT_URI,'response_type':'code','scope':'openid email profile','access_type':'offline','prompt':'select_account','state':(request.args.get('ref') or '')[:32]})
 return {'authorization_url':'https://accounts.google.com/o/oauth2/v2/auth?'+q}
@bp.get('/auth/google/callback')
def google_callback():
 if not Config.GOOGLE_CLIENT_ID:return redirect(Config.FRONTEND_URL+'/login?error=google_not_configured')
 try:
  code=request.args['code'];ref=request.args.get('state','');t=requests.post('https://oauth2.googleapis.com/token',data={'code':code,'client_id':Config.GOOGLE_CLIENT_ID,'client_secret':Config.GOOGLE_CLIENT_SECRET,'redirect_uri':Config.GOOGLE_REDIRECT_URI,'grant_type':'authorization_code'},timeout=10).json()
  info=requests.get('https://www.googleapis.com/oauth2/v3/userinfo',headers={'Authorization':'Bearer '+t['access_token']},timeout=10).json();email=info['email'].lower()
  u=mongo.db.users.find_one({'email':email});now=datetime.now(timezone.utc)
  if not u:
   base=(info.get('name') or email.split('@')[0]).strip();username=''.join(c for c in base if c.isalnum())[:24] or 'Builder'
   i=2;candidate=username
   while mongo.db.users.find_one({'username':candidate}):candidate=(username[:21]+str(i))[:24];i+=1
   username=candidate
   r=mongo.db.users.insert_one({'email':email,'username':username,'user_id':'Z-'+secrets.token_hex(16).upper(),'display_name':base,'avatar':info.get('picture',''),'bio':'','skills':[],'interests':[],'roles':[],'links':{},'reputation':0,'platform_role':'user','referral_code':referrals.generate_code(),'age_confirmed':False,'email_verified':True,'onboarding_complete':False,'auth_provider':'password','username_changed_at':None,'created_at':now});u=mongo.db.users.find_one({'_id':r.inserted_id})
   referrals.apply_referral(u['_id'],username,ref)
  return redirect(Config.FRONTEND_URL+'/?access_token='+access(u['_id'])+'&refresh_token='+refresh(u['_id']))
 except Exception:return redirect(Config.FRONTEND_URL+'/login?error=google_failed')
