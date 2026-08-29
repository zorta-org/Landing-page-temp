from datetime import datetime,timedelta,timezone
import jwt
from app.config import Config

def access(uid):
    now=datetime.now(timezone.utc)
    return jwt.encode({'sub':str(uid),'type':'access','exp':now+timedelta(minutes=Config.ACCESS_MINUTES)},Config.JWT_SECRET,algorithm='HS256')
def refresh(uid):
    now=datetime.now(timezone.utc)
    return jwt.encode({'sub':str(uid),'type':'refresh','exp':now+timedelta(days=30)},Config.JWT_REFRESH_SECRET,algorithm='HS256')
