# Marketplace + Community Server Fix

## Marketplace
- Fixed `/api/proposals` `UnboundLocalError` caused by shadowing Flask's `g` with a local `gigs.get(...)` variable.
- Marketplace browse now loads listings independently from proposals/orders/dashboard, so an auxiliary request cannot blank the entire browse screen.
- Marketplace modes are plain-language: `I want to get hired` and `I want to hire someone`.
- Marketplace create flow defaults to title, description and credits; deadline/skills/category/requirements are collapsed under `Add more details`.
- Orders expose client/freelancer usernames so Marketplace and Panel can open the global Direct Messages view.
- Global Panel now has a Marketplace tab with orders, applications and direct Message/Open actions.

## Community servers
- Server hierarchy is only Owner -> Admin -> Member.
- Owners can promote/demote members and moderate both members and admins.
- Admins can moderate regular members only; they cannot moderate the owner or another admin.
- Owners cannot act on themselves.
- Kick/ban/timeout/mute actions use confirmation modals and show success/error feedback.
- Existing experimental server-level moderator fields are removed by migration 7.
- Existing moderation audit logs and notifications remain in use.

## Validation
- Backend `compileall`: passed.
- Frontend `tsc --noEmit` for `src/vite-env.d.ts` + `src/main.tsx`: passed.
- Full Vite build was not executable in the supplied sandbox because the bundled `node_modules` is missing its native Rolldown binding. This is an environment dependency issue; no source-level TypeScript errors remain in the checked frontend entrypoint.
