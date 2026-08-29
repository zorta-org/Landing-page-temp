# Marketplace rebuild — 2026-08-26

## Root cause of the generic `LOAD FAILED`

The Marketplace loaded four requests in one `Promise.all`: `/gigs`, `/proposals`, `/orders`, and `/marketplace/dashboard`. A failure in any one request made the entire screen report a generic load error.

The most concrete deployment-level failure found in the supplied code was the backend CORS policy: it only allowed `Config.FRONTEND_URL`. The frontend defaults to `http://localhost:5173`, while local development is also commonly opened as `http://127.0.0.1:5173`. A browser opened on the latter origin can reach Flask but the browser rejects the API response, which surfaces in the frontend as a generic fetch/load failure. The backend now allows both localhost and 127.0.0.1 for the configured frontend origin.

The Marketplace request contract was also tightened: listing type is explicit, `/gigs` now supports pagination and returns `{gigs, page, limit, has_more}`, and the UI no longer assumes every listing is a client-posted gig.

## Correct marketplace model

One `gigs` collection is retained because orders, proposals, milestones, escrow and reviews already reference `gig_id`. A `listing_type` discriminator keeps the two business models explicit:

- `job_request`: client-authored. Freelancers browse and submit proposals. Client accepts one proposal, which creates and funds an order.
- `service`: freelancer-authored. Clients browse and directly hire. Direct hire creates and funds the same order structure without a proposal.

Existing gigs are backfilled as `job_request` because that matches their current ownership.

## UI

### Find Clients

Header explains that this is the freelancer-facing job market. Cards show:
- job-request label
- title
- client identity/reputation
- budget in Zorta credits as the strongest visual value
- skills
- deadline
- clear `View job & propose` CTA

Empty state leads to `Post a job request`.

### Hire Talent

Header explains that this is the client-facing service market. Cards show:
- service label
- service title
- freelancer identity/reputation
- starting price in Zorta credits as the strongest visual value
- skills
- deadline/turnaround
- clear `View service` CTA

Service detail has a direct `Hire & fund` action. It creates an order and funds escrow from the client's Zorta balance.

## Verification performed in this environment

- Backend Python source compilation: passed.
- Frontend TypeScript/JSX transpilation syntax check using TypeScript 5.8.3: passed.
- Marketplace route-contract audit: all frontend Marketplace API paths exist in the Flask backend, including the new direct-hire endpoint.
- Actual Flask/Vite execution could not be completed in the provided sandbox because the uploaded project has no `node_modules` and the sandbox has no network/package cache; Flask/PyMongo could likewise not be installed. Therefore this pass does **not** claim a browser/network-tab runtime verification that did not happen.

## Required local runtime verification

1. `cd backend && source .venv/bin/activate && python run.py`
2. `cd frontend && npm install && npm run dev`
3. Open Marketplace using both `localhost:5173` and `127.0.0.1:5173`.
4. Verify `/api/gigs?...listing_type=job_request`, `/api/gigs?...listing_type=service`, `/api/proposals`, `/api/orders`, and `/api/marketplace/dashboard` all return 2xx.
5. Test a client hiring a freelancer service.
6. Test a freelancer proposing on a client job request.
7. Test milestone submit -> approve -> credit release.
8. Test a zero-listing database, one listing, and >24 listings with Load more.
9. Open a server as its owner and use Members: promote, demote, mute, kick and ban.
10. Open Admin and verify the control center occupies the full content width rather than collapsing into a horizontal strip.
