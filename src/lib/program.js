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
  return plannedListOn(data, date)[0] ?? null;
}

/**
 * Everything planned on a date, in order: usually one activity, more when a
 * session was added or two activities were put on the same day. A rest day
 * is ["rest"]; nothing planned is [].
 */
export function plannedListOn(data, date) {
  const m = data.moves?.[date];
  const list = Array.isArray(m?.activities) ? m.activities : m?.activity ? [m.activity] : null;
  if (list) {
    const real = list.filter((a) => a && a !== "rest");
    return real.length ? real : ["rest"];
  }
  const w = plannedFor(data, parseIso(date).getDay());
  return w ? [w] : [];
}

const real = (list) => list.filter((a) => a && a !== "rest");
// Weights before running and yoga on a shared day, otherwise in the order given.
const liftsFirst = (list) => [...list.filter((a) => !EXTRA_ACTIVITIES.includes(a)), ...list.filter((a) => EXTRA_ACTIVITIES.includes(a))];

/**
 * The entries to write in data.moves to move the activity of `from` to `to`.
 * mode "swap": the activities of `to` go to `from`; "both": `to` keeps its
 * own and adds the moved one, `from` becomes rest; "replace": `from` becomes
 * rest and what was on `to` is skipped. Each entry names its pair so the two
 * days can be put back together.
 */
export function moveEntries(data, from, to, mode) {
  const a = real(plannedListOn(data, from));
  const b = real(plannedListOn(data, to));
  const rest = (l) => (l.length ? l : ["rest"]);
  return {
    [from]: { activities: rest(mode === "swap" ? b : []), pair: to },
    [to]: { activities: rest(mode === "both" ? liftsFirst([...b, ...a.filter((x) => !b.includes(x))]) : a), pair: from },
  };
}

/** The entry that adds one more activity to a date (a second session, a run on a lifting day). */
export function addEntry(data, date, activity) {
  const list = real(plannedListOn(data, date));
  const m = data.moves?.[date];
  return { [date]: { ...(m?.pair ? { pair: m.pair } : {}), activities: list.includes(activity) ? list : liftsFirst([...list, activity]) } };
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
