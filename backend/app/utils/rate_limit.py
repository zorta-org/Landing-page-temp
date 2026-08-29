from functools import wraps
from hashlib import sha256
from datetime import datetime, timezone, timedelta
from flask import g, jsonify, request
from app.extensions import mongo
from pymongo import ReturnDocument


def check_rate_limit(scope, limit, window_seconds, identity=None):
    """Small, Mongo-backed fixed-window limiter shared by all API workers.

    It intentionally stores only a hashed bucket key and counters. A TTL index
    removes expired buckets so this does not become an unbounded collection.
    """
    if identity is None:
        identity = str(getattr(g, 'user', {}).get('_id') or f'ip:{request.remote_addr or "unknown"}')
    raw_key = f'{scope}:{identity}'
    key = sha256(raw_key.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    window_start = now.replace(microsecond=0) - timedelta(seconds=now.timestamp() % window_seconds)
    expires_at = window_start + timedelta(seconds=window_seconds * 2)

    # One document per fixed window. A deterministic _id makes the operation
    # atomic across multiple Flask workers/processes.
    doc = mongo.db.rate_limits.find_one_and_update(
        {'_id': f'{key}:{int(window_start.timestamp())}'},
        {'$inc': {'count': 1}, '$setOnInsert': {'scope': scope, 'window_start': window_start, 'expires_at': expires_at}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
        projection={'count': 1, 'window_start': 1},
    )
    count = int(doc.get('count', 0)) if doc else 0
    if count > limit:
        retry = max(1, int((window_start + timedelta(seconds=window_seconds) - now).total_seconds()))
        return False, retry
    return True, 0


def limited(scope, limit, window_seconds):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            allowed, retry = check_rate_limit(scope, limit, window_seconds)
            if not allowed:
                response = jsonify({'error': 'rate_limited', 'retry_after_seconds': retry})
                response.status_code = 429
                response.headers['Retry-After'] = str(retry)
                return response
            return fn(*args, **kwargs)
        return wrapped
    return decorator
