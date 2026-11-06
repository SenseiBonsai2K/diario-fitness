-- Diario Fitness push server: run once in Supabase → SQL Editor.
-- Region: EU (Frankfurt). Only push subscriptions, reminder rules and
-- due/done quest keys live here; no weights, food or workout data.

create table if not exists push_devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,                -- sha256 of the device token; the token itself stays on the phone
  subscription jsonb,                      -- Web Push subscription (endpoint + keys); null once the browser drops it
  timezone text not null default 'Europe/Rome',
  rules jsonb not null default '[]'::jsonb,
  quiet jsonb,
  days jsonb not null default '{}'::jsonb, -- next days: { "YYYY-MM-DD": { due, done, pending } }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists push_sent (
  device_id uuid not null references push_devices(id) on delete cascade,
  rule_id text not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (device_id, rule_id, day)
);

-- The tables are only reached by the server over a direct database
-- connection: no access through Supabase's public REST API.
alter table push_devices enable row level security;
alter table push_sent enable row level security;
revoke all on push_devices, push_sent from anon, authenticated;

-- Every minute, ask the server to send what is due (also keeps the free
-- Render instance awake). Replace the URL and the secret (= CRON_SECRET on Render).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'diario-push-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-SERVICE.onrender.com/api/v1/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', 'YOUR-CRON-SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
-- To stop it: select cron.unschedule('diario-push-tick');
