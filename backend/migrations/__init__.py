from datetime import datetime, timezone

CURRENT_VERSION = 9

def run(db):
    state = db.schema_migrations.find_one({'_id': 'zorta'})
    version = int((state or {}).get('version', 0))
    if version < 1:
        # Production-readiness schema: message metadata, notification routing,
        # moderation audit records, and badge definitions/awards.
        db.schema_migrations.update_one(
            {'_id': 'zorta'},
            {'$set': {'version': 1, 'applied_at': datetime.now(timezone.utc), 'name': 'production_readiness'}},
            upsert=True,
        )
    if version < 2:
        # Rename the product concept from project stars/support to Cookies while
        # preserving existing relationships exactly once.
        for row in db.project_stars.find({}, {'workspace_id':1,'user_id':1,'created_at':1}):
            db.project_cookies.update_one(
                {'workspace_id': row.get('workspace_id'), 'user_id': row.get('user_id')},
                {'$setOnInsert': {'workspace_id': row.get('workspace_id'), 'user_id': row.get('user_id'), 'created_at': row.get('created_at') or datetime.now(timezone.utc)}},
                upsert=True,
            )
        for wid in db.project_cookies.distinct('workspace_id'):
            count=db.project_cookies.count_documents({'workspace_id':wid})
            db.workspaces.update_one({'_id':wid},{'$set':{'cookies':count,'stars':count}})
        db.schema_migrations.update_one({'_id':'zorta'},{'$set':{'version':2,'applied_at':datetime.now(timezone.utc),'name':'cookies'}},upsert=True)
    if version < 3:
        db.schema_migrations.update_one({'_id':'zorta'},{'$set':{'version':3,'applied_at':datetime.now(timezone.utc),'name':'project_discussions'}},upsert=True)
    if version < 4:
        db.schema_migrations.update_one({'_id':'zorta'},{'$set':{'version':4,'applied_at':datetime.now(timezone.utc),'name':'blocks'}},upsert=True)
    if version < 5:
        # Marketplace milestone schema: existing orders remain valid and are lazily
        # backfilled to a single implicit milestone by the marketplace service.
        for order in db.orders.find({'milestones': {'$exists': False}}, {'_id':1,'amount':1}):
            db.orders.update_one({'_id': order['_id']}, {'$set': {'milestones': [{
                'id': __import__('bson').ObjectId(),
                'title': 'Complete project',
                'amount': float(order.get('amount', 0) or 0),
                'status': 'pending',
                'due_date': None,
                'submitted_at': None,
                'approved_at': None,
                'paid_at': None,
            }]}})
        db.schema_migrations.update_one({'_id':'zorta'},{'$set':{'version':5,'applied_at':datetime.now(timezone.utc),'name':'marketplace_milestones'}},upsert=True)
    if version < 6:
        # Marketplace now has two explicit listing types. Existing gigs were
        # client-created job requests, so backfill them without changing ownership.
        db.gigs.update_many({'listing_type': {'$exists': False}}, {'$set': {'listing_type': 'job_request'}})
        db.schema_migrations.update_one({'_id':'zorta'},{'$set':{'version':6,'applied_at':datetime.now(timezone.utc),'name':'marketplace_listing_types'}},upsert=True)
    if version < 7:
        # Server role model is intentionally only Owner -> Admin -> Member.
        # Remove any accidental moderator-role field from older experimental builds.
        db.servers.update_many({}, {'$unset': {'moderators': ''}})
        db.schema_migrations.update_one(
            {'_id': 'zorta'},
            {'$set': {'version': 7, 'applied_at': datetime.now(timezone.utc), 'name': 'server_owner_admin_member_roles'}},
            upsert=True,
        )
    if version < 8:
        # Admin credit adjustments use the existing append-only credits ledger.
        # Add a hot-path index and normalize server documents defensively.
        db.credits.create_index([('user_id', 1), ('created_at', -1)], name='credits_user_new')
        db.servers.update_many({}, {'$unset': {'moderators': ''}})
        db.schema_migrations.update_one(
            {'_id': 'zorta'},
            {'$set': {'version': 8, 'applied_at': datetime.now(timezone.utc), 'name': 'admin_credits_and_server_roles'}},
            upsert=True,
        )
    if version < 9:
        # Cache each user's append-only credit ledger total on the user document.
        # Marketplace/reward spending can then use a single atomic conditional update
        # instead of a collection-wide aggregation, preventing concurrent overspend.
        totals = {row['_id']: float(row.get('total', 0) or 0) for row in db.credits.aggregate([{'$group': {'_id': '$user_id', 'total': {'$sum': '$amount'}}}])}
        for uid in db.users.distinct('_id'):
            db.users.update_one({'_id': uid}, {'$set': {'credit_balance': totals.get(uid, 0.0)}})
        db.schema_migrations.update_one({'_id':'zorta'},{'$set':{'version':9,'applied_at':datetime.now(timezone.utc),'name':'cached_credit_balances'}},upsert=True)
    return 9
