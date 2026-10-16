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
// On a shared day: weights first, then the run, then yoga (stretching last); sessions keep their order.
const liftsFirst = (list) => [...list.filter((a) => !EXTRA_ACTIVITIES.includes(a)), ...["run", "yoga"].filter((a) => list.includes(a))];

// A day whose list matches the weekly scheme again needs no entry: it goes back to "not changed".
function entryFor(data, date, list) {
  const scheme = real(schemeListOn(data, date));
  const next = list.length ? list : ["rest"];
  return real(next).join("|") === scheme.join("|") ? null : { activities: next };
}

/** What the weekly scheme alone plans on a date, ignoring any change. */
export function schemeListOn(data, date) {
  const w = plannedFor(data, parseIso(date).getDay());
  return w ? [w] : [];
}

/**
 * The entries to write in data.moves to move ONE activity from `from` to `to`.
 * Any day can be moved again, as many times as needed. mode, when `to` is
 * busy: "both" adds it to what is there; "swap" sends what is there to `from`;
 * "replace" drops what is there.
 */
export function moveEntries(data, from, to, activity, mode = "both") {
  const a = real(plannedListOn(data, from)).filter((x) => x !== activity);
  const b = real(plannedListOn(data, to));
  const nextFrom = mode === "swap" ? liftsFirst([...a, ...b.filter((x) => !a.includes(x))]) : a;
  const nextTo = mode === "both" ? liftsFirst([...b.filter((x) => x !== activity), activity]) : [activity];
  return { [from]: entryFor(data, from, nextFrom), [to]: entryFor(data, to, nextTo) };
}

/** The entry that adds one more activity to a date (a second session, a run on a lifting day). */
export function addEntry(data, date, activity) {
  const list = real(plannedListOn(data, date));
  return { [date]: entryFor(data, date, list.includes(activity) ? list : liftsFirst([...list, activity])) };
}

/** The entry that takes one activity off a date. */
export function removeEntry(data, date, activity) {
  return { [date]: entryFor(data, date, real(plannedListOn(data, date)).filter((x) => x !== activity)) };
}

/** The entries that put every changed day among `dates` back to the weekly scheme. */
export function undoEntries(data, dates) {
  return Object.fromEntries([].concat(dates).filter((d) => data.moves?.[d]).map((d) => [d, null]));
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
