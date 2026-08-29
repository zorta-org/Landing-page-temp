# Zorta production-readiness pass

## 1. Messaging / DMs — FIXED
- Dedicated bottom-right Messages dock with unread badge.
- Conversation list + thread, optimistic sends with rollback, read state, timestamps and older-message pagination.
- Server-side mutual-follow enforcement on both the new and legacy DM write endpoints.
- Unfollow/block-like loss of mutual follow prevents future sends while preserving history.
- Manual decision: WebSocket transport can replace the current polling/streaming model later; current behavior is safe and deployable.

## 2. Notifications — FIXED
- Notification records now carry `entity_type`, `entity_id`, and a structured `route` where applicable.
- Follow, mutual-follow, DM, post/comment/reply, startup, project-cookie milestone, badge and server-moderation notifications route to their target.
- Legacy link fallback remains for older notification records.

## 3. Admin / profiles — FIXED
- Admin users can search, inspect, edit, suspend, ban/unban and soft-delete users.
- Activity history and badge definition/award/revoke controls added.
- Profile first renders a compact summary and then hydrates detailed activity/projects/posts progressively.
- Manual decision: badge criteria are stored as structured JSON but automatic criteria evaluation is intentionally not enabled until product rules are finalized.

## 4. Server moderation — FIXED
- Server-side owner/admin role checks remain authoritative.
- Kick, timed/permanent ban, timed/indefinite mute, timeout, unban and audit history are available.
- Affected users receive deep-linked moderation notifications.

## 5. UI loading bugs — FIXED
- Project “Give access” no longer shares the global project busy flag. It has its own operation state and `finally` cleanup.
- Other project actions still serialize destructive/editor operations through the existing guard to prevent duplicate writes.

## 6. Projects — FIXED
- Support/stars are presented as Cookies and stored in a unique `(workspace_id,user_id)` relationship.
- Existing project stars are migrated into Cookies without deleting history.
- Discussions are now topic-based with titles, reply counts, last activity and threaded reply views.

## 7. Projects / Startups / Forums release audit

### Projects
- FIXED: empty/error states, cookie toggle rollback path, discussion empty state, access permission enforcement, older discussion replies.
- FIXED: mobile Messages overlay and core project discussion layout.
- NEEDS PRODUCT DECISION: whether project access should be invite-only by default for private projects.
- NEEDS PRODUCT DECISION: whether Cookies should trigger reputation/reward payouts and what anti-abuse threshold applies.

### Startups
- FIXED: existing comment loading/error handling and notification deep links were preserved.
- FIXED: startup application/comment notifications now carry target metadata.
- NEEDS PRODUCT DECISION: application status workflow and whether founders should have a dedicated applicant management UI.
- NEEDS PRODUCT DECISION: startup discovery ranking and pagination strategy.

### Forums / Posts
- FIXED: optimistic voting/comment rollback patterns already present were preserved.
- FIXED: discussion reply notifications now route to the parent post.
- NEEDS PRODUCT DECISION: whether forum feeds should move from page-size limits to cursor pagination everywhere.
- NEEDS PRODUCT DECISION: moderation SLA and escalation states for reported content.

## 8. Senior-engineer recommendations
1. Add Redis-backed rate limiting for DMs, follows, comments, reports and moderation actions; the current project limiter is process-local.
2. Move DM delivery to WebSockets/SSE with reconnect/backoff once realtime requirements justify the operational complexity.
3. Add automated API integration tests for mutual-follow DMs, moderation permissions, timed bans/mutes, badge awards and Cookies uniqueness.
4. Add MongoDB schema/index migration execution to deployment CI and fail deployments on migration errors instead of merely logging them.
5. Add request IDs, structured JSON logs and centralized error reporting.
6. Sanitize/validate rich text and uploaded media; enforce MIME sniffing and image dimension limits server-side.
7. Add pagination to every large admin/profile/project collection and avoid unbounded `limit(500)` style endpoints as data grows.
8. Add accessibility checks: keyboard focus for dialogs, visible focus rings, button labels, reduced-motion support and screen-reader announcements for optimistic sends.
9. Add CSRF protection if cookie-based auth is introduced; current bearer-token auth reduces that risk.
10. Add backups, restore drills and TTL/retention policies for audit/event collections where appropriate.
11. Add unique/index coverage to all hot query paths and monitor slow Mongo queries in production.
12. Add frontend error boundaries and a global toast/error system instead of scattered `alert()` calls.

## Production pass — 2026-08-26

### Fixed
- `/api/workspaces?sort=latest` no longer references an undefined `ordering` variable.
- Server members can be managed from the Members panel with server-side role/moderation checks.
- Owners can promote members to Admin or demote Admins to Member; role changes are audited and notify the affected user.
- Server staff can mute, timed-mute, kick, ban and unban members; owners remain protected and admins cannot moderate other admins.
- Admin UI redesigned from a single horizontal/table-heavy surface into a responsive control-center layout with navigation, KPIs, operational queues, user cards, server cards, report queue, badge management and audit history.
- Marketplace now has role-aware Find Work / Hire Talent modes.
- Gig creation supports categories, skills, deadline and requirements and explicitly frames budgets as Zorta credits.
- Proposal submission supports milestone breakdowns.
- Client proposal review includes freelancer identity/reputation/completed-order context and inline accept/reject.
- Proposals track `seen` state.
- Orders support milestone submission, approval/revision and per-milestone credit release.
- Existing orders without milestones are backfilled to one implicit milestone.
- Client cancellation/refund only returns unreleased milestone funds; already released milestone credits remain with the freelancer.
- Professional DM access is centralized in `services/messaging.py` and covers mutual follows plus active marketplace relationships. Rejected proposals and terminal orders do not grant permanent access.
- New-conversation DM creation is rate-limited per user/hour.
- DM threads expose block/report controls; reports enter the admin queue.
- DM notifications retain deep-link routing metadata.

### Needs product decision
- Exact marketplace fee/commission model, if any.
- Whether clients can edit milestone amounts after proposal submission or only before acceptance.
- Whether freelancers may invite clients to mutual-follow before pre-hire messaging closes.
- Final dispute adjudication workflow and SLA.
- Whether admin role changes should require a second-person approval/audit confirmation.
- Exact rewards catalog and redemption fulfilment SLAs for Discord Nitro, gift cards and game credits.

### Manual marketplace acceptance test
1. Sign in as `maya@zorta.dev` and confirm a positive Zorta credit balance.
2. Post a gig with at least two milestones/requirements and a deadline.
3. Sign in as `arjun@zorta.dev`, open Find Work, filter/search the gig and submit a proposal with two milestones.
4. Return to Maya and open Hire Talent → My gigs → Review proposals.
5. Confirm Arjun's proposal shows offer, milestone count, seen state, reputation and completed-order count.
6. Accept the proposal and confirm the order is `in_progress` and Maya's Zorta credit balance decreases by the full offer amount.
7. Open Messages and confirm Maya/Arjun can message through the professional relationship even without a mutual follow.
8. As Arjun, submit milestone 1. Confirm Maya sees `submitted`.
9. As Maya, approve milestone 1. Confirm only milestone 1 amount is added to Arjun's credits and the remaining milestone stays escrowed.
10. Repeat submit/approve for the remaining milestone(s).
11. Confirm the order reaches `completed` only after all milestones are paid.
12. Submit the final review.
13. Open Rewards and verify the resulting credits are presented as redeemable Zorta balance rather than cash/bank payment.
14. Reject a separate proposal and confirm it does not grant professional DM access afterward.
15. Cancel an order after one milestone has been paid and confirm only unreleased funds return to the client.
