import { useTranslation } from "react-i18next";
import { activityLabel, fmtRest } from "../lib/program.js";
import { fmtDate } from "../lib/dates.js";
import { num } from "../lib/stats.js";
import { useStore } from "../lib/store.jsx";
import { Content, Section, Table } from "../components/PlanParts.jsx";
import Diet from "../components/Diet.jsx";

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
  const empty = !active && !diet && data.plan.sections.length === 0 && data.archive.length === 0;

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
      <p className="text-sm text-muted">{t("intro")}</p>

      <Section title={t("goals.title")} open>
        {p.phase && <p>{t("goals.phaseNow", { phase: t(`common:phase.${p.phase}`) })}</p>}
        {(p.startWeight || p.goalWeight) && (
          <Table
            head={[t("goals.what"), t("goals.start"), t("goals.target")]}
            rows={[
              [t("goals.weight"), p.startWeight ? `${n(p.startWeight)} kg` : "—", p.goalWeight ? `${n(p.goalWeight)} kg` : "—"],
              [t("goals.bf"), p.startBf ? `${n(p.startBf)}%` : "—", p.goalBf ? `${n(p.goalBf)}%` : "—"],
            ]}
          />
        )}
        {p.kcal && (
          <Table
            alignLast
            head={["", t("goals.perDay")]}
            rows={[[t("goals.kcal"), `${n(p.kcal)} kcal`], [t("goals.protein"), `${n(p.prot)} g`], [t("goals.carbs"), `${n(p.carb)} g`], [t("goals.fat"), `${n(p.fat)} g`]]}
          />
        )}
        {p.maintenance && <p className="text-sm text-muted">{t("goals.maintenance", { value: n(p.maintenance) })}</p>}
        {p.startDate && <p className="text-sm text-muted">{t("goals.since", { date: fmtDate(p.startDate, lang, { day: "numeric", month: "long", year: "numeric" }) })}</p>}
      </Section>

      {active && (
        <Section title={active.name} sub={t("programs.current")}>
          <Program program={active} data={data} t={t} lang={lang} />
        </Section>
      )}

      {diet && (
        <Section title={diet.name || t("diet.title")} sub={t("diet.current")}>
          <Diet diet={diet} />
        </Section>
      )}

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
                  <li key={x.id} className="flex justify-between gap-3 border-t border-line py-1.5 text-sm">
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
  );
}
