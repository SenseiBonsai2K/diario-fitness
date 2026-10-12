import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Icon, NumField, Segmented, TextField } from "../components/ui.jsx";
import { today as todayIso } from "../lib/dates.js";
import { applyAppearance } from "../lib/themes-apply.js";
import { hasLogs, hasPlan, normalise } from "../lib/storage.js";
import { useStore } from "../lib/store.jsx";
import { takeSnapshot } from "../lib/snapshots.js";
import { BACKUP_ACCEPT, shareableFile } from "../lib/share.js";
import * as C from "../lib/compose.js";

const DRAFT_KEY = "diario-fitness:composer-draft";
const SOURCE_KEY = "diario-fitness:composer-source";
const TAB_KEY = "diario-fitness:composer-tab";
const TABS = ["start", "profile", "program", "diet", "plan", "history", "review"];
const SECTIONS = ["profile", "program", "diet", "plan", "history"];

const readJson = (key) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } };
const writeJson = (key, v) => { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked: the draft just isn't kept */ } };
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split(".");
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; }
  a[ks.at(-1)] = v;
}

/** Monday-first weekday names in the UI language. */
function weekdayNames(lang, style) {
  return Array.from({ length: 7 }, (_, i) => {
    const s = new Intl.DateTimeFormat(lang, { weekday: style }).format(new Date(2024, 0, 1 + i));
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}

/** Only the plan part of a backup is kept as the editor's source: never the logs. */
const planOnly = (d) => ({ profile: d.profile, programs: d.programs, diets: d.diets, activeProgram: d.activeProgram, activeDiet: d.activeDiet });

/** A new draft starts from the active program and diet, when there are any. */
function freshDraft(base, dayNames) {
  const today = todayIso();
  const d = C.emptyDraft(today, dayNames, base);
  if (base?.activeProgram && base.programs?.[base.activeProgram]) {
    const s = C.startFrom("program", `edit:${base.activeProgram}`, base, today, dayNames);
    d.programMode = s.mode; d.program = s.value;
  }
  if (base?.activeDiet && base.diets?.[base.activeDiet]) {
    const s = C.startFrom("diet", `edit:${base.activeDiet}`, base, today, dayNames);
    d.dietMode = s.mode; d.diet = s.value;
  }
  return d;
}

export default function Composer() {
  const { t, i18n } = useTranslation("composer");
  const { data, importPlan } = useStore();
  const lang = i18n.resolvedLanguage || "it";
  const dayNames = useMemo(() => weekdayNames(lang, "long"), [lang]);

  const { bg, accent, theme } = data.prefs;
  useLayoutEffect(() => { applyAppearance({ bg, accent, theme }); }, [bg, accent, theme]);
  useEffect(() => { document.title = t("pageTitle"); }, [t]);

  const [source, setSource] = useState(() => readJson(SOURCE_KEY)); // { name, data } from a loaded backup
  const base = source?.data || data;
  const appHasData = hasPlan(data) || hasLogs(data) || Object.keys(data.programs).length > 0;
  const canApply = !source && appHasData;

  const [draft, setDraft] = useState(() => { const d = readJson(DRAFT_KEY); return d?.v === C.DRAFT_VERSION ? d : freshDraft(base, dayNames); });
  const [tab, setTabState] = useState(() => { try { return sessionStorage.getItem(TAB_KEY) || "start"; } catch { return "start"; } });
  const [applied, setApplied] = useState(null);

  useEffect(() => { const id = setTimeout(() => writeJson(DRAFT_KEY, draft), 300); return () => clearTimeout(id); }, [draft]);
  const setTab = (next) => {
    setTabState(next);
    try { sessionStorage.setItem(TAB_KEY, next); } catch { /* ignore */ }
    window.scrollTo(0, 0);
  };

  /** Change the draft; editing a section includes it in the changes. */
  const update = (fn, section) => setDraft((d) => {
    const n = JSON.parse(JSON.stringify(d));
    fn(n);
    if (section) n.include[section] = true;
    return n;
  });

  const result = useMemo(() => C.buildPlanFile(draft, base), [draft, base]);

  const ctx = { draft, update, base, dayNames, lang, setTab, result };

  const loadSource = (next) => {
    setSource(next);
    writeJson(SOURCE_KEY, next);
    setDraft(freshDraft(next?.data || data, dayNames));
  };

  const apply = async () => {
    await takeSnapshot(data, "beforeEdit"); // undo point in Settings → Automatic copies
    importPlan(normalise(result.file));
    writeJson(DRAFT_KEY, null);
    setApplied({ parts: result.parts });
  };

  const restart = () => {
    setApplied(null);
    setDraft(freshDraft(source?.data || data, dayNames));
    setTab("start");
  };

  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))] flex flex-col gap-4">
        <a href="./" className="self-start inline-flex items-center gap-1 text-sm font-semibold text-accent min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-field">
          <Icon name="chevronLeft" size={18} />{t("back")}
        </a>
        <header className="flex flex-col gap-1">
          <h1 className="h-display text-3xl">{t("title")}</h1>
          <p className="text-sm text-muted">{t("lead")}</p>
        </header>

        <nav aria-label={t("tabsLabel")} className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-bg/95 backdrop-blur-md flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {TABS.map((k) => {
            const active = tab === k;
            return (
              <button key={k} type="button" onClick={() => setTab(k)} aria-current={active ? "page" : undefined}
                className={`chip ${active ? "bg-ink border-ink text-bg" : ""}`}>
                {SECTIONS.includes(k) && draft.include[k] && <span className={`w-2 h-2 rounded-full ${active ? "bg-bg" : "bg-accent"}`} aria-label={t("included")} />}
                {t(`tabs.${k}`)}
              </button>
            );
          })}
        </nav>

        <div key={tab} className="screen-enter flex flex-col gap-4">
          {tab === "start" && <Start {...ctx} source={source} loadSource={loadSource} appHasData={appHasData} reset={() => setDraft(freshDraft(base, dayNames))} />}
          {tab === "profile" && <Profile {...ctx} />}
          {tab === "program" && <Program {...ctx} />}
          {tab === "diet" && <Diet {...ctx} />}
          {tab === "plan" && <PlanText {...ctx} />}
          {tab === "history" && <History {...ctx} />}
          {tab === "review" && <Review {...ctx} canApply={canApply} fromFile={!!source} apply={apply} applied={applied} restart={restart} />}
        </div>
      </main>

      {tab !== "review" && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-surface/90 backdrop-blur-md border-t border-line/70 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm min-w-0" role="status">
              {result.parts.length ? (
                <>
                  <span className="font-semibold">{result.parts.map((p) => t(`tabs.${p}`)).join(" · ")}</span>
                  <br />
                  <span className={result.errors ? "text-bad" : "text-good"}>
                    {result.errors ? t("bar.errors", { count: result.errors }) : t("bar.ready")}
                  </span>
                </>
              ) : <span className="text-muted">{t("bar.nothing")}</span>}
            </p>
            <button type="button" className="btn shrink-0" onClick={() => setTab("review")}>{t("bar.review")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small form pieces ---------- */

function Field({ label, value, onChange, mono, type = "text", list, placeholder, onBlur, className = "" }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} type={type} list={list} className={`input ${mono ? "font-mono" : ""}`} value={value ?? ""} placeholder={placeholder}
        autoComplete="off" autoCapitalize={mono ? "none" : undefined} spellCheck={mono ? false : undefined}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
    </div>
  );
}

function Select({ label, value, onChange, options, className = "" }) {
  const id = useId();
  const has = options.some((o) => o.value === value);
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {!has && <option value={value ?? ""}>{value || "—"}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-start gap-2.5 text-sm cursor-pointer min-h-[32px]">
      <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0 accent-accent" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Lines({ label, value, onChange }) {
  return <TextField multiline label={label} value={(value || []).join("\n")} onChange={(v) => onChange(v.split("\n"))} />;
}

function IconButton({ label, icon, onClick, disabled, text }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="min-w-[36px] h-9 px-2 rounded-field border border-line text-muted grid place-items-center disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      {icon ? <Icon name={icon} size={16} /> : text}
    </button>
  );
}

function IncludeToggle({ section, draft, update }) {
  const { t } = useTranslation("composer");
  return <Check label={t("include")} checked={draft.include[section]} onChange={(v) => update((d) => { d.include[section] = v; })} />;
}

/** Two taps to confirm, for actions that throw work away. */
function ConfirmButton({ label, confirmLabel, onConfirm, className = "btn-ghost" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return undefined; const id = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(id); }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? "text-bad border-bad/60" : ""}`} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : label}
    </button>
  );
}

function MacroCheck({ prot, carb, fat, kcal }) {
  const { t } = useTranslation("composer");
  const calc = C.macroKcal(prot, carb, fat);
  if (!calc) return null;
  const k = C.num(kcal) || 0;
  const diff = calc - k;
  const off = k && Math.abs(diff) > 60;
  return <p className={`text-xs num ${off ? "text-warn" : "text-muted"}`}>{t("macroCheck", { calc, diff: `${diff >= 0 ? "+" : ""}${diff}` })}</p>;
}

function bind(draft, update, path, section) {
  return { value: getPath(draft, path), onChange: (v) => update((d) => setPath(d, path, v), section) };
}

/* ---------- tabs ---------- */

const RECIPES = [
  { id: "macro", include: ["profile"], tab: "profile" },
  { id: "phase", include: ["profile"], tab: "profile" },
  { id: "program", include: ["program"], tab: "program" },
  { id: "diet", include: ["diet"], tab: "diet" },
  { id: "plan", include: ["plan"], tab: "plan" },
];

function Start({ draft, update, base, setTab, source, loadSource, appHasData, reset }) {
  const { t } = useTranslation("composer");
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const programs = Object.keys(base.programs || {}).length;
  const diets = Object.keys(base.diets || {}).length;
  const active = (coll, id) => (id && coll?.[id] ? coll[id].name || id : "—");

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const doc = normalise(JSON.parse(await f.text()));
      loadSource({ name: f.name, data: planOnly(doc) });
      setMsg({ tone: "good", text: t("source.loaded", { programs: Object.keys(doc.programs).length, diets: Object.keys(doc.diets).length }) });
    } catch (err) {
      const key = ["notBackup", "newerVersion", "corrupt"].includes(err?.message) ? err.message : "notBackup";
      setMsg({ tone: "bad", text: t(`settings:backup.errors.${key}`) });
    }
  };

  const pick = (r) => {
    update((d) => {
      r.include.forEach((s) => { d.include[s] = true; });
      d.include.history = true;
      if (!d.history.title) d.history.title = t(`recipes.${r.id}.history`);
      d.history.date = todayIso();
    });
    setTab(r.tab);
  };

  return (
    <>
      <Card title={t("source.title")}>
        {source ? (
          <p className="text-sm">{t("source.file", { name: source.name })}</p>
        ) : appHasData ? (
          <p className="text-sm">{t("source.app")}</p>
        ) : (
          <p className="text-sm">{t("source.empty")}</p>
        )}
        {(source || appHasData) && (
          <p className="text-sm text-muted num">
            {t("source.counts", { programs, diets, program: active(base.programs, base.activeProgram), diet: active(base.diets, base.activeDiet) })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} />{source ? t("source.other") : t("source.load")}
          </button>
          {source && <button type="button" className="btn-ghost" onClick={() => { loadSource(null); setMsg(null); }}>{appHasData ? t("source.useApp") : t("source.remove")}</button>}
        </div>
        <input ref={fileRef} type="file" accept={BACKUP_ACCEPT} className="hidden" onChange={onFile} aria-label={t("source.load")} />
        {msg && <p role="status" className={`text-sm ${msg.tone === "good" ? "text-good" : "text-bad"}`}>{msg.text}</p>}
      </Card>

      <Card title={t("recipes.title")}>
        <p className="text-sm text-muted">{t("recipes.lead")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {RECIPES.map((r) => (
            <button key={r.id} type="button" onClick={() => pick(r)}
              className="text-left rounded-field border border-line bg-bg p-3 flex flex-col gap-1 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <span className="font-display text-lg font-semibold uppercase tracking-wide leading-tight">{t(`recipes.${r.id}.title`)}</span>
              <span className="text-sm text-muted">{t(`recipes.${r.id}.text`)}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title={t("rules.title")}>
        <ul className="list-disc pl-5 text-sm flex flex-col gap-1.5">
          {["logs", "archive", "newId", "exerciseIds"].map((k) => <li key={k}>{t(`rules.${k}`)}</li>)}
        </ul>
        <ConfirmButton label={t("reset")} confirmLabel={t("resetConfirm")} onConfirm={reset} />
      </Card>
    </>
  );
}

function Profile({ draft, update }) {
  const { t } = useTranslation("composer");
  const b = (path) => bind(draft, update, path, "profile");
  const p = draft.profile;
  return (
    <Card title={t("profile.title")} aside={<IncludeToggle section="profile" draft={draft} update={update} />}>
      <p className="text-sm text-muted">{t("profile.lead")}</p>
      <Segmented label={t("fields.phase")} options={C.PHASES.map((v) => ({ value: v, label: t(`common:phase.${v}`) }))} {...b("profile.phase")} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <NumField label={t("fields.kcal")} unit="kcal" decimal={false} {...b("profile.kcal")} />
        <NumField label={t("fields.prot")} unit="g" decimal={false} {...b("profile.prot")} />
        <NumField label={t("fields.carb")} unit="g" decimal={false} {...b("profile.carb")} />
        <NumField label={t("fields.fat")} unit="g" decimal={false} {...b("profile.fat")} />
      </div>
      <MacroCheck prot={p.prot} carb={p.carb} fat={p.fat} kcal={p.kcal} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <NumField label={t("fields.maintenance")} unit="kcal" decimal={false} {...b("profile.maintenance")} />
        <NumField label={t("fields.goalWeight")} unit="kg" {...b("profile.goalWeight")} />
        <NumField label={t("fields.goalBf")} unit="%" {...b("profile.goalBf")} />
      </div>
      <details className="rounded-field border border-line p-3">
        <summary className="text-sm font-semibold cursor-pointer">{t("profile.start")}</summary>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <NumField label={t("fields.heightCm")} unit="cm" decimal={false} {...b("profile.heightCm")} />
          <Field label={t("fields.startDate")} type="date" {...b("profile.startDate")} />
          <NumField label={t("fields.startWeight")} unit="kg" {...b("profile.startWeight")} />
          <NumField label={t("fields.startBf")} unit="%" {...b("profile.startBf")} />
        </div>
      </details>
      <details className="rounded-field border border-line p-3">
        <summary className="text-sm font-semibold cursor-pointer">{t("profile.zone2")}</summary>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <NumField label={t("fields.zone2Min")} unit="bpm" decimal={false} {...b("profile.zone2.min")} />
          <NumField label={t("fields.zone2Max")} unit="bpm" decimal={false} {...b("profile.zone2.max")} />
        </div>
      </details>
      <details className="rounded-field border border-line p-3">
        <summary className="text-sm font-semibold cursor-pointer">{t("profile.rules")}</summary>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
          {C.RULE_FIELDS.map((k) => <NumField key={k} label={t(`fields.${k}`)} unit={t("profile.perWeek")} {...b(`profile.rules.${k}`)} />)}
          <Field label={t("fields.step")} {...b("profile.rules.step")} placeholder="100–150" />
        </div>
        <p className="text-xs text-muted pt-2">{t("profile.rulesHint")}</p>
      </details>
    </Card>
  );
}

function modeOptions(t, kind, base) {
  const coll = (kind === "program" ? base.programs : base.diets) || {};
  const activeId = kind === "program" ? base.activeProgram : base.activeDiet;
  const sorted = Object.entries(coll).sort(([a], [b]) => (a === activeId ? -1 : b === activeId ? 1 : 0));
  return [
    { value: "new", label: t(`${kind}.mode.new`) },
    ...sorted.flatMap(([id, x]) => {
      const name = `${x.name || id}${id === activeId ? ` (${t("mode.active")})` : ""}`;
      return [{ value: `edit:${id}`, label: t("mode.edit", { name }) }, { value: `copy:${id}`, label: t("mode.copy", { name }) }];
    }),
  ];
}

function Program({ draft, update, base, dayNames }) {
  const { t } = useTranslation("composer");
  const b = (path) => bind(draft, update, path, "program");
  const P = draft.program;
  const isNew = !draft.programMode.startsWith("edit:");
  const known = useMemo(() => C.knownExercises(base), [base]);
  const prev = base.activeProgram;
  const sessionOptions = [
    ...P.sessions.filter((s) => s.id).map((s) => ({ value: s.id, label: s.name || s.id })),
    ...C.ACTIVITIES.map((a) => ({ value: a, label: t(`common:activity.${a}`) })),
  ];
  const changeMode = (mode) => update((d) => {
    const s = C.startFrom("program", mode, base, todayIso(), dayNames);
    d.programMode = s.mode; d.program = s.value;
  }, "program");

  return (
    <>
      <Card title={t("program.title")} aside={<IncludeToggle section="program" draft={draft} update={update} />}>
        <Select label={t("mode.label")} value={draft.programMode} onChange={changeMode} options={modeOptions(t, "program", base)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("fields.id")} mono {...b("program.id")} placeholder={t("program.idHint")} className="col-span-2 sm:col-span-1" />
          <Field label={t("fields.startDate")} type="date" {...b("program.startDate")} className="col-span-2 sm:col-span-1" />
          <Field label={t("fields.name")} {...b("program.name")} className="col-span-2" />
          <Field label={t("fields.author")} {...b("program.author")} />
          <Field label={t("fields.goal")} {...b("program.goal")} />
        </div>
        <Check label={t("program.active")} {...bindCheck(draft, update, "programActive")} />
        {isNew && prev && prev !== P.id && base.programs?.[prev] && !base.programs[prev].endDate && (
          <Check label={t("program.closePrev", { name: base.programs[prev].name || prev })} {...bindCheck(draft, update, "closePrevProgram")} />
        )}
      </Card>

      <Card title={t("program.week")}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {C.WEEK_KEYS.map((k, i) => <Select key={k} label={dayNames[i]} options={sessionOptions} {...b(`program.week.${k}`)} />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("program.runNote")} {...b("program.activityNotes.run")} />
          <Field label={t("program.yogaNote")} {...b("program.activityNotes.yoga")} />
        </div>
      </Card>

      <datalist id="known-exercises">
        {Object.entries(known).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </datalist>

      {P.sessions.map((s, si) => (
        <Session key={si} s={s} si={si} count={P.sessions.length} known={known} update={update} draft={draft} />
      ))}
      <button type="button" className="btn-ghost" onClick={() => update((d) => { d.program.sessions.push(C.blankSession()); }, "program")}>
        {t("program.addSession")}
      </button>

      <Card title={t("program.volume")}>
        <p className="text-xs text-muted">{t("program.volumeHint")}</p>
        {(P.volume || []).map((v, vi) => (
          <div key={vi} className="grid grid-cols-[1fr_5rem_auto] gap-2 items-end border-t border-line/70 pt-3">
            <Field label={t("program.muscle")} {...b(`program.volume.${vi}.name`)} />
            <NumField label={t("fields.sets")} decimal={false} {...b(`program.volume.${vi}.sets`)} />
            <IconButton label={t("remove")} icon="close" onClick={() => update((d) => { d.program.volume.splice(vi, 1); }, "program")} />
            <Field label={t("program.detail")} {...b(`program.volume.${vi}.detail`)} className="col-span-3" />
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={() => update((d) => { (d.program.volume ||= []).push(C.blankVolume()); }, "program")}>{t("program.addVolume")}</button>
      </Card>

      <Card>
        <Lines label={t("fields.notes")} value={P.notes} onChange={(v) => update((d) => { d.program.notes = v; }, "program")} />
      </Card>
    </>
  );
}

function bindCheck(draft, update, key) {
  return { checked: draft[key], onChange: (v) => update((d) => { d[key] = v; }) };
}

function Session({ s, si, count, known, update, draft }) {
  const { t } = useTranslation("composer");
  const base = `program.sessions.${si}`;
  const b = (path) => bind(draft, update, `${base}.${path}`, "program");
  const edit = (fn) => update((d) => fn(d.program.sessions[si]), "program");
  return (
    <Card title={`${t("program.session", { n: si + 1 })}${s.name ? ` · ${s.name}` : ""}`}
      aside={count > 1 && <ConfirmButton className="btn-ghost px-3 py-1.5 text-xs" label={t("program.removeSession")} confirmLabel={t("confirmRemove")} onConfirm={() => update((d) => { d.program.sessions.splice(si, 1); }, "program")} />}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("fields.sessionId")} mono {...b("id")} placeholder="upperA" />
        <Field label={t("fields.name")} {...b("name")} />
        <Field label={t("fields.note")} {...b("note")} className="col-span-2" />
      </div>
      {s.exercises.map((e, ei) => {
        const pairedWithPrev = ei > 0 && s.exercises[ei - 1].superset;
        const eb = (path) => b(`exercises.${ei}.${path}`);
        const isKnown = e.id && known[e.id] !== undefined;
        return (
          <div key={ei} className={`rounded-field border border-line bg-bg p-3 flex flex-col gap-3 ${e.superset || pairedWithPrev ? "border-l-4 border-l-accent" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow flex items-center gap-2">
                {t("program.exercise", { n: ei + 1 })}
                {pairedWithPrev && <span className="text-accent normal-case tracking-normal">{t("program.pairedWithPrev")}</span>}
                {e.id && <span className={`normal-case tracking-normal font-mono ${isKnown ? "text-good" : "text-warn"}`}>{isKnown ? t("program.knownId") : t("program.newId")}</span>}
              </span>
              <span className="flex gap-1">
                <IconButton label={t("moveUp")} icon="up" disabled={ei === 0} onClick={() => edit((x) => { [x.exercises[ei - 1], x.exercises[ei]] = [x.exercises[ei], x.exercises[ei - 1]]; })} />
                <IconButton label={t("moveDown")} text="↓" disabled={ei === s.exercises.length - 1} onClick={() => edit((x) => { [x.exercises[ei + 1], x.exercises[ei]] = [x.exercises[ei], x.exercises[ei + 1]]; })} />
                <IconButton label={t("program.removeExercise")} icon="close" onClick={() => edit((x) => { x.exercises.splice(ei, 1); })} />
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("fields.exerciseId")} mono list="known-exercises" {...eb("id")} placeholder="bench"
                onBlur={() => { if (known[e.id] && !e.name) edit((x) => { x.exercises[ei].name = known[e.id]; }); }} />
              <Field label={t("fields.name")} {...eb("name")} />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              <NumField label={t("fields.sets")} decimal={false} {...eb("sets")} />
              <NumField label={t("fields.repsMin")} decimal={false} {...eb("reps.0")} />
              <NumField label={t("fields.repsMax")} decimal={false} {...eb("reps.1")} />
              <NumField label={t("fields.rest")} unit="s" decimal={false} {...eb("rest")} />
              <Field label={t("fields.rir")} {...eb("rir")} placeholder="1–2" />
            </div>
            <Field label={t("fields.note")} {...eb("notes")} />
            <div className="flex flex-wrap gap-x-5">
              <Check label={t("program.superset")} checked={e.superset} onChange={(v) => edit((x) => { x.exercises[ei].superset = v; })} />
              <Check label={t("program.perSide")} checked={e.perSide} onChange={(v) => edit((x) => { x.exercises[ei].perSide = v; })} />
            </div>
          </div>
        );
      })}
      <button type="button" className="btn-ghost" onClick={() => edit((x) => { x.exercises.push(C.blankExercise()); })}>{t("program.addExercise")}</button>
    </Card>
  );
}

function Diet({ draft, update, base, dayNames }) {
  const { t } = useTranslation("composer");
  const b = (path) => bind(draft, update, path, "diet");
  const D = draft.diet;
  const isNew = !draft.dietMode.startsWith("edit:");
  const prev = base.activeDiet;
  const [dayId, setDayId] = useState(() => D.days[0]?.id);
  let di = D.days.findIndex((d) => d.id === dayId);
  if (di < 0) di = 0;
  const day = D.days[di];
  const edit = (fn) => update((d) => fn(d.diet.days[di]), "diet");
  const changeMode = (mode) => update((d) => {
    const s = C.startFrom("diet", mode, base, todayIso(), dayNames);
    d.dietMode = s.mode; d.diet = s.value;
  }, "diet");

  return (
    <>
      <Card title={t("diet.title")} aside={<IncludeToggle section="diet" draft={draft} update={update} />}>
        <Select label={t("mode.label")} value={draft.dietMode} onChange={changeMode} options={modeOptions(t, "diet", base)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("fields.id")} mono {...b("diet.id")} placeholder={t("diet.idHint")} className="col-span-2 sm:col-span-1" />
          <Field label={t("fields.startDate")} type="date" {...b("diet.startDate")} className="col-span-2 sm:col-span-1" />
          <Field label={t("fields.name")} {...b("diet.name")} className="col-span-2" />
          <Field label={t("fields.author")} {...b("diet.author")} />
          <Field label={t("fields.note")} {...b("diet.note")} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NumField label={t("fields.kcal")} unit="kcal" decimal={false} {...b("diet.targets.kcal")} />
          <NumField label={t("fields.prot")} unit="g" decimal={false} {...b("diet.targets.prot")} />
          <NumField label={t("fields.carb")} unit="g" decimal={false} {...b("diet.targets.carb")} />
          <NumField label={t("fields.fat")} unit="g" decimal={false} {...b("diet.targets.fat")} />
        </div>
        <MacroCheck {...D.targets} />
        <Check label={t("diet.active")} {...bindCheck(draft, update, "dietActive")} />
        {isNew && prev && prev !== D.id && base.diets?.[prev] && !base.diets[prev].endDate && (
          <Check label={t("diet.closePrev", { name: base.diets[prev].name || prev })} {...bindCheck(draft, update, "closePrevDiet")} />
        )}
      </Card>

      <Card title={t("diet.days")}>
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none]" role="tablist" aria-label={t("diet.days")}>
          {D.days.map((d, i) => {
            const active = i === di;
            return (
              <button key={d.id} type="button" role="tab" aria-selected={active} onClick={() => setDayId(d.id)}
                className={`chip ${active ? "bg-accent border-accent text-accent-ink" : ""}`}>
                {String(d.name || d.id).split(/[\s·]/)[0]}
              </button>
            );
          })}
        </div>
        {day && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("diet.dayName")} {...b(`diet.days.${di}.name`)} className="col-span-2 sm:col-span-1" />
              <Select label={t("diet.copyFrom")} value="" className="col-span-2 sm:col-span-1"
                options={[{ value: "", label: t("diet.copyPick") }, ...D.days.filter((x) => x.id !== day.id).map((x) => ({ value: x.id, label: x.name || x.id }))]}
                onChange={(id) => { if (!id) return; update((d) => { const src = d.diet.days.find((x) => x.id === id); d.diet.days[di].meals = JSON.parse(JSON.stringify(src.meals)); }, "diet"); }} />
              <Field label={t("diet.dayNote")} {...b(`diet.days.${di}.note`)} className="col-span-2" />
            </div>
            <details className="rounded-field border border-line p-3">
              <summary className="text-sm font-semibold cursor-pointer">{t("diet.dayTargets")}</summary>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                {["kcal", "prot", "carb", "fat"].map((k) => <NumField key={k} label={t(`fields.${k}`)} unit={k === "kcal" ? "kcal" : "g"} decimal={false} {...b(`diet.days.${di}.targets.${k}`)} />)}
              </div>
              <p className="text-xs text-muted pt-2">{t("diet.dayTargetsHint")}</p>
            </details>
            <p className="text-xs text-muted">{t("diet.ticksHint")}</p>
            {day.meals.map((m, mi) => (
              <div key={mi} className="rounded-field border border-line bg-bg p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{m.name || t("diet.meal", { n: mi + 1 })}</span>
                  <ConfirmButton className="btn-ghost px-3 py-1.5 text-xs" label={t("diet.removeMeal")} confirmLabel={t("confirmRemove")} onConfirm={() => edit((x) => { x.meals.splice(mi, 1); })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label={t("diet.mealName")} {...b(`diet.days.${di}.meals.${mi}.name`)} className="col-span-2" />
                  <Field label={t("diet.time")} {...b(`diet.days.${di}.meals.${mi}.time`)} placeholder="7:30" />
                  <Field label={t("fields.note")} {...b(`diet.days.${di}.meals.${mi}.note`)} className="col-span-3" />
                </div>
                <ItemRows path={`diet.days.${di}.meals.${mi}.items`} items={m.items} draft={draft} update={update} />
                {(m.options || []).map((o, oi) => (
                  <div key={oi} className="rounded-field border border-dashed border-line p-3 flex flex-col gap-3">
                    <div className="flex items-end gap-2">
                      <Field label={t("diet.optionName")} {...b(`diet.days.${di}.meals.${mi}.options.${oi}.name`)} className="flex-1" />
                      <IconButton label={t("diet.removeOption")} icon="close" onClick={() => edit((x) => { x.meals[mi].options.splice(oi, 1); })} />
                    </div>
                    <ItemRows path={`diet.days.${di}.meals.${mi}.options.${oi}.items`} items={o.items} draft={draft} update={update} />
                  </div>
                ))}
                <button type="button" className="btn-ghost" onClick={() => edit((x) => { (x.meals[mi].options ||= []).push(C.blankOption(t("diet.optionDefault", { n: (x.meals[mi].options?.length || 0) + 2 }))); })}>{t("diet.addOption")}</button>
                <p className="text-xs text-muted">{t("diet.optionsHint")}</p>
              </div>
            ))}
            <button type="button" className="btn-ghost" onClick={() => edit((x) => { x.meals.push(C.blankMeal()); })}>{t("diet.addMeal")}</button>
          </>
        )}
      </Card>

      <Card title={t("diet.substitutions")}>
        {(D.substitutions || []).map((x, xi) => (
          <div key={xi} className="grid grid-cols-[1fr_auto] gap-2 items-end border-t border-line/70 pt-3 first:border-t-0 first:pt-0">
            <Field label={t("diet.food")} {...b(`diet.substitutions.${xi}.food`)} />
            <IconButton label={t("remove")} icon="close" onClick={() => update((d) => { d.diet.substitutions.splice(xi, 1); }, "diet")} />
            <div className="col-span-2"><Lines label={t("diet.alternatives")} value={x.alt} onChange={(v) => update((d) => { d.diet.substitutions[xi].alt = v; }, "diet")} /></div>
            <Field label={t("fields.note")} {...b(`diet.substitutions.${xi}.note`)} className="col-span-2" />
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={() => update((d) => { (d.diet.substitutions ||= []).push(C.blankSubstitution()); }, "diet")}>{t("diet.addSubstitution")}</button>
      </Card>

      <SectionsEditor title={t("diet.sections")} path="diet.sections" sections={D.sections || []} section="diet" draft={draft} update={update} />

      <Card>
        <Lines label={t("fields.notes")} value={D.notes} onChange={(v) => update((d) => { d.diet.notes = v; }, "diet")} />
      </Card>
    </>
  );
}

/** Food rows of a meal or of a meal option: food, quantity, unit, brand, alternatives. */
function ItemRows({ path, items, draft, update }) {
  const { t } = useTranslation("composer");
  const b = (p) => bind(draft, update, `${path}.${p}`, "diet");
  const edit = (fn) => update((d) => fn(getPath(d, path)), "diet");
  return (
    <>
      {(items || []).map((it, ii) => (
        <div key={ii} className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[3fr_1fr_1fr_2fr_auto] gap-2 items-end border-t border-line/70 pt-3">
          <Field label={t("diet.food")} {...b(`${ii}.food`)} className="col-span-3 sm:col-span-1" />
          <Field label={t("diet.qty")} {...b(`${ii}.qty`)} placeholder="150" />
          <Field label={t("diet.unit")} {...b(`${ii}.unit`)} placeholder="g" />
          <Field label={t("diet.brand")} {...b(`${ii}.note`)} className="col-span-2 sm:col-span-1 order-last sm:order-none" />
          <IconButton label={t("diet.removeFood")} icon="close" onClick={() => edit((x) => { x.splice(ii, 1); })} />
          <details className="col-span-3 sm:col-span-5 order-last">
            <summary className="text-xs text-accent font-semibold cursor-pointer py-1">{t("diet.altCount", { count: (it.alt || []).filter((a) => String(a).trim()).length })}</summary>
            <Lines label={t("diet.alternatives")} value={it.alt} onChange={(v) => edit((x) => { x[ii].alt = v; })} />
          </details>
        </div>
      ))}
      <button type="button" className="btn-ghost" onClick={() => edit((x) => { x.push(C.blankItem()); })}>{t("diet.addFood")}</button>
    </>
  );
}

/** Text sections (plan, or diet notes by topic): paragraphs, bullets, numbered steps, a table, a note. */
function SectionsEditor({ title, path, sections, section, draft, update }) {
  const { t } = useTranslation("composer");
  const b = (p) => bind(draft, update, `${path}.${p}`, section);
  const edit = (fn) => update((d) => { if (!getPath(d, path)) setPath(d, path, []); fn(getPath(d, path)); }, section);
  const move = (i, k) => edit((x) => { [x[i], x[k]] = [x[k], x[i]]; });
  return (
    <Card title={title}>
      {sections.length === 0 && <p className="text-sm text-muted">{t("sections.none")}</p>}
      {sections.map((sec, i) => (
        <details key={i} className="rounded-field border border-line bg-bg">
          <summary className="cursor-pointer px-3 py-2.5 font-semibold text-sm">{sec.title || t("sections.untitled", { n: i + 1 })}</summary>
          <div className="px-3 pb-3 flex flex-col gap-3">
            <div className="flex justify-end gap-1">
              <IconButton label={t("moveUp")} icon="up" disabled={i === 0} onClick={() => move(i, i - 1)} />
              <IconButton label={t("moveDown")} text="↓" disabled={i === sections.length - 1} onClick={() => move(i, i + 1)} />
              <IconButton label={t("sections.remove")} icon="close" onClick={() => edit((x) => { x.splice(i, 1); })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("fields.title")} {...b(`${i}.title`)} className="col-span-2" />
              <Field label={t("fields.id")} mono {...b(`${i}.id`)} placeholder={t("sections.idAuto")} />
            </div>
            <Lines label={t("sections.paragraphs")} value={sec.paragraphs} onChange={(v) => edit((x) => { x[i].paragraphs = v; })} />
            <Lines label={t("sections.bullets")} value={sec.bullets} onChange={(v) => edit((x) => { x[i].bullets = v; })} />
            <Lines label={t("sections.numbered")} value={sec.numbered} onChange={(v) => edit((x) => { x[i].numbered = v; })} />
            <TextField multiline label={t("sections.table")} {...b(`${i}.table`)} placeholder={t("sections.tableHint")} />
            <Field label={t("fields.note")} {...b(`${i}.note`)} />
          </div>
        </details>
      ))}
      <button type="button" className="btn-ghost" onClick={() => edit((x) => { x.push(C.blankSection()); })}>{t("sections.add")}</button>
    </Card>
  );
}

function PlanText({ draft, update }) {
  const { t } = useTranslation("composer");
  const P = draft.plan || { sections: [], yoga: null };
  const b = (p) => bind(draft, update, `plan.${p}`, "plan");
  const yoga = (fn) => update((d) => fn(d.plan.yoga), "plan");
  return (
    <>
      <Card title={t("plan.title")} aside={<IncludeToggle section="plan" draft={draft} update={update} />}>
        <p className="text-sm text-muted">{t("plan.lead")}</p>
      </Card>
      <SectionsEditor title={t("plan.sections")} path="plan.sections" sections={P.sections || []} section="plan" draft={draft} update={update} />
      <Card title={t("plan.yoga")}>
        {!P.yoga ? (
          <button type="button" className="btn-ghost" onClick={() => update((d) => { d.plan ||= { sections: [] }; d.plan.yoga = C.blankYoga(); }, "plan")}>{t("plan.addYoga")}</button>
        ) : (
          <>
            <Field label={t("fields.title")} {...b("yoga.title")} />
            <TextField multiline label={t("plan.yogaIntro")} {...b("yoga.intro")} />
            <p className="text-xs text-muted">{t("plan.poseIdsHint")}</p>
            {P.yoga.blocks.map((blk, bi) => (
              <div key={bi} className="rounded-field border border-line bg-bg p-3 flex flex-col gap-3">
                <div className="flex items-end gap-2">
                  <Field label={t("plan.block")} {...b(`yoga.blocks.${bi}.name`)} className="flex-1" />
                  <IconButton label={t("plan.removeBlock")} icon="close" onClick={() => yoga((y) => { y.blocks.splice(bi, 1); })} />
                </div>
                {blk.poses.map((q, qi) => (
                  <div key={qi} className="grid grid-cols-[1fr_5rem_auto] sm:grid-cols-[2fr_1fr_5rem_auto] gap-2 items-end border-t border-line/70 pt-3">
                    <Field label={t("plan.pose")} {...b(`yoga.blocks.${bi}.poses.${qi}.name`)} className="col-span-3 sm:col-span-1" />
                    <Field label={t("plan.poseId")} mono {...b(`yoga.blocks.${bi}.poses.${qi}.id`)} />
                    <Field label={t("plan.hold")} {...b(`yoga.blocks.${bi}.poses.${qi}.hold`)} placeholder="1'" />
                    <IconButton label={t("plan.removePose")} icon="close" onClick={() => yoga((y) => { y.blocks[bi].poses.splice(qi, 1); })} />
                  </div>
                ))}
                <button type="button" className="btn-ghost" onClick={() => yoga((y) => { y.blocks[bi].poses.push(C.blankPose()); })}>{t("plan.addPose")}</button>
              </div>
            ))}
            <button type="button" className="btn-ghost" onClick={() => yoga((y) => { y.blocks.push(C.blankYogaBlock()); })}>{t("plan.addBlock")}</button>
            <TextField multiline label={t("plan.yogaWhy")} {...b("yoga.why")} />
            <ConfirmButton label={t("plan.removeYoga")} confirmLabel={t("confirmRemove")} onConfirm={() => update((d) => { d.plan.yoga = null; }, "plan")} />
          </>
        )}
      </Card>
    </>
  );
}

function History({ draft, update }) {
  const { t } = useTranslation("composer");
  const b = (path) => bind(draft, update, path, "history");
  return (
    <Card title={t("history.title")} aside={<IncludeToggle section="history" draft={draft} update={update} />}>
      <p className="text-sm text-muted">{t("history.lead")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("fields.date")} type="date" {...b("history.date")} />
        <Field label={t("fields.title")} {...b("history.title")} placeholder={t("history.titleHint")} />
      </div>
      <TextField multiline label={t("history.text")} {...b("history.text")} placeholder={t("history.textHint")} />
    </Card>
  );
}

function issueText(t, issue, dayNames) {
  const params = { ...issue.params };
  if (params.field) params.field = t(`fields.${params.field}`);
  if (params.day !== undefined) params.day = dayNames[C.WEEK_KEYS.indexOf(String(params.day))] || params.day;
  const at = issue.at;
  const where = [];
  if (at?.session !== undefined) where.push(`${t("program.session", { n: at.session + 1 })}${at.sessionName ? ` (${at.sessionName})` : ""}`);
  if (at?.exercise !== undefined) where.push(at.exerciseName || t("program.exercise", { n: at.exercise + 1 }));
  if (at?.day !== undefined) where.push(at.dayName);
  if (at?.meal !== undefined) where.push(at.mealName || t("diet.meal", { n: at.meal + 1 }));
  return `${where.length ? `${where.join(" · ")}: ` : ""}${t(`issues.${issue.key}`, params)}`;
}

function Review({ result, setTab, dayNames, canApply, fromFile, apply, applied, restart }) {
  const { t } = useTranslation("composer");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState(null);
  const preRef = useRef(null);
  const json = useMemo(() => JSON.stringify(result.file, null, 2), [result]);
  const blocked = result.errors > 0;

  const file = () => shareableFile(json, result.fileName);
  const canShare = !!shareableFile("{}", result.fileName);

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMsg({ tone: "good", text: t("review.downloaded") });
  };
  const share = async () => {
    try { await navigator.share({ files: [file()] }); setMsg({ tone: "good", text: t("review.shared") }); }
    catch (e) { if (e?.name !== "AbortError") setMsg({ tone: "bad", text: `${t("review.shareFailed")} (${e?.name || "Error"})` }); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setMsg({ tone: "good", text: t("review.copied") }); }
    catch {
      const pre = preRef.current;
      if (pre) { pre.closest("details").open = true; const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      setMsg({ tone: "bad", text: t("review.copyFailed") });
    }
  };

  if (applied) {
    return (
      <Card title={t("review.doneTitle")}>
        <p className="text-sm">{t("review.done", { parts: applied.parts.map((p) => t(`tabs.${p}`)).join(" · ") })}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <a href="./" className="btn">{t("review.openDiary")}</a>
          <button type="button" className="btn-ghost" onClick={restart}>{t("review.again")}</button>
        </div>
      </Card>
    );
  }

  const errors = result.issues.filter((i) => i.level === "error");
  const warns = result.issues.filter((i) => i.level === "warn");

  return (
    <>
      <Card title={t("review.title")}>
        <p className="text-sm">
          {result.parts.length ? t("review.contains", { parts: result.parts.map((p) => t(`tabs.${p}`)).join(" · ") }) : t("review.containsNothing")}
        </p>
        {result.issues.length === 0 && <p className="text-sm text-good font-semibold">{t("review.allGood")}</p>}
        {[["error", errors], ["warn", warns]].map(([level, list]) => list.length > 0 && (
          <div key={level} className="flex flex-col gap-1.5">
            <h3 className={`eyebrow ${level === "error" ? "text-bad" : "text-warn"}`}>{t(level === "error" ? "review.errors" : "review.warnings", { count: list.length })}</h3>
            <ul className="flex flex-col gap-1.5">
              {list.map((issue, i) => (
                <li key={i}>
                  <button type="button" onClick={() => setTab(issue.tab)}
                    className={`w-full text-left text-sm rounded-field px-3 py-2 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${level === "error" ? "border-bad/50 bg-bad/10" : "border-warn/50 bg-warn/10"}`}>
                    {issueText(t, issue, dayNames)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>

      <Card title={t("review.applyTitle")}>
        {canApply ? (
          !confirm ? (
            <>
              <p className="text-sm">{t("review.applyLead")}</p>
              <button type="button" className="btn" disabled={blocked} onClick={() => setConfirm(true)}><Icon name="check" size={18} />{t("review.apply")}</button>
            </>
          ) : (
            <div className="rounded-field border border-warn/60 bg-warn/10 p-3 flex flex-col gap-2 text-sm">
              <strong>{t("review.confirmTitle")}</strong>
              <span>{t("review.confirmText")}</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button type="button" className="btn" onClick={apply}>{t("review.confirm")}</button>
                <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>{t("common:cancel")}</button>
              </div>
            </div>
          )
        ) : (
          <p className="text-sm text-muted">{fromFile ? t("review.noApplyFile") : t("review.noApplyEmpty")}</p>
        )}
        {blocked && <p className="text-sm text-bad">{t("review.fixFirst")}</p>}
      </Card>

      <Card title={t("review.fileTitle")}>
        <p className="text-sm text-muted">{t("review.fileLead")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {canShare && <button type="button" className="btn-ghost" disabled={blocked} onClick={share}><Icon name="share" size={18} />{t("review.share")}</button>}
          <button type="button" className="btn-ghost" disabled={blocked} onClick={download}><Icon name="download" size={18} />{t("review.download")}</button>
          <button type="button" className="btn-ghost" disabled={blocked} onClick={copy}>{t("review.copy")}</button>
        </div>
        {msg && <p role="status" className={`text-sm ${msg.tone === "good" ? "text-good" : "text-bad"}`}>{msg.text}</p>}
        <details className="rounded-field border border-line">
          <summary className="text-sm font-semibold cursor-pointer px-3 py-2">{t("review.preview")}</summary>
          <pre ref={preRef} tabIndex={0} className="max-h-96 overflow-auto px-3 pb-3 text-xs font-mono whitespace-pre">{json}</pre>
        </details>
      </Card>
    </>
  );
}
