import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./ui.jsx";
import { useStore } from "../lib/store.jsx";
import { QUEST_TYPES, evaluateDay, questsChanged } from "../lib/game.js";
import { activityLabel, findSession } from "../lib/program.js";
import { today } from "../lib/dates.js";
import { useGame, useStyle } from "./game.jsx";

const FIELD = { steps: "passi", water: "acqua", sleep: "sonno", weigh: "peso" };

/** Compact number input inside a quest row. */
function QuestInput({ label, unit, value, onChange, decimal = true }) {
  const id = useId();
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        className="input font-mono !w-[5.5rem] !py-1.5 text-right"
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {unit && <span className="text-xs text-muted font-mono w-6">{unit}</span>}
    </span>
  );
}

const fmtN = (v, lang) => (v === null || v === undefined ? "—" : v.toLocaleString(lang, { maximumFractionDigits: 1 }));

function QuestRow({ r, date, closed, saved, actions }) {
  const { t, i18n } = useTranslation("game");
  const { data, patch } = useStore();
  const lang = i18n.language;
  const q = r.quest;
  const meta = QUEST_TYPES[q.type];
  const base = meta.xp;
  const failed = closed && r.required && r.xp === 0;
  const pct = Math.min(1, r.prog.fraction || 0);
  const name = q.type === "workout" ? activityLabel(data, q.session, t) : t(`quest.${q.type}`);
  const hint = (() => {
    switch (q.type) {
      case "workout": return t("hint.workout", { done: r.prog.value, total: r.prog.target });
      case "steps": case "water": case "sleep": return t(`hint.${q.type}`, { value: fmtN(r.prog.value, lang), target: fmtN(q.target, lang) });
      case "diet": return t("hint.diet", { done: r.prog.value, total: r.prog.target });
      default: return t(`hint.${q.type}`);
    }
  })();
  const tone = r.complete ? "text-good bg-good/15 border-good/40" : failed ? (saved ? "text-accent bg-accent-soft border-accent/40" : "text-bad bg-bad/10 border-bad/40") : "text-accent bg-accent-soft border-accent/30";
  const field = FIELD[q.type];
  return (
    <li className={`rounded-field border p-3 flex flex-col gap-2 transition-colors ${r.complete ? "border-good/40 bg-good/5" : failed && !saved ? "border-bad/30" : "border-line/70 bg-bg/40"}`}>
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 shrink-0 rounded-full border grid place-items-center ${tone}`}>
          <Icon name={r.complete ? "check" : meta.icon} size={20} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[0.95rem] leading-tight">{name}</span>
            {q.bonus && <span className="text-[0.6rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-warn/15 text-warn">{t("board.bonus")}</span>}
            {q.deadline && <span className={`text-[0.65rem] font-semibold num ${r.late ? "text-warn" : "text-muted"}`}>· {r.late ? t("board.late") : t("board.deadline", { time: q.deadline })}</span>}
          </span>
          <span className="block text-xs text-muted num truncate">{hint}</span>
        </span>
        <span className={`shrink-0 text-right font-display font-bold num leading-none ${r.xp > 0 ? "text-good text-lg" : failed && !saved ? "text-bad text-sm" : "text-muted text-sm"}`}>
          {r.xp > 0 ? t("board.xp", { xp: r.xp }) : failed && !saved ? t("board.missed", { xp: r.penalty }) : t("board.worth", { xp: base })}
        </span>
      </div>
      {(q.type !== "weigh" && q.type !== "check" && q.type !== "backup") && (
        <div className="bar !h-1.5" aria-hidden="true"><span className={r.complete ? "!bg-good" : ""} style={{ width: `${pct * 100}%` }} /></div>
      )}
      {(field || actions) && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {actions}
          {field && (
            <QuestInput
              label={name}
              unit={q.type === "steps" ? "" : q.type === "weigh" ? "kg" : t(`unit.${meta.unit}`)}
              decimal={q.type !== "steps"}
              value={data.days[date]?.[field]}
              onChange={(v) => patch("days", date, { [field]: v })}
            />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The day's quests: workouts first, then the routine's, each with its
 * progress, XP and the input or button that completes it.
 */
export default function QuestBoard({ date, openWorkout, goTo, onRoutine, onMove, onAdd, onDiet }) {
  const { t } = useTranslation("game");
  const { data, setEntries } = useStore();
  const g = useGame();
  const style = useStyle();
  const now = today();
  const closed = date < now;
  const fromState = g?.days.find((x) => x.date === date);
  const day = fromState || evaluateDay(data, date, closed);
  const saved = !!fromState?.saved;

  const actionsFor = (r) => {
    const q = r.quest;
    if (q.type === "workout") {
      const s = findSession(data, q.session)?.session;
      const label = r.complete ? t("board.openLog") : r.prog.value > 0 ? t("board.resume") : t("board.start");
      return (
        <>
          <button type="button" className="text-xs font-semibold text-muted py-1 px-1" onClick={onMove}>{t("today:move.open")}</button>
          <button type="button" className="btn !py-2" onClick={() => openWorkout(date, q.session)} disabled={!s}>{label}<Icon name="chevronRight" size={16} /></button>
        </>
      );
    }
    if (q.type === "diet") return <button type="button" className="btn-ghost !py-1.5" onClick={onDiet}>{t("board.goMenu")}</button>;
    if (q.type === "check") return !r.complete && <button type="button" className="btn-ghost !py-1.5" onClick={() => goTo("progress")}>{t("board.goCheck")}</button>;
    if (q.type === "backup") return !r.complete && <button type="button" className="btn-ghost !py-1.5" onClick={() => goTo("settings")}>{t("board.goBackup")}</button>;
    return null;
  };

  return (
    <section aria-labelledby="quest-title" className="card !gap-3 relative overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="quest-title" className="h-display text-[1.35rem] leading-tight">{date === now ? t(`words.${style}.quests`) : t("board.titleDay")}</h2>
          <div className="text-xs text-muted num mt-1">
            {t("board.count", { done: day.completed, total: day.required })}
            {date === now && !day.perfect && day.required > 0 && <> · {t("board.open")}</>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`font-display text-2xl font-bold num leading-none ${day.xp > 0 ? "text-good" : "text-muted"}`}>{t("board.xp", { xp: day.xp })}</span>
          {closed && day.penalty > 0 && !saved && <span className="text-xs font-semibold text-bad num">−{day.penalty} XP</span>}
        </div>
      </div>
      {day.perfect && (
        <p className="pop-in rounded-field bg-good/15 border border-good/40 text-good font-display uppercase tracking-wide text-center py-2 text-lg flex items-center justify-center gap-2">
          <Icon name="trophy" size={20} />{t(`words.${style}.perfect`)}
        </p>
      )}
      {saved && <p className="text-sm text-accent">{t("board.saved")}</p>}
      {day.quests.length ? (
        <ul className="flex flex-col gap-2">
          {day.quests.map((r) => <QuestRow key={r.key} r={r} date={date} closed={closed} saved={saved} actions={actionsFor(r)} />)}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("board.empty")}</p>
      )}
      {questsChanged(data, date) && (
        <div className="flex items-center justify-between gap-3 text-sm rounded-field bg-raised px-3 py-2">
          <span className="text-muted">{t("board.changed")}</span>
          <button type="button" className="font-semibold text-accent py-1" onClick={() => setEntries("questDays", { [date]: null })}>{t("board.restore")}</button>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-x-5 -mb-1">
        <button type="button" className="text-sm font-semibold text-accent py-1.5 inline-flex items-center gap-1.5" onClick={onRoutine}><Icon name="edit" size={16} />{t("board.routine")}</button>
        <button type="button" className="text-sm font-semibold text-accent py-1.5 inline-flex items-center gap-1.5" onClick={onAdd}><Icon name="plus" size={16} />{t("today:add.open")}</button>
      </div>
    </section>
  );
}
