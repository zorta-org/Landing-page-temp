# MongoDB migrations

Zorta uses MongoDB rather than a relational ORM. Production schema changes are versioned in `backend/migrations/` and executed during app initialization before routes are served.

- v1: records production-readiness schema baseline for notification routing, message metadata, moderation audit records and badge collections.
- v2: copies legacy `project_stars` relationships into `project_cookies` with a unique `(workspace_id,user_id)` key.
- v3: records the project discussion-topic/reply schema introduction.
- v4: introduces the unique user block relationship used to prevent future DMs while preserving history.

Index definitions remain centralized in `backend/app/extensions.py`. Migrations are deliberately non-destructive: existing messages, posts, comments and moderation history are retained.
- v5: marketplace milestone fields on orders. Existing orders are backfilled with one implicit `Complete project` milestone; new proposals/orders persist milestone breakdowns and indexes cover gig/proposal/order hot paths.

- v6: adds explicit marketplace `listing_type` values (`job_request` / `service`) and backfills legacy gigs as client job requests.

## Migration 7 — Server role cleanup
- Server roles are strictly `Owner`, `Admin`, and `Member`.
- Any experimental `moderators` server field is removed from existing server documents.
- No server-level moderator role is created.

- v8: adds the credits ledger index used by admin coin adjustments and defensively removes any experimental server moderator field.
