import { storeKey } from "./ns.js";
// All data lives in this device's localStorage under one key, as one JSON
// document. Nothing is ever sent anywhere and nothing personal is in the
// source code: profile, programs, diets and plan arrive only by importing a backup.

export const STORAGE_KEY = storeKey("data");
export const SCHEMA_VERSION = 5;
export const BACKUP_APP = "diario-fitness";

export const DEFAULT_PROFILE = {
  phase: null,
  kcal: null,
  prot: null,
  carb: null,
  fat: null,
  maintenance: null,
  heightCm: null,
  startWeight: null,
  startBf: null,
  startDate: null,
  goalWeight: null,
  goalBf: null,
  /** Weekly change thresholds (kg) and kcal step used by the weekly advice. */
  rules: null,
};

export function emptyData() {
  return {
    version: SCHEMA_VERSION,
    profile: { ...DEFAULT_PROFILE },
    programs: {},
    activeProgram: null,
    diets: {},
    activeDiet: null,
    plan: { sections: [], yoga: null },
    /**
     * The quest game (see src/lib/game.js): the default weekly routine of
     * quests ("0".."6" = Sunday..Saturday → quest list; workouts come from the
     * program's week), the day the game started (XP counts from there) and the
     * level/tier last shown, to announce level-ups.
     */
    game: { startDate: null, routine: null, seen: null },
    history: [],
    /** Every version replaced by a plan import: { at, kind, id?, data }. Never pruned. */
    archive: [],
    /** Device preferences carried in the backup: language, background and accent colour. */
    prefs: { lang: null, bg: null, accent: null, style: null },
    days: {},
    workouts: {},
    weeks: {},
    months: {},
    /** Day-by-day changes to the weekly plan: { "YYYY-MM-DD": { activities: [...] } }. A log: imports never touch it. */
    moves: {},
    /** Day-by-day changes to the quest routine: { "YYYY-MM-DD": { quests: [...] } }. A log. */
    questDays: {},
    meta: { createdAt: new Date().toISOString(), lastBackup: null },
  };
}

export const LOG_COLLECTIONS = ["days", "workouts", "weeks", "months", "moves", "questDays"];

/** Logs and fields of activities the app no longer has (running, yoga): removed from v5 on. */
const DROPPED_LOGS = ["runs", "yoga"];
const DROPPED_ACTIVITIES = new Set(["run", "yoga"]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Validate and normalise a parsed document (from storage or a backup file),
 * upgrading older versions. Throws an Error whose message is a locale key
 * under "settings:backup.errors".
 */
export function normalise(raw) {
  if (!isObj(raw)) throw new Error("notBackup");
  const doc = isObj(raw.data) && raw.app === BACKUP_APP ? raw.data : raw;
  if (!isObj(doc) || typeof doc.version !== "number") throw new Error("notBackup");
  if (doc.version > SCHEMA_VERSION) throw new Error("newerVersion");
  // v3 → v4 only adds the "moves" log, which starts empty: nothing to migrate.
  // v4 → v5 removes running and yoga everywhere (logs, plan, program week,
  // moves, archive) and adds the quest game; see stripRunYoga.
  const out = emptyData();
  // Keys this version doesn't know are carried through untouched, so nothing
  // in a backup is ever dropped silently (except the logs removed on purpose).
  for (const k of Object.keys(doc)) if (!(k in out) && !DROPPED_LOGS.includes(k)) out[k] = doc[k];
  out.profile = { ...DEFAULT_PROFILE, ...(isObj(doc.profile) ? doc.profile : {}) };
  for (const c of LOG_COLLECTIONS) {
    if (doc[c] !== undefined && !isObj(doc[c])) throw new Error("corrupt");
    out[c] = isObj(doc[c]) ? doc[c] : {};
  }
  if (doc.programs !== undefined && !isObj(doc.programs)) throw new Error("corrupt");
  out.programs = isObj(doc.programs) ? doc.programs : {};
  for (const p of Object.values(out.programs)) {
    if (!isObj(p) || !Array.isArray(p.sessions)) throw new Error("corrupt");
  }
  out.activeProgram = typeof doc.activeProgram === "string" && out.programs[doc.activeProgram] ? doc.activeProgram : null;
  if (doc.diets !== undefined && !isObj(doc.diets)) throw new Error("corrupt");
  out.diets = isObj(doc.diets) ? doc.diets : {};
  for (const d of Object.values(out.diets)) {
    if (!isObj(d) || !Array.isArray(d.days) || d.days.some((x) => !isObj(x) || !Array.isArray(x.meals))) throw new Error("corrupt");
  }
  out.activeDiet = typeof doc.activeDiet === "string" && out.diets[doc.activeDiet] ? doc.activeDiet : null;
  if (isObj(doc.plan)) {
    out.plan = { ...doc.plan, sections: Array.isArray(doc.plan.sections) ? doc.plan.sections : [], yoga: isObj(doc.plan.yoga) ? doc.plan.yoga : null, updatedAt: doc.plan.updatedAt || null };
  }
  out.history = Array.isArray(doc.history) ? doc.history.filter(isObj) : [];
  out.archive = Array.isArray(doc.archive) ? doc.archive.filter(isObj) : [];
  out.prefs = { ...out.prefs, ...(isObj(doc.prefs) ? doc.prefs : {}) };
  out.meta = { ...out.meta, ...(isObj(doc.meta) ? doc.meta : {}) };
  out.game = { ...out.game, ...(isObj(doc.game) ? doc.game : {}) };
  if (out.game.routine !== null && !isObj(out.game.routine)) out.game.routine = null;
  out.version = SCHEMA_VERSION;
  return stripRunYoga(out);
}

const dropActivity = (a) => (DROPPED_ACTIVITIES.has(a) ? "rest" : a);

function cleanProgram(p) {
  if (!isObj(p)) return p;
  const next = { ...p };
  if (isObj(p.week)) next.week = Object.fromEntries(Object.entries(p.week).map(([k, v]) => [k, dropActivity(v)]));
  if (isObj(p.activityNotes)) {
    const notes = { ...p.activityNotes };
    for (const a of DROPPED_ACTIVITIES) delete notes[a];
    if (Object.keys(notes).length) next.activityNotes = notes; else delete next.activityNotes;
  }
  return next;
}

function cleanProfile(p) {
  if (!isObj(p) || !("zone2" in p)) return p;
  const { zone2: _z, ...rest } = p;
  return rest;
}

/** Running and yoga are gone from the app (Nov 2026): remove them wherever they were stored. */
function stripRunYoga(d) {
  d.profile = cleanProfile(d.profile);
  d.plan = { ...d.plan, yoga: null };
  d.programs = Object.fromEntries(Object.entries(d.programs).map(([k, p]) => [k, cleanProgram(p)]));
  const moves = {};
  for (const [date, m] of Object.entries(d.moves)) {
    if (!isObj(m)) continue;
    const list = Array.isArray(m.activities) ? m.activities : m.activity ? [m.activity] : [];
    const kept = list.filter((a) => !DROPPED_ACTIVITIES.has(a));
    if (list.length && !kept.length && list.some((a) => DROPPED_ACTIVITIES.has(a))) continue; // only a run/yoga was planned there
    moves[date] = { activities: kept.length ? kept : ["rest"] };
  }
  d.moves = moves;
  d.archive = d.archive.map((a) => {
    if (a.kind === "plan" && isObj(a.data) && a.data.yoga) return { ...a, data: { ...a.data, yoga: null } };
    if (a.kind === "profile") return { ...a, data: cleanProfile(a.data) };
    if (a.kind === "program") return { ...a, data: cleanProgram(a.data) };
    return a;
  });
  return d;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const PROFILE_PLAN_KEYS = Object.keys(DEFAULT_PROFILE);

/**
 * Keep every log already on the phone and take profile, programs, diets,
 * plan and history from the incoming document (used to load a new plan
 * without losing what was recorded). A partial file only updates what it
 * carries: empty profile fields and an empty plan leave the current ones. Whatever the incoming file replaces —
 * plan, profile targets, a program or diet with the same id — is first
 * copied into the archive, so no version is ever lost.
 */
export function mergePlan(current, incoming, at = new Date().toISOString()) {
  const archive = [...current.archive];
  const keep = (kind, data, id) => archive.push({ at, kind, ...(id ? { id } : {}), data });

  const filled = (plan) => plan.sections.length > 0 || !!plan.yoga;
  const nextPlan = filled(incoming.plan) ? incoming.plan : current.plan;
  if (filled(current.plan) && !same(current.plan, nextPlan)) keep("plan", current.plan);

  const pick = (p) => Object.fromEntries(PROFILE_PLAN_KEYS.map((k) => [k, p[k] ?? null]));
  const given = Object.fromEntries(Object.entries(incoming.profile).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  const nextProfile = { ...current.profile, ...given };
  if (Object.values(pick(current.profile)).some((v) => v !== null) && !same(pick(current.profile), pick(nextProfile))) keep("profile", pick(current.profile));

  for (const [coll, kind] of [["programs", "program"], ["diets", "diet"]]) {
    for (const [id, item] of Object.entries(incoming[coll])) {
      if (current[coll][id] && !same(current[coll][id], item)) keep(kind, current[coll][id], id);
    }
  }
  // Older archive entries carried by the incoming file are added too.
  for (const a of incoming.archive) if (!archive.some((x) => same(x, a))) archive.push(a);
  archive.sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const history = [...current.history];
  for (const h of incoming.history) {
    if (!history.some((x) => x.date === h.date && x.title === h.title)) history.push(h);
  }
  history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // The quest routine travels with the plan: a file that carries one replaces it.
  const routine = incoming.game?.routine || null;
  if (routine && current.game?.routine && !same(routine, current.game.routine)) keep("routine", current.game.routine);
  return {
    ...current,
    game: routine ? { ...current.game, routine } : current.game,
    profile: nextProfile,
    programs: { ...current.programs, ...incoming.programs },
    activeProgram: incoming.activeProgram || current.activeProgram,
    diets: { ...current.diets, ...incoming.diets },
    activeDiet: incoming.activeDiet || current.activeDiet,
    plan: nextPlan,
    history,
    archive,
  };
}

export function load() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? normalise(JSON.parse(s)) : emptyData();
  } catch {
    return emptyData();
  }
}

/** Returns false when the write failed (storage full or blocked). */
export function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** The backup file: the full document wrapped with a small header. */
export function toBackup(data) {
  return { app: BACKUP_APP, exportedAt: new Date().toISOString(), data };
}

export function countEntries(data) {
  return {
    ...Object.fromEntries(LOG_COLLECTIONS.map((c) => [c, Object.keys(data[c]).length])),
    programs: Object.keys(data.programs).length,
    diets: Object.keys(data.diets).length,
    history: data.history.length,
    archive: data.archive.length,
  };
}

/** True when the document holds at least one log entry (days, workouts, checks, moves). */
export function hasLogs(data) {
  return LOG_COLLECTIONS.some((c) => Object.keys(data[c] || {}).length > 0);
}

export function hasPlan(data) {
  return !!data.activeProgram || !!data.activeDiet || data.plan.sections.length > 0;
}

/** Ask the browser not to evict our storage (installed PWAs usually get it). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported: nothing to do */
  }
}
