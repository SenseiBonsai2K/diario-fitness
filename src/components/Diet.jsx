import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { fmtDate, today } from "../lib/dates.js";
import { Content, Table } from "./PlanParts.jsx";
import { Icon } from "./ui.jsx";

// A diet lives in the user's data (imported from a file), never in the code.
// Shape: { id, name, author?, startDate?, endDate?, note?, targets?, week?,
//          days: [{ id, name, note?, targets?, meals: [{ name, time?, note?,
//                   items: [{ food, qty?, unit?, note?, alt?: [] }],
//                   options?: [{ name, items }] }] }],
//          substitutions?: [{ food, alt: [], note? }], notes?: [], sections?: [] }

const DAY_ORDER = ["1", "2", "3", "4", "5", "6", "0"];

/** The weekday map is worth showing only when weekdays share a day type. */
const showWeek = (diet) => {
  if (!diet.week || diet.days.length < 2) return false;
  const used = Object.values(diet.week).filter(Boolean);
  return new Set(used).size < used.length;
};
const long = { day: "numeric", month: "long", year: "numeric" };

function useDietText(diet) {
  const { t, i18n } = useTranslation("plan");
  const lang = i18n.language;
  const n = (v) => (typeof v === "number" ? v.toLocaleString(lang, { maximumFractionDigits: 1 }) : v);
  const qty = (it) => [it.qty !== undefined && it.qty !== null ? n(it.qty) : null, it.unit].filter(Boolean).join(" ");
  const period = diet.startDate
    ? diet.endDate
      ? t("programs.periodTo", { from: fmtDate(diet.startDate, lang, long), to: fmtDate(diet.endDate, lang, long) })
      : t("programs.period", { from: fmtDate(diet.startDate, lang, long) })
    : null;
  const targetRows = (tg) =>
    tg
      ? [
          tg.kcal != null && [t("goals.kcal"), `${n(tg.kcal)} kcal`],
          tg.prot != null && [t("goals.protein"), `${n(tg.prot)} g`],
          tg.carb != null && [t("goals.carbs"), `${n(tg.carb)} g`],
          tg.fat != null && [t("goals.fat"), `${n(tg.fat)} g`],
        ].filter(Boolean)
      : [];
  const dayName = (id) => diet.days.find((d) => d.id === id)?.name || id || "—";
  return { t, lang, qty, period, targetRows, dayName };
}

/** Meal groups: the plain item list, then any "option" lists. */
const groupsOf = (meal) => [
  ...(meal.items?.length ? [{ name: null, items: meal.items }] : []),
  ...(meal.options || []).map((o) => ({ name: o.name, items: o.items || [] })),
];

function Items({ items, qty, t }) {
  return (
    <ul className="flex flex-col">
      {items.map((it, i) => (
        <li key={i} className="flex justify-between gap-3 border-t border-line py-1.5 text-sm">
          <span className="min-w-0">
            {it.food}
            {it.note && <span className="block text-xs text-muted">{it.note}</span>}
            {it.alt?.length > 0 && <span className="block text-xs text-muted">{t("diet.or")} {it.alt.join(", ")}</span>}
          </span>
          <span className="text-muted shrink-0 num">{qty(it)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The diet as shown in the Plan screen, with a button to print it or save it as PDF. */
export default function Diet({ diet }) {
  const { t, qty, period, targetRows, dayName } = useDietText(diet);
  const [printing, setPrinting] = useState(false);
  const multi = diet.days.length > 1;
  const targets = targetRows(diet.targets);

  return (
    <>
      <div className="text-sm flex flex-col gap-1">
        {period && <span className="text-muted">{period}</span>}
        {diet.author && <span><span className="text-muted">{t("programs.author")}:</span> {diet.author}</span>}
        {diet.note && <span>{diet.note}</span>}
      </div>
      <button type="button" className="btn-ghost self-start" onClick={() => setPrinting(true)}>
        <Icon name="print" size={18} />{t("diet.print")}
      </button>
      {targets.length > 0 && <Table alignLast head={["", t("goals.perDay")]} rows={targets} />}
      {showWeek(diet) && (
        <>
          <h3 className="eyebrow">{t("programs.week")}</h3>
          <Table head={[t("week.day"), t("diet.dayType")]} rows={DAY_ORDER.map((d) => [t(`week.days.${d}`), dayName(diet.week[d])])} />
        </>
      )}
      {diet.days.map((day) => (
        <div key={day.id || day.name} className="flex flex-col gap-2">
          {multi && <h3 className="h-display text-lg">{day.name}</h3>}
          {day.note && <p className="text-sm text-muted">{day.note}</p>}
          {targetRows(day.targets).length > 0 && <Table alignLast head={["", t("goals.perDay")]} rows={targetRows(day.targets)} />}
          {day.meals.map((meal, mi) => (
            <div key={mi} className="flex flex-col gap-1">
              <h4 className="eyebrow">{meal.name}{meal.time && <span className="font-normal normal-case tracking-normal"> · {meal.time}</span>}</h4>
              {groupsOf(meal).map((g, gi) => (
                <div key={gi}>
                  {g.name && <div className="text-xs font-semibold pt-1">{g.name}</div>}
                  <Items items={g.items} qty={qty} t={t} />
                </div>
              ))}
              {meal.note && <p className="text-xs text-muted">{meal.note}</p>}
            </div>
          ))}
        </div>
      ))}
      {diet.substitutions?.length > 0 && (
        <>
          <h3 className="eyebrow">{t("diet.substitutions")}</h3>
          <Table head={[t("diet.food"), t("diet.alternatives")]} rows={diet.substitutions.map((s) => [s.food, [s.alt?.join(", "), s.note].filter(Boolean).join(" — ")])} />
        </>
      )}
      {(diet.sections || []).map((s, i) => (
        <div key={s.id || i} className="flex flex-col gap-2">
          <h3 className="eyebrow">{s.title}</h3>
          <Content s={s} />
        </div>
      ))}
      {diet.notes?.length > 0 && (
        <>
          <h3 className="eyebrow">{t("programs.notes")}</h3>
          <ul className="list-disc pl-5 flex flex-col gap-1.5 text-sm">{diet.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}
      {printing && <DietPrint diet={diet} onDone={() => setPrinting(false)} />}
    </>
  );
}

/**
 * Print layout (A4, always light), rendered outside the app root only while
 * printing. The browser's print dialog offers "Save as PDF".
 */
export function DietPrint({ diet, onDone }) {
  const { t, lang, qty, period, targetRows, dayName } = useDietText(diet);
  const multi = diet.days.length > 1;

  useEffect(() => {
    const done = () => { document.body.classList.remove("is-printing"); onDone(); };
    document.body.classList.add("is-printing");
    window.addEventListener("afterprint", done, { once: true });
    const id = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(id); window.removeEventListener("afterprint", done); document.body.classList.remove("is-printing"); };
  }, [onDone]);

  const targets = targetRows(diet.targets);
  return createPortal(
    <div className="print-root">
      <header className="pr-head">
        <div className="pr-eyebrow">{t("diet.title")}</div>
        <h1>{diet.name}</h1>
        <div className="pr-meta">
          {[period, diet.author && `${t("programs.author")}: ${diet.author}`].filter(Boolean).join(" · ")}
        </div>
        {diet.note && <p>{diet.note}</p>}
      </header>
      {targets.length > 0 && (
        <p className="pr-targets">{targets.map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
      )}
      {showWeek(diet) && (
        <table className="pr-table pr-week">
          <tbody>
            <tr>{DAY_ORDER.map((d) => <th key={d}>{t(`week.days.${d}`)}</th>)}</tr>
            <tr>{DAY_ORDER.map((d) => <td key={d}>{dayName(diet.week[d])}</td>)}</tr>
          </tbody>
        </table>
      )}
      {diet.days.map((day) => {
        const hasAlt = day.meals.some((m) => groupsOf(m).some((g) => g.items.some((it) => it.alt?.length)));
        return (
        <section key={day.id || day.name} className="pr-day pr-menu">
          {multi && <h2>{day.name}</h2>}
          {day.note && <p className="pr-note">{day.note}</p>}
          {targetRows(day.targets).length > 0 && <p className="pr-targets">{targetRows(day.targets).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>}
          <table className="pr-table">
            <thead>
              <tr><th>{t("diet.meal")}</th><th>{t("diet.food")}</th><th className="pr-qty">{t("diet.qty")}</th>{hasAlt && <th>{t("diet.alternatives")}</th>}</tr>
            </thead>
            {day.meals.map((meal, mi) => (
              <tbody key={mi} className="pr-meal">
                {groupsOf(meal).flatMap((g, gi) =>
                  g.items.map((it, ii) => (
                    <tr key={`${gi}-${ii}`}>
                      {gi === 0 && ii === 0 && (
                        <td rowSpan={groupsOf(meal).reduce((a, x) => a + x.items.length, 0)} className="pr-mealname">
                          <strong>{meal.name}</strong>
                          {meal.time && <div>{meal.time}</div>}
                          {meal.note && <div className="pr-note">{meal.note}</div>}
                        </td>
                      )}
                      <td>{ii === 0 && g.name && <div className="pr-option">{g.name}</div>}{it.food}{it.note && <div className="pr-note">{it.note}</div>}</td>
                      <td className="pr-qty">{qty(it)}</td>
                      {hasAlt && <td>{it.alt?.join(", ")}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            ))}
          </table>
        </section>
        );
      })}
      {diet.substitutions?.length > 0 && (
        <section className="pr-day">
          <h2>{t("diet.substitutions")}</h2>
          <table className="pr-table">
            <thead><tr><th>{t("diet.food")}</th><th>{t("diet.alternatives")}</th></tr></thead>
            <tbody>{diet.substitutions.map((s, i) => <tr key={i}><td>{s.food}</td><td>{[s.alt?.join(", "), s.note].filter(Boolean).join(" — ")}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      {(diet.sections || []).map((s, i) => (
        <section key={s.id || i} className="pr-day">
          <h2>{s.title}</h2>
          {(s.paragraphs || []).map((p, j) => <p key={j}>{p}</p>)}
          {s.bullets?.length > 0 && <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
          {s.numbered?.length > 0 && <ol>{s.numbered.map((b, j) => <li key={j}>{b}</li>)}</ol>}
          {s.table && (
            <table className="pr-table">
              <thead><tr>{s.table.head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
              <tbody>{s.table.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
            </table>
          )}
          {s.note && <p className="pr-note">{s.note}</p>}
        </section>
      ))}
      {diet.notes?.length > 0 && (
        <section className="pr-day">
          <h2>{t("programs.notes")}</h2>
          <ul>{diet.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}
      <footer className="pr-foot">{t("diet.printedOn", { date: fmtDate(today(), lang, long) })}</footer>
    </div>,
    document.body
  );
}
