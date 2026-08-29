from datetime import datetime, timezone
from bson import ObjectId
from app.extensions import mongo


def notify(user_id, kind, title, body='', link='', *, entity_type=None, entity_id=None, route=None):
    if not user_id:
        return
    payload = {
        'user_id': user_id, 'kind': kind, 'title': title, 'body': body,
        'link': link or '', 'read': False, 'created_at': datetime.now(timezone.utc),
    }
    if entity_type:
        payload['entity_type'] = entity_type
    if entity_id is not None:
        payload['entity_id'] = entity_id
    if route:
        payload['route'] = route
    mongo.db.notifications.insert_one(payload)


def notify_entity(user_id, kind, title, *, entity_type, entity_id, body='', route=None):
    notify(user_id, kind, title, body, entity_type=entity_type, entity_id=entity_id, route=route)
