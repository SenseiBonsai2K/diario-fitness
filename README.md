# Diario Fitness

Personal training and nutrition diary, installable on Android (Chrome) and iPhone (Safari →
Add to Home Screen) as a web app (PWA). On iPhone there is no vibration and the rest alarm may not
sound with the screen locked.
It works offline and keeps every piece of data on the phone: nothing is sent to a server.

- **Today**: week strip (planned and done per day), the day's session with progress ring and
  estimated length, weight, calories and macros with progress bars, today's menu from the diet
  with a tick for every food (stored as `days[date].cibi`; ticking everything marks the diet as followed),
  sleep, energy, hunger, notes.
- **Workout**: the day's session from the plan (sticky progress header, superset pairs grouped,
  finished exercises collapse to a summary), with kg × reps for every set, last time's numbers,
  a "add weight" hint (double progression) and a rest timer that starts on every ticked set with
  the planned rest, keeps running across screens and app restarts (end time saved), keeps the
  screen on while resting, and beeps and vibrates at the end. The beeps are Web Audio scheduled in advance on
  the audio clock, so they mix over the user's music instead of pausing it; sound can be turned off
  in Settings (`prefs.timerSound`), with eight short synthesised ringtones to pick from (`prefs.timerTone`). Run and yoga logs on their days.
- **Progress**: weekly summary with the calorie rule, weekly and monthly checks, charts for weight
  (7-day average), waist and estimated 1RM per exercise. Running: the week's runs (km, time, pace,
  average HR against zone 2, compared with the week before) and a chart of pace, average HR or km per
  week. Run times can be typed as `52,30` as well as `52:30` (phone number pads often lack a colon);
  `runs[d].durata` stays the text the user typed and is parsed by `parseDuration` in `src/lib/stats.js`.
- **Plan**: four tabs — Program (week, one session at a time, volume bars, notes), Diet (one
  weekday at a time, today first), Plan (goals, plan sections, yoga), Archive (only when there is
  something archived) — the active training program and diet, previous programs and diets,
  plan sections, yoga routine, history and an archive of every replaced version, all read from the
  user's data. Each diet has a "Print or save as PDF" button (browser print, A4, one page per day type).
- **Edit plan** (`compositore.html`, opened from Settings → Edit plan): a second page of the app that
  edits everything that isn't a log: profile (targets, starting point, zone 2, rules), phase,
  programs (sessions, exercises, week, weekly volume), diets (seven days, meals, foods with
  alternatives, whole-meal options, per-day targets, swaps, text sections), the plan's text sections
  (paragraphs, lists, tables) and the yoga routine, plus a history entry, starting from the active
  program and diet. Yoga pose ids, like exercise ids, tie past logs to the routine. A summary lists errors and
  warnings (existing ids, renamed exercise ids, more than 3 sets, macros that don't add up to the
  kcal…), then **Apply** runs the same `mergePlan` as "Load plan only": logs untouched, replaced
  versions archived, the previous program/diet closed the day before the new one starts. The result
  can also be downloaded or shared as a plan file. Same origin and scope as the diary, so opened from
  the installed app on iPhone it shares the app's storage (Safari and the home-screen app have
  separate storage). Logic in `src/lib/compose.js` (tested), UI in `src/composer/`.
- **Automatic copies** (`src/lib/snapshots.js`, IndexedDB): when the app opens it saves a copy of
  the whole document once a week (keeps 8), and one before every plan edit, import or restore
  (keeps 6). Settings → Automatic copies lists them with Restore and Download. They protect against
  mistakes, not against losing the phone or deleting the app: the weekly file backup (on iPhone,
  Share → Save to Files → iCloud Drive) is still needed. A web app can't write files on its own in
  the background, so a fully automatic off-phone backup would need a server, which this app doesn't
  have by design. "Delete all data" also deletes the copies.
- Sharing a backup (`src/lib/share.js`): Chrome on Android refuses `.json` files in the share
  sheet (it can even pass `canShare` and fail in `share`), so outside iPhone the backup is shared as
  `.txt` (same content); restore accepts `.json` and `.txt`.
- **Settings**: appearance (neutral background: auto, light, grey, dark, black; and one of sixteen
  accent colours — eight soft, eight vivid — chosen separately; saved in `prefs.bg` / `prefs.accent` and in the backup), phase and targets, backup export (file or Android share sheet → Google Drive),
  restore from a backup, language (Italian / English).

## Stack

React 18 + Vite + Tailwind CSS, react-i18next (English + Italian). No backend: data lives in
`localStorage` as one JSON document (`src/lib/storage.js`). A hand-written service worker
(`public/sw.js`) caches the app so it opens without a connection: the page is network-first (a new
deploy is picked up right away when online), hashed assets are cache-first.

Deliberately not included: Supabase, Sentry or any other service from the usual stack. The app
has no server and no network calls, so there is nothing for them to do; errors stay on the device.

## Appearance

`src/themes.css` and `src/lib/appearance.js` are generated by `python3 scripts/gen-themes.py src/themes.css src/lib/appearance.js`,
which checks every background × accent combination for at least 4.5:1 text contrast (it fails otherwise).
Edit the palette there, not in the CSS.

## Run locally

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests (stats, backup)
npm run check:locales  # every key exists in both en and it
npm run build          # static site in dist/
```

No environment variables are needed.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: locale check, tests, `npm audit`, build,
then publishes `dist/` to GitHub Pages. One-time setup in the repository:
**Settings → Pages → Source: GitHub Actions**.

The site is public but contains no personal data and no training content. Profile, training
programs, plan text, yoga routine, thresholds and history all live in the user's data: the public
app opens empty and is filled by importing a backup file. Backup files are git-ignored.

## Data and backups

- Backup file: `{ app: "diario-fitness", exportedAt, data }`, where `data` is the whole document:
  `version` (4), `profile` (targets, weekly-advice `rules`, `zone2` heart-rate band), `programs`
  (each with `sessions[].exercises[]`, `week`, `notes`, `volume`), `activeProgram`, `diets` and
  `activeDiet` (shape below), `plan` (`sections[]`, `yoga`), `history[]`, `archive[]`
  (`{ at, kind: "plan" | "profile" | "program" | "diet", id?, data }`), `prefs` (`lang`), `meta`,
  and the logs `days`, `workouts`, `runs`, `yoga`, `weeks`, `months`, `moves`.
  `moves[d] = { activity, pair }` overrides the weekly scheme on one date only ("move Lower B from
  Friday to Saturday", swapping or leaving a rest day); `plannedOn` in `src/lib/program.js` reads it.
- Diet: `{ id, name, author?, startDate?, endDate?, note?, targets?: { kcal, prot, carb, fat },
  week?: { "0".."6": dayId }, days: [{ id, name, note?, targets?, meals: [{ name, time?, note?,
  items: [{ food, qty?, unit?, note?, alt?: [] }], options?: [{ name, items }] }] }],
  substitutions?: [{ food, alt: [], note? }], notes?: [], sections?: [plan-section shape] }`.
  One day = the same menu every day; several days plus `week` = training/rest or per-weekday menus.
- Nothing in a backup is dropped: keys the app doesn't know yet are carried through on import and
  export.
- Import offers two modes: **restore everything** (replaces all data) or **load plan and programs
  only** (keeps every log, updates profile, programs, diets, plan and history). The second is how a
  new program, diet or plan reaches the phone; every version it replaces (plan, profile targets, a
  program or diet with the same id) is first copied to `archive`, so nothing is lost. A partial
  file (e.g. only `diets` + `activeDiet`) updates only what it carries: empty profile fields and an
  empty plan leave the current ones in place. A file with no logs is never offered as "restore
  everything" when the phone already has logs, so a plan file can't wipe the history.
- The diary and the plan editor are two pages on the same `localStorage` key; the store listens for
  `storage` events so an open page picks up the other page's write instead of saving a stale copy.
- `SCHEMA_VERSION` in `src/lib/storage.js` must be bumped (with a migration in `normalise`) whenever
  the document shape changes, so older backups keep importing.

Skillset version: not recorded (personal tool, outside the client project workflow).
