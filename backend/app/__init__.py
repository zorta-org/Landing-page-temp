from flask import Flask, g, request
from time import perf_counter
import logging
from flask_cors import CORS
from .config import Config
from .extensions import mongo

def create_app():
    app=Flask(__name__);app.config.from_object(Config);app.config['MAX_CONTENT_LENGTH']=6*1024*1024
    app.logger.setLevel(logging.INFO)
    @app.before_request
    def _perf_start(): g._perf_start=perf_counter()
    @app.after_request
    def _perf_end(response):
        elapsed=(perf_counter()-getattr(g,'_perf_start',perf_counter()))*1000
        response.headers['X-Response-Time-ms']=f'{elapsed:.1f}'
        if elapsed>=200: app.logger.warning('slow_request method=%s path=%s duration_ms=%.1f', request.method, request.path, elapsed)
        return response
    allowed_origins = {Config.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'}
    CORS(app, resources={r'/api/*': {'origins': list(allowed_origins)}}, supports_credentials=True)
    mongo.init_app(app)
    def ensure_index(collection, keys, name, **options):
        existing = collection.index_information()
        key_list = keys if isinstance(keys, list) else [(keys, 1)]
        for existing_name, info in existing.items():
            if info.get('key') == key_list:
                if existing_name == name:
                    return
                # Reuse an equivalent existing index rather than failing startup
                # because MongoDB assigned it another name.
                return
        collection.create_index(keys, name=name, **options)

    try:
        ensure_index(mongo.db.users, [('username', 1)], 'users_username_unique', unique=True)
        ensure_index(mongo.db.users, [('user_id', 1)], 'users_user_id_unique', unique=True, sparse=True)
        ensure_index(mongo.db.notifications, [('user_id', 1), ('created_at', -1)], 'notifications_user_created')
        ensure_index(mongo.db.startup_comments, [('startup_id', 1), ('created_at', 1)], 'startup_comments_startup_created')
        ensure_index(mongo.db.startup_applications, [('startup_id', 1), ('applicant_id', 1)], 'startup_application_unique', unique=True)
        ensure_index(mongo.db.direct_messages, [('sender_id', 1), ('recipient_id', 1), ('created_at', 1)], 'dm_conversation')
        ensure_index(mongo.db.direct_messages, [('recipient_id', 1), ('read', 1)], 'dm_unread')
        ensure_index(mongo.db.followers, [('follower_id', 1), ('following_id', 1)], 'followers_unique', unique=True)
        ensure_index(mongo.db.servers, [('members', 1)], 'servers_members')
        ensure_index(mongo.db.servers, [('owner_id', 1)], 'servers_owner')
        ensure_index(mongo.db.server_moderation_logs, [('server_id', 1), ('created_at', -1)], 'server_moderation_server_created')
        ensure_index(mongo.db.gigs, [('listing_type', 1), ('status', 1), ('created_at', -1)], 'gigs_listing_status_created')
        ensure_index(mongo.db.gigs, [('client_id', 1), ('created_at', -1)], 'gigs_client_created')
        ensure_index(mongo.db.gigs, [('freelancer_id', 1), ('created_at', -1)], 'gigs_freelancer_created')
        ensure_index(mongo.db.proposals, [('gig_id', 1), ('status', 1), ('created_at', -1)], 'proposals_gig_status_created')
        ensure_index(mongo.db.blocks, [('blocker_id', 1), ('blocked_id', 1)], 'blocks_pair_unique', unique=True)
        ensure_index(mongo.db.rate_limits, [('expires_at', 1)], 'rate_limits_ttl', expireAfterSeconds=0)
        ensure_index(mongo.db.orders, [('client_id', 1), ('freelancer_id', 1), ('status', 1), ('updated_at', -1)], 'orders_participants_status')
    except Exception as exc:
        app.logger.warning('index_initialization_failed: %s', exc)
    from .routes.auth import bp as auth
    from .routes.core import bp as core
    from .routes.workspaces import bp as workspaces
    from .routes.market import bp as market
    from .routes.startups import bp as startups
    from .routes.community import bp as community
    from .routes.messages import bp as messages
    from .routes.misc import bp as misc
    from .routes.rewards import bp as rewards
    from .routes.moderation import bp as moderation
    from .routes.admin import bp as admin
    from .routes.referrals import bp as referrals
    for b in [auth,core,workspaces,market,startups,community,messages,misc,rewards,moderation,admin,referrals]:app.register_blueprint(b,url_prefix='/api')
    @app.get('/api/health')
    def health():
        try:mongo.db.command('ping');db='ok'
        except Exception:db='unavailable'
        return {'ok':True,'database':db}
    return app