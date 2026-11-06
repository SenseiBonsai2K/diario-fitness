// The quest game. Everything here is derived from the diary's own logs, every
// time: XP, level, rank, streak, jolly and constancy are never stored, so they
// can't drift from what was recorded and a correction made later (yesterday's
// steps typed today) is picked up at once. Only the routine (which quests are
// due on which day) and the start date live in data.game.
//
// A day is "open" until midnight: its quests earn XP as they are done, and the
// penalty for a missed required quest is only charged once the day is over.

import { addDays, iso, isoWeek, parseIso } from "./dates.js";
import { menuKeys } from "./diet.js";
import { findSession, plannedListOn } from "./program.js";
import { num, sessionLog } from "./stats.js";

/** Quest types: base XP, the default target and how partial progress counts by default. */
export const QUEST_TYPES = {
  workout: { xp: 100, mode: "all", icon: "dumbbell" },
  steps: { xp: 50, target: 10000, mode: "prop", icon: "steps", unit: "steps" },
  diet: { xp: 40, mode: "all", icon: "plate" },
  sleep: { xp: 20, target: 7, mode: "all", icon: "rest", unit: "h" },
  weigh: { xp: 15, mode: "all", icon: "scale" },
  water: { xp: 15, target: 2.5, mode: "prop", icon: "drop", unit: "L" },
  check: { xp: 30, mode: "all", icon: "list" },
  backup: { xp: 20, mode: "all", icon: "download" },
};
/** Quest types the routine can hold (workouts come from the program's week). */
export const ROUTINE_TYPES = ["steps", "diet", "sleep", "weigh", "water", "check", "backup"];
export const MODES = ["all", "prop", "threshold"];
export const DEFAULT_THRESHOLD = 0.7;

/** Extra steps beyond the target: 5 XP every 1,000, at most 50. */
export const STEP_BONUS = { per: 1000, xp: 5, max: 50 };
/** Share of the base XP lost when a required quest ends the day at 0 XP. */
export const PENALTY = 0.5;
/** Share of the XP kept when a quest with a deadline is done after it. */
export const LATE = 0.5;
/** A jolly is earned every this many perfect days in a row; at most MAX_JOLLY are kept. */
export const JOLLY_EVERY = 14;
export const MAX_JOLLY = 3;

/** XP needed to go from `level` to the next one. */
export const xpToNext = (level) => 300 + 48 * (level - 1);

/** Rank tiers by level (7 tiers; their names depend on the chosen style). */
export const TIER_LEVELS = [1, 5, 10, 20, 30, 40, 50];
export const STYLES = ["fantasy", "system", "cyber"];
export const DEFAULT_STYLE = "fantasy";

/** The routine a new game starts with; the user changes it in the routine editor. */
export function defaultRoutine() {
  const day = () => [
    { type: "steps", target: 10000, mode: "prop" },
    { type: "diet", mode: "all" },
    { type: "weigh", mode: "all" },
    { type: "water", target: 2.5, mode: "prop" },
    { type: "sleep", target: 7, mode: "all" },
  ];
  const r = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((k) => [k, day()]));
  r["0"].push({ type: "check", mode: "all" }, { type: "backup", mode: "all" });
  return r;
}

const cleanQuest = (q) => {
  const meta = QUEST_TYPES[q?.type];
  if (!meta || q.type === "workout") return null;
  const out = { type: q.type, mode: MODES.includes(q.mode) ? q.mode : meta.mode };
  if (meta.target !== undefined) out.target = num(q.target) > 0 ? num(q.target) : meta.target;
  if (out.mode === "threshold") out.threshold = num(q.threshold) > 0 && num(q.threshold) < 1 ? num(q.threshold) : DEFAULT_THRESHOLD;
  if (typeof q.deadline === "string" && /^\d{1,2}:\d{2}$/.test(q.deadline)) out.deadline = q.deadline.padStart(5, "0");
  if (q.bonus) out.bonus = true;
  return out;
};

/** A routine day's quest list, tidied (unknown types dropped, one quest per type). */
export function cleanQuests(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map(cleanQuest).filter((q) => q && !seen.has(q.type) && seen.add(q.type));
}

export function routineOf(data) {
  return data.game?.routine || defaultRoutine();
}

/** The routine's quests for a weekday ("0" = Sunday). */
export function routineDay(data, weekday) {
  return cleanQuests(routineOf(data)[String(weekday)]);
}

/** Non-workout quests due on a date: a change for that date wins over the routine. */
export function routineQuestsOn(data, date) {
  const own = data.questDays?.[date]?.quests;
  return own ? cleanQuests(own) : routineDay(data, parseIso(date).getDay());
}

/** True when the date's quests differ from the routine. */
export function questsChanged(data, date) {
  return !!data.questDays?.[date];
}

/** The questDays entry that gives a date these quests (null when they match the routine again). */
export function questDayEntry(data, date, quests) {
  const next = cleanQuests(quests);
  const scheme = routineDay(data, parseIso(date).getDay());
  return JSON.stringify(next) === JSON.stringify(scheme) ? null : { quests: next };
}

/** Every quest due on a date: one per planned lifting session, then the routine's. */
export function questsOn(data, date) {
  const lifts = plannedListOn(data, date)
    .filter((a) => a && a !== "rest" && findSession(data, a))
    .map((session) => ({ type: "workout", session, mode: "all" }));
  return [...lifts, ...routineQuestsOn(data, date)];
}

/** Stable key of a quest within its day (used for completion times). */
export const questKey = (q) => (q.type === "workout" ? `workout:${q.session}` : q.type);

const filled = (v) => v !== undefined && v !== null && v !== "";

/** How far a quest is on a date: { value, target, fraction } (fraction 0..1, may pass 1 for steps). */
export function questProgress(data, date, q) {
  const day = data.days?.[date] || {};
  switch (q.type) {
    case "workout": {
      const s = findSession(data, q.session)?.session;
      const planned = s ? s.exercises.reduce((a, e) => a + (Number(e.sets) || 0), 0) : 0;
      const log = sessionLog(data.workouts?.[date], q.session);
      let done = 0;
      if (log && s) for (const e of s.exercises) done += Math.min(Number(e.sets) || 0, (log.sets?.[e.id] || []).filter((r) => r.done).length);
      return { value: done, target: planned, fraction: planned ? done / planned : 0 };
    }
    case "steps":
    case "water":
    case "sleep": {
      const field = { steps: "passi", water: "acqua", sleep: "sonno" }[q.type];
      const v = num(day[field]);
      return { value: v, target: q.target, fraction: v !== null && q.target ? v / q.target : 0 };
    }
    case "weigh":
      return { value: num(day.peso), target: null, fraction: num(day.peso) !== null ? 1 : 0 };
    case "diet": {
      const keys = menuKeys(data, date);
      const ticked = new Set(Array.isArray(day.cibi) ? day.cibi : []);
      const done = keys.filter((k) => ticked.has(k)).length;
      if (day.dieta === "ok") return { value: keys.length, target: keys.length, fraction: 1 };
      return { value: done, target: keys.length, fraction: keys.length ? done / keys.length : 0 };
    }
    case "check": {
      const w = data.weeks?.[isoWeek(parseIso(date))] || {};
      const any = ["vita", "aderenza", "note", "decisione"].some((k) => filled(w[k]));
      return { value: null, target: null, fraction: any ? 1 : 0 };
    }
    case "backup":
      return { value: null, target: null, fraction: day.backup ? 1 : 0 };
    default:
      return { value: null, target: null, fraction: 0 };
  }
}

/** True when the quest counts as accomplished (for streaks and constancy). */
export function questComplete(q, fraction) {
  if (q.mode === "threshold") return fraction >= (q.threshold ?? DEFAULT_THRESHOLD);
  return fraction >= 1;
}

/** XP a quest earns for a given progress, before any lateness. */
export function questXp(q, prog) {
  const base = QUEST_TYPES[q.type].xp;
  const f = prog.fraction;
  let xp;
  if (q.mode === "prop") xp = base * Math.min(1, f);
  else if (q.mode === "threshold") xp = f >= 1 ? base : f >= (q.threshold ?? DEFAULT_THRESHOLD) ? base / 2 : 0;
  else xp = f >= 1 ? base : 0;
  if (q.type === "steps" && f >= 1 && prog.value !== null) {
    xp += Math.min(STEP_BONUS.max, Math.floor((prog.value - q.target) / STEP_BONUS.per) * STEP_BONUS.xp);
  }
  return Math.round(xp);
}

/**
 * One day's quests with their result. `closed`: the day is over, so missed
 * required quests are charged. Completion times (days[d].fatto[key] = "HH:MM")
 * are written by the app when a quest is done on its own day; a quest with a
 * deadline done later, or with no recorded time, counts as late.
 */
export function evaluateDay(data, date, closed) {
  const times = data.days?.[date]?.fatto || {};
  const quests = questsOn(data, date).map((q) => {
    const prog = questProgress(data, date, q);
    let xp = questXp(q, prog);
    const time = times[questKey(q)];
    const late = !!q.deadline && xp > 0 && (!time || time > q.deadline);
    if (late) xp = Math.round(xp * LATE);
    const complete = questComplete(q, prog.fraction);
    const required = !q.bonus;
    const penalty = closed && required && xp === 0 ? Math.round(QUEST_TYPES[q.type].xp * PENALTY) : 0;
    return { quest: q, key: questKey(q), prog, xp, late, complete, required, penalty };
  });
  const required = quests.filter((x) => x.required);
  return {
    date,
    quests,
    xp: quests.reduce((a, x) => a + x.xp, 0),
    penalty: quests.reduce((a, x) => a + x.penalty, 0),
    required: required.length,
    completed: required.filter((x) => x.complete).length,
    perfect: required.length > 0 && required.every((x) => x.complete),
  };
}

/** Level and progress inside it, from total XP (never below level 1). */
export function levelFromXp(total) {
  let level = 1, rest = Math.max(0, Math.floor(total));
  while (rest >= xpToNext(level)) { rest -= xpToNext(level); level++; }
  return { level, into: rest, need: xpToNext(level) };
}

/** Total XP at the start of a level. */
export function xpAtLevel(level) {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpToNext(l);
  return t;
}

/** Tier 0..6 from level, lowered by poor constancy over the last 30 days. */
export function tierFor(level, constancy30) {
  let tier = 0;
  TIER_LEVELS.forEach((l, i) => { if (level >= l) tier = i; });
  if (constancy30 !== null && constancy30 !== undefined) {
    if (constancy30 < 0.5) tier -= 2;
    else if (constancy30 < 0.7) tier -= 1;
  }
  return Math.max(0, tier);
}

const ratio = (done, total) => (total ? done / total : null);

/**
 * The whole game state on `todayIso`, replaying every day from the start date:
 * XP (penalties included, never below 0), level, tier, streak, jolly,
 * constancy and per-day results. Today is open (no penalties yet).
 */
export function gameState(data, todayIso) {
  const start = data.game?.startDate || todayIso;
  const days = [];
  let xp = 0, streak = 0, best = 0, jolly = 0, run = 0;
  const perType = {};
  for (let d = parseIso(start); iso(d) <= todayIso; d = addDays(d, 1)) {
    const date = iso(d);
    const closed = date < todayIso;
    const r = evaluateDay(data, date, closed);
    let saved = false;
    if (closed && r.required > 0 && !r.perfect && jolly > 0) { jolly--; saved = true; }
    xp = Math.max(0, xp + r.xp - (saved ? 0 : r.penalty));
    if (r.required > 0) {
      if (r.perfect) {
        streak++; run++;
        if (run % JOLLY_EVERY === 0) jolly = Math.min(MAX_JOLLY, jolly + 1);
      } else if (closed && !saved) { streak = 0; run = 0; }
    }
    best = Math.max(best, streak);
    for (const x of r.quests) {
      if (!x.required || (!closed && !x.complete)) continue; // today's open quests don't count against constancy
      const p = (perType[x.quest.type] ||= { done: 0, total: 0 });
      p.total++; if (x.complete) p.done++;
    }
    days.push({ ...r, saved, closed, total: xp });
  }
  const window = (n) => {
    const from = iso(addDays(parseIso(todayIso), -(n - 1)));
    let done = 0, total = 0;
    for (const r of days) {
      if (r.date < from) continue;
      for (const x of r.quests) if (x.required && (r.closed || x.complete)) { total++; if (x.complete) done++; }
    }
    return ratio(done, total);
  };
  const lvl = levelFromXp(xp);
  const constancy = { week: window(7), month: window(30), all: window(days.length || 1) };
  return {
    startDate: start,
    xp,
    ...lvl,
    tier: tierFor(lvl.level, constancy.month),
    baseTier: tierFor(lvl.level, null),
    streak,
    best,
    jolly,
    constancy,
    perType: Object.fromEntries(Object.entries(perType).map(([k, v]) => [k, { ...v, ratio: ratio(v.done, v.total) }])),
    days,
    today: days[days.length - 1] || evaluateDay(data, todayIso, false),
  };
}
