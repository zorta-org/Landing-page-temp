from pymongo import MongoClient, ASCENDING, DESCENDING
import secrets, re


class Mongo:
    client = None
    db = None

    def init_app(self, app):
        self.client = MongoClient(
            app.config['MONGO_URI'],
            serverSelectionTimeoutMS=3000,
            connectTimeoutMS=3000,
            socketTimeoutMS=8000,
            maxPoolSize=50,
            minPoolSize=5,
            retryWrites=True,
        )
        self.db = self.client[app.config['MONGO_DB']]
        self.ensure_indexes()
        try:
            from migrations import run as run_migrations
            run_migrations(self.db)
        except Exception as exc:
            app.logger.warning('schema_migration_failed: %s', exc)

    def ensure_indexes(self):
        d = self.db
        indexes = {
            'users': [
                ([('email', ASCENDING)], {'unique': True, 'name': 'users_email_unique'}),
                ([('username', ASCENDING)], {'unique': True, 'name': 'users_username_unique'}),
                ([('user_id', ASCENDING)], {'unique': True, 'name': 'users_user_id_unique'}),
                ([('username', ASCENDING), ('display_name', ASCENDING)], {'name': 'users_search'}),
                ([('$**', 'text')], {'name': 'users_text_search'}),
            ],
            'posts': [
                ([('created_at', DESCENDING), ('_id', DESCENDING)], {'name': 'posts_new'}),
                ([('score', DESCENDING), ('_id', DESCENDING)], {'name': 'posts_top'}),
                ([('author_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'posts_author'}),
                ([('workspace_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'posts_workspace'}),
                ([('$**', 'text')], {'name': 'posts_text_search'}),
            ],
            'votes': [
                ([('target_id', ASCENDING), ('target_type', ASCENDING), ('user_id', ASCENDING)], {'unique': True, 'name': 'votes_target_user_unique'}),
                ([('target_id', ASCENDING), ('target_type', ASCENDING), ('value', ASCENDING)], {'name': 'votes_target_value'}),
            ],
            'comments': [
                ([('post_id', ASCENDING), ('created_at', ASCENDING), ('_id', ASCENDING)], {'name': 'comments_post_new'}),
                ([('post_id', ASCENDING), ('parent_id', ASCENDING), ('created_at', ASCENDING)], {'name': 'comments_thread'}),
            ],
            'saves': [
                ([('user_id', ASCENDING), ('target_id', ASCENDING), ('target_type', ASCENDING)], {'unique': True, 'name': 'saves_user_target_unique'}),
            ],
            'blocks': [([('blocker_id', ASCENDING), ('blocked_id', ASCENDING)], {'unique': True, 'name': 'blocks_unique'}), ([('blocked_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'blocks_blocked_new'})],
            'followers': [
                ([('follower_id', ASCENDING), ('following_id', ASCENDING)], {'unique': True, 'name': 'followers_unique'}),
                ([('following_id', ASCENDING), ('follower_id', ASCENDING)], {'name': 'followers_following'}),
            ],
            'workspaces': [
                ([('owner_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'workspaces_owner'}),
                ([('created_at', DESCENDING), ('_id', DESCENDING)], {'name': 'workspaces_new'}),
                ([('$**', 'text')], {'name': 'workspaces_text_search'}),
            ],
            'files': [
                ([('workspace_id', ASCENDING), ('branch', ASCENDING), ('path', ASCENDING)], {'unique': True, 'name': 'files_workspace_branch_path_unique'}),
            ],
            'branches': [([('workspace_id', ASCENDING), ('name', ASCENDING)], {'unique': True, 'name': 'branches_workspace_name_unique'})],
            'workspace_comments': [([('workspace_id', ASCENDING), ('created_at', ASCENDING), ('_id', ASCENDING)], {'name': 'workspace_comments_new'})],
            'project_discussions': [([('workspace_id', ASCENDING), ('last_activity_at', DESCENDING), ('_id', DESCENDING)], {'name': 'project_discussions_activity'})],
            'project_discussion_replies': [([('discussion_id', ASCENDING), ('created_at', ASCENDING), ('_id', ASCENDING)], {'name': 'project_discussion_replies_new'}), ([('workspace_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'project_discussion_replies_workspace'})],
            'collaborators': [([('workspace_id', ASCENDING), ('user_id', ASCENDING)], {'unique': True, 'name': 'collaborators_workspace_user_unique'})],
            'project_stars': [([('workspace_id', ASCENDING), ('user_id', ASCENDING)], {'unique': True, 'name': 'project_stars_unique'})],
            'project_cookies': [([('workspace_id', ASCENDING), ('user_id', ASCENDING)], {'unique': True, 'name': 'project_cookies_unique'}), ([('workspace_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'project_cookies_new'})],
            'project_watches': [([('workspace_id', ASCENDING), ('user_id', ASCENDING)], {'unique': True, 'name': 'project_watches_unique'})],
            'issue_comments': [([('issue_id', ASCENDING), ('created_at', ASCENDING)], {'name': 'issue_comments_new'})],
            'pull_requests': [([('workspace_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'prs_workspace_new'})],
            'pr_comments': [([('pull_request_id', ASCENDING), ('created_at', ASCENDING)], {'name': 'pr_comments_new'})],
            'commits': [([('workspace_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'commits_workspace_new'})],
            'issues': [([('workspace_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'issues_workspace_new'})],
            'gigs': [
                ([('created_at', DESCENDING), ('_id', DESCENDING)], {'name': 'gigs_new'}),
                ([('status', ASCENDING), ('created_at', DESCENDING)], {'name': 'gigs_status_new'}),
                ([('$**', 'text')], {'name': 'gigs_text_search'}),
            ],
            'proposals': [
                ([('gig_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'proposals_gig_new'}),
                ([('gig_id', ASCENDING), ('status', ASCENDING), ('created_at', DESCENDING)], {'name': 'proposals_gig_status_new'}),
                ([('freelancer_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'proposals_freelancer_new'}),
                ([('freelancer_id', ASCENDING), ('status', ASCENDING), ('created_at', DESCENDING)], {'name': 'proposals_freelancer_status_new'}),
            ],
            'orders': [
                ([('client_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'orders_client_new'}),
                ([('freelancer_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'orders_freelancer_new'}),
                ([('status', ASCENDING), ('updated_at', DESCENDING)], {'name': 'orders_status_updated'}),
            ],
            'reviews': [([('target_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'reviews_target_new'})],
            'startups': [
                ([('created_at', DESCENDING), ('_id', DESCENDING)], {'name': 'startups_new'}),
                ([('$**', 'text')], {'name': 'startups_text_search'}),
            ],
            'startup_applications': [([('startup_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'startup_apps_new'}), ([('startup_id', ASCENDING), ('applicant_id', ASCENDING)], {'unique': True, 'name': 'startup_apps_unique'})],
            'notifications': [([('user_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'notifications_user_new'}), ([('user_id', ASCENDING), ('read', ASCENDING), ('created_at', DESCENDING)], {'name': 'notifications_unread'})],
            'direct_messages': [([('sender_id', ASCENDING), ('recipient_id', ASCENDING), ('created_at', DESCENDING), ('_id', DESCENDING)], {'name': 'dm_sender_recipient_new'}), ([('recipient_id', ASCENDING), ('read', ASCENDING), ('created_at', DESCENDING)], {'name': 'dm_recipient_unread'})],
            'badge_definitions': [([('slug', ASCENDING)], {'unique': True, 'name': 'badges_slug_unique'}), ([('active', ASCENDING), ('name', ASCENDING)], {'name': 'badges_active_name'})],
            'user_badges': [([('user_id', ASCENDING), ('badge_id', ASCENDING)], {'unique': True, 'name': 'user_badges_unique'}), ([('user_id', ASCENDING), ('awarded_at', DESCENDING)], {'name': 'user_badges_user_new'})],
            'server_moderation_logs': [([('server_id', ASCENDING), ('created_at', DESCENDING), ('_id', DESCENDING)], {'name': 'server_moderation_new'}), ([('target_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'server_moderation_target'})],
            'admin_activity': [([('target_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'admin_activity_target_new'})],

            'servers': [([('created_at', DESCENDING)], {'name': 'servers_new'}), ([('$**', 'text')], {'name': 'servers_text_search'})],
            'channels': [([('server_id', ASCENDING), ('name', ASCENDING)], {'unique': True, 'name': 'channels_server_name_unique'})],
            'messages': [([('channel_id', ASCENDING), ('created_at', DESCENDING), ('_id', DESCENDING)], {'name': 'messages_channel_new'})],
            'reports': [([('target_id', ASCENDING), ('reporter_id', ASCENDING)], {'unique': True, 'name': 'reports_target_reporter_unique'}), ([('status', ASCENDING), ('created_at', DESCENDING)], {'name': 'reports_moderation_queue'})],
            'activity': [([('user_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'activity_user_new'})],
            'credits': [([('user_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'credits_user_new'})],
            'rewards': [([('active', ASCENDING), ('cost', ASCENDING)], {'name': 'rewards_active_cost'})],
            'redemptions': [([('user_id', ASCENDING), ('created_at', DESCENDING)], {'name': 'redemptions_user_new'}), ([('status', ASCENDING), ('created_at', ASCENDING)], {'name': 'redemptions_fulfillment_queue'})],
        }
        # Older deployments may have accidentally created a text index using
        # `language` as MongoDB's language_override. `language` is a programming
        # language in Zorta, so remove that legacy index if it exists.
        try:
            for idx in d['workspaces'].list_indexes():
                key=dict(idx.get('key', {}))
                if idx.get('language_override') == 'language':
                    d['workspaces'].drop_index(idx['name'])
        except Exception:
            pass
        # Normalize files before enforcing the branch-aware uniqueness rule.\n        try:\n            d['files'].update_many({'branch': {'$exists': False}}, {'$set': {'branch': 'main'}})\n        except Exception:\n            pass\n        # Older builds used workspace+path as the file key. Branch-aware files need
        # workspace+branch+path; drop the legacy index when it exists.
        try:
            d['files'].drop_index('files_workspace_path_unique')
        except Exception:
            pass
        # Normalize legacy usernames so the platform has one stable alphanumeric identity format.
        try:
            for u in d['users'].find({}, {'_id':1,'username':1}):
                old=str(u.get('username') or '')
                if re.fullmatch(r'[A-Za-z0-9]{3,24}', old):
                    continue
                base=''.join(ch for ch in old if ch.isalnum())[:20] or 'User'
                candidate=base; n=2
                while d['users'].find_one({'username':candidate,'_id':{'$ne':u['_id']}}):
                    candidate=(base[:20]+str(n))[:24]; n+=1
                d['users'].update_one({'_id':u['_id']},{'$set':{'username':candidate}})
                for coll,field in [('workspaces','owner_username'),('commits','author_username'),('issues','author_username'),('collaborators','username'),('workspace_comments','author_username'),('issue_comments','author_username'),('pull_requests','author_username'),('pr_comments','author_username')]:
                    try:d[coll].update_many({field:old},{'$set':{field:candidate}})
                    except Exception:pass
        except Exception:
            pass
        # Backfill a stable public Zorta ID for every account. The Mongo _id remains an internal key.
        try:
            for u in d['users'].find({'user_id': {'$exists': False}}, {'_id': 1}):
                d['users'].update_one({'_id': u['_id']}, {'$set': {'user_id': 'Z-' + secrets.token_hex(16).upper()}})
        except Exception:
            pass
        for collection, specs in indexes.items():
            for fields, options in specs:
                try:
                    d[collection].create_index(fields, **options)
                except Exception:
                    # Index creation must not prevent the API from starting if a legacy
                    # deployment has conflicting data/index definitions.
                    pass


mongo = Mongo()
