# Dealership inventory

A small web app where two fictional car dealerships each manage their own vehicle inventory. It is my take-home assessment for the Full Stack Developer role. This page explains what the app does, how I built it, what I tested, and what is still unfinished.

| | |
|---|---|
| Repository | https://github.com/mahfuz-alam0/dealership |
| Live app | https://dealership-app.dealersip.workers.dev (health: `/api/health`) |
| Green pipeline run | https://github.com/mahfuz-alam0/dealership/actions/runs/40571288435 (checks and deploy passed on `master`; from PR https://github.com/mahfuz-alam0/dealership/pull/1) |
| Loom walkthrough | Not recorded yet |
| Stack | Cloudflare Worker (Hono), Cloudflare D1 (SQLite), React, Vite, Tailwind |

## What the app does

People sign in with an email and password. Each person belongs to one dealership and is either an admin or a viewer.

- Everyone sees the vehicles of their own dealership, and only those.
- Admins can edit a vehicle's make, model, year and status (available, reserved or sold).
- Viewers can look but not change anything.
- Edits are saved in a database, so they are still there after a page reload.

The hard part of the assignment is not the screens. It is making the backend hold up when people do the wrong thing or act at the same time: someone calls the API directly to skip the UI, someone asks for another dealership's car, or two admins save the same car in the same second.

## How I built it

I did the backend first and the screens second, because the assignment weighs correctness and tests more than looks. The git history follows that order:

1. API: login, logout, vehicle list and edit, password hashing, and the version check that stops lost updates.
2. API tests for every access rule and for the two-admin race.
3. The React app: login page, inventory list, edit form, and the conflict message.
4. Browser tests with Playwright, plus a GitHub Actions workflow that runs all the checks on pull requests.
5. A smoke-test script for the deployed app, and documentation.
6. A UI cleanup: services and components split into separate files, then a redesign with search, filters, sorting and a card view.

### Why this stack

One Cloudflare Worker serves both the API (`/api/*`) and the built React app. The browser only talks to one origin, so there is no CORS configuration and only one thing to deploy. Data lives in Cloudflare D1, which is SQLite hosted by Cloudflare and fits the free plan. Hono is a small router that runs on Workers without extra setup.

### Who can do what

Login creates a session record in the database and sends the browser a random ID in an HttpOnly cookie, so page scripts cannot read it. Every protected endpoint then checks three things in order:

1. Is there a valid, unexpired session? If not, 401.
2. Is the user an admin, for edit requests? If not, 403.
3. Does the vehicle belong to the user's dealership? If not, 404.

The dealership comes from the session on the server. Anything the browser sends about dealerships is ignored. A request for another dealership's vehicle gets the same 404 as a vehicle that doesn't exist, so the API doesn't confirm that it is there.

Passwords are stored as PBKDF2-SHA256 hashes (100,000 iterations, the most Cloudflare Workers allow) with a random salt per user. Wrong email and wrong password give the same error message and take about the same time. Logout deletes the session record, so an old cookie stops working immediately. I picked database sessions over JWTs for that reason. The price is one database lookup per request, which is fine at this size.

### Two admins editing the same car

Every vehicle has a `version` number that starts at 1. The edit form remembers the version it loaded and sends it back with the changes. The server then runs one SQL statement:

```sql
UPDATE vehicles
SET make = ?, model = ?, year = ?, status = ?, version = version + 1
WHERE id = ? AND dealership_id = ? AND version = ?
RETURNING id, make, model, year, status, version
```

Think of the version as a page number. Two admins open version 1. The first one to save matches `version = 1`, so the row updates and becomes version 2. The second one's `version = 1` no longer matches, so nothing changes and the API answers 409 Conflict. Because the check and the write are a single statement, no other request can slip in between them.

The wrong way would be to read the row, compare versions in code, and then update with no version condition. Two overlapping requests would both pass the comparison, and the later write would silently erase the earlier one. That is the bug the regression tests are written to catch.

In the browser, the second admin sees "This vehicle was updated by someone else. Refresh and try again." The Save button stays disabled until they click Refresh, which loads the current values. Nothing retries automatically and nothing is overwritten.

## Tests

All of these passed on my machine on 2026-10-27.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | passes |
| API tests | `npm test` | 19 passed |
| Build | `npm run build:web` | passes |
| Browser tests | `npm run db:migrate && npm run db:seed && npm run e2e` | 7 passed |
| Smoke test on the deployed app | `APP_URL=https://dealership-app.dealersip.workers.dev npm run smoke` | 7 steps passed on 2026-10-27 (see [Deployed smoke test](#deployed-smoke-test)) |

The API tests live in `test/api.test.ts`. They call the Worker directly, so they skip anything the UI hides. They cover:

- Valid and invalid login, and that wrong email and wrong password look identical.
- Missing, garbage and expired cookies, and logout invalidating the old cookie.
- A viewer trying to edit (403), and an admin editing another dealership's vehicle (404). After each rejected write, the test checks the stored row did not change.
- Invalid payloads (400) that leave the data untouched.
- The race: two admins send different edits from the same version. Exactly one gets 200, the other gets 409, and the database holds the winner's values at version 2. A second test repeats the race 20 times, and a third checks that a stale edit fails and a retry with the fresh version works.

The Playwright tests (`e2e/inventory.spec.ts`) cover login, the dealership-scoped list, an edit that survives a reload, the read-only viewer, the two-admin conflict through the real UI including Refresh, a wrong password, a failed list load with a Retry button, a 403 on save, and an expired session on save.

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

Environment variable names are listed in `.env.example`: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (needed only to deploy), `SESSION_TTL_HOURS` (session length, default 8), and `APP_URL` (target for the smoke test). Real values never go in the repository.

### Test accounts

Every account uses the same synthetic password, `Dealer#2026`. It is made up and only protects fake data.

| Email | Role | Dealership |
|---|---|---|
| admin1@alpha.test | admin | Alpha Motors |
| admin2@alpha.test | admin | Alpha Motors |
| viewer@alpha.test | viewer | Alpha Motors |
| admin1@beta.test | admin | Beta Autos |
| admin2@beta.test | admin | Beta Autos |
| viewer@beta.test | viewer | Beta Autos |

### See the conflict yourself

1. Open the app in two browser sessions: a normal window and a private window, so they have separate cookies.
2. Window A: sign in as `admin1@alpha.test`. Window B: sign in as `admin2@alpha.test`.
3. In both, click Edit on the same vehicle (for example Honda Civic). Both forms show the same version.
4. In window A, change the status and click Save changes. The save succeeds and the version goes up.
5. In window B, which still holds the old version, change the status to something else and click Save changes.
6. Window B shows the conflict message and Save is disabled.
7. In window B, click Refresh. The form and the table row now show window A's values and the new version.

The third test in `e2e/inventory.spec.ts` automates this same sequence.

## Regression demo: defective variant vs the fix

I checked that the race tests really catch a lost update by running them against a broken `updateVehicle` on my machine, on 2026-10-27. The broken version lives only on the branch [`lost-update-bug`](https://github.com/mahfuz-alam0/dealership/tree/lost-update-bug) ([diff against `master`](https://github.com/mahfuz-alam0/dealership/compare/master...lost-update-bug)), which is never merged or deployed: the deploy workflow runs only on `master`. It reads the row first, compares the version in code, then writes with no version condition:

```ts
const row = await findVehicle(db, id, dealershipId);   // 1. read
if (!row || row.version !== version) return null;      // 2. compare in code
return db.prepare(`UPDATE vehicles SET ..., version = version + 1
                   WHERE id = ? AND dealership_id = ? RETURNING ...`)   // 3. write, no version check
```

Two admins send edits from version 1 at the same time. Both reads happen before either write, so both pass step 2 and both writes run. The later write silently replaces the earlier one.

| Run | Command | Result |
|---|---|---|
| Defective variant | `npm test` | 2 failed, 17 passed. `both save at the same time...` and `same race 20 times...` fail with `expected [ 200, 200 ] to deeply equal [ 200, 409 ]` |
| Fixed code (the repository) | `npm test` | 19 passed |

The fix is the single conditional `UPDATE ... WHERE id = ? AND dealership_id = ? AND version = ?` in `src/db/vehicles.ts`. SQLite runs one statement as a unit, so the version check and the write cannot be split by another request. The loser matches zero rows and gets 409.

To reproduce: run `git checkout lost-update-bug && npm test` to see the 2 failures, or on `master` replace `updateVehicle` with the three steps above, run `npm test`, then `git checkout src/db/vehicles.ts`.

## Deploy to Cloudflare

Everything runs as one Cloudflare Worker (free plan). The Worker serves the API under `/api/*` and the built React files as static assets, so there is no separate Pages project. Data lives in one D1 database.

One-time setup:

1. `npx wrangler login`, then `npx wrangler d1 create dealership-db`. Copy the printed `database_id` into `wrangler.toml`.
2. In the GitHub repository, open Settings > Secrets and variables > Actions. Add the secrets `CLOUDFLARE_API_TOKEN` (a token that can edit Workers scripts and D1) and `CLOUDFLARE_ACCOUNT_ID`. Add the variable `APP_URL` with the Worker URL, so the pipeline runs the smoke test after each deploy.
3. Push to `master`. `deploy.yml` runs the checks, applies D1 migrations, runs `wrangler deploy`, and runs the smoke test.
4. Seed the remote database once: `npm run db:seed:remote`. The pipeline never seeds, because seeding deletes all rows. To wipe the remote database back to the seed data: `npm run db:reset:remote`.
5. Check health: `curl https://dealership-app.dealersip.workers.dev/api/health` should print `{"status":"ok"}`. The endpoint returns nothing else.

Manual deploy from a laptop, if the pipeline is unavailable: `npm run build:web && npm run db:migrate:remote && npx wrangler deploy`.

Schema changes go in a new file in `migrations/` (for example `0002_add_column.sql`). The pipeline applies pending migrations before it deploys the new code.

## Deployed smoke test

Run on 2026-10-27 (re-run with S7 added) against the live URL: `APP_URL=https://dealership-app.dealersip.workers.dev npm run smoke`.

```
ok  S1 health
ok  S2 login admin1
ok  S3 update, version +1
ok  S4 viewer PUT rejected
ok  S5 stale edit -> 409
ok  S6 final read matches S3
ok  restored original values
ok  S7 cross-dealership GET and PUT -> 404, data unchanged
```

The script edits one Alpha vehicle and puts the original values back at the end, so it can be run again. Step S7 covers cross-dealership GET and PUT (404, data unchanged). I also ran 24 extra direct API checks against the live URL with a throwaway script that is not in the repository: Alpha and Beta lists do not overlap, cross-dealership GET and PUT return 404 and leave the data unchanged, a spoofed dealership id is ignored, viewer PUT returns 403, bad input returns 400, two admins sending parallel edits from the same version get one 200 and one 409 with the winner's values stored, logout makes the old cookie return 401, and a garbage cookie returns 401. All 24 passed.

## A failed check blocks the deploy

`deploy.yml` starts with a job named `checks` that calls `ci.yml` as a reusable workflow. That job runs typecheck, API tests, the web build and the Playwright tests. The `deploy` job is declared with `needs: checks`, so GitHub only starts it when every step in `checks` succeeded. If any step fails, `deploy` is skipped: no migration is applied and `wrangler deploy` does not run, so the live app keeps its previous version. The same `ci.yml` also runs on every pull request, so a failure shows up before the merge. Cloudflare credentials exist only as GitHub secrets, in the `deploy` job.

To make a red pull request impossible to merge, turn on branch protection for `master` and require the `checks` status. That is a GitHub setting and is not stored in this repository. I have not forced a failing run on `master` to watch the skip happen, so this section describes how the workflow is written, not an observed result.

## Recover a release

Pick the case that matches the problem.

1. **Bad code, schema unchanged.** This is the usual case.
   - Fast: `npx wrangler versions list` (or `npx wrangler deployments list`) to find the last good version id, then `npx wrangler rollback <version-id> --message "why"`. The change is live within seconds.
   - Clean: `git revert <bad-commit>` and push to `master`. The pipeline checks and deploys the revert. This also fixes the code in git, which the fast way does not.
   - Then run `curl .../api/health` and `APP_URL=... npm run smoke`.
2. **Bad migration or bad data.** Rolling the Worker back does not touch D1. Use D1 Time Travel: `npx wrangler d1 time-travel info dealership-db` shows the restore points, and `npx wrangler d1 time-travel restore dealership-db --timestamp=<ISO time before the bad change>` restores the database in place. The free plan keeps about 7 days of history. For seed data only, `npm run db:reset:remote` is enough.
3. **Limit.** Migrations only go forward. If a release added a column or table and the old code does not know about it, the old code usually still runs, because the new column is ignored. A release that renamed or dropped something is not safe to roll back by code alone: ship a new migration that fixes the schema, or use Time Travel, and roll back the code in the same step.

I have not run `wrangler rollback` or a Time Travel restore. The Worker currently has one version, so there is nothing to roll back to yet. These steps come from the Wrangler commands and must be tried once before relying on them.

## Where things stand

Done and checked: login and logout, dealership-scoped list, admin edit, viewer restrictions, the atomic version check, the API tests, the browser tests, the build, the GitHub Actions deploy to Cloudflare, and the deployed smoke test.

Not done yet:

- A rollback or Time Travel restore actually performed (see [Recover a release](#recover-a-release)), and a forced failing run that shows `deploy` being skipped.
- The Loom walkthrough.

Other limits worth knowing: filters, search and sorting happen in the browser on the full list, which is fine for a handful of cars but would need server-side paging for thousands. Creating and deleting vehicles was optional and I skipped it.

## Reference: frontend and API

```
web/
  index.html                  Vite entry
  public/favicon.svg          static, copied as-is
  src/
    main.tsx                  React root
    App.tsx                   session state and route guard (no session -> /login)
    index.css                 Tailwind v4 import and the row-flash animation
    services/http.ts          fetch wrapper (credentials: 'include', central error mapping, ApiError)
    services/auth.ts          login, logout, getMe
    services/vehicles.ts      listVehicles, getVehicle, updateVehicle
    types/index.ts            User, Vehicle, STATUSES, sort types
    pages/                    LoginPage, InventoryPage
    components/               AppHeader, StatTabs, Toolbar, VehicleTable, VehicleCards,
                              EditVehicleForm, Modal, StatusBadge, Logo, Button, Field, Notice
src/                          Worker: routes, middleware, D1 queries, password hashing
migrations/                   D1 schema
scripts/                      seed.ts, reset.sql, smoke.ts
test/                         API tests (Vitest, local D1)
e2e/inventory.spec.ts         Playwright (runs against `wrangler dev`)
```

### API contract

| Call | Success | Failure bodies |
|---|---|---|
| `GET /api/health` | `{ "status": "ok" }`, no auth needed | |
| `POST /api/login` `{email,password}` | 200 and the session cookie | 400, 401 |
| `GET /api/me` | `{ email, role: "admin"\|"viewer", dealership: "<name>" }` | 401 |
| `POST /api/logout` | 200 | 401 |
| `GET /api/vehicles` | `[{ id, make, model, year, status, version }]` | 401 |
| `GET /api/vehicles/:id` | one vehicle | 401, 404 |
| `PUT /api/vehicles/:id` `{make,model,year,status,version}` | updated vehicle with the new `version` | 400 `{ error?, fields?: { <field>: "<message>" } }`, 401, 403, 404, 409 |

`status` is one of `available`, `reserved`, `sold`. The 409 response also carries the vehicle's current values, but the UI ignores them and re-fetches when the user clicks Refresh.

### What the user sees in each state

| State | What the user sees |
|---|---|
| Loading | "Loading vehicles…" with a spinner, "Signing in…" and "Saving…" on buttons |
| Empty | "No vehicles in stock." |
| No search or filter match | "No vehicles match your filters." and a Clear filters button |
| List, network or 5xx error | Red banner "Something went wrong. Please try again." with Retry |
| Invalid login | "Invalid email or password." (same text for a wrong email or a wrong password) |
| Expired session (401 while signed in) | Redirect to `/login` with "Session expired, please sign in again." |
| 400 | Banner plus a message under each bad field |
| 403 / 404 | "You don't have permission to edit vehicles." / "Vehicle not found." |
| 409 conflict | "This vehicle was updated by someone else. Refresh and try again." with Refresh, and Save disabled until then |
| After Refresh | Form reset to the server's values and new version, plus a note saying so |
| Saved | Green banner "Saved Toyota Corolla (now version 2)." and the changed row flashes |

Admins get an Edit button on each row or card, which opens a dialog. Viewers get the same data with no Edit buttons and no Actions column. Hiding Edit is a convenience only; the API enforces the roles. The inventory page has status count cards that filter the list, a search box, sortable columns, and a table or card layout. The UI uses labelled fields, visible focus rings, and colors with enough contrast for text.

<details>
<summary>Loom recording checklist</summary>

- [ ] Sign in as `admin1@alpha.test`; show the header (email, dealership, role)
- [ ] Show the list is scoped: only that dealership's vehicles (compare with a `@beta.test` login)
- [ ] Edit a vehicle, save, show the success banner and new version; reload and show it persisted
- [ ] Log out; show the redirect to `/login`; reload and show still signed out
- [ ] Expired session: sign in, open Edit, change the session cookie's value in DevTools > Application > Cookies, click Save changes; show the redirect to `/login` and the "Session expired" banner
- [ ] Sign in as `viewer@alpha.test`: no Edit buttons, no Actions column
- [ ] Invalid password shows the inline error
- [ ] Conflict: two sessions per the steps above, show the 409 message, Refresh, values reset
- [ ] Show a green CI run and the deployed `/api/health` (needs the deployment work above)

</details>
