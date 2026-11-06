// Notifications through the push server (server/). The diary never leaves the
// phone: the server gets the reminder rules, quiet hours and, for the next
// days, which quests are due (with a short label like "Upper A") and which are
// done. Rules live in the user's data (prefs.notifications, in the backup);
// the device's id and token live only on this phone.

import { storeKey } from "./ns.js";
import { addDays, iso, parseIso } from "./dates.js";
import { QUEST_TYPES, evaluateDay, questKey } from "./game.js";
import { activityLabel } from "./program.js";

const DEVICE_KEY = storeKey("push-device");
export const DEFAULT_SERVER = import.meta.env?.VITE_PUSH_SERVER || "";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Reminder kinds, in the order shown, with their default time and state. */
export const NOTIFY_KINDS = [
  { kind: "workout", time: "17:30", on: true },
  { kind: "steps", time: "19:00", on: true },
  { kind: "weigh", time: "08:00", on: false },
  { kind: "water", time: "15:00", on: false },
  { kind: "diet", time: "21:00", on: false },
  { kind: "sleep", time: "22:00", on: false },
  { kind: "check", time: "18:00", on: false },
  { kind: "backup", time: "20:30", on: false },
  { kind: "streak", time: "21:30", on: true },
  { kind: "summary", time: "20:00", on: true, days: [0] },
];

export function defaultNotifications() {
  return {
    rules: NOTIFY_KINDS.map((k) => ({ id: k.kind, kind: k.kind, time: k.time, days: k.days || ALL_DAYS, enabled: k.on })),
    quiet: { start: "22:30", end: "07:00" },
  };
}

export function notificationsOf(data) {
  const n = data.prefs?.notifications;
  const base = defaultNotifications();
  if (!n) return base;
  const rules = base.rules.map((r) => ({ ...r, ...(n.rules || []).find((x) => x.id === r.id) }));
  return { rules, quiet: n.quiet || base.quiet };
}

export function readDevice() {
  try { return JSON.parse(localStorage.getItem(DEVICE_KEY) || "null"); } catch { return null; }
}
function writeDevice(d) {
  try { d ? localStorage.setItem(DEVICE_KEY, JSON.stringify(d)) : localStorage.removeItem(DEVICE_KEY); } catch { /* storage blocked */ }
}

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const clean = (url) => String(url || "").trim().replace(/\/+$/, "");

class PushError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

async function api(server, path, { method = "GET", body, token, registerKey, keepalive } = {}) {
  let res;
  try {
    res = await fetch(`${clean(server)}/api/v1${path}`, {
      method,
      keepalive,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(registerKey ? { "X-Register-Key": registerKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new PushError("network");
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new PushError(json?.error?.code || "http_error", res.status);
  return json;
}

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe this browser and register it on the server. */
export async function enablePush(server, registerKey) {
  if (!pushSupported()) throw new PushError("unsupported");
  if (!clean(server)) throw new PushError("no_server");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new PushError("denied");
  const { publicKey } = await api(server, "/push/key");
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe().catch(() => {});
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome";
  const out = await api(server, "/devices", { method: "POST", registerKey, body: { subscription: sub.toJSON(), timezone: tz } });
  const device = { server: clean(server), id: out.id, token: out.token };
  writeDevice(device);
  return device;
}

export async function disablePush() {
  const d = readDevice();
  if (d) await api(d.server, `/devices/${d.id}`, { method: "DELETE", token: d.token }).catch(() => {});
  try {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
  } catch { /* nothing to undo */ }
  writeDevice(null);
}

export async function testPush(t) {
  const d = readDevice();
  if (!d) throw new PushError("not_enabled");
  const q = new URLSearchParams({ title: t("notify:test.title"), body: t("notify:test.body") });
  return api(d.server, `/devices/${d.id}/test?${q}`, { method: "POST", token: d.token });
}

/** Short label for a due quest ("Upper A", "10.000 passi"). */
function label(data, q, t, lang) {
  if (q.type === "workout") return activityLabel(data, q.session, t);
  const n = (v) => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });
  if (q.type === "steps") return `${n(q.target)} ${t("game:unit.steps")}`;
  if (q.type === "water" || q.type === "sleep") return `${n(q.target)} ${t(`game:unit.${QUEST_TYPES[q.type].unit}`)}`;
  return t(`game:quest.${q.type}`);
}

/** What the server needs: rules with their texts, quiet hours, and today + the next 7 days. */
export function syncPayload(data, todayIso, t, lang, game) {
  const n = notificationsOf(data);
  const days = {};
  for (let i = 0; i < 8; i++) {
    const date = iso(addDays(parseIso(todayIso), i));
    const r = evaluateDay(data, date, false);
    days[date] = {
      due: Object.fromEntries(r.quests.filter((x) => x.required || x.quest.bonus).map((x) => [questKey(x.quest), label(data, x.quest, t, lang).slice(0, 60)])),
      done: r.quests.filter((x) => x.complete).map((x) => x.key),
      pending: r.required - r.completed,
    };
  }
  const summary = game
    ? t("notify:text.summaryBody", { level: game.level, constancy: game.constancy.week === null ? "—" : `${Math.round(game.constancy.week * 100)}%`, streak: game.streak })
    : t("notify:text.summaryBody", { level: "—", constancy: "—", streak: 0 });
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome",
    quiet: n.quiet,
    rules: n.rules.map((r) => ({
      ...r,
      title: t(`notify:text.${r.kind}Title`),
      body: r.kind === "summary" ? summary : t(`notify:text.${r.kind}Body`),
    })),
    days,
  };
}

export async function syncPush(payload, { keepalive = false } = {}) {
  const d = readDevice();
  if (!d) return null;
  try {
    return await api(d.server, `/devices/${d.id}`, { method: "PUT", token: d.token, body: payload, keepalive });
  } catch (e) {
    // The server forgot this phone (or the token is wrong): it has to be enabled again.
    if (e.status === 404) writeDevice(null);
    throw e;
  }
}
