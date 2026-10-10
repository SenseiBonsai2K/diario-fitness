import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { activityLabel, fmtRest } from "../lib/program.js";
import { fmtDate } from "../lib/dates.js";
import { num } from "../lib/stats.js";
import { useStore } from "../lib/store.jsx";
import { Content, Section, Table } from "../components/PlanParts.jsx";
import Diet, { DietPrint } from "../components/Diet.jsx";
import { Icon, Meter } from "../components/ui.jsx";
import { today, parseIso } from "../lib/dates.js";
import { sessionMinutes } from "../lib/program.js";

const DAY_ORDER = ["1", "2", "3", "4", "5", "6", "0"];

function Program({ program, data, t, lang }) {
  const period = program.endDate
    ? t("programs.periodTo", { from: fmtDate(program.startDate, lang, { day: "numeric", month: "short", year: "numeric" }), to: fmtDate(program.endDate, lang, { day: "numeric", month: "short", year: "numeric" }) })
    : program.startDate ? t("programs.period", { from: fmtDate(program.startDate, lang, { day: "numeric", month: "short", year: "numeric" }) }) : null;
  return (
    <>
      <div className="text-sm flex flex-col gap-1">
        {period && <span className="text-muted">{period}</span>}
        {program.author && <span><span className="text-muted">{t("programs.author")}:</span> {program.author}</span>}
        {program.goal && <span><span className="text-muted">{t("programs.goal")}:</span> {program.goal}</span>}
      </div>
      {program.week && (
        <>
          <h3 className="eyebrow">{t("programs.week")}</h3>
          <Table head={[t("week.day"), t("week.activity")]} rows={DAY_ORDER.map((d) => [t(`week.days.${d}`), activityLabel(data, program.week[d], t)])} />
        </>
      )}
      {program.sessions.map((s) => (
        <div key={s.id} className="flex flex-col gap-1.5">
          <h3 className="h-display text-lg">{s.name}</h3>
          {s.note && <p className="text-sm text-muted">{s.note}</p>}
          <Table
            monoFrom={1}
            head={[t("sessions.exercise"), t("sessions.setsReps"), t("sessions.rest"), "RIR"]}
            rows={s.exercises.map((e) => [
              <span key="n">{e.superset && <span className="mr-1.5 rounded bg-accent-soft text-accent text-[0.65rem] font-bold uppercase px-1 py-0.5">SS</span>}{e.name}{e.notes && <span className="block text-xs text-muted font-body whitespace-normal">{e.notes}</span>}</span>,
              `${e.sets} × ${e.reps[0]}–${e.reps[1]}${e.perSide ? ` ${t("workout:perSide")}` : ""}`,
              e.rest ? fmtRest(e.rest) : e.superset ? t("workout:supersetNext") : "—",
              e.rir || "—",
            ])}
          />
        </div>
      ))}
      {program.volume?.length > 0 && (
        <>
          <h3 className="eyebrow">{t("programs.volume")}</h3>
          <Table head={[t("programs.muscle"), t("programs.sets"), t("programs.detail")]} rows={program.volume.map((v) => [v.name, String(v.sets), v.detail || ""])} />
        </>
      )}
      {program.notes?.length > 0 && (
        <>
          <h3 className="eyebrow">{t("programs.notes")}</h3>
          <ul className="list-disc pl-5 flex flex-col gap-1.5 text-sm">{program.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
    </>
  );
}

/** One archived version: a program, a diet, the plan text or the profile targets. */
function ArchivedItem({ a, data, t, lang, n }) {
  const d = a.data || {};
  if (a.kind === "program" && Array.isArray(d.sessions)) return <Program program={d} data={data} t={t} lang={lang} />;
  if (a.kind === "diet" && Array.isArray(d.days)) return <Diet diet={d} />;
  if (a.kind === "plan") {
    return (
      <>
        {(d.sections || []).map((s, i) => (
          <div key={s.id || i} className="flex flex-col gap-2">
            <h3 className="eyebrow">{s.title}</h3>
            <Content s={s} />
          </div>
        ))}
        {d.yoga?.blocks?.length > 0 && <p className="text-sm text-muted">{t("archive.yoga", { title: d.yoga.title || t("common:activity.yoga") })}</p>}
      </>
    );
  }
  if (a.kind === "profile") {
    const rows = [
      ["phase", d.phase ? t(`common:phase.${d.phase}`) : null],
      ["kcal", d.kcal != null ? `${n(d.kcal)} kcal` : null],
      ["protein", d.prot != null ? `${n(d.prot)} g` : null],
      ["carbs", d.carb != null ? `${n(d.carb)} g` : null],
      ["fat", d.fat != null ? `${n(d.fat)} g` : null],
      ["goalWeight", d.goalWeight != null ? `${n(d.goalWeight)} kg` : null],
      ["goalBf", d.goalBf != null ? `${n(d.goalBf)}%` : null],
    ].filter(([, v]) => v);
    return <Table alignLast head={["", ""]} rows={rows.map(([k, v]) => [t(`archive.profile.${k}`), v])} />;
  }
  return <pre className="text-xs overflow-x-auto">{JSON.stringify(d, null, 2)}</pre>;
}

const TAB_KEY = "diario-fitness:planTab";
const readTab = () => { try { return sessionStorage.getItem(TAB_KEY) || "program"; } catch { return "program"; } };

function Tabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="grid gap-1 p-1 rounded-full bg-raised" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((x) => (
        <button
          key={x.id}
          type="button"
          role="tab"
          aria-selected={value === x.id}
          onClick={() => onChange(x.id)}
          className={`min-h-[40px] rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${value === x.id ? "bg-surface text-ink shadow-card" : "text-muted"}`}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}

/** Exercise list of one session, superset pairs bracketed together. */
function SessionList({ session, t }) {
  const rows = [];
  session.exercises.forEach((e, i) => {
    const prevSs = i > 0 && session.exercises[i - 1].superset;
    rows.push({ e, i, inPair: e.superset || prevSs, first: e.superset && !prevSs });
  });
  return (
    <ol className="flex flex-col">
      {rows.map(({ e, i, inPair, first }) => (
        <li key={`${e.id}-${i}`} className={`flex gap-3 py-2.5 border-t border-line/70 first:border-t-0 ${inPair ? "pl-2 border-l-2 border-l-accent/50" : ""}`}>
          <span className="w-6 h-6 shrink-0 rounded-full bg-raised text-muted grid place-items-center text-[0.7rem] font-bold num">{i + 1}</span>
          <div className="min-w-0 flex-1">
            {first && <span className="block text-[0.62rem] font-bold uppercase tracking-wider text-accent mb-0.5">{t("workout:superset")}</span>}
            <div className="font-semibold text-sm leading-snug">{e.name}</div>
            <div className="text-xs text-muted num mt-0.5">
              {e.rest ? `${t("sessions.rest")} ${fmtRest(e.rest)}` : e.superset ? t("workout:supersetNext") : ""}{e.rir ? ` · RIR ${e.rir}` : ""}
            </div>
            {e.notes && <div className="text-xs text-muted mt-0.5">{e.notes}</div>}
          </div>
          <span className="shrink-0 font-display text-lg font-semibold num leading-tight text-right">
            {e.sets}×{e.reps[0]}–{e.reps[1]}
            {e.perSide && <span className="block font-body text-[0.65rem] font-normal text-muted">{t("workout:perSide")}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ProgramTab({ program, data, t, lang }) {
  const todayId = program.week?.[String(new Date().getDay())];
  const first = program.sessions.find((s) => s.id === todayId) || program.sessions[0];
  const [sel, setSel] = useState(first?.id);
  const session = program.sessions.find((s) => s.id === sel) || first;
  const maxVol = Math.max(1, ...(program.volume || []).map((v) => v.sets));
  const short = new Intl.DateTimeFormat(lang, { weekday: "short" });
  const period = program.startDate ? t("programs.period", { from: fmtDate(program.startDate, lang, { day: "numeric", month: "long", year: "numeric" }) }) : null;
  return (
    <>
      <section className="card">
        <div>
          <div className="eyebrow">{t("programs.current")}</div>
          <h2 className="h-display text-[1.7rem] mt-1">{program.name}</h2>
          <div className="text-xs text-muted mt-1">{[period, program.author && `${t("programs.author")} ${program.author}`].filter(Boolean).join(" · ")}</div>
        </div>
        {program.goal && <p className="text-sm">{program.goal}</p>}
        {program.week && (
          <div className="grid grid-cols-7 gap-1">
            {DAY_ORDER.map((d) => {
              const a = program.week[d];
              const isSession = a && !["run", "yoga", "rest"].includes(a);
              const isToday = String(new Date().getDay()) === d;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!isSession}
                  onClick={() => isSession && setSel(a)}
                  aria-label={`${t(`week.days.${d}`)}: ${activityLabel(data, a, t)}`}
                  className={`rounded-field py-1.5 flex flex-col items-center gap-1 border text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                    ${isSession && a === session?.id ? "bg-ink text-surface border-ink" : isToday ? "border-accent/50 bg-accent-soft" : "border-line/70"}`}
                >
                  <span className="text-[0.62rem] font-semibold uppercase opacity-70">{short.format(new Date(2026, 9, 11 + Number(d)))}</span>
                  <span className="text-[0.66rem] font-bold leading-none h-4 grid place-items-center">
                    {isSession ? activityLabel(data, a, t).replace(/^(\w)\w*\s+(\w).*$/, "$1$2").slice(0, 3) : <Icon name={a === "run" ? "run" : a === "yoga" ? "yoga" : "rest"} size={14} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div role="tablist" aria-label={t("programs.sessions")} className="scroller">
        {program.sessions.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === session?.id} onClick={() => setSel(s.id)} className="chip">{s.name}</button>
        ))}
      </div>

      {session && (
        <section className="card">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="h-display text-2xl">{session.name}</h2>
              {session.note && <div className="text-xs text-muted mt-0.5">{session.note}</div>}
            </div>
            <span className="text-xs text-muted num shrink-0">{t("programs.sessionMeta", { sets: session.exercises.reduce((a, e) => a + e.sets, 0), min: sessionMinutes(session) })}</span>
          </div>
          <SessionList session={session} t={t} />
        </section>
      )}

      {program.volume?.length > 0 && (
        <section className="card">
          <h2 className="eyebrow">{t("programs.volume")}</h2>
          <ul className="flex flex-col gap-2.5">
            {program.volume.map((v) => (
              <li key={v.name} className="flex flex-col gap-1">
                <div className="flex justify-between gap-3 text-sm"><span className="font-medium">{v.name}</span><span className="num font-semibold">{v.sets}</span></div>
                <Meter value={v.sets} target={maxVol} />
                {v.detail && <span className="text-[0.7rem] text-muted">{v.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {program.notes?.length > 0 && (
        <section className="card">
          <h2 className="eyebrow">{t("programs.notes")}</h2>
          <ul className="flex flex-col gap-2 text-sm">{program.notes.map((n, i) => <li key={i} className="flex gap-2"><span className="text-accent mt-0.5"><Icon name="check" size={16} /></span><span>{n}</span></li>)}</ul>
        </section>
      )}
    </>
  );
}

function DietTab({ diet, t, lang }) {
  const n = (v) => (typeof v === "number" ? v.toLocaleString(lang, { maximumFractionDigits: 1 }) : v);
  const qty = (it) => [it.qty !== undefined && it.qty !== null ? n(it.qty) : null, it.unit].filter(Boolean).join(" ");
  const weekday = String(parseIso(today()).getDay());
  const byWeek = diet.week && DAY_ORDER.every((d) => diet.week[d]);
  const [sel, setSel] = useState(byWeek ? weekday : null);
  const [dayId, setDayId] = useState(diet.days[0]?.id);
  const [printing, setPrinting] = useState(false);
  const day = byWeek ? diet.days.find((d) => d.id === diet.week[sel]) : diet.days.find((d) => d.id === dayId) || diet.days[0];
  const tg = day?.targets || diet.targets;
  const short = new Intl.DateTimeFormat(lang, { weekday: "short" });
  return (
    <>
      <section className="card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">{t("diet.current")}</div>
            <h2 className="h-display text-[1.7rem] mt-1">{diet.name}</h2>
            {diet.startDate && <div className="text-xs text-muted mt-1">{t("programs.period", { from: fmtDate(diet.startDate, lang, { day: "numeric", month: "long", year: "numeric" }) })}</div>}
          </div>
          <button type="button" className="w-11 h-11 rounded-full border border-line grid place-items-center text-accent shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label={t("diet.print")} onClick={() => setPrinting(true)}>
            <Icon name="print" size={20} />
          </button>
        </div>
        {tg && (
          <div className="grid grid-cols-4 gap-2">
            {[["kcal", t("goals.kcal"), "kcal"], ["prot", t("goals.protein"), "g"], ["carb", t("goals.carbs"), "g"], ["fat", t("goals.fat"), "g"]].map(([k, l, u]) =>
              tg[k] != null ? (
                <div key={k} className="rounded-field bg-raised px-2 py-2 text-center">
                  <div className="font-display text-xl font-semibold num leading-none">{n(tg[k])}{u === "g" && <span className="text-xs text-muted font-body font-normal ml-0.5">g</span>}</div>
                  <div className="text-[0.65rem] text-muted mt-1 truncate">{l}</div>
                </div>
              ) : null
            )}
          </div>
        )}
      </section>

      {byWeek ? (
        <div role="tablist" aria-label={t("programs.week")} className="grid grid-cols-7 gap-1">
          {DAY_ORDER.map((d) => (
            <button key={d} type="button" role="tab" aria-selected={sel === d} onClick={() => setSel(d)}
              className={`min-h-[44px] rounded-field border text-xs font-semibold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${sel === d ? "bg-ink text-surface border-ink" : d === weekday ? "border-accent/50 bg-accent-soft" : "border-line/70 bg-surface"}`}>
              {short.format(new Date(2026, 9, 11 + Number(d)))}
            </button>
          ))}
        </div>
      ) : diet.days.length > 1 ? (
        <div role="tablist" className="scroller">
          {diet.days.map((d) => <button key={d.id} type="button" role="tab" aria-selected={d.id === day?.id} onClick={() => setDayId(d.id)} className="chip">{d.name}</button>)}
        </div>
      ) : null}

      {day && (
        <>
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="h-display text-2xl">{day.name}</h2>
            {byWeek && sel === weekday && <span className="text-xs font-semibold text-accent">{t("diet.today")}</span>}
          </div>
          {day.note && <p className="text-sm text-muted px-1">{day.note}</p>}
          {day.meals.map((meal, mi) => (
            <section key={mi} className="card !gap-2">
              <h3 className="flex items-center justify-between gap-3">
                <span className="font-display text-lg font-semibold uppercase tracking-wide">{meal.name}</span>
                {meal.time && <span className="text-xs text-muted num">{meal.time}</span>}
              </h3>
              {[...(meal.items?.length ? [{ name: null, items: meal.items }] : []), ...(meal.options || [])].map((g, gi) => (
                <div key={gi}>
                  {g.name && <div className="text-xs font-semibold text-accent pt-1">{g.name}</div>}
                  <ul className="flex flex-col">
                    {(g.items || []).map((it, ii) => (
                      <li key={ii} className="flex justify-between gap-3 border-t border-line/70 py-2 first:border-t-0 text-sm">
                        <span className="min-w-0">
                          {it.food}
                          {it.note && <span className="block text-xs text-muted">{it.note}</span>}
                          {it.alt?.length > 0 && <span className="block text-xs text-muted">{t("diet.or")} {it.alt.join(", ")}</span>}
                        </span>
                        <span className="shrink-0 font-semibold num">{qty(it)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {meal.note && <p className="text-xs text-muted">{meal.note}</p>}
            </section>
          ))}
        </>
      )}

      {diet.substitutions?.length > 0 && (
        <Section title={t("diet.substitutions")}>
          <Table head={[t("diet.food"), t("diet.alternatives")]} rows={diet.substitutions.map((s) => [s.food, [s.alt?.join(", "), s.note].filter(Boolean).join(" — ")])} />
        </Section>
      )}
      {(diet.sections || []).map((s, i) => <Section key={s.id || i} title={s.title}><Content s={s} /></Section>)}
      {diet.notes?.length > 0 && (
        <section className="card">
          <h2 className="eyebrow">{t("programs.notes")}</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1.5 text-sm">{diet.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}
      {printing && <DietPrint diet={diet} onDone={() => setPrinting(false)} />}
    </>
  );
}

function Goals({ p, t, n, lang }) {
  const span = p.startWeight && p.goalWeight ? p.startWeight - p.goalWeight : null;
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">{t("goals.title")}</div>
          {p.phase && <h2 className="h-display text-[1.7rem] mt-1">{t(`common:phase.${p.phase}`)}</h2>}
        </div>
        {p.startDate && <span className="text-xs text-muted text-right">{t("goals.since", { date: fmtDate(p.startDate, lang, { day: "numeric", month: "long", year: "numeric" }) })}</span>}
      </div>
      {(p.startWeight || p.goalWeight) && (
        <div className="grid grid-cols-2 gap-2">
          {[[t("goals.weight"), p.startWeight, p.goalWeight, "kg"], [t("goals.bf"), p.startBf, p.goalBf, "%"]].map(([l, a, b, u]) => (
            <div key={l} className="rounded-field bg-raised px-3 py-2.5">
              <div className="text-[0.7rem] text-muted">{l}</div>
              <div className="flex items-center gap-1.5 mt-1 num">
                <span className="font-display text-xl font-semibold">{a ? n(a) : "—"}</span>
                <Icon name="chevronRight" size={14} className="text-muted" />
                <span className="font-display text-xl font-semibold text-accent">{b ? n(b) : "—"}</span>
                <span className="text-xs text-muted">{u}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {span > 0 && <p className="text-xs text-muted">{t("goals.toLose", { value: n(span) })}</p>}
      {p.kcal && (
        <div className="grid grid-cols-4 gap-2">
          {[[p.kcal, t("goals.kcal")], [p.prot, t("goals.protein")], [p.carb, t("goals.carbs")], [p.fat, t("goals.fat")]].map(([v, l]) => (
            <div key={l} className="rounded-field border border-line/70 px-2 py-2 text-center">
              <div className="font-display text-lg font-semibold num leading-none">{n(v)}</div>
              <div className="text-[0.65rem] text-muted mt-1">{l}</div>
            </div>
          ))}
        </div>
      )}
      {p.maintenance && <p className="text-xs text-muted">{t("goals.maintenance", { value: n(p.maintenance) })}</p>}
    </section>
  );
}

export default function Plan() {
  const { t, i18n } = useTranslation("plan");
  const { data } = useStore();
  const p = data.profile;
  const lang = i18n.language;
  const n = (v) => (num(v) === null ? "—" : num(v).toLocaleString(lang, { maximumFractionDigits: 1 }));
  const active = data.programs[data.activeProgram];
  const archived = Object.values(data.programs).filter((x) => x.id !== data.activeProgram).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const diet = data.diets[data.activeDiet];
  const oldDiets = Object.values(data.diets).filter((x) => x.id !== data.activeDiet).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const hasArchive = archived.length + oldDiets.length + data.archive.length + data.history.length > 0;
  const empty = !active && !diet && data.plan.sections.length === 0 && !hasArchive;

  const tabs = [
    active && { id: "program", label: t("tabs.program") },
    diet && { id: "diet", label: t("tabs.diet") },
    { id: "plan", label: t("tabs.plan") },
    hasArchive && { id: "archive", label: t("tabs.archive") },
  ].filter(Boolean);
  const [tab, setTab] = useState(readTab);
  const current = tabs.some((x) => x.id === tab) ? tab : tabs[0].id;
  useEffect(() => { try { sessionStorage.setItem(TAB_KEY, current); } catch { /* ignore */ } }, [current]);

  if (empty) {
    return (
      <>
        <h1 className="h-display text-3xl">{t("title")}</h1>
        <p className="card text-sm">{t("empty")}</p>
      </>
    );
  }

  return (
    <>
      <h1 className="h-display text-3xl">{t("title")}</h1>
      {tabs.length > 1 && <Tabs tabs={tabs} value={current} onChange={setTab} label={t("title")} />}

      {current === "program" && active && <ProgramTab key={active.id} program={active} data={data} t={t} lang={lang} />}
      {current === "diet" && diet && <DietTab key={diet.id} diet={diet} t={t} lang={lang} />}

      {current === "plan" && (
        <>
          <Goals p={p} t={t} n={n} lang={lang} />
          {data.plan.sections.map((s) => (
            <Section key={s.id || s.title} title={s.title}>
              <Content s={s} />
            </Section>
          ))}
          {data.plan.yoga && (
            <Section title={data.plan.yoga.title || t("common:activity.yoga")}>
              {data.plan.yoga.intro && <p>{data.plan.yoga.intro}</p>}
              {data.plan.yoga.blocks?.map((b) => (
                <div key={b.name} className="flex flex-col gap-1">
                  <h3 className="eyebrow">{b.name}</h3>
                  <ul className="flex flex-col">
                    {b.poses.map((x) => (
                      <li key={x.id} className="flex justify-between gap-3 border-t border-line/70 py-1.5 text-sm">
                        <span>{x.name}</span>
                        <span className="font-mono text-muted shrink-0">{x.hold}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {data.plan.yoga.why && <p className="text-sm text-muted">{data.plan.yoga.why}</p>}
            </Section>
          )}
        </>
      )}

      {current === "archive" && (
        <>
          {archived.map((prog) => (
            <Section key={prog.id} title={prog.name} sub={t("programs.archived")}>
              <Program program={prog} data={data} t={t} lang={lang} />
            </Section>
          ))}
          {oldDiets.map((d) => (
            <Section key={d.id} title={d.name} sub={t("diet.archived")}>
              <Diet diet={d} />
            </Section>
          ))}
          {data.archive.length > 0 && (
            <Section title={t("archive.title")} sub={t("archive.sub", { count: data.archive.length })}>
              {[...data.archive].reverse().map((a, i) => (
                <details key={i} className="border-t border-line pt-2 first:border-t-0 group/a">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex justify-between gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <span className="min-w-0">
                      <span className="block text-xs text-muted num">{a.at ? fmtDate(String(a.at).slice(0, 10), lang, { day: "numeric", month: "long", year: "numeric" }) : ""}</span>
                      <span className="font-semibold text-sm">{t(`archive.kind.${a.kind}`, { defaultValue: a.kind })}{a.data?.name ? ` · ${a.data.name}` : ""}</span>
                    </span>
                    <span aria-hidden="true" className="text-muted transition-transform group-open/a:rotate-90">›</span>
                  </summary>
                  <div className="flex flex-col gap-3 pt-2 text-[0.95rem] leading-relaxed">
                    <ArchivedItem a={a} data={data} t={t} lang={lang} n={n} />
                  </div>
                </details>
              ))}
            </Section>
          )}
          {data.history.length > 0 && (
            <Section title={t("history.title")}>
              <ol className="flex flex-col">
                {[...data.history].reverse().map((h, i) => (
                  <li key={i} className="border-t border-line py-2 first:border-t-0">
                    <div className="text-xs text-muted num">{h.date ? fmtDate(h.date, lang, { day: "numeric", month: "long", year: "numeric" }) : ""}</div>
                    <div className="font-semibold text-sm">{h.title}</div>
                    {h.text && <div className="text-sm">{h.text}</div>}
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </>
      )}
    </>
  );
}
