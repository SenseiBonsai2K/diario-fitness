import { addDays, iso, mondayOf, parseIso, weekDays } from "./dates.js";

/** Parse a user-typed number ("82,4" or "82.4"); null when empty or invalid. */
export function num(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function avg(values) {
  const a = values.filter((x) => x !== null && x !== undefined);
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}

function field(data, dates, key) {
  return dates.map((d) => num(data.days[d]?.[key]));
}

/** Mean of a daily field over the inclusive range [fromIso, toIso]. */
export function rangeAvg(data, fromIso, toIso, key) {
  const out = [];
  for (let d = parseIso(fromIso); d <= parseIso(toIso); d = addDays(d, 1)) out.push(num(data.days[iso(d)]?.[key]));
  return avg(out);
}

/**
 * Every lifting session logged on one day. The first one lives in the day's
 * log itself ({ program, session, sets, note }); further sessions on the
 * same day live in `more`, keyed by session id.
 */
export function liftLogs(w) {
  if (!w) return [];
  const out = w.session || w.sets ? [{ program: w.program, session: w.session, sets: w.sets || {}, note: w.note }] : [];
  for (const [id, x] of Object.entries(w.more || {})) if (x) out.push({ ...x, session: x.session || id, sets: x.sets || {} });
  return out;
}

/** The log of one session on one day, or null. */
export function sessionLog(w, sessionId) {
  return liftLogs(w).find((l) => l.session === sessionId) || null;
}

const hasDoneSet = (l) => Object.values(l.sets || {}).some((sets) => sets.some((s) => s.done));

/** True when a day's workout log has at least one completed set. */
export function workoutDone(w) {
  return liftLogs(w).some(hasDoneSet);
}

/** Lifting sessions with at least one completed set on a day. */
export function liftsDone(w) {
  return liftLogs(w).filter(hasDoneSet).length;
}

/** Everything the weekly check shows, computed from daily logs. */
export function weekStats(data, mondayIsoStr) {
  const monday = parseIso(mondayIsoStr);
  const days = weekDays(monday);
  const prev = weekDays(addDays(monday, -7));
  const weights = field(data, days, "peso");
  let lifts = 0, runs = 0, km = 0, yoga = 0;
  for (const d of days) {
    lifts += liftsDone(data.workouts[d]);
    const r = data.runs[d];
    if (r && num(r.km)) { runs++; km += num(r.km); }
    if (data.yoga[d]?.done) yoga++;
  }
  const a = avg(weights);
  const p = avg(field(data, prev, "peso"));
  return {
    monday: mondayIsoStr,
    avgWeight: a,
    prevWeight: p,
    delta: a !== null && p !== null ? a - p : null,
    weighIns: weights.filter((x) => x !== null).length,
    kcal: avg(field(data, days, "kcal")),
    prot: avg(field(data, days, "prot")),
    sleep: avg(field(data, days, "sonno")),
    energy: avg(field(data, days, "energia")),
    lifts,
    runs,
    km: Math.round(km * 10) / 10,
    yoga,
  };
}

/**
 * The calorie rule for one week's change in average weight, using the
 * thresholds stored in the profile ({ cutMin, cutMax, bulkMin, bulkMax, maintainBand }).
 * Returns an advice key (see locale "progress:advice.*") — the UI translates it.
 */
export function adviceKey(delta, phase, rules) {
  if (!rules || !phase) return "noRules";
  if (delta === null) return "needData";
  if (phase === "cut" || phase === "minicut") {
    if (delta > -rules.cutMin) return "cutSlow";
    if (delta < -rules.cutMax) return "cutFast";
    return "cutOk";
  }
  if (phase === "bulk") {
    if (delta < rules.bulkMin) return "bulkSlow";
    if (delta > rules.bulkMax) return "bulkFast";
    return "bulkOk";
  }
  return Math.abs(delta) < rules.maintainBand ? "maintainOk" : "maintainDrift";
}

/** Daily weights plus a trailing 7-day mean, for the weight chart. */
export function weightSeries(data, fromIso) {
  const keys = Object.keys(data.days).filter((k) => num(data.days[k].peso) !== null).sort();
  if (!keys.length) return { points: [], trend: [] };
  const start = fromIso && fromIso > keys[0] ? fromIso : keys[0];
  const end = keys[keys.length - 1];
  const points = [], trend = [];
  for (let d = parseIso(start); d <= parseIso(end); d = addDays(d, 1)) {
    const k = iso(d);
    const w = num(data.days[k]?.peso);
    if (w !== null) points.push({ date: k, value: w });
    const m = rangeAvg(data, iso(addDays(d, -6)), k, "peso");
    if (m !== null) trend.push({ date: k, value: m });
  }
  return { points, trend };
}

/** Epley estimated one-rep max. */
export function e1rm(kg, reps) {
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

/** Completed sets of one exercise on one day, across every session of that day. */
export function doneSets(w, exerciseId) {
  return liftLogs(w).flatMap((l) => (l.sets?.[exerciseId] || []).filter((s) => s.done && num(s.kg) !== null && num(s.reps) !== null));
}

/** Most recent day before `beforeIso` with completed sets of the exercise. */
export function lastPerformance(data, exerciseId, beforeIso) {
  const keys = Object.keys(data.workouts).filter((k) => k < beforeIso).sort().reverse();
  for (const k of keys) {
    const sets = doneSets(data.workouts[k], exerciseId);
    if (sets.length) return { date: k, sets };
  }
  return null;
}

/**
 * Double progression: when every planned set reached the top of the rep range,
 * the next session should add load.
 */
export function shouldIncrease(exercise, perf) {
  if (!perf || perf.sets.length < exercise.sets) return false;
  return perf.sets.slice(0, exercise.sets).every((s) => num(s.reps) >= exercise.reps[1]);
}

/** Per-day best estimated 1RM and heaviest set, for the exercise chart. */
export function exerciseSeries(data, exerciseId) {
  return Object.keys(data.workouts).sort().flatMap((k) => {
    const sets = doneSets(data.workouts[k], exerciseId);
    if (!sets.length) return [];
    const best = Math.max(...sets.map((s) => e1rm(num(s.kg), num(s.reps))));
    const top = sets.reduce((m, s) => (num(s.kg) > num(m.kg) ? s : m), sets[0]);
    return [{ date: k, value: Math.round(best * 10) / 10, top: `${num(top.kg)}×${num(top.reps)}` }];
  });
}

/** Weekly waist measurements (from the weekly checks), oldest first. */
export function waistSeries(data) {
  return Object.keys(data.weeks).sort().flatMap((k) => {
    const v = num(data.weeks[k].vita);
    return v === null || !data.weeks[k].monday ? [] : [{ date: data.weeks[k].monday, value: v }];
  });
}

export function currentMonday() {
  return iso(mondayOf(new Date()));
}

/**
 * Run time typed by the user → seconds. Accepts ":" or "," (or "." / space)
 * as separator, because phone number pads often have no colon:
 * "52,30" / "52:30" = 52 min 30 s · "1,02,30" = 1 h 2 min 30 s · "52" = 52 min.
 * The part after a separator is always seconds (so "52,5" = 52:05).
 */
export function parseDuration(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v * 60 : null;
  const parts = String(v).trim().split(/[:,.\s]+/).filter(Boolean);
  if (!parts.length || parts.length > 3 || parts.some((x) => !/^\d+$/.test(x))) return null;
  const n = parts.map(Number);
  if (n.length > 1 && n.slice(1).some((x) => x >= 60)) return null;
  const sec = n.length === 1 ? n[0] * 60 : n.length === 2 ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60 + n[2];
  return sec > 0 ? sec : null;
}

/** Seconds → "52:30" or "1:02:30". */
export function fmtDuration(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** One logged run with derived pace (seconds per km); null when no distance. */
export function runInfo(r) {
  const km = num(r?.km);
  if (!km) return null;
  const sec = parseDuration(r.durata);
  return { km, sec, pace: sec ? sec / km : null, fc: num(r.fc) };
}

/** Every logged run since `fromIso` (inclusive), oldest first. */
export function runSeries(data, fromIso) {
  return Object.keys(data.runs || {}).sort().flatMap((date) => {
    if (fromIso && date < fromIso) return [];
    const info = runInfo(data.runs[date]);
    return info ? [{ date, ...info }] : [];
  });
}

/** Totals for a list of runs: km, time, average pace (total time / km with a time), average HR. */
export function runTotals(runs) {
  const km = runs.reduce((s, r) => s + r.km, 0);
  const timed = runs.filter((r) => r.sec);
  const sec = timed.reduce((s, r) => s + r.sec, 0);
  const timedKm = timed.reduce((s, r) => s + r.km, 0);
  return {
    count: runs.length,
    km: Math.round(km * 10) / 10,
    sec: timed.length ? sec : null,
    pace: timedKm ? sec / timedKm : null,
    fc: avg(runs.map((r) => r.fc)),
  };
}

/** Kilometres per ISO week (keyed by Monday) since `fromIso`, oldest first, weeks without runs skipped. */
export function weeklyKmSeries(data, fromIso) {
  const by = {};
  for (const r of runSeries(data, fromIso)) {
    const m = iso(mondayOf(parseIso(r.date)));
    by[m] = (by[m] || 0) + r.km;
  }
  return Object.keys(by).sort().map((date) => ({ date, value: Math.round(by[date] * 10) / 10 }));
}
