# Marketing Billing Buddy

Self-hosted billing app for marketing freelancers / micro-agencies. Tracks
clients, recurring subscriptions, invoices, and payments. Runs entirely
**offline** on a single machine using docker-compose.

## What you get

- **Frontend** — Vite + React 18 + shadcn/ui + TanStack Query (port `8080`)
- **Postgres 15** — application database (port `54322`)
- **PostgREST** — auto-generated REST API on top of Postgres
- **GoTrue** — Supabase Auth (email + password)
- **Kong** — API gateway exposing PostgREST + GoTrue (port `54321`)
- **Studio** — database admin UI (port `54323`)
- **pg_cron** — runs the daily subscription invoice generator (`03:30`)
  and pause-reactivation job (`03:15`) directly inside Postgres, no edge
  functions or external scheduler needed.

## Features

- Clients · invoices · subscriptions · payments · services
- Recurring subscriptions with **setup fees** + **add-ons** (one-off
  charges that ride along with the next invoice)
- **Pro-rata** first invoice when a subscription starts mid-period
- **Price history** auto-tracked via Postgres triggers — every change to a
  recurring item amount opens a new history row
- **Pause subscriptions** with an optional `paused_until` date and
  automatic reactivation; case-by-case dialog asks what to do with
  pending invoices
- **Subscription detail page** with full invoice history, "billed this
  year", and last invoice
- **Duplicate invoice** + "New invoice from client" shortcuts
- **Drag-and-drop** invoice line ordering
- **Filters** (status, search, date range) on invoice/subscription lists
- Auth-gated UI — every API call goes through Supabase Auth

## First-time setup

```bash
# 1. clone + install
git clone <repo-url> marketing-billing-buddy
cd marketing-billing-buddy

# 2. generate signing keys + a strong DB password
cp .env.selfhost.example .env.selfhost
node supabase/selfhost/scripts/generate-keys.mjs >> .env.selfhost
# (open .env.selfhost and fill any remaining blank values)

# 3. boot the whole stack
docker compose --env-file .env.selfhost up -d

# 4. create the first admin user (replace email/password)
docker compose exec auth gotrue admin create-user \
  --email you@example.com \
  --password 'change-me-please'
```

The app is now reachable at:

| Service | URL |
| --- | --- |
| Frontend | http://localhost:8080 |
| Kong (API gateway) | http://localhost:54321 |
| Studio (DB admin) | http://localhost:54323 |
| Postgres (psql) | `psql postgres://postgres:<password>@localhost:54322/postgres` |

Sign in at `http://localhost:8080/login` with the user you created.

## Day-to-day commands

```bash
# follow logs
docker compose logs -f app db kong

# restart just the frontend after pulling new code — BUILD_ID busts the cache
BUILD_ID=$(date +%s) docker compose --env-file .env.selfhost up -d --build app

# apply new migrations (auto-runs on db boot, but to re-run by hand:)
docker compose exec db psql -U postgres -f /docker-entrypoint-initdb.d/<file>.sql

# wipe everything and start over (DESTRUCTIVE)
docker compose down -v
```

## Deploying on Coolify

Coolify auto-sets `SOURCE_COMMIT` to the commit SHA it just checked out.
The `app` service in `docker-compose.yaml` picks this up via
`BUILD_ID: ${BUILD_ID:-${SOURCE_COMMIT:-dev}}` and bakes it into the
Docker build as a cache-busting `ARG`. This guarantees that every commit
produces a different layer hash — no more "I merged a PR but the deployed
bundle is stale" problem.

The deployed build ID is **visible in the sidebar footer** (small grey
text under the user email). If it matches the latest commit on `main`,
you know you're on the newest code.

If you ever need to force a rebuild without a new commit (e.g. while
debugging), you can override `BUILD_ID` in Coolify's environment
variables (Project → Environment → add `BUILD_ID=<any unique value>`)
and click **Redeploy**. Coolify will rebuild from scratch.

## Working offline

Once the images are pulled the first time, the entire stack runs without
internet access. The frontend never talks to any external service — all
auth, data, and cron run locally. To take this VM/laptop to a venue with
no Wi-Fi, just `docker compose up -d` and you're good.

## Generating invoices

`pg_cron` runs `public.generate_subscription_invoices()` every day at
`03:30` Europe/Lisbon. Each active subscription whose
`next_billing_date <= today` gets a new draft invoice with all its
recurring + add-on items, plus any uninvoiced setup items on the first
billing cycle. If the subscription has `prorate_first_invoice = true`
the first invoice's amounts are scaled by `days_remaining / days_in_period`.
You can also click **Gerar agora** in the Subscriptions page to run the
function on demand.

## Local development (without docker)

```bash
npm install
npm run dev          # Vite dev server, localhost:5173

# point the dev server at your self-hosted Supabase:
echo "VITE_SUPABASE_URL=http://localhost:54321" > .env.local
echo "VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from .env.selfhost>" >> .env.local
echo "VITE_SUPABASE_PROJECT_ID=local" >> .env.local
```

## Project layout

```
docker-compose.yaml         # full self-host stack
Dockerfile                  # builds the frontend, served via nginx
supabase/
  migrations/               # SQL migrations (applied on db init)
  selfhost/
    kong.yml                # routing rules for the Kong gateway
    nginx.conf              # SPA routing for the frontend container
    scripts/generate-keys.mjs   # JWT_SECRET + ANON_KEY + SERVICE_ROLE_KEY
src/                        # React app
```
