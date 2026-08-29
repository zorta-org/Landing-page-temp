# Zorta Release Performance Audit

## Checkpoint 1 — backend

The uploaded project could be inspected and compiled, but the sandbox does not have the project's MongoDB instance or the uploaded macOS native dependency binaries. That means a real production traffic trace could not honestly be claimed. The audit therefore combined executable code-path inspection with database/query-path analysis, and the release adds lightweight runtime timing instrumentation (`X-Response-Time-ms` plus warnings for requests >= 200 ms) so the deployed service can produce real measurements.

### High-impact bottlenecks found

| Area | Before | Root cause | Release change |
|---|---|---|---|
| Feed enrichment | Up to ~101 DB round trips for 50 posts | One vote lookup + one save lookup per post | 2 batched `$in` queries for the whole page |
| Vote writes | Full vote collection scan on every vote | `sum(...)` over every matching vote | Atomic `$inc` using the vote delta |
| Forum pagination | First 50 only / no cursor | Entire sorted query path had no continuation contract | Cursor pagination with bounded pages |
| Comments | Entire comment collection for a post | No page size/cursor | Bounded cursor pagination |
| Workspace payload | All file contents returned with workspace | Large code blobs bundled into metadata request | File listing excludes `content`; dedicated file endpoint returns it |
| Messages | Oldest 200 messages returned | Ascending sort + limit | Fetch newest bounded window, reverse for display |
| Profile | Workspaces were unbounded | Missing upper bound | Bounded recent workspace list |
| Search | Case-insensitive regex across multiple collections | Regex scans do not scale well | Mongo text indexes + `$text` search |
| GitHub refresh | Every refresh caused an external HTTP request | No freshness window | 5-minute DB-backed snapshot cache |

### Complexity reasoning

The old feed enrichment was effectively `O(P)` database calls after the page query, where `P` was the number of posts. For 50 posts, it could issue 100 additional lookups. The release turns that into two set-based queries, so enrichment is constant in round-trip count for a page.

The old vote path scanned all votes for a post to recalculate the score. The release stores the score as a maintained counter and applies only the delta (`+1`, `-1`, `+2`, or `-2`) atomically, making the write path independent of the number of historical votes.

## Caching tradeoffs

The GitHub snapshot cache uses a 5-minute freshness window. This reduces repeated external requests and latency while accepting up to five minutes of metadata staleness. A manual refresh endpoint remains available after the freshness window. General forum content is intentionally not aggressively cached because votes, replies, moderation reports, and notifications need predictable freshness.

## Checkpoint 2 — frontend

- Added a centralized API client in `frontend/src/lib/api.ts`.
- Forum pages use bounded loading and an explicit “Load more” interaction instead of silently loading everything.
- Existing skeleton loading states are retained and the forum list uses `content-visibility:auto` for long feeds.
- Added reduced-motion support.
- Added immediate button states and inline save confirmation in Settings.
- Added responsive forum/thread styling and lightweight transitions only.

## Verification limits

- Python source compiles successfully with `python3 -m compileall -q backend/app`.
- Frontend TypeScript passes strict checking with TypeScript 5.8.3 when invoked directly against the source set.
- The uploaded `node_modules` contains macOS-native packages, so the Linux sandbox cannot execute the Vite/Rolldown production build without reinstalling platform-specific optional dependencies. The project itself is not changed to depend on those native binaries; a normal `npm install` on the target machine resolves them.
- Backend pytest could not run in the sandbox because Python dependencies were not installed and outbound package installation is unavailable.
