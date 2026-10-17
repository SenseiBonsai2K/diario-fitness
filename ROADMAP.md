# Roadmap

## Current phase: v1 in use (from 12 October 2026)

Done
- Daily diary, per-set workout log with rest timer and progression hint, run and yoga logs.
- Weekly and monthly checks, weight / waist / strength charts.
- Programs, plan, yoga, thresholds and history stored in the user's data (nothing personal in the code).
- Plan screen with current and previous programs and history; phase and targets in settings.
- Import modes: restore everything, or load plan and programs only.
- Backup export (download or share to Drive) and restore. EN + IT.
- Offline support and Android install (manifest + service worker).
- Diet in the plan (one or more day types, meal options, swaps, notes) with print / save as PDF.
- Archive: plan imports keep every replaced plan, profile targets, program and diet.
- Backup covers everything, language included; unknown keys are preserved (schema v3).
- Appearance in Settings: neutral background (auto/light/grey/dark/black) + 8 accent colours, AA contrast.
- Service worker: network-first page, so a deploy never leaves a blank screen.
- Tickable foods in today's menu; app-wide rest timer with alarm sound.
- Edit plan page (compositore.html): profile, phase, programs, diets and history edited in the app,
  checked in a summary, applied with the plan-import rules (archive, no logs touched) or saved as a file.
- Everything that isn't a log is editable in the app (diet options, alternatives, swaps, plan
  sections, yoga, volume, starting point, zone 2).
- Automatic local copies: weekly and before every replace, restorable from Settings.
- UI refresh: week strip, hero card for the day, macro bars, today's menu, workout progress and
  superset grouping, tabbed Plan screen.
- Running in Progress (14 Oct 2026): weekly runs card and pace / HR / km-per-week chart; run time
  accepted with a comma (52,30) with the reading shown under the field.
- Move a day (16 Oct 2026): from Today, move the day's activity to another date (swap, or leave a
  rest day); dates only, the weekly scheme is unchanged; "Restore" puts both days back. Schema v4
  adds the `moves` log, kept by every import.
- More sessions a day (16 Oct 2026): add a session to any day, or move one onto a day that already
  has one ("do both"); the day card lists each with its own start button. A second lifting session
  is logged in `workouts[d].more`, so nothing is overwritten; charts and "last time" read every session.
- Chained moves (16 Oct 2026): every activity moves on its own and changed days can be changed again
  (Lower B to Saturday, then the run to Sunday with yoga); remove one activity from a day; restore
  a day or the whole week.
- Change a day's menu (17 Oct 2026): from Today's menu, eat another date's menu (e.g. Sunday's on
  Saturday) or swap the two; stored as `days[d].menu`, restorable, the diet's scheme unchanged.

Next
- Weekly backup reminder as a notification instead of a banner.
- Lean bulk changes when the phase switches (extra sets listed in the plan).
- Archive manual edits of targets made in Settings (today only imports archive the old values).

Open decisions
- None.
