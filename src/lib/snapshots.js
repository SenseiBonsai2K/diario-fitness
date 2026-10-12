// Automatic local copies of the whole document, kept in IndexedDB on this
// device: one a week, plus one before every change that replaces data
// (plan edits, imports, restoring a copy). They protect against mistakes and
// bad imports; they do NOT protect against losing the phone or deleting the
// app, so the weekly file backup (Settings → Backup) is still needed.

const DB_NAME = "diario-fitness";
const STORE = "snapshots";
export const WEEK_MS = 7 * 86400000;
/** How many copies of each kind are kept. */
export const KEEP = { weekly: 8, before: 6 };

/** Which copies to delete: keeps the newest KEEP[kind] of each kind. Pure, for tests. */
export function toPrune(list) {
  const out = [];
  for (const kind of Object.keys(KEEP)) {
    const same = list.filter((s) => (s.kind === "weekly" ? "weekly" : "before") === kind).sort((a, b) => b.at.localeCompare(a.at));
    out.push(...same.slice(KEEP[kind]).map((s) => s.at));
  }
  return out;
}

/** True when the newest weekly copy is older than a week (or there is none). */
export function weeklyDue(list, now = Date.now()) {
  const last = list.filter((s) => s.kind === "weekly").map((s) => Date.parse(s.at)).sort((a, b) => b - a)[0];
  return !last || now - last >= WEEK_MS;
}

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("unavailable")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "at" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  }));
}

const request = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

/** Every copy without its data (date, kind, size, counts), newest first. */
export async function listSnapshots() {
  try {
    const all = await tx("readonly", (s) => request(s.getAll()));
    return (all || []).map(({ data, ...meta }) => meta).sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}

export async function getSnapshot(at) {
  return tx("readonly", (s) => request(s.get(at)));
}

/**
 * Save a copy. kind: "weekly" or the reason for a "before" copy
 * ("beforeEdit", "beforeImport", "beforeRestore"). Never throws: a failed copy
 * must not block the action it protects.
 */
export async function takeSnapshot(data, kind) {
  try {
    const at = new Date().toISOString();
    const json = JSON.stringify(data);
    const counts = { days: Object.keys(data.days || {}).length, workouts: Object.keys(data.workouts || {}).length };
    await tx("readwrite", (s) => request(s.put({ at, kind, size: json.length, counts, data: JSON.parse(json) })));
    const list = await listSnapshots();
    const drop = toPrune(list);
    if (drop.length) await tx("readwrite", (s) => Promise.all(drop.map((k) => request(s.delete(k)))));
    return true;
  } catch {
    return false;
  }
}

/** Called when the app opens: one copy a week, only once there is something to keep. */
export async function weeklySnapshot(data, hasSomething) {
  if (!hasSomething) return false;
  const list = await listSnapshots();
  return weeklyDue(list) ? takeSnapshot(data, "weekly") : false;
}

export async function clearSnapshots() {
  try { await tx("readwrite", (s) => request(s.clear())); } catch { /* nothing to clear */ }
}
