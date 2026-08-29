# Zorta v2 — complete runnable MVP

This version fixes the MongoDB `ObjectId is not JSON serializable` failure by using one recursive serializer across the API. It also makes post voting, downvoting, save, comments, comment voting, follows, notifications, workspaces/files/commits/issues, freelance proposals/orders/reviews, startup applications, servers/messages, search, profiles and theme settings real API-backed flows.

## Visual direction
The UI is rebuilt from the supplied Zorta references: black/charcoal editorial layout, restrained warm-white surfaces, lavender accent, thin borders, large serif greeting, compact data cards and the Zorta angular mark. It deliberately avoids the generic purple AI-dashboard look.

## Run
### MongoDB
Start a local MongoDB server, then:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python seed.py
python run.py
```

### Frontend
In another terminal:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
Open http://localhost:5173.

Demo: `maya@zorta.dev` / `demo12345`.

## Important external dependencies
Google OAuth requires Google credentials. Hosting and payments intentionally use provider interfaces and return `provider_not_configured` until real infrastructure is connected. No fake credentials are included.

## Main API
Auth: `/api/auth/*`
Feed/posts: `/api/feed`, `/api/posts/*`, `/api/comments/*`
Profiles: `/api/profiles/*`, `/api/users/:username/follow`
Workspaces: `/api/workspaces/*`
Marketplace: `/api/gigs/*`, `/api/proposals/*`, `/api/orders/*`
Startups: `/api/startups/*`, `/api/startup-applications/*`
Community: `/api/servers/*`, `/api/channels/*`
Notifications: `/api/notifications/*`
Search: `/api/search`
Hosting: `/api/workspaces/:id/deploy`
Payments: `/api/payments/order`

## Notes
- Authentication persists through access + refresh tokens.
- MongoDB ObjectIds are recursively converted to strings before every JSON response.
- The frontend centralizes API requests and automatically refreshes an expired access token once.
- Realtime chat is REST-based and structured so a WebSocket layer can be added later.
- Actual hosting/payment execution is not falsely claimed when a provider is not configured.

## If an old session is stuck
The frontend normalizes the `/auth/me` response and rejects malformed user payloads instead of rendering a broken authenticated shell. If you are upgrading from an older Zorta build, clear the old session once:

```js
localStorage.removeItem('zorta_access');
localStorage.removeItem('zorta_refresh');
location.reload();
```

Then log in again.


## Zorta UI v4 refinement

This build uses the supplied Zorta purple mark as a real frontend asset (`frontend/public/zorta-mark.png`), a client-side history router so internal navigation does not reload the page, and a focused Communities experience backed by the existing server/community API.

The posts experience intentionally stays small: Latest/Top sorting, upvote/downvote, save, comments and share. Those actions are connected to MongoDB-backed endpoints.


## Community / Admin setup notes

The Community/Server section now uses the Flask API and MongoDB for server membership, channels, messages, moderation and admin management.

### Run locally

Backend:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python seed.py
python run.py
```

Frontend, in another terminal:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend expects `VITE_API_URL` to point at the backend API (default `http://localhost:5050/api`).

### Demo admin

The seed data creates:
- `maya@zorta.dev` / `demo12345` — platform admin
- `arjun@zorta.dev` / `demo12345`
- `noor@zorta.dev` / `demo12345`

Use the admin account to access `/admin`.

### Community behavior

- New servers receive `#general`, `#media`, and `#memes`.
- Default channels cannot be deleted.
- Only the owner/admins can create custom text channels.
- Only owners/admins can kick, ban, or mute members. Admins cannot moderate the owner or another admin.
- Server chat endpoints require membership; muted members cannot send messages.
- Server message streams authenticate with the current access token.
- Joining a community updates the community card immediately and navigates directly into the joined server.
