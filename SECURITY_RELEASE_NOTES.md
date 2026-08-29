# Zorta Release Security Notes

## Important
The source archive supplied for this release contained live-looking MongoDB and Google OAuth credentials in `.env` and `.env.example`. Those files are intentionally excluded from the release archive. Rotate any credentials that were present in the supplied archive before deploying.

## Included hardening
- Mongo-backed fixed-window rate limiting with TTL cleanup for authentication, DMs, community moderation/channel messages, marketplace mutations, and reward redemption.
- Marketplace order funding uses an atomic cached credit balance and a conditional listing claim to prevent concurrent double-hire/overspend paths.
- Milestone release uses an atomic `approved -> paid` transition, so a repeated approval request cannot credit the same milestone twice.
- Marketplace DMs use the same professional-order/proposal permission rules as the canonical Messages UI.
- Frontend user identity normalization now keeps the internal Mongo `id` separate from the public `user_id`. This fixes server owner/admin detection and marketplace client/freelancer detection.

## Verification limits
The backend source compiles with Python `compileall`. The bundled frontend dependencies contain platform-specific/missing native packages in this Linux environment, so a real Vite production build and browser E2E run were not possible here. Run `npm install && npm run build` on the deployment/development machine before release.
