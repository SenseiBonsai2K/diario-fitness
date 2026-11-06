# Diario Fitness push server

Sends the app's reminders when the app is closed. FastAPI on Render (free plan), devices in Supabase
Postgres (EU, Frankfurt), triggered every minute by Supabase `pg_cron`.

What it stores, per phone: the Web Push subscription, the reminder rules (kind, local time, weekdays,
title and text), quiet hours, and for today and the next 7 days which quests are due (key + short label
such as "Upper A" or "10.000 passi") and which are done. Never weight, food, sets or any other log.
The phone's token is stored only as a SHA-256 hash.

## API (`/api/v1`)

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/health` | — | liveness (Render health check, uptime monitor) |
| GET | `/push/key` | — | VAPID public key |
| POST | `/devices` | `X-Register-Key` | register a phone → `{ id, token }` (10/hour per IP) |
| PUT | `/devices/{id}` | `Bearer token` | rules, quiet hours, next days (120/hour per device) |
| POST | `/devices/{id}/test` | `Bearer token` | send a test push (5 per 5 min) |
| DELETE | `/devices/{id}` | `Bearer token` | forget the phone |
| POST | `/tick` | `X-Cron-Secret` | send what is due now (the cron) |

Errors: `{ "error": { "code", "message", "details"? } }`. `/docs` only with `APP_ENV=development`.
A reminder goes out at its time (up to 15 minutes late if a tick was missed), once a day, only if that
quest is planned that day and not done, never during quiet hours. "Streak at risk" goes out while
required quests are still open; "weekly summary" on the chosen days.

## Run locally

```bash
cd server
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # fill in; DATABASE_URL empty = in-memory store
set -a; . ./.env; set +a
uvicorn app.main:app --reload --port 8000
python -m pytest -q    # TEST_DATABASE_URL=… also runs the Postgres store test
```

## Deploy (once)

1. **Supabase** (free): new project, region *EU Central (Frankfurt)*. SQL Editor → run
   `supabase/schema.sql` up to the cron block. Copy *Project settings → Database → Connection string →
   Session pooler* (URI) as `DATABASE_URL`.
2. **VAPID keys**: `python scripts/gen_vapid.py` (needs `pip install -r requirements.txt`).
3. **Render**: New → Blueprint → this repository (`render.yaml`). Set `DATABASE_URL`, `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` + an address you read), optionally `SENTRY_DSN`.
   `REGISTER_KEY` and `CRON_SECRET` are generated: copy them from the service's Environment tab.
4. **Cron**: in Supabase SQL Editor run the cron block of `supabase/schema.sql` with the Render URL and
   `CRON_SECRET`. Check with `select * from cron.job_run_details order by start_time desc limit 5;`.
5. **App**: Settings → Notifications → server address + `REGISTER_KEY` → Turn on. A test notification
   arrives. Optionally set `VITE_PUSH_SERVER` in the repo's `.env` so the address is prefilled.

Costs: all free tiers. The cron keeps the one Render service awake (about 744 of the 750 free hours a
month). A paid plan is only needed for a second always-on service. Supabase pauses free projects after
a week without activity; the server's queries every minute should count as activity, but if it ever pauses,
restore it from the dashboard and reminders resume.

Backups: the tables only hold reminder settings the app re-sends on every change, so losing them means
turning notifications on again, not losing data. No backup policy needed beyond Supabase's default.
