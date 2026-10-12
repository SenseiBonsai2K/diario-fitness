import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Grid, Icon, NumField, Segmented } from "../components/ui.jsx";
import { LANGS } from "../i18n.js";
import { DEFAULT_TONE, TONE_IDS, previewTone } from "../components/RestTimer.jsx";
import { APPEARANCE } from "../lib/appearance.js";
import { ACCENT_IDS, BG_IDS, resolveAppearance } from "../lib/themes-apply.js";
import { today } from "../lib/dates.js";
import { countEntries, emptyData, hasLogs, hasPlan, normalise, toBackup } from "../lib/storage.js";
import { useStore } from "../lib/store.jsx";

const PHASES = ["cut", "maintain", "bulk", "minicut"];

export default function Settings() {
  const { t } = useTranslation("settings");
  return (
    <>
      <h1 className="h-display text-3xl">{t("title")}</h1>
      <PlanEditor />
      <Backup />
      <Profile />
      <TimerSettings />
      <Appearance />
      <Language />
      <Install />
      <DangerZone />
      <p className="text-xs text-muted text-center pb-2">{t("privacy")}</p>
    </>
  );
}

/** The plan editor is a separate page of the app (compositore.html): same storage, so it edits this diary directly. */
function PlanEditor() {
  const { t } = useTranslation("settings");
  return (
    <Card title={t("editor.title")}>
      <p className="text-sm">{t("editor.lead")}</p>
      <a href="./compositore.html" className="btn"><Icon name="list" size={18} />{t("editor.open")}</a>
    </Card>
  );
}

function TimerSettings() {
  const { t } = useTranslation("settings");
  const { data, setPrefs } = useStore();
  return (
    <Card title={t("timer.title")}>
      <Segmented
        clearable={false}
        label={t("timer.sound")}
        value={data.prefs.timerSound === false ? "off" : "on"}
        onChange={(v) => setPrefs({ timerSound: v === "on" })}
        options={[{ value: "on", label: t("timer.on") }, { value: "off", label: t("timer.off") }]}
      />
      {data.prefs.timerSound !== false && (
        <div className="flex flex-col gap-1.5">
          <span id="tone-label" className="label">{t("timer.tone")}</span>
          <div role="radiogroup" aria-labelledby="tone-label" className="grid grid-cols-2 gap-2">
            {TONE_IDS.map((id) => {
              const on = id === (TONE_IDS.includes(data.prefs.timerTone) ? data.prefs.timerTone : DEFAULT_TONE);
              return (
                <button key={id} type="button" role="radio" aria-checked={on}
                  onClick={() => { setPrefs({ timerTone: id }); previewTone(id); }}
                  className={`flex items-center gap-2.5 rounded-field border px-3 min-h-[48px] text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? "border-accent bg-accent-soft font-semibold" : "border-line/70"}`}>
                  <span className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${on ? "bg-accent text-accent-ink" : "bg-raised text-muted"}`}><Icon name={on ? "check" : "play"} size={14} /></span>
                  {t(`timer.tones.${id}`)}
                </button>
              );
            })}
          </div>
          <span className="text-xs text-muted">{t("timer.toneHint")}</span>
        </div>
      )}
      <p className="text-xs text-muted">{t("timer.note")}</p>
    </Card>
  );
}

/** Neutral background and accent colour, picked separately; every combination keeps AA contrast. */
function Appearance() {
  const { t } = useTranslation("settings");
  const { data, setPrefs } = useStore();
  const cur = resolveAppearance(data.prefs);
  const bgs = APPEARANCE.backgrounds;
  const half = (l, d) => `linear-gradient(135deg, ${l} 50%, ${d} 50%)`;
  return (
    <Card title={t("appearance.title")}>
      <div className="flex flex-col gap-2">
        <span id="bg-label" className="label">{t("appearance.background")}</span>
        <div role="radiogroup" aria-labelledby="bg-label" className="grid grid-cols-5 gap-2">
          {BG_IDS.map((id) => {
            const on = id === cur.bgPref;
            const fill = id === "auto" ? half(bgs.light.bg, bgs.dark.bg) : bgs[id].bg;
            return (
              <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setPrefs({ bg: id })}
                className="flex flex-col items-center gap-1.5 rounded-field py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <span className={`w-12 h-12 rounded-full border-2 grid place-items-center ${on ? "border-accent ring-2 ring-accent/30" : "border-line"}`} style={{ background: fill }}>
                  {on && <span className="w-5 h-5 rounded-full bg-accent text-accent-ink grid place-items-center"><Icon name="check" size={12} /></span>}
                </span>
                <span className={`text-[0.7rem] ${on ? "font-semibold" : "text-muted"}`}>{t(`appearance.bgs.${id}`)}</span>
              </button>
            );
          })}
        </div>
      </div>
      {[["soft", ACCENT_IDS.filter((id) => !APPEARANCE.accents[id].vivid)], ["vivid", ACCENT_IDS.filter((id) => APPEARANCE.accents[id].vivid)]].map(([group, ids]) => (
        <div key={group} className="flex flex-col gap-2">
          <span id={`accent-${group}`} className="label">{t(`appearance.accent_${group}`)}</span>
          <div role="radiogroup" aria-labelledby={`accent-${group}`} className="grid grid-cols-4 gap-2">
            {ids.map((id) => {
              const on = id === cur.accent;
              const col = APPEARANCE.accents[id][cur.mode];
              return (
                <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setPrefs({ accent: id })}
                  className={`flex flex-col items-center gap-1.5 rounded-field border py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? "border-accent bg-accent-soft" : "border-line/70"}`}>
                  <span className="w-8 h-8 rounded-full grid place-items-center" style={{ background: col }}>
                    {on && <span className="w-5 h-5 rounded-full bg-black/25 grid place-items-center text-white"><Icon name="check" size={13} /></span>}
                  </span>
                  <span className={`text-[0.7rem] ${on ? "font-semibold" : "text-muted"}`}>{t(`appearance.accents.${id}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">{t("appearance.note")}</p>
    </Card>
  );
}

function Language() {
  const { t, i18n } = useTranslation("settings");
  const { setPrefs } = useStore();
  return (
    <Card title={t("language")}>
      <Segmented
        clearable={false}
        value={i18n.resolvedLanguage}
        onChange={(l) => { i18n.changeLanguage(l); setPrefs({ lang: l }); }}
        options={LANGS.map((l) => ({ value: l, label: t(`languages.${l}`) }))}
      />
    </Card>
  );
}

function Profile() {
  const { t } = useTranslation("settings");
  const { data, setProfile } = useStore();
  const p = data.profile;
  const set = (k) => (v) => setProfile({ [k]: v });
  return (
    <Card title={t("profile.title")}>
      <div className="flex flex-col gap-1">
        <label htmlFor="phase" className="label">{t("profile.phase")}</label>
        <select id="phase" className="input" value={p.phase || ""} onChange={(e) => setProfile({ phase: e.target.value || null })}>
          <option value="">—</option>
          {PHASES.map((ph) => <option key={ph} value={ph}>{t(`common:phase.${ph}`)}</option>)}
        </select>
      </div>
      <Grid>
        <NumField label={t("profile.kcal")} unit="kcal" decimal={false} value={p.kcal} onChange={set("kcal")} />
        <NumField label={t("profile.maintenance")} unit="kcal" decimal={false} value={p.maintenance} onChange={set("maintenance")} />
        <NumField label={t("profile.protein")} unit="g" decimal={false} value={p.prot} onChange={set("prot")} />
        <NumField label={t("profile.carbs")} unit="g" decimal={false} value={p.carb} onChange={set("carb")} />
        <NumField label={t("profile.fat")} unit="g" decimal={false} value={p.fat} onChange={set("fat")} />
        <NumField label={t("profile.height")} unit="cm" decimal={false} value={p.heightCm} onChange={set("heightCm")} />
        <NumField label={t("profile.startWeight")} unit="kg" value={p.startWeight} onChange={set("startWeight")} />
        <NumField label={t("profile.startBf")} unit="%" value={p.startBf} onChange={set("startBf")} />
        <NumField label={t("profile.goalWeight")} unit="kg" value={p.goalWeight} onChange={set("goalWeight")} />
        <NumField label={t("profile.goalBf")} unit="%" value={p.goalBf} onChange={set("goalBf")} />
      </Grid>
      <div className="flex flex-col gap-1">
        <label htmlFor="start-date" className="label">{t("profile.startDate")}</label>
        <input id="start-date" type="date" className="input" value={p.startDate || ""} onChange={(e) => setProfile({ startDate: e.target.value || null })} />
      </div>
    </Card>
  );
}

function fileName() {
  return `diario-fitness-backup-${today()}.json`;
}

function Backup() {
  const { t, i18n } = useTranslation("settings");
  const { data, replaceAll, importPlan, markBackup } = useStore();
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null); // { doc, exportedAt }
  const [msg, setMsg] = useState(null); // { tone, text }

  const snapshot = () => ({ ...data, prefs: { ...data.prefs, lang: i18n.resolvedLanguage || data.prefs.lang } });
  const blob = () => new Blob([JSON.stringify(toBackup(snapshot()), null, 2)], { type: "application/json" });

  const download = () => {
    const url = URL.createObjectURL(blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    markBackup();
    setMsg({ tone: "good", text: t("backup.saved") });
  };

  const file = () => new File([blob()], fileName(), { type: "application/json" });
  const canShare = typeof navigator !== "undefined" && !!navigator.canShare && (() => { try { return navigator.canShare({ files: [file()] }); } catch { return false; } })();

  const share = async () => {
    try {
      await navigator.share({ files: [file()], title: t("backup.shareTitle") });
      markBackup();
      setMsg({ tone: "good", text: t("backup.shared") });
    } catch (e) {
      if (e?.name !== "AbortError") setMsg({ tone: "bad", text: t("backup.shareFailed") });
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMsg(null);
    try {
      const raw = JSON.parse(await f.text());
      const doc = normalise(raw);
      setPending({ doc, exportedAt: raw.exportedAt || null, name: f.name });
    } catch (err) {
      const key = ["notBackup", "newerVersion", "corrupt"].includes(err?.message) ? err.message : "notBackup";
      setMsg({ tone: "bad", text: t(`backup.errors.${key}`) });
    }
  };

  const confirmImport = (mode) => {
    if (mode === "all") {
      replaceAll(pending.doc);
      if (LANGS.includes(pending.doc.prefs?.lang)) i18n.changeLanguage(pending.doc.prefs.lang);
    } else importPlan(pending.doc);
    setPending(null);
    setMsg({ tone: "good", text: t(mode === "all" ? "backup.imported" : "backup.planImported") });
  };

  const counts = pending ? countEntries(pending.doc) : null;
  // A plan file (no logs) must never wipe the logs on the phone.
  const allowAll = pending ? hasLogs(pending.doc) || !hasLogs(data) : false;
  const last = data.meta.lastBackup;

  return (
    <Card title={t("backup.title")}>
      {!hasPlan(data) && <p className="text-sm font-semibold text-accent">{t("backup.emptyHint")}</p>}
      <p className="text-sm">{t("backup.lead")}</p>
      <p className="text-sm text-muted">
        {last
          ? t("backup.last", { date: new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(last)) })
          : t("backup.never")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {canShare && (
          <button type="button" className="btn" onClick={share}><Icon name="share" size={18} />{t("backup.share")}</button>
        )}
        <button type="button" className={canShare ? "btn-ghost" : "btn"} onClick={download}><Icon name="download" size={18} />{t("backup.download")}</button>
        <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} />{t("backup.import")}</button>
      </div>
      {canShare && <p className="text-xs text-muted">{t("backup.shareHint")}</p>}
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} aria-label={t("backup.import")} />

      {pending && (
        <div className="rounded-field border border-warn/60 bg-warn/10 p-3 flex flex-col gap-2 text-sm">
          <strong>{t("backup.confirmTitle")}</strong>
          <span className="break-all text-muted">{pending.name}</span>
          {pending.exportedAt && <span>{t("backup.exportedAt", { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "long", timeStyle: "short" }).format(new Date(pending.exportedAt)) })}</span>}
          <span className="num">{t("backup.contains", counts)}</span>
          <span>{allowAll ? t("backup.importChoice") : t("backup.planFileOnly")}</span>
          <div className="flex flex-col gap-2 pt-1">
            {allowAll && <button type="button" className="btn-ghost" onClick={() => confirmImport("all")}>{t("backup.importAll")}</button>}
            <button type="button" className="btn" onClick={() => confirmImport("plan")}>{t("backup.importPlan")}</button>
            <button type="button" className="btn-ghost border-transparent" onClick={() => setPending(null)}>{t("common:cancel")}</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className={`text-sm ${msg.tone === "good" ? "text-good" : "text-bad"}`}>{msg.text}</p>}
    </Card>
  );
}

function Install() {
  const { t } = useTranslation("settings");
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const blocks = ios ? ["ios", "android"] : ["android", "ios"];
  return (
    <Card title={t("install.title")}>
      {blocks.map((k) => (
        <div key={k} className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">{t(`install.${k}.title`)}</h3>
          <ol className="list-decimal pl-5 text-sm flex flex-col gap-1.5">
            {[1, 2, 3].map((n) => <li key={n}>{t(`install.${k}.step${n}`)}</li>)}
          </ol>
          {k === "ios" && <p className="text-xs text-muted">{t("install.ios.note")}</p>}
        </div>
      ))}
    </Card>
  );
}

function DangerZone() {
  const { t } = useTranslation("settings");
  const { replaceAll } = useStore();
  const [armed, setArmed] = useState(false);
  const [text, setText] = useState("");
  const word = t("danger.word");
  return (
    <Card title={t("danger.title")}>
      {!armed ? (
        <button type="button" className="btn-ghost text-bad border-bad/50" onClick={() => setArmed(true)}>{t("danger.start")}</button>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p>{t("danger.warning", { word })}</p>
          <input className="input" aria-label={t("danger.typeLabel", { word })} value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" />
          <div className="flex gap-2">
            <button type="button" className="btn-danger flex-1" disabled={text.trim().toUpperCase() !== word} onClick={() => { replaceAll(emptyData()); setArmed(false); setText(""); }}>
              {t("danger.confirm")}
            </button>
            <button type="button" className="btn-ghost flex-1" onClick={() => { setArmed(false); setText(""); }}>{t("common:cancel")}</button>
          </div>
        </div>
      )}
    </Card>
  );
}
