# Diario Fitness

Personal training and nutrition diary run as a quest game (levels, ranks, streaks), installable on Android (Chrome) and iPhone (Safari →
Add to Home Screen) as a web app (PWA). On iPhone there is no vibration and the rest alarm may not
sound with the screen locked.
It works offline and keeps every piece of data on the phone. The only exception is optional: the
push server in `server/` (FastAPI on Render + Supabase) gets reminder rules, quiet hours and which
quests are due/done for the next days, so reminders arrive with the app closed — never weights,
food or workouts.

- **Quest** (the first tab): an always-visible bar on top (rank emblem, level, XP, streak, jolly),
  the week strip (a dot on perfect days), **today's quests** (numbers typed in a quest are a
  draft until confirmed with ✓, Enter or leaving the field, and must be in range, so a half-typed
  "8" never completes a weigh-in) — one per planned lifting session,
  then the routine's (steps, diet, sleep, weigh-in, water, weekly check, backup) — each with its
  progress, XP and the field or button that completes it; then calories and macros, today's menu
  from the diet with a tick for every food (`days[date].cibi`), energy, hunger, notes.
- **Look** (v2.1): an opening scene once per session (`Splash`, per style, tap to skip), a living
  background (`Backdrop`: embers, motes and scan line, digital rain; a half-resolution canvas at
  ~30 fps, paused when hidden), a hero panel on the quest screen (emblem in an XP ring, rank in
  animated gradient), emblems drawn per style that grow with the tier (`src/components/emblems.jsx`),
  style frames for cards, a flash and floating "+XP" when a quest completes, a full-screen level-up
  scene with rays and a burst. All CSS/SVG/canvas, no animation library; everything stops with
  reduced motion.
- **Game** (`src/lib/game.js`, tested): it starts on the first Monday on or after the first
  opening (`startMonday`); before that today's quests are a preview and nothing counts. XP, level,
  rank, streak, jolly and constancy are never stored; `gameState` replays every day from `game.startDate` over the logs, so a late correction
  counts at once. Base XP per quest in `QUEST_TYPES`; partial progress per quest: all or nothing,
  proportional, or half above a threshold; +5 XP per 1,000 steps over target (max +50); done after
  a deadline = half XP (completion times in `days[d].fatto`, written by the app on the day); a
  required quest at 0 XP when the day closes costs half its base XP, and XP (hence levels) can go
  down, never below 0. Level n→n+1 needs 300 + 48·(n−1) XP. Seven rank tiers by level
  (1, 5, 10, 20, 30, 40, 50), one tier lower under 70% constancy over 30 days, two under 50%.
  Weight trophies need at least 3 plausible weigh-ins (±30% of the start) in the last 7 days.
  A jolly every 14 perfect days in a row (max 3) is spent automatically on the first missed day:
  it keeps the streak and cancels the penalty. Rank names depend on the game style
  (`prefs.style`: fantasy, system, cyber) in `src/locales/*/game.json`. A dialog announces level
  and rank changes, up or down (`game.seen`).
- **Routine** (from Quest or Profile): the default weekly scheme — per weekday, the workout
  (the active program's `week`) and which quests are due with their target, partial rule,
  deadline and bonus flag (`game.routine`) — or one week at a time, where each date changes on
  its own (`moves` for sessions, `questDays[d] = { quests }` for quests) and can be restored.
- **Weekly, monthly and boss quests** (they earn XP and never cost any): every planned session of
  the week (150), the week's steps (100), a perfect week (200), the monthly check (150), a month at
  85% constancy (300), each personal record (75, at most 3 a day; a day's best estimated 1RM beating
  every earlier day of that exercise), streaks of 7 (250) and 30 (1000) days. Shown under today's
  quests. Achievements (28 trophies, each unlocking a title shown on the profile, `game.title`) and
  RPG stats (strength, endurance, discipline, 1–99) are derived the same way.
- **Styles** (`prefs.style`, `src/game-styles.css`): fantasy (Cinzel), system (Rajdhani) and
  cyberpunk (Orbitron) repaint the dark neutrals and decoration; the app is always dark and keeps
  the chosen accent. Each style has its own synthesised sounds (`src/lib/sfx.js`, over the music
  like the timer), vibration patterns and wording; both switchable (`prefs.gameSound`,
  `prefs.vibration`). Toasts announce done quests, records, trophies and earned period quests.
- **Notifications** (Settings): turn on push for this phone (server address + the server's
  registration key), choose reminders (workout, steps, weigh-in, water, diet, sleep, weekly check,
  backup, streak at risk, weekly summary) with time and weekdays, and quiet hours
  (`prefs.notifications`). `NotifySync` sends the server the rules and the next 8 days a few seconds
  after any change and when the app goes to the background (`src/lib/notify.js`). The device id and
  token stay in this phone's storage only. Server: see `server/README.md`.
- **Profile**: emblem, rank, level and XP, title, stats, trophies, recent records, streak and best streak, jolly, constancy (week, 30 days,
  all time, per quest), the last 7 days' XP, the rank ladder and the rules.
- **Workout**: the day's session from the plan (sticky progress header, superset pairs grouped,
  finished exercises collapse to a summary), with kg × reps for every set, last time's numbers,
  a "add weight" hint (double progression) and a rest timer that starts on every ticked set with
  the planned rest, keeps running across screens and app restarts (end time saved), keeps the
  screen on while resting, and beeps and vibrates at the end. The beeps are Web Audio scheduled in advance on
  the audio clock, so they mix over the user's music instead of pausing it; sound can be turned off
  in Settings (`prefs.timerSound`), with eight short synthesised ringtones to pick from (`prefs.timerTone`).
- **Progress**: weekly summary with the calorie rule, weekly and monthly checks, charts for weight
  (7-day average), waist and estimated 1RM per exercise.
- **Plan**: four tabs — Program (week, one session at a time, volume bars, notes), Diet (one
  weekday at a time, today first), Plan (goals, plan sections), Archive (only when there is
  something archived) — the active training program and diet, previous programs and diets,
  plan sections, history and an archive of every replaced version, all read from the
  user's data. Each diet has a "Print or save as PDF" button (browser print, A4, one page per day type).
- **Edit plan** (`compositore.html`, opened from Settings → Edit plan): a second page of the app that
  edits everything that isn't a log: profile (targets, starting point, rules), phase,
  programs (sessions, exercises, week, weekly volume), diets (seven days, meals, foods with
  alternatives, whole-meal options, per-day targets, swaps, text sections), the plan's text sections
  (paragraphs, lists, tables), plus a history entry, starting from the active
  program and diet. Exercise ids tie past logs to the program. A summary lists errors and
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
- **Settings** (gear in the top bar): game style with sounds and vibration, accent colour (one of
  sixteen, saved in `prefs.accent` and in the backup; the old background choice is ignored since v2),
  notifications, phase and targets, backup export (file or Android share sheet → Google Drive),
  restore from a backup, language (Italian / English).

## Stack

React 18 + Vite + Tailwind CSS, react-i18next (English + Italian). No backend: data lives in
`localStorage` as one JSON document (`src/lib/storage.js`). A hand-written service worker
(`public/sw.js`) caches the app so it opens without a connection: the page is network-first (a new
deploy is picked up right away when online), hashed assets are cache-first.

The app itself has no server and stays usable fully offline; errors stay on the device (no Sentry in
the app on purpose). The optional push server (`server/`, FastAPI + Supabase + Render, Sentry when
`SENTRY_DSN` is set) only handles reminders.

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

Build variables, committed in `.env` (not secrets; `.env.example` lists them too):
`VITE_KEY_PREFIX`, the prefix of every key stored on the phone (`diario-fitness`; the preview build
uses `diario-fitness-prova`), and `VITE_PUSH_SERVER`, the push server's address to prefill in
Settings (empty = typed in the app). The push server's own variables are in `server/.env.example`.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: locale check, tests, `npm audit`, build,
then publishes `dist/` to GitHub Pages. When the `prova` branch exists, the same run also builds
it into `dist/prova/` with `VITE_KEY_PREFIX=diario-fitness-prova`: a preview at
`…/diario-fitness/prova/` with its own data, service worker and cache, so trying it never touches
the real diary (the main service worker ignores `/prova/`). A push to `prova` runs
`.github/workflows/preview.yml`, which re-runs the deploy on `main`. One-time setup in the repository:
**Settings → Pages → Source: GitHub Actions**.

The site is public but contains no personal data and no training content. Profile, training
programs, plan text, yoga routine, thresholds and history all live in the user's data: the public
app opens empty and is filled by importing a backup file. Backup files are git-ignored.

## Data and backups

- Backup file: `{ app: "diario-fitness", exportedAt, data }`, where `data` is the whole document:
  `version` (5), `profile` (targets, weekly-advice `rules`), `programs`
  (each with `sessions[].exercises[]`, `week`, `notes`, `volume`), `activeProgram`, `diets` and
  `activeDiet` (shape below), `plan` (`sections[]`), `game` (`startDate`, `routine`, `seen`), `history[]`, `archive[]`
  (`{ at, kind: "plan" | "profile" | "program" | "diet" | "routine", id?, data }`), `prefs` (`lang`, `bg`, `accent`, `style`), `meta`,
  and the logs `days`, `workouts`, `weeks`, `months`, `moves`, `questDays`.
  v5 (Nov 2026) removed running and yoga: `normalise` drops the `runs` and `yoga` logs, the yoga
  routine, `zone2`, run/yoga days in program weeks, moves and archived versions. A plan file with
  `game.routine` replaces the routine on "load plan only" (the old one is archived).
  `moves[d] = { activities: [...] }` overrides the weekly scheme on one date only. Each activity is
  moved on its own (add to the target day, swap, or replace) and any day can be changed again; a day
  whose list matches the scheme again loses its entry. Older entries may carry `activity` and `pair`
  (ignored). `plannedListOn` in `src/lib/program.js` reads it; restore works per day or per week.
  `days[d].menu = "<dietDayId>"` gives one date another diet day's menu (take it, or swap the two
  dates); `src/lib/diet.js` reads it, and the entry is dropped when it matches the diet's scheme again.
  More than one lifting session a day: the first lives in `workouts[d]` itself, the others in
  `workouts[d].more[sessionId]` with the same shape; `liftLogs` in `src/lib/stats.js` returns them all.
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
