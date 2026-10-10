// All data lives in this device's localStorage under one key, as one JSON
// document. Nothing is ever sent anywhere and nothing personal is in the
// source code: profile, programs, diets and plan arrive only by importing a backup.

export const STORAGE_KEY = "diario-fitness:data";
export const SCHEMA_VERSION = 3;
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
  /** Heart-rate band for easy runs, e.g. { min: 120, max: 140 }. */
  zone2: null,
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
    history: [],
    /** Every version replaced by a plan import: { at, kind, id?, data }. Never pruned. */
    archive: [],
    /** Device preferences carried in the backup (today only the language). */
    prefs: { lang: null },
    days: {},
    workouts: {},
    runs: {},
    yoga: {},
    weeks: {},
    months: {},
    meta: { createdAt: new Date().toISOString(), lastBackup: null },
  };
}

export const LOG_COLLECTIONS = ["days", "workouts", "runs", "yoga", "weeks", "months"];

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
  const out = emptyData();
  // Keys this version doesn't know are carried through untouched, so nothing
  // in a backup is ever dropped silently.
  for (const k of Object.keys(doc)) if (!(k in out)) out[k] = doc[k];
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
  out.version = SCHEMA_VERSION;
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const PROFILE_PLAN_KEYS = Object.keys(DEFAULT_PROFILE);

/**
 * Keep every log already on the phone and take profile, programs, diets,
 * plan and history from the incoming document (used to load a new plan
 * without losing what was recorded). Whatever the incoming file replaces —
 * plan, profile targets, a program or diet with the same id — is first
 * copied into the archive, so no version is ever lost.
 */
export function mergePlan(current, incoming, at = new Date().toISOString()) {
  const archive = [...current.archive];
  const keep = (kind, data, id) => archive.push({ at, kind, ...(id ? { id } : {}), data });

  const hasPlanContent = current.plan.sections.length > 0 || current.plan.yoga;
  if (hasPlanContent && !same(current.plan, incoming.plan)) keep("plan", current.plan);

  const pick = (p) => Object.fromEntries(PROFILE_PLAN_KEYS.map((k) => [k, p[k] ?? null]));
  const nextProfile = { ...current.profile, ...incoming.profile };
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
  return {
    ...current,
    profile: nextProfile,
    programs: { ...current.programs, ...incoming.programs },
    activeProgram: incoming.activeProgram || current.activeProgram,
    diets: { ...current.diets, ...incoming.diets },
    activeDiet: incoming.activeDiet || current.activeDiet,
    plan: incoming.plan,
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
