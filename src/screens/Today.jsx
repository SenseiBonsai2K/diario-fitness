import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Grid, Icon, Meter, NumField, Ring, Segmented, Stepper, TextField } from "../components/ui.jsx";
import { activeProgram, activityLabel, addEntry, findSession, moveEntries, plannedListOn, sessionMinutes, sessionsOf, undoEntries } from "../lib/program.js";
import { hasPlan } from "../lib/storage.js";
import { addDays, fmtDate, iso, mondayOf, parseIso, today, weekDays } from "../lib/dates.js";
import { num, rangeAvg, sessionLog } from "../lib/stats.js";
import { useStore } from "../lib/store.jsx";

const SCALE = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));

export function DateStepper({ date, setDate }) {
  const { t, i18n } = useTranslation();
  const isToday = date === today();
  const label = isToday ? t("date.today") : fmtDate(date, i18n.language, { weekday: "short", day: "numeric", month: "short" });
  return (
    <Stepper
      label={label}
      prevLabel={t("date.prev")}
      nextLabel={t("date.next")}
      onPrev={() => setDate(iso(addDays(parseIso(date), -1)))}
      onNext={() => setDate(iso(addDays(parseIso(date), 1)))}
      extra={
        isToday ? (
          <div className="text-xs text-muted">{fmtDate(date, i18n.language, { weekday: "long", day: "numeric", month: "long" })}</div>
        ) : (
          <button type="button" className="text-xs text-accent font-semibold py-1" onClick={() => setDate(today())}>{t("date.backToToday")}</button>
        )
      }
    />
  );
}

/** Short tag for an activity in the week strip: session initials or an icon. */
function activityTag(data, id) {
  if (!id || id === "rest") return { icon: "rest" };
  if (id === "run") return { icon: "run" };
  if (id === "yoga") return { icon: "yoga" };
  const name = findSession(data, id)?.session.name || id;
  const words = name.split(/\s+/).filter(Boolean);
  return { text: words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 2).toUpperCase() : name.slice(0, 2).toUpperCase() };
}

/** Completed sets of one session on one day (any session of the day, first or added). */
function setsDone(data, d, sessionId) {
  const l = sessionLog(data.workouts[d], sessionId);
  return l ? Object.values(l.sets).reduce((a, rows) => a + rows.filter((r) => r.done).length, 0) : 0;
}

function isDone(data, d, planned) {
  if (planned === "run") return !!num(data.runs[d]?.km);
  if (planned === "yoga") return !!data.yoga[d]?.done;
  return setsDone(data, d, planned) > 0;
}

/** "Lower B + Corsa": every activity of a day in one label. */
function listLabel(data, list, t) {
  return list.length ? list.map((a) => activityLabel(data, a, t)).join(" + ") : activityLabel(data, null, t);
}

const realList = (list) => list.filter((a) => a !== "rest");

/** Monday–Sunday of the selected week: what's planned and what's done. */
function WeekStrip({ date, setDate }) {
  const { t, i18n } = useTranslation("today");
  const { data } = useStore();
  const days = weekDays(mondayOf(parseIso(date)));
  const now = today();
  const short = new Intl.DateTimeFormat(i18n.language, { weekday: "narrow" });
  return (
    <div role="group" aria-label={t("week")} className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const dt = parseIso(d);
        const list = plannedListOn(data, d);
        const acts = realList(list);
        const moved = !!data.moves?.[d];
        const tag = activityTag(data, list[0]);
        const done = acts.length > 0 && acts.every((a) => isDone(data, d, a));
        const sel = d === date;
        return (
          <button
            key={d}
            type="button"
            onClick={() => setDate(d)}
            aria-pressed={sel}
            aria-label={`${fmtDate(d, i18n.language, { weekday: "long", day: "numeric" })} · ${listLabel(data, list, t)}${moved ? ` · ${t("moved")}` : ""}${done ? ` · ${t("done")}` : ""}`}
            className={`relative flex flex-col items-center gap-1 rounded-field py-2 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
              ${sel ? "bg-ink border-ink text-surface" : d === now ? "bg-accent-soft border-accent/40 text-ink" : "bg-surface border-line/70 text-ink"}`}
          >
            <span className={`text-[0.65rem] font-semibold uppercase ${sel ? "opacity-70" : "text-muted"}`}>{short.format(dt)}</span>
            <span className="font-display text-lg font-semibold leading-none num">{dt.getDate()}</span>
            <span className={`h-5 grid place-items-center text-[0.62rem] font-bold tracking-wide ${sel ? "" : "text-muted"}`}>
              {tag.text ? tag.text : <Icon name={tag.icon} size={14} />}
                          </span>
            {acts.length > 1 && <span className={`absolute bottom-1 right-1 text-[0.55rem] font-bold leading-none num ${sel ? "" : "text-accent"}`}>+{acts.length - 1}</span>}
            {moved && <span className={`absolute top-1 left-1 w-1.5 h-1.5 rounded-full ring-1 ${sel ? "ring-surface" : "ring-accent"}`} />}
            {done && <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${sel ? "bg-surface" : "bg-good"}`} />}
          </button>
        );
      })}
    </div>
  );
}

/** The day's diet from the active diet, by weekday. */
/**
 * The day's diet from the active diet, by weekday. Every food can be ticked
 * off; ticks live in the day log as days[date].cibi = ["<dayId>|<meal>|<item>", …].
 */
function TodayMenu({ date, goTo }) {
  const { t, i18n } = useTranslation("today");
  const { data, patch } = useStore();
  const diet = data.diets[data.activeDiet];
  if (!diet) return null;
  const wd = String(parseIso(date).getDay());
  const day = diet.days.find((d) => d.id === diet.week?.[wd]) || (diet.days.length === 1 ? diet.days[0] : null);
  if (!day) return null;
  const n = (v) => (typeof v === "number" ? v.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) : v);
  const qty = (it) => [it.qty !== undefined && it.qty !== null ? n(it.qty) : null, it.unit].filter(Boolean).join(" ");
  const openDiet = () => { try { sessionStorage.setItem("diario-fitness:planTab", "diet"); } catch { /* ignore */ } goTo("plan"); };

  const log = data.days[date] || {};
  const ticked = new Set(Array.isArray(log.cibi) ? log.cibi : []);
  const meals = day.meals.map((m, mi) => ({
    m,
    items: [...(m.items || []), ...(m.options?.[0]?.items || [])].map((it, ii) => ({ it, key: `${day.id}|${mi}|${ii}` })),
  }));
  const allKeys = meals.flatMap((x) => x.items.map((i) => i.key));
  const doneCount = allKeys.filter((k) => ticked.has(k)).length;

  const save = (next) => {
    const list = allKeys.filter((k) => next.has(k));
    const values = { cibi: list.length ? list : null };
    // Everything eaten and no verdict yet: mark the diet as followed.
    if (list.length === allKeys.length && !log.dieta) values.dieta = "ok";
    patch("days", date, values);
  };
  const toggle = (key) => { const next = new Set(ticked); next.has(key) ? next.delete(key) : next.add(key); save(next); };
  const toggleMeal = (keys) => {
    const next = new Set(ticked);
    const all = keys.every((k) => next.has(k));
    keys.forEach((k) => (all ? next.delete(k) : next.add(k)));
    save(next);
  };

  return (
    <Card title={t("menuToday")} aside={<button type="button" onClick={openDiet} className="text-xs font-semibold text-accent py-1">{t("menuAll")}</button>}>
      <div className="flex items-end justify-between gap-3 -mt-1">
        <div className="h-display text-xl min-w-0">{day.name}</div>
        <span className={`text-xs font-semibold num shrink-0 ${doneCount === allKeys.length ? "text-good" : "text-muted"}`}>{t("foodsDone", { done: doneCount, total: allKeys.length })}</span>
      </div>
      <Meter value={doneCount} target={allKeys.length || 1} tone={doneCount === allKeys.length ? "good" : undefined} />
      <div className="flex flex-col">
        {meals.map(({ m, items }, mi) => {
          const keys = items.map((i) => i.key);
          const mealDone = keys.length > 0 && keys.every((k) => ticked.has(k));
          return (
            <div key={mi} className="border-t border-line/70 pt-2 pb-1 first:border-t-0">
              <button
                type="button"
                onClick={() => toggleMeal(keys)}
                aria-pressed={mealDone}
                className="w-full flex items-center justify-between gap-3 py-1 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className={`text-xs font-bold uppercase tracking-wider ${mealDone ? "text-good" : "text-muted"}`}>
                  {m.name}{m.time && <span className="font-normal normal-case tracking-normal"> · {m.time}</span>}
                </span>
                <span className="text-[0.7rem] font-semibold text-accent">{mealDone ? t("mealUndo") : t("mealAll")}</span>
              </button>
              <ul className="flex flex-col">
                {items.map(({ it, key }) => {
                  const on = ticked.has(key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(key)}
                        className="w-full flex items-center gap-3 py-2 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <span className={`w-6 h-6 shrink-0 rounded-md border-2 grid place-items-center transition-colors ${on ? "bg-good border-good text-surface" : "border-line"}`}>
                          {on && <Icon name="check" size={14} />}
                        </span>
                        <span className={`flex-1 min-w-0 text-sm leading-snug ${on ? "text-muted line-through" : ""}`}>
                          {it.food}
                          {it.note && <span className="block text-xs text-muted no-underline">{it.note}</span>}
                        </span>
                        <span className={`shrink-0 text-sm font-semibold num ${on ? "text-muted" : ""}`}>{qty(it)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Move the day's activity to another day (Lower B from Friday to Saturday):
 * swap the two days or leave this one as rest. Only the dates change, never
 * the weekly scheme of the program; "Restore" puts both days back.
 */
function MoveDay({ date, list, onClose }) {
  const { t, i18n } = useTranslation("today");
  const { data, setEntries } = useStore();
  const [target, setTarget] = useState(null);
  const lang = i18n.language;
  const day = (d) => fmtDate(d, lang, { weekday: "short", day: "numeric" });
  // Three days back, a week ahead: enough to shift a session within the week or into the next.
  const options = Array.from({ length: 11 }, (_, i) => iso(addDays(parseIso(date), i - 3))).filter((d) => d !== date);
  const there = target ? realList(plannedListOn(data, target)) : [];
  const free = there.length === 0;
  const thereLabel = listLabel(data, there, t);
  const apply = (mode) => { setEntries("moves", moveEntries(data, date, target, mode)); onClose(target); };
  return (
    <Card title={t("move.title", { activity: listLabel(data, list, t) })} aside={<button type="button" onClick={() => onClose(null)} aria-label={t("move.cancel")} className="w-9 h-9 -mr-1 grid place-items-center rounded-full text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Icon name="close" size={18} /></button>}>
      <p className="text-sm text-muted -mt-1">{t("move.lead")}</p>
      <div role="radiogroup" aria-label={t("move.to")} className="scroller">
        {options.map((d) => {
          const busy = !!data.moves?.[d];
          return (
            <button key={d} type="button" role="radio" aria-checked={target === d} disabled={busy} onClick={() => setTarget(d)} className="chip flex-col !items-start !gap-0 py-1.5 disabled:opacity-40">
              <span className="num">{day(d)}</span>
              <span className="text-[0.7rem] font-normal opacity-80">{busy ? t("moved") : listLabel(data, plannedListOn(data, d), t)}</span>
            </button>
          );
        })}
      </div>
      {target && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            {free
              ? t("move.free", { day: fmtDate(target, lang, { weekday: "long", day: "numeric" }) })
              : t("move.busy", { day: fmtDate(target, lang, { weekday: "long", day: "numeric" }), activity: thereLabel })}
          </p>
          {free ? (
            <button type="button" className="btn w-full" onClick={() => apply("replace")}>{t("move.here", { day: day(target) })}</button>
          ) : (
            <>
              <button type="button" className="btn w-full" onClick={() => apply("swap")}>{t("move.swap", { activity: thereLabel, day: day(date) })}</button>
              <button type="button" className="btn-ghost w-full" onClick={() => apply("both")}>{t("move.both", { day: day(target) })}</button>
              <button type="button" className="btn-ghost w-full" onClick={() => apply("replace")}>{t("move.replace", { activity: thereLabel })}</button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/** Add one more activity to a day: a second lifting session, a run on a lifting day, yoga. */
function AddSession({ date, list, onClose }) {
  const { t } = useTranslation("today");
  const { data, setEntries } = useStore();
  const choices = [...sessionsOf(activeProgram(data)).map((x) => x.id), "run", "yoga"].filter((a) => !list.includes(a));
  return (
    <Card title={t("add.title")} aside={<button type="button" onClick={onClose} aria-label={t("move.cancel")} className="w-9 h-9 -mr-1 grid place-items-center rounded-full text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Icon name="close" size={18} /></button>}>
      <p className="text-sm text-muted -mt-1">{t("add.lead")}</p>
      <div className="flex flex-wrap gap-2">
        {choices.map((a) => (
          <button key={a} type="button" className="chip" onClick={() => { setEntries("moves", addEntry(data, date, a)); onClose(); }}>
            <Icon name={a === "run" ? "run" : a === "yoga" ? "yoga" : "dumbbell"} size={16} />
            {activityLabel(data, a, t)}
          </button>
        ))}
      </div>
    </Card>
  );
}

/** One planned activity inside the day card: name, progress and its own start button. */
function PlannedItem({ data, date, planned, compact, openWorkout, t }) {
  const found = planned && !["run", "yoga", "rest"].includes(planned) ? findSession(data, planned) : null;
  const sess = found?.session;
  const done = isDone(data, date, planned);
  const hint = sess?.note || data.programs[data.activeProgram]?.activityNotes?.[planned] || "";
  const plannedSets = sess ? sess.exercises.reduce((a, e) => a + e.sets, 0) : 0;
  const doneSets = sess ? setsDone(data, date, sess.id) : 0;
  const active = planned && planned !== "rest";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`h-display ${compact ? "text-[1.6rem]" : "text-[2.1rem] mt-1.5"}`}>{activityLabel(data, planned, t)}</div>
          {(hint || !active) && !compact && <div className="text-sm text-hero-muted mt-1">{hint || t("restDay")}</div>}
          {sess && (
            <div className="text-xs text-hero-muted mt-2 num">
              {t("sessionMeta", { exercises: sess.exercises.length, sets: plannedSets, min: sessionMinutes(sess) })}
            </div>
          )}
        </div>
        {sess ? (
          <Ring value={plannedSets ? doneSets / plannedSets : 0} size={compact ? 44 : 52} className="text-hero-accent">{doneSets >= plannedSets && plannedSets > 0 ? <Icon name="check" size={18} /> : `${doneSets}/${plannedSets}`}</Ring>
        ) : done ? (
          <span className="inline-flex items-center gap-1 text-hero-accent text-sm font-semibold shrink-0"><Icon name="check" size={18} />{t("done")}</span>
        ) : active ? (
          <span className={`${compact ? "w-11 h-11" : "w-12 h-12"} rounded-full bg-hero-ink/10 grid place-items-center text-hero-accent shrink-0`}><Icon name={planned === "run" ? "run" : planned === "yoga" ? "yoga" : "dumbbell"} size={22} /></span>
        ) : null}
      </div>
      {active && (
        <button type="button" className="inline-flex items-center justify-center gap-2 rounded-field px-4 py-3 font-semibold text-sm bg-hero-accent text-hero active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-ink" onClick={() => openWorkout(date, planned)}>
          {sess ? (doneSets >= plannedSets ? t("openLog") : doneSets > 0 ? t("resume") : t("start")) : done ? t("openLog") : t("start")}
          {compact && <span className="font-normal opacity-80">· {activityLabel(data, planned, t)}</span>}
          <Icon name="chevronRight" size={18} />
        </button>
      )}
    </div>
  );
}

function MacroRow({ label, unit, value, onChange, target, t }) {
  const v = num(value);
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <NumField label={label} unit={unit} decimal={false} value={value} onChange={onChange} placeholder={target ? String(target) : ""} />
      {target ? (
        <>
          <Meter value={v || 0} target={target} />
          <span className="text-[0.7rem] text-muted num">{v === null ? t("target", { value: target }) : v > target ? t("over", { value: Math.round(v - target) }) : t("left", { value: Math.round(target - v) })}</span>
        </>
      ) : null}
    </div>
  );
}

export default function Today({ date, setDate, openWorkout, goTo }) {
  const { t, i18n } = useTranslation("today");
  const { data, patch, setEntries } = useStore();
  const day = data.days[date] || {};
  const set = (k) => (v) => patch("days", date, { [k]: v });
  const lang = i18n.language;
  const p = data.profile;

  // Panels belong to the day they were opened on: changing day closes them.
  const [panel, setPanel] = useState(null);
  const open = panel?.date === date ? panel.kind : null;
  const move = data.moves?.[date];
  const list = plannedListOn(data, date);
  const acts = realList(list);

  const avg7 = rangeAvg(data, iso(addDays(parseIso(date), -6)), date, "peso");
  const fmt1 = (v) => v.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const hasData = Object.keys(data.days).length + Object.keys(data.workouts).length > 0;
  const last = data.meta.lastBackup ? new Date(data.meta.lastBackup) : null;
  const backupDue = hasData && (!last || Date.now() - last.getTime() > 7 * 86400000);

  return (
    <>
      <DateStepper date={date} setDate={setDate} />
      {hasPlan(data) && <WeekStrip date={date} setDate={setDate} />}

      {backupDue && (
        <button type="button" onClick={() => goTo("settings")} className="text-left rounded-card border border-warn/60 bg-warn/10 px-4 py-3 text-sm text-ink flex items-center gap-3">
          <Icon name="download" className="text-warn shrink-0" />
          <span>{last ? t("backupDue", { date: fmtDate(data.meta.lastBackup.slice(0, 10), lang) }) : t("backupNever")}</span>
        </button>
      )}

      {!hasPlan(data) ? (
        <Card title={t("planned")}>
          <p className="text-sm">{t("emptyPlan")}</p>
          <button type="button" className="btn w-full" onClick={() => goTo("settings")}>{t("emptyPlanAction")}</button>
        </Card>
      ) : (
        <section aria-label={t("planned")} className="rounded-card bg-hero text-hero-ink p-5 flex flex-col gap-4 shadow-float">
          <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-hero-muted -mb-3">
            {t("planned")}{acts.length > 1 && <span className="num"> · {t("add.count", { count: acts.length })}</span>}
          </div>
          {(acts.length ? acts : [list[0] ?? null]).map((a, i) => (
            <div key={a ?? "none"} className={i > 0 ? "border-t border-hero-ink/15 pt-4" : ""}>
              <PlannedItem data={data} date={date} planned={a} compact={acts.length > 1} openWorkout={openWorkout} t={t} />
            </div>
          ))}
          {move && (
            <div className="flex items-center justify-between gap-3 rounded-field bg-hero-ink/10 px-3 py-2 text-sm">
              <span className="min-w-0">{move.pair ? t("move.movedWith", { day: fmtDate(move.pair, lang, { weekday: "long", day: "numeric" }) }) : t("add.changed")}</span>
              <button type="button" className="shrink-0 font-semibold text-hero-accent py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-ink rounded" onClick={() => setEntries("moves", undoEntries(data, date))}>{t("move.undo")}</button>
            </div>
          )}
          {!open && (
            <div className="-mt-1 flex flex-wrap justify-center gap-x-4">
              {acts.length > 0 && !move && (
                <button type="button" className="text-sm font-semibold text-hero-muted py-1 px-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-ink" onClick={() => setPanel({ date, kind: "move" })}>{t("move.open")}</button>
              )}
              <button type="button" className="text-sm font-semibold text-hero-muted py-1 px-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-ink" onClick={() => setPanel({ date, kind: "add" })}>{t("add.open")}</button>
            </div>
          )}
        </section>
      )}

      {open === "move" && acts.length > 0 && !move && (
        <MoveDay date={date} list={acts} onClose={(to) => { setPanel(null); if (to) setDate(to); }} />
      )}
      {open === "add" && <AddSession date={date} list={acts} onClose={() => setPanel(null)} />}

      <Card title={t("body")}>
        <Grid>
          <NumField
            label={t("weight")}
            unit="kg"
            value={day.peso}
            onChange={set("peso")}
            placeholder="kg"
            hint={avg7 !== null ? t("avg7", { value: fmt1(avg7) }) : t("weighHint")}
          />
          <NumField label={t("sleep")} unit={t("common:unit.hours")} value={day.sonno} onChange={set("sonno")} placeholder="7,5" />
        </Grid>
      </Card>

      <Card title={t("food")} aside={p.kcal ? <span className="text-xs text-muted num">{t("goal", { kcal: p.kcal })}</span> : null}>
        <Grid>
          <MacroRow t={t} label={t("kcal")} unit="kcal" value={day.kcal} onChange={set("kcal")} target={p.kcal} />
          <MacroRow t={t} label={t("protein")} unit="g" value={day.prot} onChange={set("prot")} target={p.prot} />
          <MacroRow t={t} label={t("carbs")} unit="g" value={day.carb} onChange={set("carb")} target={p.carb} />
          <MacroRow t={t} label={t("fat")} unit="g" value={day.fat} onChange={set("fat")} target={p.fat} />
          <NumField label={t("water")} unit="L" value={day.acqua} onChange={set("acqua")} placeholder="" />
          <NumField label={t("steps")} decimal={false} value={day.passi} onChange={set("passi")} placeholder="" />
        </Grid>
        <Segmented
          label={t("diet")}
          value={day.dieta}
          onChange={set("dieta")}
          options={[
            { value: "ok", label: t("dietOk") },
            { value: "partial", label: t("dietPartial") },
            { value: "off", label: t("dietOff") },
          ]}
        />
      </Card>

      <TodayMenu date={date} goTo={goTo} />

      <Card title={t("recovery")}>
        <Segmented label={t("energy")} value={day.energia} onChange={set("energia")} options={SCALE} />
        <Segmented label={t("hunger")} value={day.fame} onChange={set("fame")} options={SCALE} />
        <TextField label={t("notes")} multiline value={day.note} onChange={set("note")} placeholder={t("notesPlaceholder")} />
      </Card>
    </>
  );
}
