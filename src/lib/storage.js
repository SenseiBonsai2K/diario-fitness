// All data lives in this device's localStorage under one key, as one JSON
// document. Nothing is ever sent anywhere and nothing personal is in the
// source code: profile, programs and plan arrive only by importing a backup.

export const STORAGE_KEY = "diario-fitness:data";
export const SCHEMA_VERSION = 2;
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
    plan: { sections: [], yoga: null },
    history: [],
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
  out.plan = isObj(doc.plan) ? { sections: Array.isArray(doc.plan.sections) ? doc.plan.sections : [], yoga: isObj(doc.plan.yoga) ? doc.plan.yoga : null, updatedAt: doc.plan.updatedAt || null } : out.plan;
  out.history = Array.isArray(doc.history) ? doc.history.filter(isObj) : [];
  out.meta = { ...out.meta, ...(isObj(doc.meta) ? doc.meta : {}) };
  out.version = SCHEMA_VERSION;
  return out;
}

/**
 * Keep every log already on the phone and take profile, programs, plan and
 * history from the incoming document (used to load a new plan or new
 * programs without losing what was recorded).
 */
export function mergePlan(current, incoming) {
  const history = [...current.history];
  for (const h of incoming.history) {
    if (!history.some((x) => x.date === h.date && x.title === h.title)) history.push(h);
  }
  history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    ...current,
    profile: { ...current.profile, ...incoming.profile },
    programs: { ...current.programs, ...incoming.programs },
    activeProgram: incoming.activeProgram || current.activeProgram,
    plan: incoming.plan,
    history,
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
    history: data.history.length,
  };
}

export function hasPlan(data) {
  return !!data.activeProgram || data.plan.sections.length > 0;
}

/** Ask the browser not to evict our storage (installed PWAs usually get it). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported: nothing to do */
  }
}
