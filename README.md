# Dealership inventory

A small web app where two fictional car dealerships each manage their own vehicle inventory. Built as my take-home assessment for the Full Stack Developer role.

| | |
|---|---|
| Repository | https://github.com/mahfuz-alam0/dealership |
| Live app | https://dealership-app.dealersip.workers.dev (health check: `/api/health`) |
| Green pipeline run | https://github.com/mahfuz-alam0/dealership/actions/runs/40571288435 |
| Loom walkthrough | Not recorded yet |
| Stack | Cloudflare Worker (Hono), Cloudflare D1 (SQLite), React, Vite, Tailwind |

## What the app does

Users sign in with an email and password. Each user belongs to one dealership and is either an admin or a viewer.

- Everyone sees the vehicles of their own dealership, and only those.
- Admins can edit a vehicle's make, model, year and status (available, reserved or sold).
- Viewers can look but not change anything.
- Edits are saved in a database, so they are still there after a reload.

The hard part of the assignment isn't the screens. It's making the backend hold up when people do the wrong thing: calling the API directly to skip the UI, asking for another dealership's car, or two admins saving the same car at the same moment. So I built the backend and its tests first, then the UI.

## Why this stack

One Cloudflare Worker serves both the API (`/api/*`) and the built React app. The browser only talks to one origin, so there is no CORS setup and only one thing to deploy. Data lives in D1, which is SQLite hosted by Cloudflare and fits the free plan. Hono is a small router that works on Workers out of the box.

## Who can do what

Login creates a session row in the database and sends the browser a random ID in an HttpOnly cookie, so page scripts can't read it. Every protected endpoint then checks, in order:

1. Is there a valid, unexpired session? If not, 401.
2. Is the user an admin (for edits)? If not, 403.
3. Does the vehicle belong to the user's dealership? If not, 404.

The dealership always comes from the session on the server. Anything the browser sends about dealerships is ignored. A vehicle from another dealership gets the same 404 as one that doesn't exist, so the API doesn't confirm it's there.

Passwords are stored as PBKDF2-SHA256 hashes (100,000 iterations, the most Workers allow) with a random salt per user. A wrong email and a wrong password give the same error. Logout deletes the session row, so the old cookie stops working immediately. I chose database sessions over JWTs for that reason; the cost is one lookup per request, which is fine at this size.

## Two admins editing the same car

Every vehicle has a `version` number starting at 1. The edit form remembers the version it loaded and sends it back with the changes. The server then runs a single SQL statement:

```sql
UPDATE vehicles
SET make = ?, model = ?, year = ?, status = ?, version = version + 1
WHERE id = ? AND dealership_id = ? AND version = ?
RETURNING id, make, model, year, status, version
```

Say two admins both open version 1. The first to save matches `version = 1`, the row updates and becomes version 2. The second one's `version = 1` no longer matches, so nothing is written and the API returns 409 Conflict. Because the check and the write are one statement, no other request can slip in between.

The wrong way is to read the row, compare versions in code, then update with no version condition. Two overlapping requests both pass the comparison and the later write silently erases the earlier one. The race tests are written to catch exactly that.

In the browser, the second admin sees "This vehicle was updated by someone else. Refresh and try again." Save stays disabled until they click Refresh, which loads the current values. Nothing is retried automatically and nothing is overwritten. The code is in `src/db/vehicles.ts`.

## Tests

All of these passed on my machine on 2026-10-27.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | passes |
| API tests | `npm test` | 19 passed |
| Build | `npm run build:web` | passes |
| Browser tests | `npm run db:migrate && npm run db:seed && npm run e2e` | 7 passed |
| Smoke test (deployed app) | `APP_URL=https://dealership-app.dealersip.workers.dev npm run smoke` | all steps passed |

**API tests** (`test/api.test.ts`) call the Worker directly, so they skip anything the UI hides. They cover:

- Valid and invalid login, and that wrong email and wrong password look identical.
- Missing, garbage and expired cookies, and logout invalidating the old cookie.
- A viewer editing (403) and an admin editing another dealership's vehicle (404). After each rejected write, the test checks the stored row didn't change.
- Invalid payloads (400) that leave the data untouched.
- The race: two admins send different edits from the same version. Exactly one gets 200, the other gets 409, and the database holds the winner's values at version 2. The race is repeated 20 times, and a stale edit followed by a retry with the fresh version is checked too.

**Browser tests** (`e2e/inventory.spec.ts`, Playwright) cover login, the dealership-scoped list, an edit that survives a reload, the read-only viewer, the two-admin conflict through the real UI including Refresh, a wrong password, a failed list load with Retry, a 403 on save, and an expired session on save.

**Regression check.** To make sure the race tests really work, I ran them against a deliberately broken `updateVehicle` that reads the row, compares the version in code, and writes without a version condition. Result: 2 failed, 17 passed, with `expected [ 200, 200 ] to deeply equal [ 200, 409 ]`. With the real code, all 19 pass.

**Smoke test** (`scripts/smoke.ts`) runs against the live URL: health, login, update (version +1), viewer PUT rejected, stale edit gives 409, final read matches, and cross-dealership GET and PUT give 404. It restores the original values at the end, so it can be re-run.

## Run it locally

You need Node 22 and npm.

```bash
npm ci
npm run db:migrate        # create the local D1 database
npm run db:seed           # two dealerships, six users, eight vehicles
npm run build:web && npm run dev    # app and API on http://localhost:3000
```

| Task | Command |
|---|---|
| Hot-reload UI on :5173 (API proxied to :3000) | `npm run dev` in one terminal, `npm run dev:web` in another |
| Wipe and rebuild the local database | `npm run db:reset` |
| Run everything CI runs | `npm run typecheck && npm test && npm run build:web && npm run e2e` |

Environment variable names are in `.env.example`: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (only needed to deploy), `SESSION_TTL_HOURS` (default 8), and `APP_URL` (smoke test target). Real values never go in the repo.

### Test accounts

Every account uses the same fake password, `Dealer#2026`.

| Email | Role | Dealership |
|---|---|---|
| admin1@alpha.test | admin | Alpha Motors |
| admin2@alpha.test | admin | Alpha Motors |
| viewer@alpha.test | viewer | Alpha Motors |
| admin1@beta.test | admin | Beta Autos |
| admin2@beta.test | admin | Beta Autos |
| viewer@beta.test | viewer | Beta Autos |

### See the conflict yourself

1. Open the app in a normal window and a private window, so the cookies are separate.
2. Sign in as `admin1@alpha.test` in window A and `admin2@alpha.test` in window B.
3. Click Edit on the same vehicle in both.
4. In A, change the status and save. It works and the version goes up.
5. In B (still on the old version), change the status and save. B shows the conflict message and Save is disabled.
6. In B, click Refresh. The form and the table row now show A's values.

## API

| Call | Success | Errors |
|---|---|---|
| `GET /api/health` | `{ "status": "ok" }` | |
| `POST /api/login` `{email,password}` | 200 and the session cookie | 400, 401 |
| `GET /api/me` | `{ email, role, dealership }` | 401 |
| `POST /api/logout` | 200 | 401 |
| `GET /api/vehicles` | list of `{ id, make, model, year, status, version }` | 401 |
| `GET /api/vehicles/:id` | one vehicle | 401, 404 |
| `PUT /api/vehicles/:id` `{make,model,year,status,version}` | updated vehicle with new `version` | 400, 401, 403, 404, 409 |

## Frontend

Admins get an Edit button on each row or card that opens a dialog. Viewers see the same data with no Edit buttons. Hiding the button is only a convenience; the API enforces the roles. The inventory page has status count cards that filter the list, a search box, sortable columns, and a table or card layout.

The UI handles each state with a clear message: loading spinner, empty list, no search match (with Clear filters), network or server error (with Retry), invalid login, expired session (redirect to `/login`), per-field validation errors, 403 and 404, the 409 conflict, and a green banner after a successful save.

```
web/src/
  pages/        LoginPage, InventoryPage
  components/   table, cards, edit form, modal, toolbar, small UI pieces
  services/     api.ts, handleApiError.ts, auth/ (one file per call), vehicles.ts
src/            Worker: routes, middleware, D1 queries, password hashing
migrations/     D1 schema
scripts/        seed, reset, smoke test
test/           API tests (Vitest)
e2e/            Playwright tests
```

## Deploy to Cloudflare

Everything is one Worker on the free plan, serving the API and the built React files, with one D1 database.

One-time setup:

1. `npx wrangler login`, then `npx wrangler d1 create dealership-db`, and copy the `database_id` into `wrangler.toml`.
2. In the GitHub repo (Settings > Secrets and variables > Actions), add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and the variable `APP_URL` so the pipeline can run the smoke test.
3. Push to `master`. `deploy.yml` runs the checks, applies D1 migrations, runs `wrangler deploy`, then the smoke test.
4. Seed the remote database once with `npm run db:seed:remote`. The pipeline never seeds because seeding deletes all rows. `npm run db:reset:remote` wipes it back to the seed data.

Manual deploy if the pipeline is down: `npm run build:web && npm run db:migrate:remote && npx wrangler deploy`. Schema changes go in a new file in `migrations/`; the pipeline applies them before deploying.

**A failed check blocks the deploy.** `deploy.yml` starts with a `checks` job (typecheck, API tests, build, browser tests). The `deploy` job has `needs: checks`, so it only starts if every step passed. On a failure, no migration runs and the live app keeps its previous version. The same checks also run on every pull request. To make a red PR unmergeable, turn on branch protection for `master` and require the `checks` status; that's a GitHub setting and isn't stored in the repo.

## Recovering a release

1. **Bad code, schema unchanged.** Either run `npx wrangler versions list` to find the last good version, then `npx wrangler rollback <version-id> --message "why"` (live in seconds), or `git revert <bad-commit>` and push so the pipeline deploys the revert. Then check `/api/health` and run the smoke test.
2. **Bad migration or bad data.** A Worker rollback doesn't touch D1. Use D1 Time Travel: `npx wrangler d1 time-travel info dealership-db` lists restore points, and `npx wrangler d1 time-travel restore dealership-db --timestamp=<time before the bad change>` restores in place. The free plan keeps about 7 days.
3. **Limit.** Migrations only go forward. A release that renamed or dropped something isn't safe to roll back by code alone; ship a fixing migration or use Time Travel.

I haven't actually run `wrangler rollback` or a Time Travel restore yet (the Worker has only one version), so these steps should be tried once before relying on them.

## Where things stand

Done and checked: login and logout, dealership-scoped list, admin edit, viewer restrictions, the atomic version check, API tests, browser tests, the build, the GitHub Actions deploy, and the deployed smoke test.

Not done:

- A real rollback or Time Travel restore, and a forced failing run that shows `deploy` being skipped.
- The Loom walkthrough.
- Search, filter and sort run in the browser on the full list. That's fine for a few cars but would need server-side paging for thousands.
- Creating and deleting vehicles (optional, skipped).
