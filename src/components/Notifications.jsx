import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Icon } from "./ui.jsx";
import { useStore } from "../lib/store.jsx";
import { today } from "../lib/dates.js";
import { DEFAULT_SERVER, NOTIFY_KINDS, disablePush, enablePush, notificationsOf, pushSupported, readDevice, syncPayload, syncPush, testPush } from "../lib/notify.js";
import { useGame } from "./game.jsx";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const errKey = (e) => e?.code || "generic";

/**
 * Keeps the push server up to date: a few seconds after any change, and right
 * away when the app goes to the background. Silent when notifications are off.
 */
export function NotifySync() {
  const { data } = useStore();
  const g = useGame();
  const { t, i18n } = useTranslation();
  const latest = useRef(null);
  latest.current = () => syncPayload(data, today(), t, i18n.language, g);

  useEffect(() => {
    if (!readDevice()) return undefined;
    const id = setTimeout(() => {
      syncPush(latest.current()).then(() => { try { sessionStorage.setItem("push-synced", new Date().toISOString()); } catch { /* ignore */ } }).catch(() => {});
    }, 3000);
    return () => clearTimeout(id);
  }, [data, i18n.language, g?.level, g?.streak]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden" && readDevice()) syncPush(latest.current(), { keepalive: true }).catch(() => {}); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);
  return null;
}

function Field({ label, hint, ...props }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} className="input" autoComplete="off" {...props} />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** Settings → Notifications: turn push on for this phone, choose reminders, times, days and quiet hours. */
export default function Notifications() {
  const { t, i18n } = useTranslation("notify");
  const { data, setPrefs } = useStore();
  const g = useGame();
  const [device, setDevice] = useState(readDevice);
  const [server, setServer] = useState(device?.server || data.prefs.pushServer || DEFAULT_SERVER);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const n = notificationsOf(data);
  const weekday = (d) => new Intl.DateTimeFormat(i18n.language, { weekday: "narrow" }).format(new Date(2026, 10, 1 + d));

  const save = (next) => setPrefs({ notifications: { ...n, ...next } });
  const setRule = (id, values) => save({ rules: n.rules.map((r) => (r.id === id ? { ...r, ...values } : r)) });
  const fail = (e) => setMsg({ tone: "bad", text: t(`errors.${errKey(e)}`, { code: errKey(e), defaultValue: t("errors.generic", { code: errKey(e) }) }) });

  const enable = async () => {
    setBusy(true); setMsg(null);
    try {
      const d = await enablePush(server, key.trim());
      setPrefs({ pushServer: d.server });
      setDevice(d); setKey("");
      await syncPush(syncPayload(data, today(), i18n.t.bind(i18n), i18n.language, g));
      await testPush(i18n.t.bind(i18n));
      setMsg({ tone: "good", text: t("sent") });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      await syncPush(syncPayload(data, today(), i18n.t.bind(i18n), i18n.language, g));
      await testPush(i18n.t.bind(i18n));
      setMsg({ tone: "good", text: t("sent") });
    } catch (e) { fail(e); if (!readDevice()) setDevice(null); } finally { setBusy(false); }
  };
  const disable = async () => { setBusy(true); await disablePush(); setDevice(null); setBusy(false); setMsg(null); };

  return (
    <Card title={t("title")}>
      <p className="text-sm text-muted -mt-1">{t("lead")}</p>
      {!pushSupported() ? (
        <p className="text-sm text-warn">{t("unsupported")}</p>
      ) : device ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-good inline-flex items-center gap-2"><Icon name="check" size={16} />{t("on")}</p>
          <p className="text-xs text-muted break-all">{device.server}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" disabled={busy} onClick={test}>{t("testButton")}</button>
            <button type="button" className="btn-ghost !text-bad" disabled={busy} onClick={disable}>{t("disable")}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t("off")}</p>
          <Field label={t("server")} hint={t("serverHint")} type="url" inputMode="url" placeholder="https://…onrender.com" value={server} onChange={(e) => setServer(e.target.value)} />
          <Field label={t("registerKey")} hint={t("registerKeyHint")} type="password" value={key} onChange={(e) => setKey(e.target.value)} />
          <button type="button" className="btn" disabled={busy || !server.trim() || !key.trim()} onClick={enable}>{busy ? t("enabling") : t("enable")}</button>
        </div>
      )}
      {msg && <p role="status" className={`text-sm ${msg.tone === "good" ? "text-good" : "text-bad"}`}>{msg.text}</p>}

      <h3 className="eyebrow mt-2">{t("rules")}</h3>
      <p className="text-xs text-muted -mt-2">{t("rulesHint")}</p>
      <ul className="flex flex-col gap-2">
        {NOTIFY_KINDS.map(({ kind }) => {
          const r = n.rules.find((x) => x.id === kind);
          return (
            <li key={kind} className={`rounded-field border p-3 flex flex-col gap-2 ${r.enabled ? "border-accent/40" : "border-line/60"}`}>
              <div className="flex items-center gap-3">
                <button type="button" role="switch" aria-checked={r.enabled} onClick={() => setRule(kind, { enabled: !r.enabled })}
                  className={`w-11 h-6 rounded-full relative shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${r.enabled ? "bg-accent" : "bg-raised border border-line"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface shadow transition-all ${r.enabled ? "left-[22px]" : "left-0.5"}`} />
                  <span className="sr-only">{t(`kinds.${kind}`)}</span>
                </button>
                <span className="flex-1 min-w-0 text-sm font-semibold">{t(`kinds.${kind}`)}</span>
                <label className="sr-only" htmlFor={`nt-${kind}`}>{t("time")}</label>
                <input id={`nt-${kind}`} type="time" className="input !w-[7.25rem] !py-1.5 font-mono" value={r.time} onChange={(e) => e.target.value && setRule(kind, { time: e.target.value })} disabled={!r.enabled} />
              </div>
              {r.enabled && (
                <div role="group" aria-label={t("days")} className="flex gap-1">
                  {DAY_ORDER.map((d) => {
                    const on = r.days.includes(d);
                    return (
                      <button key={d} type="button" aria-pressed={on} onClick={() => setRule(kind, { days: on ? r.days.filter((x) => x !== d) : [...r.days, d].sort() })}
                        className={`w-9 h-8 rounded-full text-xs font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? "bg-accent border-accent text-accent-ink" : "border-line text-muted"}`}>
                        {weekday(d)}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="eyebrow mt-2">{t("quiet")}</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("quietStart")} type="time" value={n.quiet.start} onChange={(e) => e.target.value && save({ quiet: { ...n.quiet, start: e.target.value } })} />
        <Field label={t("quietEnd")} type="time" value={n.quiet.end} onChange={(e) => e.target.value && save({ quiet: { ...n.quiet, end: e.target.value } })} />
      </div>
    </Card>
  );
}
