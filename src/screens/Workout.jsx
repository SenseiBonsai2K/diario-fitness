import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Grid, Icon, NumField, Ring, TextField } from "../components/ui.jsx";
import { activeProgram, activityLabel, findSession, fmtRest, plannedOn, sessionsOf } from "../lib/program.js";
import { fmtDate } from "../lib/dates.js";
import { lastPerformance, liftLogs, num, shouldIncrease } from "../lib/stats.js";
import { useStore } from "../lib/store.jsx";
import { DateStepper } from "./Today.jsx";
import { useRestTimer } from "../components/RestTimer.jsx";


/** What the day's log already contains, else what the weekly plan says. */
function defaultActivity(data, date) {
  if (data.workouts[date]?.session) return data.workouts[date].session;
  const planned = plannedOn(data, date);
  if (planned && planned !== "rest") return planned;
  return sessionsOf(activeProgram(data))[0]?.id || null;
}

export default function Workout({ date, setDate, activity, setActivity }) {
  const { t } = useTranslation("workout");
  const { data } = useStore();
  const current = activity || defaultActivity(data, date);
  const program = activeProgram(data);
  const ids = sessionsOf(program).map((x) => x.id);
  // A log from an older program still opens with that program's session.
  if (current && !ids.includes(current) && findSession(data, current)) ids.unshift(current);
  const logged = new Set(liftLogs(data.workouts[date]).filter((l) => Object.values(l.sets).some((r) => r.some((x) => x.done))).map((l) => l.session));
  for (const id of logged) if (!ids.includes(id) && findSession(data, id)) ids.unshift(id);
  const found = current ? findSession(data, current, data.workouts[date]?.program) : null;

  // Changing day resets the manual choice so the new day opens on its own plan.
  const changeDate = (d) => { setActivity(null); setDate(d); };

  return (
    <>
      <DateStepper date={date} setDate={changeDate} />
      <div role="tablist" aria-label={t("chooseActivity")} className="scroller">
        {ids.map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={current === a}
            onClick={() => setActivity(a)}
            className="chip"
          >
            {logged.has(a) && <Icon name="check" size={14} />}
            {activityLabel(data, a, t)}
          </button>
        ))}
      </div>
      {!program && !found && <p className="card text-sm">{t("noProgram")}</p>}
      {found && <LiftSession key={`${date}-${current}`} date={date} session={found.session} programId={found.program.id} />}
    </>
  );
}

function LiftSession({ date, session, programId }) {
  const { t, i18n } = useTranslation("workout");
  const { data, patch } = useStore();
  const log = data.workouts[date];
  // The day's first session lives in the log itself; a second (third…) one in log.more[sessionId].
  const primary = !log?.session || log.session === session.id;
  const entry = primary ? log : log.more?.[session.id];
  const sets = entry?.sets || {};
  const { start: startRest } = useRestTimer();

  const write = (nextSets, extra = {}) => {
    const value = { program: programId, session: session.id, sets: nextSets, ...extra };
    if (primary) patch("workouts", date, value);
    else patch("workouts", date, { more: { ...(log.more || {}), [session.id]: { ...(log.more?.[session.id] || {}), ...value } } });
  };

  const totals = session.exercises.reduce(
    (acc, ex) => {
      acc.planned += ex.sets;
      acc.done += (sets[ex.id] || []).filter((s) => s.done).length;
      return acc;
    },
    { planned: 0, done: 0 }
  );

  const otherSession = !primary;
  const pct = totals.planned ? totals.done / totals.planned : 0;
  const complete = totals.planned > 0 && totals.done >= totals.planned;
  const volume = Object.values(sets).reduce((a, rows) => a + rows.filter((r) => r.done).reduce((b, r) => b + (num(r.kg) || 0) * (num(r.reps) || 0), 0), 0);

  // Superset pairs are shown together: the first exercise has `superset: true`.
  const groups = [];
  session.exercises.forEach((ex, idx) => {
    const prev = groups[groups.length - 1];
    if (prev && prev.open) { prev.items.push({ ex, idx }); prev.open = !!ex.superset; return; }
    groups.push({ items: [{ ex, idx }], open: !!ex.superset, ss: !!ex.superset });
  });

  const card = ({ ex, idx }) => (
    <ExerciseCard
      key={ex.id}
      index={idx + 1}
      exercise={ex}
      date={date}
      rows={sets[ex.id] || []}
      lang={i18n.language}
      onRows={(rows) => write({ ...sets, [ex.id]: rows })}
      onSetDone={() => startRest(Number(ex.rest) || 0, ex.name)}
    />
  );

  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-[max(8px,env(safe-area-inset-top))] pb-3 -mt-2 bg-bg/90 backdrop-blur-md flex items-center gap-3">
        <Ring value={pct} size={48} className={complete ? "text-good" : "text-accent"}>{complete ? <Icon name="check" size={18} /> : `${Math.round(pct * 100)}%`}</Ring>
        <div className="min-w-0 flex-1">
          <h1 className="h-display text-[1.9rem] truncate">{session.name}</h1>
          <div className="text-xs text-muted num">{t("setsDone", { done: totals.done, planned: totals.planned })}{session.note ? ` · ${session.note}` : ""}</div>
        </div>
      </div>
      {otherSession && (
        <p className="text-sm text-muted">{t("otherSession", { name: activityLabel(data, log.session, t) })}</p>
      )}
      {totals.done === 0 && <p className="text-sm text-muted -mt-1">{t("howTo")}</p>}

      {groups.map((g, gi) =>
        g.ss && g.items.length > 1 ? (
          <div key={gi} className="rounded-[20px] border-2 border-dashed border-accent/35 p-1.5 flex flex-col gap-1.5">
            <div className="px-2.5 pt-1 flex items-center justify-between gap-2">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-accent">{t("superset")}</span>
              <span className="text-[0.7rem] text-muted">{t("supersetHint")}</span>
            </div>
            {g.items.map(card)}
          </div>
        ) : (
          g.items.map(card)
        )
      )}

      {complete && (
        <section className="rounded-card bg-good/10 border border-good/40 p-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-good text-surface grid place-items-center shrink-0"><Icon name="check" /></span>
          <div className="min-w-0">
            <div className="font-semibold">{t("complete")}</div>
            <div className="text-sm text-muted num">{t("completeSub", { sets: totals.done, volume: Math.round(volume).toLocaleString(i18n.language) })}</div>
          </div>
        </section>
      )}

      <Card>
        <TextField label={t("sessionNotes")} multiline value={entry?.note || ""} onChange={(v) => write(sets, { note: v })} placeholder={t("sessionNotesPlaceholder")} />
      </Card>

    </>
  );
}

function ExerciseCard({ index, exercise, date, rows, onRows, onSetDone, lang }) {
  const { t } = useTranslation("workout");
  const { data } = useStore();
  const last = useMemo(() => lastPerformance(data, exercise.id, date), [data, exercise.id, date]);
  const increase = shouldIncrease(exercise, last);
  const count = Math.max(exercise.sets, rows.length);
  const allDone = rows.length >= exercise.sets && rows.slice(0, exercise.sets).every((r) => r.done);

  const update = (i, values) => {
    const next = Array.from({ length: count }, (_, k) => rows[k] || { kg: "", reps: "", done: false });
    next[i] = { ...next[i], ...values };
    onRows(next);
  };

  // Ticking a set confirms what is typed in it (drafts included); only then
  // does it count for the quest, records and stats.
  const toggle = (i, draft = {}) => {
    const row = { ...(rows[i] || {}), ...draft };
    if ((rows[i] || {}).done) return update(i, { ...draft, done: false });
    const ref = last?.sets[i] || last?.sets[last.sets.length - 1];
    update(i, {
      kg: row.kg !== undefined && row.kg !== "" ? row.kg : ref ? String(ref.kg) : "",
      reps: row.reps !== undefined && row.reps !== "" ? row.reps : ref ? String(ref.reps) : "",
      done: true,
    });
    onSetDone();
  };

  const name = exercise.name;
  const target = `${exercise.sets} × ${exercise.reps[0]}–${exercise.reps[1]}${exercise.perSide ? ` ${t("perSide")}` : ""}`;
  const [open, setOpen] = useState(false);

  if (allDone && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded="false" className="card !flex-row items-center gap-3 text-left !py-3 border-good/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span className="w-7 h-7 shrink-0 rounded-full grid place-items-center bg-good text-surface"><Icon name="check" size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug truncate">{name}</span>
          <span className="block text-xs text-muted font-mono num truncate">{rows.filter((r) => r.done).map((r) => `${num(r.kg) ?? "–"}×${num(r.reps) ?? "–"}`).join(" · ")}</span>
        </span>
        <span className="text-xs font-semibold text-accent shrink-0">{t("edit")}</span>
      </button>
    );
  }

  return (
    <section className={`card ${allDone ? "border-good/50" : ""}`} aria-label={name}>
      <div className="flex items-start gap-3">
        <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-xs font-bold num ${allDone ? "bg-good text-surface" : "bg-raised text-muted"}`}>
          {allDone ? <Icon name="check" size={16} /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-snug">{name}</h2>
          <div className="text-xs text-muted num mt-0.5">
            {target}{exercise.rest ? ` · ${t("rest")} ${fmtRest(exercise.rest)}` : exercise.superset ? ` · ${t("supersetNext")}` : ""}{exercise.rir ? ` · RIR ${exercise.rir}` : ""}
          </div>
          {(exercise.technique || exercise.notes) && (
            <div className="text-xs mt-1 flex flex-col gap-0.5">
              {exercise.technique && <span><span className="text-muted">{t("technique")}:</span> {exercise.technique}</span>}
              {exercise.notes && <span><span className="text-muted">{t("notes")}:</span> {exercise.notes}</span>}
            </div>
          )}
        </div>
        {allDone && (
          <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-accent shrink-0 py-1">{t("collapse")}</button>
        )}
      </div>

      <div className="text-xs rounded-field bg-raised px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {last ? (
          <>
            <span className="text-muted">{t("lastTime", { date: fmtDate(last.date, lang) })}</span>
            <span className="font-mono num">{last.sets.map((s) => `${num(s.kg)}×${num(s.reps)}`).join(" · ")}</span>
            {increase && (
              <span className="inline-flex items-center gap-1 text-good font-semibold">
                <Icon name="up" size={14} />
                {t("increase")}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted">{t("firstTime")}</span>
        )}
      </div>

      <div className="grid grid-cols-[28px_1fr_1fr_48px] gap-2 items-center">
        <span className="eyebrow text-center">#</span>
        <span className="eyebrow">kg</span>
        <span className="eyebrow">{t("reps")}</span>
        <span><span className="sr-only">{t("done")}</span></span>
        {Array.from({ length: count }, (_, i) => {
          const r = rows[i] || {};
          const ref = last?.sets[i];
          return (
            <Row
              key={i}
              n={i + 1}
              row={r}
              placeholderKg={ref ? String(num(ref.kg)) : "kg"}
              placeholderReps={ref ? String(num(ref.reps)) : `${exercise.reps[0]}–${exercise.reps[1]}`}
              onKg={(v) => update(i, { kg: v })}
              onReps={(v) => update(i, { reps: v })}
              onToggle={(draft) => toggle(i, draft)}
              extra={i >= exercise.sets}
              onRemove={() => onRows(rows.filter((_, k) => k !== i))}
            />
          );
        })}
      </div>
      <button type="button" className="self-start text-sm text-accent font-semibold py-1" onClick={() => onRows([...Array.from({ length: count }, (_, k) => rows[k] || { kg: "", reps: "", done: false }), { kg: "", reps: "", done: false }])}>
        {t("addSet")}
      </button>
    </section>
  );
}

const LIMITS = { kg: [0, 500], reps: [0, 100] };
const okValue = (v, [lo, hi]) => v === "" || (num(v) !== null && num(v) >= lo && num(v) <= hi);

/**
 * One set. Weight and reps typed here are a draft until confirmed (leaving the
 * field, Enter, or the tick), so "1" on the way to "100" never counts as a
 * record; values out of range are never saved.
 */
function Row({ n, row, placeholderKg, placeholderReps, onKg, onReps, onToggle, extra, onRemove }) {
  const { t } = useTranslation("workout");
  const [kg, setKg] = useState(null);
  const [reps, setReps] = useState(null);
  const badKg = kg !== null && !okValue(kg, LIMITS.kg);
  const badReps = reps !== null && !okValue(reps, LIMITS.reps);
  const commitKg = () => { if (kg === null) return; if (!badKg) { if (kg !== (row.kg ?? "")) onKg(kg.trim()); setKg(null); } };
  const commitReps = () => { if (reps === null) return; if (!badReps) { if (reps !== (row.reps ?? "")) onReps(reps.trim()); setReps(null); } };
  const enter = (fn) => (e) => { if (e.key === "Enter") { e.preventDefault(); fn(); e.currentTarget.blur(); } };
  const tick = () => {
    if (badKg || badReps) return;
    const draft = {};
    if (kg !== null) draft.kg = kg.trim();
    if (reps !== null) draft.reps = reps.trim();
    setKg(null); setReps(null);
    onToggle(draft);
  };
  return (
    <>
      <span className="text-center text-sm text-muted num">
        {extra ? (
          <button type="button" onClick={onRemove} aria-label={t("removeSet", { n })} className="w-7 h-7 grid place-items-center rounded-full text-muted">
            <Icon name="close" size={14} />
          </button>
        ) : n}
      </span>
      <input aria-label={t("kgFor", { n })} aria-invalid={badKg} className={`input font-mono py-2 text-center ${badKg ? "!border-bad" : ""}`} type="text" inputMode="decimal" enterKeyHint="done" value={kg ?? row.kg ?? ""} placeholder={placeholderKg} onChange={(e) => setKg(e.target.value)} onBlur={commitKg} onKeyDown={enter(commitKg)} />
      <input aria-label={t("repsFor", { n })} aria-invalid={badReps} className={`input font-mono py-2 text-center ${badReps ? "!border-bad" : ""}`} type="text" inputMode="numeric" enterKeyHint="done" value={reps ?? row.reps ?? ""} placeholder={placeholderReps} onChange={(e) => setReps(e.target.value)} onBlur={commitReps} onKeyDown={enter(commitReps)} />
      <button
        type="button"
        aria-pressed={!!row.done}
        aria-label={t("markSet", { n })}
        onMouseDown={(e) => e.preventDefault()}
        onClick={tick}
        className={`h-11 rounded-field border grid place-items-center transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${row.done ? "bg-good border-good text-surface" : "bg-bg border-line text-muted"}`}
      >
        <Icon name="check" />
      </button>
    </>
  );
}
