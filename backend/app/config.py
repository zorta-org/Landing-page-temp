import os
from dotenv import load_dotenv
load_dotenv()
class Config:
    MONGO_URI=os.getenv('MONGO_URI','mongodb://127.0.0.1:27017')
    MONGO_DB=os.getenv('MONGO_DB','zorta')
    JWT_SECRET=os.getenv('JWT_SECRET','dev-change-me')
    JWT_REFRESH_SECRET=os.getenv('JWT_REFRESH_SECRET','dev-refresh-change-me')
    ACCESS_MINUTES=int(os.getenv('ACCESS_MINUTES','45'))
    FRONTEND_URL=os.getenv('FRONTEND_URL','http://localhost:5173')
    GOOGLE_CLIENT_ID=os.getenv('GOOGLE_CLIENT_ID','')
    GOOGLE_CLIENT_SECRET=os.getenv('GOOGLE_CLIENT_SECRET','')
    GOOGLE_REDIRECT_URI=os.getenv('GOOGLE_REDIRECT_URI','http://localhost:5050/api/auth/google/callback')
