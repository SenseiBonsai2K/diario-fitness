import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Grid, NumField, Segmented, Stat, Stepper, TextField } from "../components/ui.jsx";
import { LineChart } from "../components/LineChart.jsx";
import { exerciseNames, weeklyTargets } from "../lib/program.js";
import { addDays, fmtDate, fmtMonth, iso, isoWeek, monthKey, parseIso, today } from "../lib/dates.js";
import { adviceKey, avg, currentMonday, exerciseSeries, fmtDuration, num, runSeries, runTotals, waistSeries, weekStats, weeklyKmSeries, weightSeries } from "../lib/stats.js";
import { useStore } from "../lib/store.jsx";

export default function Progress() {
  const { t } = useTranslation("progress");
  const [view, setView] = useState("week");
  return (
    <>
      <h1 className="h-display text-3xl">{t("title")}</h1>
      <Segmented
        clearable={false}
        value={view}
        onChange={setView}
        options={[
          { value: "week", label: t("week") },
          { value: "month", label: t("month") },
          { value: "charts", label: t("charts") },
        ]}
      />
      {view === "week" && <WeekView />}
      {view === "month" && <MonthView />}
      {view === "charts" && <ChartsView />}
    </>
  );
}

function useFmt() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return {
    lang,
    f1: (v) => (v === null || v === undefined ? "—" : v.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })),
    f0: (v) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString(lang)),
  };
}

function WeekView() {
  const { t } = useTranslation("progress");
  const { data, patch } = useStore();
  const { lang, f1, f0 } = useFmt();
  const [monday, setMonday] = useState(currentMonday);
  const key = isoWeek(parseIso(monday));
  const s = useMemo(() => weekStats(data, monday), [data, monday]);
  const w = data.weeks[key] || {};
  const set = (k) => (v) => patch("weeks", key, { [k]: v, monday });
  const sunday = iso(addDays(parseIso(monday), 6));
  const rules = data.profile.rules;
  const advice = adviceKey(s.delta, data.profile.phase, rules);
  const targets = weeklyTargets(data);
  const fmtR = (v) => (v ?? 0).toLocaleString(lang, { maximumFractionDigits: 2 });
  const adviceVars = rules ? { min: fmtR(advice.startsWith("bulk") ? rules.bulkMin : rules.cutMin), max: fmtR(advice.startsWith("bulk") ? rules.bulkMax : rules.cutMax), step: rules.step } : {};
  const deltaTone = s.delta === null ? undefined : data.profile.phase === "bulk" ? (s.delta > 0 ? "good" : "warn") : s.delta < 0 ? "good" : "warn";

  return (
    <>
      <Stepper
        label={`${fmtDate(monday, lang)} – ${fmtDate(sunday, lang)}`}
        prevLabel={t("prevWeek")}
        nextLabel={t("nextWeek")}
        onPrev={() => setMonday(iso(addDays(parseIso(monday), -7)))}
        onNext={() => setMonday(iso(addDays(parseIso(monday), 7)))}
        extra={<div className="text-xs text-muted">{monday === currentMonday() ? t("thisWeek") : key}</div>}
      />
      <Card title={t("summary")}>
        <Grid>
          <Stat label={t("avgWeight")} value={f1(s.avgWeight)} sub={t("weighIns", { count: s.weighIns })} />
          <Stat label={t("change")} value={s.delta === null ? "—" : `${s.delta > 0 ? "+" : ""}${f1(s.delta)}`} sub={s.prevWeight !== null ? t("prev", { value: f1(s.prevWeight) }) : t("noPrev")} tone={deltaTone} />
          <Stat label={t("avgKcal")} value={f0(s.kcal)} sub={s.prot !== null ? t("avgProt", { value: f0(s.prot) }) : undefined} />
          <Stat label={t("training")} value={`${s.lifts}/${targets.lifts || "—"}`} sub={t("cardio", { runs: s.runs, runsTarget: targets.runs, km: f1(s.km), yoga: s.yoga, yogaTarget: targets.yoga })} />
          <Stat label={t("avgSleep")} value={s.sleep === null ? "—" : `${f1(s.sleep)} h`} />
          <Stat label={t("avgEnergy")} value={s.energy === null ? "—" : `${f1(s.energy)}/5`} />
        </Grid>
        <p className="rounded-field bg-accent-soft border-l-4 border-accent px-3 py-2.5 text-sm">{t(`advice.${advice}`, adviceVars)}</p>
      </Card>
      <WeekRuns monday={monday} sunday={sunday} />
      <Card title={t("weeklyCheck")} aside={<span className="text-xs text-muted">{t("onSunday")}</span>}>
        <Grid>
          <NumField label={t("waist")} unit="cm" value={w.vita} onChange={set("vita")} placeholder="" />
          <NumField label={t("adherence")} unit="%" decimal={false} value={w.aderenza} onChange={set("aderenza")} placeholder="" />
        </Grid>
        <TextField label={t("howItWent")} multiline value={w.note} onChange={set("note")} />
        <TextField label={t("decision")} value={w.decisione} onChange={set("decisione")} placeholder={t("decisionPlaceholder")} />
      </Card>
    </>
  );
}

const MEASURES = ["vita", "fianchi", "petto", "braccio", "coscia", "collo"];

function MonthView() {
  const { t } = useTranslation("progress");
  const { data, patch } = useStore();
  const { lang, f1 } = useFmt();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const m = data.months[month] || {};
  const set = (k) => (v) => patch("months", month, { [k]: v });
  const shift = (n) => {
    const [y, mm] = month.split("-").map(Number);
    setMonth(monthKey(new Date(y, mm - 1 + n, 1)));
  };
  const computed = avg(Object.keys(data.days).filter((k) => k.startsWith(month)).map((k) => num(data.days[k].peso)));
  const prevKey = (() => { const [y, mm] = month.split("-").map(Number); return monthKey(new Date(y, mm - 2, 1)); })();
  const prev = data.months[prevKey] || {};

  return (
    <>
      <Stepper label={fmtMonth(month, lang)} prevLabel={t("prevMonth")} nextLabel={t("nextMonth")} onPrev={() => shift(-1)} onNext={() => shift(1)} />
      <Card title={t("composition")}>
        <Grid>
          <NumField label={t("avgWeight")} unit="kg" value={m.peso} onChange={set("peso")} placeholder={computed !== null ? f1(computed) : ""} hint={computed !== null ? t("fromDiary", { value: f1(computed) }) : undefined} />
          <NumField label={t("bodyFat")} unit="%" value={m.bf} onChange={set("bf")} placeholder={prev.bf ? String(prev.bf) : ""} />
        </Grid>
        <TextField label={t("bfMethod")} value={m.metodo} onChange={set("metodo")} placeholder={t("bfMethodPlaceholder")} />
      </Card>
      <Card title={t("measurements")} aside={<span className="text-xs text-muted">cm</span>}>
        <p className="text-xs text-muted">{t("measureHow")}</p>
        <Grid>
          {MEASURES.map((k) => (
            <NumField key={k} label={t(`measure.${k}`)} value={m[k]} onChange={set(k)} placeholder={prev[k] ? String(prev[k]) : ""} hint={prev[k] && m[k] ? delta(num(m[k]) - num(prev[k]), f1) : undefined} />
          ))}
        </Grid>
      </Card>
      <Card title={t("review")}>
        <Segmented label={t("photos")} value={m.foto ? "yes" : ""} onChange={(v) => set("foto")(v === "yes" ? true : null)} options={[{ value: "yes", label: t("photosDone") }]} />
        <TextField label={t("monthNotes")} multiline value={m.note} onChange={set("note")} />
      </Card>
    </>
  );
}

function delta(d, f1) {
  if (d === null || Number.isNaN(d)) return undefined;
  return `${d > 0 ? "+" : ""}${f1(d)} cm`;
}

function ChartsView() {
  const { t } = useTranslation("progress");
  const { data } = useStore();
  const { lang, f1 } = useFmt();
  const [range, setRange] = useState("90");
  const names = useMemo(() => {
    const n = exerciseNames(data);
    for (const w of Object.values(data.workouts)) for (const id of Object.keys(w.sets || {})) if (!n[id]) n[id] = id;
    return n;
  }, [data]);
  const ids = Object.keys(names);
  const [picked, setExercise] = useState(null);
  const exercise = picked && names[picked] ? picked : ids[0] || null;

  const from = range === "all" ? null : iso(addDays(parseIso(today()), -Number(range)));
  const weight = useMemo(() => weightSeries(data, from), [data, from]);
  const waist = useMemo(() => waistSeries(data), [data]);
  const ex = useMemo(() => (exercise ? exerciseSeries(data, exercise) : []), [data, exercise]);
  const months = Object.keys(data.months).sort().reverse();

  return (
    <>
      <Card title={t("weightChart")}>
        <Segmented clearable={false} value={range} onChange={setRange} options={[{ value: "30", label: t("days", { count: 30 }) }, { value: "90", label: t("days", { count: 90 }) }, { value: "all", label: t("all") }]} />
        {weight.points.length >= 2 ? (
          <>
            <LineChart points={weight.points} trend={weight.trend} unit="kg" lang={lang} ariaLabel={t("weightChart")} />
            <div className="flex flex-wrap gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted/60" />{t("dailyWeight")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 bg-accent" />{t("trend7")}</span>
            </div>
          </>
        ) : <Empty text={t("emptyWeight")} />}
      </Card>

      <Card title={t("exerciseChart")}>
        <div className="flex flex-col gap-1">
          <label htmlFor="ex-pick" className="label">{t("exercise")}</label>
          {ids.length ? (
            <select id="ex-pick" className="input" value={exercise} onChange={(e) => setExercise(e.target.value)}>
              {ids.map((id) => <option key={id} value={id}>{names[id]}</option>)}
            </select>
          ) : <p className="text-sm text-muted">{t("noExercises")}</p>}
        </div>
        {ex.length >= 2 ? (
          <>
            <LineChart points={ex} unit="kg" lang={lang} ariaLabel={t("exerciseChart")} />
            <p className="text-xs text-muted">{t("e1rmNote")}</p>
          </>
        ) : <Empty text={t("emptyExercise")} />}
        {ex.length > 0 && (
          <table className="w-full text-sm num">
            <thead><tr className="text-left"><th className="eyebrow py-1 font-semibold">{t("date")}</th><th className="eyebrow py-1 font-semibold">{t("topSet")}</th><th className="eyebrow py-1 font-semibold text-right">e1RM</th></tr></thead>
            <tbody>
              {ex.slice(-5).reverse().map((p) => (
                <tr key={p.date} className="border-t border-line"><td className="py-1.5">{fmtDate(p.date, lang)}</td><td className="py-1.5 font-mono">{p.top}</td><td className="py-1.5 font-mono text-right">{f1(p.value)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <RunCharts />

      <Card title={t("waistChart")}>
        {waist.length >= 2 ? <LineChart points={waist} unit="cm" lang={lang} ariaLabel={t("waistChart")} /> : <Empty text={t("emptyWaist")} />}
      </Card>

      {months.length > 0 && (
        <Card title={t("monthsTable")}>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm num">
              <thead>
                <tr className="text-left">
                  <th className="eyebrow py-1 pr-3 font-semibold whitespace-nowrap">{t("month")}</th>
                  <th className="eyebrow py-1 pr-3 font-semibold whitespace-nowrap">kg</th>
                  <th className="eyebrow py-1 pr-3 font-semibold whitespace-nowrap">BF %</th>
                  {["vita", "petto", "braccio", "coscia"].map((k) => <th key={k} className="eyebrow py-1 pr-3 font-semibold whitespace-nowrap">{t(`measureShort.${k}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {months.map((k) => {
                  const r = data.months[k];
                  return (
                    <tr key={k} className="border-t border-line">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{fmtMonth(k, lang)}</td>
                      <td className="py-1.5 pr-3 font-mono">{f1(num(r.peso))}</td>
                      <td className="py-1.5 pr-3 font-mono">{f1(num(r.bf))}</td>
                      {["vita", "petto", "braccio", "coscia"].map((m) => <td key={m} className="py-1.5 pr-3 font-mono">{f1(num(r[m]))}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/** Pace and heart rate cell, HR coloured against the zone-2 band. */
function RunRow({ r, lang, z2, f1, showDate = true }) {
  const high = z2 && r.fc && r.fc > z2.max;
  return (
    <tr className="border-t border-line">
      {showDate && <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDate(r.date, lang)}</td>}
      <td className="py-1.5 pr-3 font-mono">{f1(r.km)}</td>
      <td className="py-1.5 pr-3 font-mono">{fmtDuration(r.sec)}</td>
      <td className="py-1.5 pr-3 font-mono">{r.pace ? fmtDuration(r.pace) : "—"}</td>
      <td className={`py-1.5 font-mono text-right ${high ? "text-warn" : ""}`}>{r.fc ? Math.round(r.fc) : "—"}</td>
    </tr>
  );
}

function RunTableHead({ t, showDate = true }) {
  return (
    <thead>
      <tr className="text-left">
        {showDate && <th className="eyebrow py-1 pr-3 font-semibold">{t("date")}</th>}
        <th className="eyebrow py-1 pr-3 font-semibold">km</th>
        <th className="eyebrow py-1 pr-3 font-semibold">{t("run.time")}</th>
        <th className="eyebrow py-1 pr-3 font-semibold whitespace-nowrap">{t("run.paceShort")}</th>
        <th className="eyebrow py-1 font-semibold text-right">{t("run.hrShort")}</th>
      </tr>
    </thead>
  );
}

function WeekRuns({ monday, sunday }) {
  const { t } = useTranslation("progress");
  const { data } = useStore();
  const { lang, f1, f0 } = useFmt();
  const runs = useMemo(() => runSeries(data, monday).filter((r) => r.date <= sunday), [data, monday, sunday]);
  const prevMonday = iso(addDays(parseIso(monday), -7));
  const prev = useMemo(() => runTotals(runSeries(data, prevMonday).filter((r) => r.date < monday)), [data, prevMonday, monday]);
  const tot = runTotals(runs);
  const z2 = data.profile.zone2;
  const inZone = z2 ? runs.filter((r) => r.fc && r.fc <= z2.max).length : 0;
  const withHr = runs.filter((r) => r.fc).length;
  const target = weeklyTargets(data).runs;

  return (
    <Card title={t("run.title")} aside={<span className="text-xs text-muted">{t("run.count", { done: tot.count, target: target || "—" })}</span>}>
      {runs.length ? (
        <>
          <Grid>
            <Stat label={t("run.km")} value={f1(tot.km)} sub={prev.count ? t("prev", { value: f1(prev.km) }) : t("noPrev")} />
            <Stat label={t("run.avgPace")} value={tot.pace ? `${fmtDuration(tot.pace)}` : "—"} sub={prev.pace ? t("run.prevPace", { value: fmtDuration(prev.pace) }) : t("run.perKm")} />
            <Stat label={t("run.avgHr")} value={tot.fc ? f0(tot.fc) : "—"} sub={z2 && withHr ? t("run.inZone", { n: inZone, count: withHr, min: z2.min, max: z2.max }) : undefined} tone={z2 && withHr ? (inZone === withHr ? "good" : "warn") : undefined} />
            <Stat label={t("run.totalTime")} value={fmtDuration(tot.sec)} />
          </Grid>
          <table className="w-full text-sm num">
            <RunTableHead t={t} />
            <tbody>{runs.map((r) => <RunRow key={r.date} r={r} lang={lang} z2={z2} f1={f1} />)}</tbody>
          </table>
        </>
      ) : <Empty text={t("run.emptyWeek")} />}
    </Card>
  );
}

function RunCharts() {
  const from = null;
  const { t } = useTranslation("progress");
  const { data } = useStore();
  const { lang, f1 } = useFmt();
  const [metric, setMetric] = useState("pace");
  const runs = useMemo(() => runSeries(data, from), [data, from]);
  const z2 = data.profile.zone2;
  const series = useMemo(() => {
    if (metric === "km") return weeklyKmSeries(data, from);
    if (metric === "hr") return runs.filter((r) => r.fc).map((r) => ({ date: r.date, value: r.fc }));
    return runs.filter((r) => r.pace).map((r) => ({ date: r.date, value: Math.round(r.pace) }));
  }, [metric, runs, data, from]);
  const chart = {
    pace: { unit: "/km", format: fmtDuration, minPad: 10, note: t("run.paceNote") },
    hr: { unit: "bpm", decimals: 0, minPad: 3, note: z2 ? t("run.hrNote", { min: z2.min, max: z2.max }) : undefined },
    km: { unit: "km", decimals: 1, minPad: 1, note: t("run.kmNote") },
  }[metric];

  return (
    <Card title={t("run.chart")}>
      <Segmented
        label={t("run.metric")}
        clearable={false}
        value={metric}
        onChange={setMetric}
        options={[{ value: "pace", label: t("run.pace") }, { value: "hr", label: t("run.hr") }, { value: "km", label: t("run.weeklyKm") }]}
      />
      {series.length >= 2 ? (
        <>
          <LineChart points={series} unit={chart.unit} lang={lang} ariaLabel={`${t("run.chart")} · ${t(`run.${metric === "km" ? "weeklyKm" : metric}`)}`} format={chart.format} decimals={chart.decimals} minPad={chart.minPad} />
          {chart.note && <p className="text-xs text-muted">{chart.note}</p>}
        </>
      ) : <Empty text={t("run.emptyChart")} />}
      {runs.length > 0 && (
        <table className="w-full text-sm num">
          <RunTableHead t={t} />
          <tbody>{runs.slice(-5).reverse().map((r) => <RunRow key={r.date} r={r} lang={lang} z2={z2} f1={f1} />)}</tbody>
        </table>
      )}
    </Card>
  );
}

function Empty({ text }) {
  return <p className="text-sm text-muted border border-dashed border-line rounded-field px-3 py-6 text-center">{text}</p>;
}
