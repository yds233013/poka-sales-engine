# Deployment

How to run Poka Sales Engine as a public demo link. Nothing here has been
deployed yet; this is the plan and the preparation that has been done for it.

---

## Recommended architecture

**One long-running Node web service plus a managed PostgreSQL database, with a
scheduled job that resets the demo data.** Railway and Render both provide all
three in one project; either is a good fit. Fly.io works too but asks for more
configuration than this app needs.

```
visitor ──► web service (next start, 1 instance) ──► managed PostgreSQL 16
                     │
                     └──► Anthropic Messages API   (only if live runs are enabled)

scheduled job (nightly) ──► npm run db:seed   (resets the demo to its seeded state)
```

### Why a long-running service rather than Vercel

The choice follows from how this repository behaves, not from preference:

| Property of this app | Consequence |
| --- | --- |
| A live adaptive run takes 15–130 s; the evaluation suite runs for over a minute | Serverless function time limits would cut these off mid-run |
| Every page is `force-dynamic` and queries Postgres per request | A persistent connection pool suits it; serverless needs a pooler (PgBouncer / Prisma Accelerate) in front of Postgres |
| The live-run rate limit (`ADAPTIVE_MAX_RUNS_PER_HOUR`) is in-memory | It is exact with one long-lived instance, per-instance on autoscaled or serverless hosting |
| The MCP server is in-process over an in-memory transport | No extra service to host, on any platform |

Vercel can host it if live runs stay disabled (the default for a public demo)
and a connection pooler is added — but a single container is the simpler,
more predictable fit for everything the app does.

---

## Environment variables

| Variable | Required | Public demo value | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | provided by the platform's Postgres | Prisma connection string |
| `AI_PROVIDER` | yes | `mock` | Keeps request extraction deterministic. Leave as `mock`. |
| `PUBLIC_DEMO` | recommended | `true` | Switches live model runs off even if a key is present |
| `ANTHROPIC_API_KEY` | no | unset, or set with `PUBLIC_DEMO=true` | Only needed for live adaptive runs |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-5` | Model for live adaptive runs |
| `ALLOW_LIVE_ADAPTIVE` | no | unset | Deliberately re-enables live runs on a public demo |
| `ADAPTIVE_MAX_RUNS_PER_HOUR` | if live runs are on | e.g. `20` | Per-process cap on live runs |
| `PORT` | set by platform | — | `next start` binds to it |

Nothing in this list reaches the browser. The client bundle has been checked
for the API key and the connection string; neither is present.

---

## Build, release and start

| Step | Command | Notes |
| --- | --- | --- |
| Install | `npm ci` | `postinstall` runs `prisma generate`. The generated client is gitignored, so without this a fresh build fails with `Can't resolve '@/generated/prisma'` — verified, and fixed. |
| Build | `npm run build` | |
| Release (schema) | `npx prisma db push` | See the schema note below |
| First-time data | `npm run db:seed` | Runs the seed and the analysis on every seeded case |
| Start | `npm run start` | |
| Health check | `GET /api/health` | 200 when the database answers, 503 when it does not |

Node 20.9 or later (`engines` in package.json).

### Schema strategy

The project manages its schema with `prisma db push` rather than migration
files — the database is demo data that is rebuilt from the seed, so there is no
production data whose history a migration would protect. On deploy, run
`prisma db push` as the release step.

If this ever holds data worth keeping, switch to migrations first:
`npx prisma migrate dev --name baseline` locally, commit `prisma/migrations/`,
and replace the release step with `npx prisma migrate deploy`.

---

## Demo data and resetting it

A public visitor can do everything an operator can: decide approvals under the
acting-user picker, release quotes, reprice, re-run analysis, and create custom
requests in the Agent Lab. That is the point of a working demo, and it means
the shared state drifts.

**Reset it on a schedule.** Run `npm run db:seed` nightly as a cron job on the
same platform, pointed at the same database. The seed wipes and rebuilds every
table, then re-runs the analysis, so REQ-2041 returns to its reference state:
PX-440 × 12, $102,808.88, 30.38 % margin, three approvals pending.

The seed is destructive by design. Never point `DATABASE_URL` at anything but
the demo database when running it.

Evaluation runs clean up after themselves, and any copy orphaned by an
interrupted run is swept at the start of the next suite and never shown in the
product.

---

## Public-demo security

The one real cost exposure is live model spend: with a key configured, the
Agent Lab's "Run evaluation suite" executes fourteen live scenarios — about
$0.82 — for anyone who clicks it.

**Default for a public link: `PUBLIC_DEMO=true`.** Then:

- The deterministic workflow works fully, offline, for every visitor.
- The captured live results — the REQ-2041 live run, the three adaptive paths,
  the per-scenario suite and the adversarial runs — are shown, labelled with
  model and capture date.
- Every live run is refused, including a server action called directly: the
  gate lives inside `runAdaptiveRequest`, the one function every live call goes
  through. The UI states that live runs are switched off and why.

**If you want visitors to run the agent live**, do all of these:

1. Put the app behind authentication — platform-level basic auth, or an
   identity proxy. The app itself has none (see below).
2. Set `ALLOW_LIVE_ADAPTIVE=true` and `ADAPTIVE_MAX_RUNS_PER_HOUR` to a figure
   you are comfortable paying for.
3. Run a single instance, so the in-memory limit is exact.
4. Set a monthly spend limit on the Anthropic workspace that owns the key. That
   is the only control that holds regardless of what the app does.

### Anthropic key handling

- Set it as a platform secret, never in a committed file. `.env` is gitignored
  and `.env.example` carries an empty value.
- Use a key dedicated to this demo, in its own workspace with a spend limit, so
  it can be rotated or revoked without touching anything else.
- The key reaches exactly one place: the Anthropic client constructor. No MCP
  tool schema, trace, log line or page contains it.

---

## What is not production-ready

These are properties of a demo, stated so nobody mistakes them for oversights:

- **No authentication.** The acting-user picker lets anyone act as any role.
  The role gate is still enforced on the server — a sales rep cannot record an
  engineer's sign-off — but anyone can pick the engineer.
- **Synthetic data only.** Every company, product, price, document and stock
  position is generated. There is no integration with any real system.
- **Single tenant.** There is one shared dataset for every visitor.

---

## Launch checklist

- [ ] Postgres provisioned; `DATABASE_URL` set as a secret
- [ ] `AI_PROVIDER=mock`, `PUBLIC_DEMO=true`
- [ ] Build succeeds from a clean clone (`npm ci && npm run build`)
- [ ] `npx prisma db push` then `npm run db:seed` run once
- [ ] `GET /api/health` returns `{"status":"ok"}`
- [ ] REQ-2041 shows PX-440 × 12, $102,808.88, three approvals pending
- [ ] Agent Lab shows "Live agent off" and the captured live run
- [ ] Nightly `npm run db:seed` scheduled against the demo database
- [ ] If a key is set: dedicated workspace, spend limit configured
