import { useTranslation } from "react-i18next";
import { activityLabel, fmtRest } from "../lib/program.js";
import { fmtDate } from "../lib/dates.js";
import { num } from "../lib/stats.js";
import { useStore } from "../lib/store.jsx";

const DAY_ORDER = ["1", "2", "3", "4", "5", "6", "0"];

function Section({ title, sub, children, open = false }) {
  return (
    <details className="card group" open={open}>
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
        <div className="min-w-0">
          <h2 className="h-display text-xl">{title}</h2>
          {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
        </div>
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="flex flex-col gap-3 pt-1 text-[0.95rem] leading-relaxed">{children}</div>
    </details>
  );
}

function Table({ head, rows, monoFrom = 99, alignLast = false }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm num">
        <thead>
          <tr className="text-left">{head.map((h, i) => <th key={i} className={`eyebrow py-1.5 pr-3 font-semibold whitespace-nowrap ${alignLast && i === head.length - 1 ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => (
                <td key={j} className={`py-2 pr-3 ${j >= monoFrom ? "whitespace-nowrap font-mono text-[0.8rem]" : ""} ${alignLast && j === r.length - 1 ? "text-right" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A plan section from the user's data: paragraphs, bullets, numbered steps, a table, a note. */
function Content({ s }) {
  return (
    <>
      {(s.paragraphs || []).map((p, i) => <p key={`p${i}`}>{p}</p>)}
      {s.table && <Table head={s.table.head} rows={s.table.rows} />}
      {s.bullets?.length > 0 && <ul className="list-disc pl-5 flex flex-col gap-1.5">{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
      {s.numbered?.length > 0 && <ol className="list-decimal pl-5 flex flex-col gap-1.5">{s.numbered.map((b, i) => <li key={i}>{b}</li>)}</ol>}
      {s.note && <p className="text-sm text-muted">{s.note}</p>}
    </>
  );
}

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
              <span key="n">{e.name}{e.notes && <span className="block text-xs text-muted font-body whitespace-normal">{e.notes}</span>}</span>,
              `${e.sets} × ${e.reps[0]}–${e.reps[1]}${e.perSide ? ` ${t("workout:perSide")}` : ""}`,
              fmtRest(e.rest),
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

export default function Plan() {
  const { t, i18n } = useTranslation("plan");
  const { data } = useStore();
  const p = data.profile;
  const lang = i18n.language;
  const n = (v) => (num(v) === null ? "—" : num(v).toLocaleString(lang, { maximumFractionDigits: 1 }));
  const active = data.programs[data.activeProgram];
  const archived = Object.values(data.programs).filter((x) => x.id !== data.activeProgram).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const empty = !active && data.plan.sections.length === 0;

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
