// Training programs live in the user's data (imported from a backup), never
// in the source code. These helpers read them.

import { parseIso } from "./dates.js";

/** Activities that exist without a program session. */
export const EXTRA_ACTIVITIES = ["run", "yoga"];

export function activeProgram(data) {
  return data.programs[data.activeProgram] || null;
}

export function sessionsOf(program) {
  return program?.sessions || [];
}

/** The session (or "run" / "yoga" / "rest" / null) planned for a weekday 0–6. */
export function plannedFor(data, weekday) {
  const p = activeProgram(data);
  return p?.week?.[String(weekday)] ?? null;
}

/**
 * What is planned on a given date: a day-by-day move wins over the weekly
 * scheme of the active program.
 */
export function plannedOn(data, date) {
  const m = data.moves?.[date];
  if (m?.activity) return m.activity;
  return plannedFor(data, parseIso(date).getDay());
}

/**
 * The entries to write in data.moves to move the activity of `from` to `to`.
 * With swap, the activity of `to` goes to `from`; otherwise `from` becomes a
 * rest day and the activity of `to` is skipped. Each entry names its pair so
 * the two days can be put back together.
 */
export function moveEntries(data, from, to, swap) {
  const a = plannedOn(data, from);
  const b = plannedOn(data, to);
  return {
    [from]: { activity: swap && b ? b : "rest", pair: to },
    [to]: { activity: a || "rest", pair: from },
  };
}

/** The entries that undo a move: the day and its pair go back to the weekly scheme. */
export function undoEntries(data, date) {
  const pair = data.moves?.[date]?.pair;
  const out = { [date]: null };
  if (pair && data.moves?.[pair]?.pair === date) out[pair] = null;
  return out;
}

/** Find a session by id, in the active program first, then in any program. */
export function findSession(data, sessionId, programId) {
  const order = [programId, data.activeProgram, ...Object.keys(data.programs)].filter(Boolean);
  for (const id of order) {
    const s = data.programs[id]?.sessions?.find((x) => x.id === sessionId);
    if (s) return { program: data.programs[id], session: s };
  }
  return null;
}

/** id → display name for every exercise in every program (active program wins). */
export function exerciseNames(data) {
  const names = {};
  const ids = [data.activeProgram, ...Object.keys(data.programs).filter((k) => k !== data.activeProgram)];
  for (const pid of ids) {
    for (const s of data.programs[pid]?.sessions || []) {
      for (const e of s.exercises) if (!names[e.id]) names[e.id] = e.name;
    }
  }
  return names;
}

/** Planned lifting sessions, runs and yoga per week, from the active program. */
export function weeklyTargets(data) {
  const week = activeProgram(data)?.week || {};
  const vals = Object.values(week);
  const sessions = new Set(sessionsOf(activeProgram(data)).map((s) => s.id));
  return {
    lifts: vals.filter((v) => sessions.has(v)).length,
    runs: vals.filter((v) => v === "run").length,
    yoga: vals.filter((v) => v === "yoga").length,
  };
}

/** Label for an activity id: a session name, or a translated run/yoga/rest. */
export function activityLabel(data, id, t) {
  if (!id) return t("common:activity.none");
  if (["run", "yoga", "rest"].includes(id)) return t(`common:activity.${id}`);
  return findSession(data, id)?.session.name || id;
}

export function fmtRest(sec) {
  if (!sec && sec !== 0) return "—";
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}'${String(s).padStart(2, "0")}"` : `${m}'`;
}

/** Rough session length in minutes: ~45" of work per set plus the planned rest, to the nearest 5'. */
export function sessionMinutes(session) {
  const sec = (session?.exercises || []).reduce((a, e) => a + e.sets * (45 + (Number(e.rest) || 0)), 0);
  return Math.max(5, Math.round(sec / 300) * 5);
}
