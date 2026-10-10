import { useTranslation } from "react-i18next";
import { Card, Grid, Icon, Meter, NumField, Ring, Segmented, Stepper, TextField } from "../components/ui.jsx";
import { activityLabel, findSession, plannedFor, sessionMinutes } from "../lib/program.js";
import { hasPlan } from "../lib/storage.js";
import { addDays, fmtDate, iso, mondayOf, parseIso, today, weekDays } from "../lib/dates.js";
import { num, rangeAvg, workoutDone } from "../lib/stats.js";
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

function isDone(data, d, planned) {
  if (planned === "run") return !!num(data.runs[d]?.km);
  if (planned === "yoga") return !!data.yoga[d]?.done;
  return workoutDone(data.workouts[d]);
}

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
        const planned = plannedFor(data, dt.getDay());
        const tag = activityTag(data, planned);
        const done = planned && planned !== "rest" && isDone(data, d, planned);
        const sel = d === date;
        return (
          <button
            key={d}
            type="button"
            onClick={() => setDate(d)}
            aria-pressed={sel}
            aria-label={`${fmtDate(d, i18n.language, { weekday: "long", day: "numeric" })} · ${activityLabel(data, planned, t)}${done ? ` · ${t("done")}` : ""}`}
            className={`relative flex flex-col items-center gap-1 rounded-field py-2 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
              ${sel ? "bg-ink border-ink text-surface" : d === now ? "bg-accent-soft border-accent/40 text-ink" : "bg-surface border-line/70 text-ink"}`}
          >
            <span className={`text-[0.65rem] font-semibold uppercase ${sel ? "opacity-70" : "text-muted"}`}>{short.format(dt)}</span>
            <span className="font-display text-lg font-semibold leading-none num">{dt.getDate()}</span>
            <span className={`h-5 grid place-items-center text-[0.62rem] font-bold tracking-wide ${sel ? "" : "text-muted"}`}>
              {tag.text ? tag.text : <Icon name={tag.icon} size={14} />}
            </span>
            {done && <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${sel ? "bg-surface" : "bg-good"}`} />}
          </button>
        );
      })}
    </div>
  );
}

/** The day's diet from the active diet, by weekday. */
function TodayMenu({ date, goTo }) {
  const { t, i18n } = useTranslation("today");
  const { data } = useStore();
  const diet = data.diets[data.activeDiet];
  if (!diet) return null;
  const wd = String(parseIso(date).getDay());
  const day = diet.days.find((d) => d.id === diet.week?.[wd]) || (diet.days.length === 1 ? diet.days[0] : null);
  if (!day) return null;
  const n = (v) => (typeof v === "number" ? v.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) : v);
  const qty = (it) => [it.qty !== undefined && it.qty !== null ? n(it.qty) : null, it.unit].filter(Boolean).join(" ");
  const openDiet = () => { try { sessionStorage.setItem("diario-fitness:planTab", "diet"); } catch { /* ignore */ } goTo("plan"); };
  return (
    <Card title={t("menuToday")} aside={<button type="button" onClick={openDiet} className="text-xs font-semibold text-accent py-1">{t("menuAll")}</button>}>
      <div className="h-display text-xl -mt-1">{day.name}</div>
      <ul className="flex flex-col">
        {day.meals.map((m, i) => {
          const items = [...(m.items || []), ...(m.options?.[0]?.items || [])];
          return (
            <li key={i} className="grid grid-cols-[92px_1fr] gap-3 border-t border-line/70 py-2 first:border-t-0">
              <span className="text-xs font-semibold text-muted pt-0.5">{m.name}{m.time && <span className="block font-normal">{m.time}</span>}</span>
              <span className="text-sm leading-snug">
                {items.map((it, k) => (
                  <span key={k} className="block">
                    {it.food} <span className="text-muted num">{qty(it)}</span>
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
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
  const { data, patch } = useStore();
  const day = data.days[date] || {};
  const set = (k) => (v) => patch("days", date, { [k]: v });
  const lang = i18n.language;
  const p = data.profile;

  const planned = plannedFor(data, parseIso(date).getDay());
  const plannedSession = planned && !["run", "yoga", "rest"].includes(planned) ? findSession(data, planned) : null;
  const done = isDone(data, date, planned);
  const hint = plannedSession?.session.note || data.programs[data.activeProgram]?.activityNotes?.[planned] || "";
  const sess = plannedSession?.session;
  const plannedSets = sess ? sess.exercises.reduce((a, e) => a + e.sets, 0) : 0;
  const log = data.workouts[date];
  const doneSets = sess && log?.session === sess.id ? Object.values(log.sets || {}).reduce((a, rows) => a + rows.filter((r) => r.done).length, 0) : 0;

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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-hero-muted">{t("planned")}</div>
              <div className="h-display text-[2.1rem] mt-1.5">{activityLabel(data, planned, t)}</div>
              {(hint || planned === "rest" || !planned) && <div className="text-sm text-hero-muted mt-1">{hint || t("restDay")}</div>}
              {sess && (
                <div className="text-xs text-hero-muted mt-2 num">
                  {t("sessionMeta", { exercises: sess.exercises.length, sets: plannedSets, min: sessionMinutes(sess) })}
                </div>
              )}
            </div>
            {sess ? (
              <Ring value={plannedSets ? doneSets / plannedSets : 0} size={52} className="text-hero-accent">{done && doneSets >= plannedSets ? <Icon name="check" size={18} /> : `${doneSets}/${plannedSets}`}</Ring>
            ) : done ? (
              <span className="inline-flex items-center gap-1 text-hero-accent text-sm font-semibold shrink-0"><Icon name="check" size={18} />{t("done")}</span>
            ) : planned && planned !== "rest" ? (
              <span className="w-12 h-12 rounded-full bg-hero-ink/10 grid place-items-center text-hero-accent shrink-0"><Icon name={planned === "run" ? "run" : planned === "yoga" ? "yoga" : "dumbbell"} size={22} /></span>
            ) : null}
          </div>
          {planned && planned !== "rest" && (
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-field px-4 py-3 font-semibold text-sm bg-hero-accent text-hero active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-ink" onClick={() => openWorkout(date, planned)}>
              {sess ? (doneSets >= plannedSets ? t("openLog") : doneSets > 0 ? t("resume") : t("start")) : done ? t("openLog") : t("start")}
              <Icon name="chevronRight" size={18} />
            </button>
          )}
        </section>
      )}

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
