import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, Segmented, Stepper } from "../components/ui.jsx";
import { useStore } from "../lib/store.jsx";
import { DEFAULT_THRESHOLD, MODES, QUEST_TYPES, ROUTINE_TYPES, cleanQuests, questDayEntry, routineDay, routineOf, routineQuestsOn } from "../lib/game.js";
import { activeProgram, addEntry, plannedListOn, removeEntry, sessionsOf, undoEntries } from "../lib/program.js";
import { addDays, fmtDate, iso, mondayOf, parseIso, today, weekDays } from "../lib/dates.js";
import { num } from "../lib/stats.js";

const WEEK_KEYS = ["1", "2", "3", "4", "5", "6", "0"]; // Monday first

/** Small field. Numbers are kept as typed while editing ("2," on the way to "2,5") and saved on blur. */
function Small({ label, value, onChange, unit, type = "text", inputMode, placeholder }) {
  const id = useId();
  const [draft, setDraft] = useState(null);
  const numeric = type === "text";
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id} className="label">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          id={id} className="input font-mono !py-2" type={type} inputMode={inputMode} placeholder={placeholder}
          value={numeric && draft !== null ? draft : String(value ?? "").replace(".", numeric && inputMode === "decimal" ? "," : ".")}
          onChange={(e) => (numeric ? setDraft(e.target.value) : onChange(e.target.value))}
          onBlur={() => { if (numeric && draft !== null) { onChange(draft); setDraft(null); } }}
        />
        {unit && <span className="text-xs text-muted font-mono">{unit}</span>}
      </div>
    </div>
  );
}

/** Settings of one quest in a routine day: target, partial rule, threshold, deadline, bonus. */
function QuestSettings({ q, onChange }) {
  const { t } = useTranslation("game");
  const meta = QUEST_TYPES[q.type];
  const set = (values) => onChange({ ...q, ...values });
  return (
    <div className="flex flex-col gap-3 rounded-field bg-bg border border-line p-3">
      <div className="grid grid-cols-2 gap-3">
        {meta.target !== undefined && (
          <Small label={t("routine.target")} unit={meta.unit === "steps" ? t("unit.steps") : t(`unit.${meta.unit}`)} inputMode={q.type === "steps" ? "numeric" : "decimal"} value={q.target} onChange={(v) => { const n = num(v); if (n > 0) set({ target: n }); }} />
        )}
        <Small label={t("routine.deadline")} type="time" value={q.deadline || ""} onChange={(v) => set({ deadline: v || undefined })} />
      </div>
      <Segmented label={t("routine.mode")} clearable={false} value={q.mode} onChange={(v) => set({ mode: v, threshold: v === "threshold" ? q.threshold ?? DEFAULT_THRESHOLD : undefined })} options={MODES.map((m) => ({ value: m, label: t(`modes.${m}`) }))} />
      {q.mode === "threshold" && (
        <Small label={t("routine.threshold")} unit="%" inputMode="numeric" value={Math.round((q.threshold ?? DEFAULT_THRESHOLD) * 100)} onChange={(v) => { const n = num(v); set({ threshold: n ? n / 100 : DEFAULT_THRESHOLD }); }} />
      )}
      <label className="flex items-center gap-3 text-sm min-h-[40px]">
        <input type="checkbox" className="w-5 h-5 accent-[rgb(var(--accent))]" checked={!!q.bonus} onChange={(e) => set({ bonus: e.target.checked || undefined })} />
        {t("routine.bonus")}
      </label>
    </div>
  );
}

/** One day of the routine: its workout(s) and the quests switched on. */
function DayEditor({ title, changed, workouts, multi, sessions, onWorkout, quests, onQuests, onCopyAll, onRestore, initiallyOpen = false }) {
  const { t } = useTranslation("game");
  const [openType, setOpenType] = useState(null);
  const [open, setOpen] = useState(initiallyOpen);
  const names = workouts.map((id) => sessions.find((s) => s.id === id)?.name || id);
  const has = new Map(quests.map((q) => [q.type, q]));
  const toggle = (type) => {
    if (has.has(type)) { onQuests(quests.filter((q) => q.type !== type)); if (openType === type) setOpenType(null); }
    else {
      const meta = QUEST_TYPES[type];
      const order = (x) => ROUTINE_TYPES.indexOf(x.type);
      onQuests([...quests, { type, mode: meta.mode, ...(meta.target !== undefined ? { target: meta.target } : {}) }].sort((a, b) => order(a) - order(b)));
    }
  };
  const change = (next) => onQuests(quests.map((q) => (q.type === next.type ? next : q)));
  const summary = (
    <span className="flex flex-col min-w-0">
      <span className="flex items-center gap-2 font-display uppercase tracking-wide text-lg leading-tight">{title}{changed && <span className="font-body text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-accent-soft text-accent normal-case tracking-normal">{t("routine.changed")}</span>}</span>
      <span className="text-xs text-muted truncate">{[names.length ? names.join(" + ") : t("routine.rest"), t("routine.questCount", { count: quests.length })].join(" · ")}</span>
    </span>
  );
  if (!open) {
    return (
      <button type="button" aria-expanded={false} onClick={() => setOpen(true)} className="card !flex-row items-center justify-between !py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {summary}
        <Icon name="chevronRight" className="text-muted shrink-0 rotate-90" />
      </button>
    );
  }
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-expanded={true} onClick={() => setOpen(false)} className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
          {summary}
          <Icon name="chevronRight" className="text-muted shrink-0 -rotate-90" />
        </button>
      </div>
      {onRestore && changed && <button type="button" className="text-xs font-semibold text-accent self-start py-1 -mt-2" onClick={onRestore}>{t("routine.restoreDay")}</button>}
      <div className="flex flex-col gap-1.5">
        <span className="label">{t("routine.workout")}</span>
        {sessions.length ? (
          <div className="flex flex-wrap gap-1.5">
            {!multi && <button type="button" className="chip" aria-pressed={!workouts.length} onClick={() => onWorkout(null)}>{t("routine.rest")}</button>}
            {sessions.map((s) => (
              <button key={s.id} type="button" className="chip" aria-pressed={workouts.includes(s.id)} onClick={() => onWorkout(s.id)}>
                <Icon name="dumbbell" size={14} />{s.name}
              </button>
            ))}
          </div>
        ) : <p className="text-xs text-muted">{t("routine.noProgram")}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="label">{t("routine.quests")}</span>
        <ul className="flex flex-col gap-1.5">
          {ROUTINE_TYPES.map((type) => {
            const q = has.get(type);
            const meta = QUEST_TYPES[type];
            return (
              <li key={type} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <button type="button" role="switch" aria-checked={!!q} onClick={() => toggle(type)}
                    className={`flex-1 min-w-0 flex items-center gap-3 rounded-field border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${q ? "border-accent/50 bg-accent-soft" : "border-line/70 text-muted"}`}>
                    <span className={`w-5 h-5 rounded-md border-2 grid place-items-center shrink-0 ${q ? "bg-accent border-accent text-accent-ink" : "border-line"}`}>{q && <Icon name="check" size={12} />}</span>
                    <Icon name={meta.icon} size={16} className="shrink-0" />
                    <span className={`flex-1 min-w-0 truncate ${q ? "text-ink font-semibold" : ""}`}>{t(`quest.${type}`)}</span>
                    {q && (
                      <span className="text-[0.7rem] text-muted num shrink-0">
                        {[q.target !== undefined ? `${q.target}${meta.unit === "steps" ? "" : ` ${t(`unit.${meta.unit}`)}`}` : null, q.deadline ? `≤ ${q.deadline}` : null, q.bonus ? t("board.bonus") : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    <span className="text-[0.7rem] text-muted num shrink-0">{t("routine.xp", { xp: meta.xp })}</span>
                  </button>
                  {q && (
                    <button type="button" aria-expanded={openType === type} aria-label={t("routine.settings", { quest: t(`quest.${type}`) })} onClick={() => setOpenType(openType === type ? null : type)}
                      className={`w-10 h-10 shrink-0 rounded-full border grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${openType === type ? "bg-ink text-surface border-ink" : "border-line text-muted"}`}>
                      <Icon name="gear" size={16} />
                    </button>
                  )}
                </div>
                {q && openType === type && <QuestSettings q={q} onChange={change} />}
              </li>
            );
          })}
        </ul>
      </div>
      {onCopyAll && <button type="button" className="text-sm font-semibold text-accent self-start py-1" onClick={onCopyAll}>{t("routine.copyAll")}</button>}
    </section>
  );
}

/**
 * The weekly routine: the default scheme (every week; workouts are the active
 * program's week) or one week's days, changed on their own (moves + questDays).
 */
export default function Routine({ onClose }) {
  const { t, i18n } = useTranslation("game");
  const { data, update, setEntries } = useStore();
  const [mode, setMode] = useState("default");
  const [monday, setMonday] = useState(() => iso(mondayOf(new Date())));
  const [note, setNote] = useState(null);
  const lang = i18n.language;
  const program = activeProgram(data);
  const sessions = sessionsOf(program);
  const dayName = (k) => new Intl.DateTimeFormat(lang, { weekday: "long" }).format(new Date(2026, 10, 1 + Number(k))); // 1 Nov 2026 = Sunday

  const setRoutineDay = (k, quests) => update((d) => ({ ...d, game: { ...d.game, routine: { ...routineOf(d), [k]: cleanQuests(quests) } } }));
  const setWeekday = (k, session) => update((d) => {
    const p = d.programs[d.activeProgram];
    if (!p) return d;
    return { ...d, programs: { ...d.programs, [p.id]: { ...p, week: { ...(p.week || {}), [k]: session || "rest" } } } };
  });
  const copyAll = (k) => {
    const quests = routineDay(data, k);
    update((d) => ({ ...d, game: { ...d.game, routine: Object.fromEntries(WEEK_KEYS.map((x) => [x, quests])) } }));
    setNote(t("routine.copied"));
  };

  const days = weekDays(parseIso(monday));
  const close = <button type="button" onClick={onClose} aria-label={t("routine.close")} className="w-10 h-10 grid place-items-center rounded-full border border-line text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Icon name="close" size={18} /></button>;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="h-display text-3xl">{t("routine.title")}</h1>
        {close}
      </div>
      <Segmented clearable={false} value={mode} onChange={setMode} options={[{ value: "default", label: t("routine.default") }, { value: "week", label: t("routine.week") }]} />
      <p className="text-sm text-muted -mt-1">{mode === "default" ? t("routine.defaultLead") : t("routine.weekLead")}</p>
      {note && <p role="status" className="text-sm text-good">{note}</p>}

      {mode === "default" && WEEK_KEYS.map((k) => {
        const w = program?.week?.[k];
        return (
          <DayEditor
            key={k}
            title={dayName(k)}
            workouts={w && w !== "rest" ? [w] : []}
            sessions={sessions}
            onWorkout={(id) => setWeekday(k, id === w ? null : id)}
            quests={routineDay(data, k)}
            onQuests={(q) => { setNote(null); setRoutineDay(k, q); }}
            onCopyAll={() => copyAll(k)}
          />
        );
      })}

      {mode === "week" && (
        <>
          <Stepper
            label={`${fmtDate(days[0], lang)} – ${fmtDate(days[6], lang)}`}
            prevLabel={t("routine.prevWeek")}
            nextLabel={t("routine.nextWeek")}
            onPrev={() => setMonday(iso(addDays(parseIso(monday), -7)))}
            onNext={() => setMonday(iso(addDays(parseIso(monday), 7)))}
            extra={days.includes(today()) ? <div className="text-xs text-muted">{t("routine.thisWeek")}</div> : null}
          />
          {days.some((d) => data.moves?.[d] || data.questDays?.[d]) && (
            <button type="button" className="btn-ghost w-full" onClick={() => { setEntries("moves", undoEntries(data, days)); setEntries("questDays", Object.fromEntries(days.map((d) => [d, null]))); }}>
              {t("routine.restoreWeek")}
            </button>
          )}
          {days.map((d) => {
            const list = plannedListOn(data, d).filter((a) => a !== "rest");
            return (
              <DayEditor
                key={d}
                initiallyOpen={d === today()}
                title={fmtDate(d, lang, { weekday: "long", day: "numeric", month: "short" })}
                changed={!!(data.moves?.[d] || data.questDays?.[d])}
                multi
                workouts={list}
                sessions={sessions}
                onWorkout={(id) => setEntries("moves", list.includes(id) ? removeEntry(data, d, id) : addEntry(data, d, id))}
                quests={routineQuestsOn(data, d)}
                onQuests={(q) => setEntries("questDays", { [d]: questDayEntry(data, d, q) })}
                onRestore={() => { setEntries("moves", undoEntries(data, d)); setEntries("questDays", { [d]: null }); }}
              />
            );
          })}
        </>
      )}
      <button type="button" className="btn w-full" onClick={onClose}>{t("routine.close")}</button>
    </>
  );
}
