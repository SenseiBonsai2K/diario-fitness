import { useTranslation } from "react-i18next";
import { Card, Grid, NumField, Segmented, Stepper, TextField, Icon } from "../components/ui.jsx";
import { activityLabel, findSession, plannedFor } from "../lib/program.js";
import { hasPlan } from "../lib/storage.js";
import { addDays, fmtDate, iso, parseIso, today } from "../lib/dates.js";
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

export default function Today({ date, setDate, openWorkout, goTo }) {
  const { t, i18n } = useTranslation("today");
  const { data, patch } = useStore();
  const day = data.days[date] || {};
  const set = (k) => (v) => patch("days", date, { [k]: v });
  const lang = i18n.language;
  const p = data.profile;

  const planned = plannedFor(data, parseIso(date).getDay());
  const plannedSession = planned && !["run", "yoga", "rest"].includes(planned) ? findSession(data, planned) : null;
  const done =
    planned === "run" ? !!num(data.runs[date]?.km)
    : planned === "yoga" ? !!data.yoga[date]?.done
    : workoutDone(data.workouts[date]);
  const hint = plannedSession?.session.note || data.programs[data.activeProgram]?.activityNotes?.[planned] || "";

  const avg7 = rangeAvg(data, iso(addDays(parseIso(date), -6)), date, "peso");
  const fmt1 = (v) => v.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const hasData = Object.keys(data.days).length + Object.keys(data.workouts).length > 0;
  const last = data.meta.lastBackup ? new Date(data.meta.lastBackup) : null;
  const backupDue = hasData && (!last || Date.now() - last.getTime() > 7 * 86400000);

  const macro = (key, target) => {
    const v = num(day[key]);
    if (!target) return undefined;
    return v === null ? t("target", { value: target }) : t("left", { value: Math.round(target - v) });
  };

  return (
    <>
      <DateStepper date={date} setDate={setDate} />

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
        <Card title={t("planned")}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="h-display text-2xl">{activityLabel(data, planned, t)}</div>
              {(hint || planned === "rest") && <div className="text-sm text-muted">{hint || t("restDay")}</div>}
            </div>
            {done ? (
              <span className="inline-flex items-center gap-1 text-good text-sm font-semibold shrink-0"><Icon name="check" size={18} />{t("done")}</span>
            ) : null}
          </div>
          {planned && planned !== "rest" && (
            <button type="button" className="btn w-full" onClick={() => openWorkout(date, planned)}>
              {done ? t("openLog") : t("start")}
            </button>
          )}
        </Card>
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
          <NumField label={t("kcal")} unit="kcal" decimal={false} value={day.kcal} onChange={set("kcal")} placeholder={p.kcal ? String(p.kcal) : ""} hint={macro("kcal", p.kcal)} />
          <NumField label={t("protein")} unit="g" decimal={false} value={day.prot} onChange={set("prot")} placeholder={p.prot ? String(p.prot) : ""} hint={macro("prot", p.prot)} />
          <NumField label={t("carbs")} unit="g" decimal={false} value={day.carb} onChange={set("carb")} placeholder={p.carb ? String(p.carb) : ""} hint={macro("carb", p.carb)} />
          <NumField label={t("fat")} unit="g" decimal={false} value={day.fat} onChange={set("fat")} placeholder={p.fat ? String(p.fat) : ""} hint={macro("fat", p.fat)} />
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

      <Card title={t("recovery")}>
        <Segmented label={t("energy")} value={day.energia} onChange={set("energia")} options={SCALE} />
        <Segmented label={t("hunger")} value={day.fame} onChange={set("fame")} options={SCALE} />
        <TextField label={t("notes")} multiline value={day.note} onChange={set("note")} placeholder={t("notesPlaceholder")} />
      </Card>
    </>
  );
}
