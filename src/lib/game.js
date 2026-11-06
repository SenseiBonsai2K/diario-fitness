// The quest game. Everything here is derived from the diary's own logs, every
// time: XP, level, rank, streak, jolly and constancy are never stored, so they
// can't drift from what was recorded and a correction made later (yesterday's
// steps typed today) is picked up at once. Only the routine (which quests are
// due on which day) and the start date live in data.game.
//
// A day is "open" until midnight: its quests earn XP as they are done, and the
// penalty for a missed required quest is only charged once the day is over.

import { addDays, iso, isoWeek, mondayOf, monthKey, parseIso } from "./dates.js";
import { menuKeys } from "./diet.js";
import { findSession, plannedListOn } from "./program.js";
import { doneSets, e1rm, num, sessionLog } from "./stats.js";

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

/**
 * The game always starts on a Monday, with a new week: the first Monday on or
 * after `fromIso` (opened on Friday 6 Nov 2026 → Monday 9 Nov).
 */
export function startMonday(fromIso) {
  const d = parseIso(fromIso);
  const add = (8 - d.getDay()) % 7; // Monday = 1
  return iso(addDays(d, add));
}

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

/** XP of the weekly, monthly and boss quests (they never cost XP when missed). */
export const EXTRA_XP = { allLifts: 150, weekSteps: 100, perfectWeek: 200, monthCheck: 150, monthConstancy: 300, pr: 75, streak7: 250, streak30: 1000 };
/** At most this many personal records pay XP on one day. */
export const PR_PER_DAY = 3;
/** A month counts as constant from this share of required quests done. */
export const MONTH_CONSTANCY = 0.85;

/**
 * Personal records: a day whose best estimated 1RM on an exercise beats every
 * earlier day (the first session of an exercise is only the baseline).
 * Earlier history counts as baseline, only records from `fromIso` are returned.
 */
export function personalRecords(data, fromIso) {
  const best = {};
  const out = [];
  for (const date of Object.keys(data.workouts || {}).sort()) {
    const ids = new Set();
    for (const w of [data.workouts[date]]) {
      for (const l of [w, ...Object.values(w?.more || {})]) for (const id of Object.keys(l?.sets || {})) ids.add(id);
    }
    for (const id of ids) {
      const sets = doneSets(data.workouts[date], id);
      if (!sets.length) continue;
      const top = sets.reduce((m, x) => (e1rm(num(x.kg), num(x.reps)) > e1rm(num(m.kg), num(m.reps)) ? x : m), sets[0]);
      const value = Math.round(e1rm(num(top.kg), num(top.reps)) * 10) / 10;
      if (best[id] !== undefined && value > best[id] && (!fromIso || date >= fromIso)) {
        out.push({ date, exercise: id, value, previous: best[id], kg: num(top.kg), reps: num(top.reps) });
      }
      if (best[id] === undefined || value > best[id]) best[id] = value;
    }
  }
  return out;
}

const stepsTarget = (r) => r.quests.filter((x) => x.quest.type === "steps" && x.required).reduce((a, x) => a + (x.quest.target || 0), 0);
const stepsDone = (data, date) => num(data.days?.[date]?.passi) || 0;

/**
 * Weekly and monthly quests, each with the date it was earned on (the first
 * day the condition held, or the week's / month's last day).
 */
function periodEvents(data, results, todayIso) {
  const events = [];
  const byWeek = {};
  for (const r of results) (byWeek[iso(mondayOf(parseIso(r.date)))] ||= []).push(r);
  for (const [monday, list] of Object.entries(byWeek)) {
    const days = Array.from({ length: 7 }, (_, i) => iso(addDays(parseIso(monday), i)));
    const all = days.map((d) => list.find((r) => r.date === d) || evaluateDay(data, d, d < todayIso));
    const lifts = all.flatMap((r) => r.quests.filter((x) => x.quest.type === "workout"));
    const target = all.reduce((a, r) => a + stepsTarget(r), 0);
    let steps = 0, liftsDone = false, stepsDoneFlag = false;
    for (const r of list) {
      if (r.date > todayIso) break;
      steps += stepsDone(data, r.date);
      if (!liftsDone && lifts.length && lifts.every((x) => x.complete && all.find((y) => y.date <= r.date && y.quests.includes(x)))) {
        liftsDone = true; events.push({ date: r.date, kind: "allLifts", xp: EXTRA_XP.allLifts, period: monday });
      }
      if (!stepsDoneFlag && target > 0 && steps >= target) {
        stepsDoneFlag = true; events.push({ date: r.date, kind: "weekSteps", xp: EXTRA_XP.weekSteps, period: monday });
      }
    }
    const sunday = days[6];
    if (sunday < todayIso && all.every((r) => r.required === 0 || r.perfect) && all.some((r) => r.required > 0) && list.length === 7) {
      events.push({ date: sunday, kind: "perfectWeek", xp: EXTRA_XP.perfectWeek, period: monday });
    }
  }
  const byMonth = {};
  for (const r of results) (byMonth[r.date.slice(0, 7)] ||= []).push(r);
  for (const [m, list] of Object.entries(byMonth)) {
    const last = list[list.length - 1].date;
    const monthOver = monthKey(parseIso(todayIso)) !== m;
    const c = data.months?.[m] || {};
    if (["peso", "bf", "foto", "vita"].some((k) => c[k] !== undefined && c[k] !== null && c[k] !== "")) {
      events.push({ date: monthOver ? last : todayIso, kind: "monthCheck", xp: EXTRA_XP.monthCheck, period: m });
    }
    if (monthOver && list.length >= 20) {
      let done = 0, total = 0;
      for (const r of list) { done += r.completed; total += r.required; }
      if (total && done / total >= MONTH_CONSTANCY) events.push({ date: last, kind: "monthConstancy", xp: EXTRA_XP.monthConstancy, period: m });
    }
  }
  return events;
}

/**
 * The whole game state on `todayIso`, replaying every day from the start date:
 * XP (daily, weekly, monthly and boss quests, penalties included, never below
 * 0), level, tier, streak, jolly, constancy, records and per-day results.
 * Today is open (no penalties yet).
 */
export function gameState(data, todayIso) {
  const start = startMonday(data.game?.startDate || todayIso);
  if (start > todayIso) return notStarted(data, start, todayIso);
  const results = [];
  for (let d = parseIso(start); iso(d) <= todayIso; d = addDays(d, 1)) {
    const date = iso(d);
    results.push(evaluateDay(data, date, date < todayIso));
  }
  const prs = personalRecords(data, start).filter((p) => p.date <= todayIso);
  const prDays = {};
  for (const p of prs) (prDays[p.date] ||= []).push(p);
  const events = [...periodEvents(data, results, todayIso)];
  for (const [date, list] of Object.entries(prDays)) {
    list.slice(0, PR_PER_DAY).forEach((p) => events.push({ date, kind: "pr", xp: EXTRA_XP.pr, exercise: p.exercise, value: p.value }));
  }

  const days = [];
  let xp = 0, streak = 0, best = 0, jolly = 0, run = 0, perfectDays = 0;
  const perType = {};
  for (const r of results) {
    const { date } = r;
    const closed = date < todayIso;
    let saved = false;
    if (closed && r.required > 0 && !r.perfect && jolly > 0) { jolly--; saved = true; }
    const today = events.filter((e) => e.date === date);
    if (r.required > 0) {
      if (r.perfect) {
        streak++; run++; perfectDays++;
        if (run % JOLLY_EVERY === 0) jolly = Math.min(MAX_JOLLY, jolly + 1);
        if (streak % 30 === 0) { const e = { date, kind: "streak30", xp: EXTRA_XP.streak30, n: streak }; events.push(e); today.push(e); }
        else if (streak % 7 === 0) { const e = { date, kind: "streak7", xp: EXTRA_XP.streak7, n: streak }; events.push(e); today.push(e); }
      } else if (closed && !saved) { streak = 0; run = 0; }
    }
    const extra = today.reduce((a, e) => a + e.xp, 0);
    xp = Math.max(0, xp + r.xp + extra - (saved ? 0 : r.penalty));
    best = Math.max(best, streak);
    for (const x of r.quests) {
      if (!x.required || (!closed && !x.complete)) continue; // today's open quests don't count against constancy
      const p = (perType[x.quest.type] ||= { done: 0, total: 0 });
      p.total++; if (x.complete) p.done++;
    }
    days.push({ ...r, saved, closed, extra, events: today, total: xp });
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
  const state = {
    startDate: start,
    xp,
    ...lvl,
    tier: tierFor(lvl.level, constancy.month),
    baseTier: tierFor(lvl.level, null),
    streak,
    best,
    jolly,
    constancy,
    perfectDays,
    prs,
    events: events.sort((a, b) => a.date.localeCompare(b.date)),
    perType: Object.fromEntries(Object.entries(perType).map(([k, v]) => [k, { ...v, ratio: ratio(v.done, v.total) }])),
    days,
    today: days[days.length - 1] || evaluateDay(data, todayIso, false),
  };
  state.stats = rpgStats(data, state);
  state.badges = badges(data, state);
  return state;
}

/** Before the first Monday: level 1, nothing counted yet; today's quests are a preview. */
function notStarted(data, start, todayIso) {
  const preview = evaluateDay(data, todayIso, false);
  const state = {
    startDate: start, notStarted: true, daysToStart: Math.round((parseIso(start) - parseIso(todayIso)) / 86400000),
    xp: 0, ...levelFromXp(0), tier: 0, baseTier: 0, streak: 0, best: 0, jolly: 0,
    constancy: { week: null, month: null, all: null }, perfectDays: 0, prs: [], events: [], perType: {}, days: [], today: preview,
  };
  state.stats = rpgStats(data, state);
  state.badges = badges(data, state);
  return state;
}

/** Strength, endurance and discipline, 1–99, from what was actually done. */
export function rpgStats(data, s) {
  const lifts = s.days.reduce((a, r) => a + r.quests.filter((x) => x.quest.type === "workout" && x.complete).length, 0);
  const steps = s.days.reduce((a, r) => a + stepsDone(data, r.date), 0);
  const diet = s.days.filter((r) => r.quests.some((x) => x.quest.type === "diet" && x.complete)).length;
  const cap = (v) => Math.max(1, Math.min(99, Math.floor(v)));
  return {
    strength: { value: cap(1 + lifts + 3 * s.prs.length), lifts, prs: s.prs.length },
    endurance: { value: cap(1 + steps / 50000), steps },
    discipline: { value: cap(1 + s.perfectDays + diet / 2), perfect: s.perfectDays, diet },
  };
}

/**
 * Achievements: [id, icon, test]. Each unlocks a title the player can show
 * under the rank (game.title). Names and titles live in the locale (game.badges.*).
 */
export const BADGES = [
  ["firstWorkout", "dumbbell", (c) => c.lifts >= 1],
  ["workouts10", "dumbbell", (c) => c.lifts >= 10],
  ["workouts50", "dumbbell", (c) => c.lifts >= 50],
  ["workouts100", "dumbbell", (c) => c.lifts >= 100],
  ["streak7", "flame", (c) => c.best >= 7],
  ["streak14", "flame", (c) => c.best >= 14],
  ["streak30", "flame", (c) => c.best >= 30],
  ["streak60", "flame", (c) => c.best >= 60],
  ["streak100", "flame", (c) => c.best >= 100],
  ["level5", "shield", (c) => c.level >= 5],
  ["level10", "shield", (c) => c.level >= 10],
  ["level20", "shield", (c) => c.level >= 20],
  ["level30", "shield", (c) => c.level >= 30],
  ["level40", "shield", (c) => c.level >= 40],
  ["level50", "shield", (c) => c.level >= 50],
  ["steps15k", "steps", (c) => c.maxSteps >= 15000],
  ["steps20k", "steps", (c) => c.maxSteps >= 20000],
  ["weekSteps100k", "steps", (c) => c.maxWeekSteps >= 100000],
  ["pr1", "bolt", (c) => c.prs >= 1],
  ["pr10", "bolt", (c) => c.prs >= 10],
  ["pr25", "bolt", (c) => c.prs >= 25],
  ["perfectWeek", "trophy", (c) => c.perfectWeeks >= 1],
  ["perfectWeek4", "trophy", (c) => c.perfectWeeks >= 4],
  ["constancy90", "star", (c) => c.days >= 30 && c.month !== null && c.month >= 0.9],
  ["lost2", "scale", (c) => c.lost !== null && c.lost >= 2],
  ["lost5", "scale", (c) => c.lost !== null && c.lost >= 5],
  ["backups4", "download", (c) => c.backups >= 4],
  ["checks4", "list", (c) => c.checks >= 4],
];

function badges(data, s) {
  const range = s.days.map((r) => r.date);
  const steps = range.map((d) => stepsDone(data, d));
  const weekSteps = {};
  range.forEach((d, i) => { const m = iso(mondayOf(parseIso(d))); weekSteps[m] = (weekSteps[m] || 0) + steps[i]; });
  const weights = range.map((d) => num(data.days?.[d]?.peso)).filter((v) => v !== null);
  const recent = weights.slice(-7);
  const avg7 = recent.length ? recent.reduce((a, v) => a + v, 0) / recent.length : null;
  const startW = num(data.profile?.startWeight);
  const c = {
    lifts: s.stats.strength.lifts,
    best: s.best,
    level: s.level,
    maxSteps: Math.max(0, ...steps),
    maxWeekSteps: Math.max(0, ...Object.values(weekSteps)),
    prs: s.prs.length,
    perfectWeeks: s.events.filter((e) => e.kind === "perfectWeek").length,
    days: s.days.length,
    month: s.constancy.month,
    lost: avg7 !== null && startW ? Math.round((startW - avg7) * 10) / 10 : null,
    backups: range.filter((d) => data.days?.[d]?.backup).length,
    checks: Object.keys(data.weeks || {}).filter((w) => { const x = data.weeks[w]; return ["vita", "aderenza", "note", "decisione"].some((k) => x?.[k] !== undefined && x[k] !== ""); }).length,
  };
  return BADGES.map(([id, icon, test]) => ({ id, icon, unlocked: !!test(c) }));
}

/** The current week's and month's quests, for the quest screen: progress and whether earned. */
export function periodProgress(data, s, todayIso) {
  const monday = iso(mondayOf(parseIso(todayIso)));
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(parseIso(monday), i)));
  const res = days.map((d) => s.days.find((r) => r.date === d) || evaluateDay(data, d, d < todayIso));
  const lifts = res.flatMap((r) => r.quests.filter((x) => x.quest.type === "workout"));
  const target = res.reduce((a, r) => a + stepsTarget(r), 0);
  const steps = days.filter((d) => d <= todayIso).reduce((a, d) => a + stepsDone(data, d), 0);
  const earned = (kind, period) => s.events.some((e) => e.kind === kind && e.period === period);
  const closedPast = res.filter((r) => r.date < todayIso && r.required > 0);
  const m = todayIso.slice(0, 7);
  const monthDays = s.days.filter((r) => r.date.startsWith(m) && r.closed);
  const mDone = monthDays.reduce((a, r) => a + r.completed, 0), mTotal = monthDays.reduce((a, r) => a + r.required, 0);
  const c = data.months?.[m] || {};
  const nextStreak = s.streak < 30 ? Math.ceil((s.streak + 1) / 7) * 7 : Math.ceil((s.streak + 1) / 30) * 30;
  return {
    week: [
      { kind: "allLifts", value: lifts.filter((x) => x.complete).length, target: lifts.length, done: earned("allLifts", monday), xp: EXTRA_XP.allLifts },
      { kind: "weekSteps", value: steps, target, done: earned("weekSteps", monday), xp: EXTRA_XP.weekSteps },
      { kind: "perfectWeek", value: res.filter((r) => r.perfect).length, target: 7, done: earned("perfectWeek", monday), failed: closedPast.some((r) => !r.perfect && !s.days.find((x) => x.date === r.date)?.saved), xp: EXTRA_XP.perfectWeek },
    ],
    month: [
      { kind: "monthCheck", value: null, target: null, done: earned("monthCheck", m), xp: EXTRA_XP.monthCheck },
      { kind: "monthConstancy", value: mTotal ? mDone / mTotal : null, target: MONTH_CONSTANCY, done: earned("monthConstancy", m), xp: EXTRA_XP.monthConstancy },
    ],
    boss: { nextStreak, streak: s.streak, xp: nextStreak % 30 === 0 ? EXTRA_XP.streak30 : EXTRA_XP.streak7, prs: s.prs.length, prXp: EXTRA_XP.pr },
    monthLogged: ["peso", "bf", "foto", "vita"].some((k) => c[k] !== undefined && c[k] !== ""),
  };
}
