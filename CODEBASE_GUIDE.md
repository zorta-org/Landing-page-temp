# Zorta Codebase Guide

This release is intentionally organized so future feature work can be handled file-by-file instead of exchanging the whole repository.

## Frontend feature ownership

- `frontend/src/features/forums.tsx` — feed, posts, voting, saves, comments, threaded replies, edit/delete/report UI.
- `frontend/src/features/settings.tsx` — profile settings and theme settings.
- `frontend/src/lib/theme.tsx` — theme registry, theme persistence, first-visit picker.
- `frontend/src/lib/api.ts` — authenticated API client + refresh-token retry.
- `frontend/src/lib/types.ts` — shared frontend types.
- `frontend/src/components/ui.tsx` — shared Logo/Avatar primitives.
- `frontend/src/main.tsx` — application shell, navigation, auth boot, and page routing. Avoid adding feature-specific UI here.
- `frontend/src/styles.css` — global design system and responsive styling.

## Backend feature ownership

- `backend/app/routes/core.py` — posts/forum APIs, votes, comments, reports, follows.
- `backend/app/routes/misc.py` — profiles, notifications, global search.
- `backend/app/routes/workspaces.py` — project/workspace APIs and GitHub integration.
- `backend/app/routes/community.py` — communities, channels, messages.
- `backend/app/routes/market.py` — marketplace/gigs/orders.
- `backend/app/routes/startups.py` — startup APIs.
- `backend/app/routes/auth.py` — authentication and Google OAuth.
- `backend/app/extensions.py` — MongoDB client, pool settings, and indexes.
- `backend/app/services/` — cross-cutting services such as reputation and notifications.

## Performance conventions

1. Prefer projections for large MongoDB documents.
2. Use bounded `limit` values on collection endpoints.
3. Prefer cursor pagination over loading entire collections.
4. Never calculate counters by scanning an entire collection inside a write request. Maintain counters atomically.
5. Avoid one query per item. Batch IDs with `$in` when enriching a list.
6. External HTTP calls must have timeouts and should be cached where safe.
7. Keep file content out of workspace list/detail payloads unless the specific file is requested.

## Forum API conventions

Forum lists return bounded pages and expose `next_cursor` / `has_more` where applicable. Post and comment mutations are authenticated and ownership checks are enforced server-side. Reports are persisted for moderation instead of being treated as a client-only action.

## Theme conventions

Theme selection is stored in `localStorage` using `zorta_theme`. First-visit completion is stored as `zorta_theme_seen`. The picker is intentionally client-side because it is a visual preference and should apply before application content renders.

## Future file-based workflow

For a forum change, send `frontend/src/features/forums.tsx` and/or `backend/app/routes/core.py`.
For themes, send `frontend/src/lib/theme.tsx`, `frontend/src/features/settings.tsx`, and the relevant CSS.
For API behavior, send the relevant backend route plus `frontend/src/lib/api.ts` if the client contract changes.
