"""Document the MongoDB migration contract for production-readiness v1.

MongoDB collections are schemaless, so this migration records the schema version;
indexes are created by the dedicated migration/index bootstrap in app.extensions.
No existing messages/history are deleted or rewritten.
"""
VERSION = 1
