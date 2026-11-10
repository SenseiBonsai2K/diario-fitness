import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./ui.jsx";
import { useStore } from "../lib/store.jsx";
import { QUEST_TYPES, evaluateDay, periodProgress, questsChanged } from "../lib/game.js";
import { activityLabel, findSession } from "../lib/program.js";
import { today } from "../lib/dates.js";
import { num } from "../lib/stats.js";
import { CountUp, useGame, useStyle } from "./game.jsx";

const FIELD = { steps: "passi", water: "acqua", sleep: "sonno", weigh: "peso" };

/** Accepted ranges: a value outside is a typo, never saved. */
const RANGE = { passi: [0, 100000], acqua: [0, 10], sonno: [0, 16], peso: [30, 250] };

/**
 * Number input inside a quest row. What is typed stays a draft until it is
 * confirmed (the ✓ button, Enter, or leaving the field): only then is it saved,
 * so "8" on the way to "82,4" never completes the quest or unlocks anything.
 */
function QuestInput({ label, unit, value, onChange, field, decimal = true }) {
  const { t } = useTranslation("game");
  const id = useId();
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (value ?? "");
  const n = num(draft);
  const [lo, hi] = RANGE[field] || [0, Infinity];
  const dirty = draft !== null && draft !== (value ?? "");
  const valid = draft === "" || (n !== null && n >= lo && n <= hi);
  const commit = () => {
    if (!dirty) { setDraft(null); return; }
    if (!valid) return;
    onChange(draft.trim());
    setDraft(null);
  };
  return (
    <span className="flex flex-col items-end gap-1 shrink-0">
      <span className="flex items-center gap-1.5">
        <label htmlFor={id} className="sr-only">{label}</label>
        <input
          id={id}
          className={`input font-mono !w-[5.5rem] !py-1.5 text-right ${dirty && !valid ? "!border-bad" : ""}`}
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          enterKeyHint="done"
          autoComplete="off"
          value={shown}
          aria-invalid={dirty && !valid}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); e.currentTarget.blur(); } if (e.key === "Escape") setDraft(null); }}
          onBlur={commit}
        />
        {unit && <span className="text-xs text-muted font-mono w-6">{unit}</span>}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          disabled={!dirty || !valid}
          aria-label={t("board.confirm", { what: label })}
          className={`w-9 h-9 grid place-items-center rounded-full border transition-colors ${dirty && valid ? "bg-accent border-accent text-accent-ink" : "border-line text-muted opacity-40"}`}
        >
          <Icon name="check" size={16} />
        </button>
      </span>
      {dirty && !valid && <span role="alert" className="text-[0.65rem] text-bad">{t("board.outOfRange", { lo, hi: hi === Infinity ? "—" : hi })}</span>}
      {dirty && valid && <span className="text-[0.65rem] text-accent">{t("board.toConfirm")}</span>}
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
  const stars = base >= 100 ? 3 : base >= 30 ? 2 : 1;
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
  // The moment a quest turns complete: a flash, the check pops and "+XP" floats up.
  const was = useRef(r.complete);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (r.complete && !was.current) { setFlash(true); const id = setTimeout(() => setFlash(false), 1100); was.current = true; return () => clearTimeout(id); }
    was.current = r.complete;
    return undefined;
  }, [r.complete]);
  return (
    <li className={`quest-card relative ${r.complete ? "quest-done" : failed && !saved ? "quest-failed" : ""} ${flash ? "quest-flash" : ""}`}>
      {flash && r.xp > 0 && <span aria-hidden="true" className="xp-float font-display font-bold text-good">+{r.xp} XP</span>}
      {r.complete && <span aria-hidden="true" className="quest-stamp font-display">{t("board.status_done")}</span>}
      {failed && !saved && <span aria-hidden="true" className="quest-stamp quest-stamp-bad font-display">{t("board.status_failed")}</span>}
      <div className="flex items-start gap-3">
        <span className={`quest-icon ${flash ? "check-pop" : ""}`}><Icon name={r.complete ? "check" : meta.icon} size={22} /></span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="quest-title font-display">{name}</span>
            {q.bonus && <span className="quest-tag quest-tag-bonus">{t("board.bonus")}</span>}
          </span>
          <span className="flex items-center gap-2 mt-0.5">
            <span className="quest-stars" aria-label={`${t("board.difficulty")} ${stars}/3`}>{"★".repeat(stars)}<span className="opacity-25">{"★".repeat(3 - stars)}</span></span>
            {q.deadline && <span className={`text-[0.65rem] font-semibold num ${r.late ? "text-warn" : "text-muted"}`}>{r.late ? t("board.late") : t("board.deadline", { time: q.deadline })}</span>}
          </span>
          <span className="block text-xs text-muted num truncate mt-0.5">{hint}</span>
        </span>
        <span className={`quest-reward ${r.xp > 0 ? "quest-reward-earned" : failed && !saved ? "quest-reward-lost" : ""}`}>
          <Icon name="bolt" size={13} />
          <span className="num">{r.xp > 0 ? `+${r.xp}` : failed && !saved ? `−${r.penalty}` : base}</span>
          <span className="text-[0.6rem] opacity-80">XP</span>
        </span>
      </div>
      {(q.type !== "weigh" && q.type !== "check" && q.type !== "backup") && (
        <div className={`seg-bar ${r.complete ? "seg-bar-done" : ""}`} aria-hidden="true"><span style={{ width: `${pct * 100}%` }} /></div>
      )}
      {(field || actions) && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {actions}
          {field && (
            <QuestInput
              field={field}
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
  const { t, i18n } = useTranslation("game");
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
          <span className={`font-display text-2xl font-bold leading-none ${day.xp > 0 ? "text-good" : "text-muted"}`}>+<CountUp value={day.xp} /> XP</span>
          {closed && day.penalty > 0 && !saved && <span className="text-xs font-semibold text-bad num">−{day.penalty} XP</span>}
        </div>
      </div>
      {g?.notStarted && (
        <p className="rounded-field border border-accent/40 bg-accent-soft px-3 py-2 text-sm">
          {t("hero.preview", { date: new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${g.startDate}T12:00:00`)) })}
        </p>
      )}
      {day.perfect && (
        <p className="pop-in rounded-field bg-good/15 border border-good/40 text-good font-display uppercase tracking-wide text-center py-2 text-lg flex items-center justify-center gap-2">
          <Icon name="trophy" size={20} />{t(`words.${style}.perfect`)}
        </p>
      )}
      {saved && <p className="text-sm text-accent">{t("board.saved")}</p>}
      {day.quests.length ? (
        <ul className="flex flex-col gap-2.5">
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

function PeriodRow({ icon, name, hint, xp, done, failed, pct }) {
  const { t } = useTranslation("game");
  return (
    <li className={`flex flex-col gap-1.5 rounded-field border px-3 py-2.5 ${done ? "border-good/40 bg-good/5" : failed ? "border-line/50 opacity-60" : "border-line/70"}`}>
      <div className="flex items-center gap-3">
        <Icon name={done ? "check" : icon} size={18} className={done ? "text-good shrink-0" : "text-muted shrink-0"} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold leading-tight">{name}</span>
          <span className="block text-xs text-muted num">{hint}</span>
        </span>
        <span className={`font-display font-bold num shrink-0 ${done ? "text-good" : "text-muted text-sm"}`}>{done ? t("board.xp", { xp }) : t("board.worth", { xp })}</span>
      </div>
      {pct !== undefined && !done && <div className="bar !h-1" aria-hidden="true"><span style={{ width: `${Math.min(1, pct) * 100}%` }} /></div>}
    </li>
  );
}

/** This week's and month's quests and the bosses: they only earn XP, missing them costs nothing. */
export function PeriodQuests() {
  const { t, i18n } = useTranslation("game");
  const { data } = useStore();
  const g = useGame();
  if (!g) return null;
  const p = periodProgress(data, g, today());
  const n = (v) => (v ?? 0).toLocaleString(i18n.language, { maximumFractionDigits: 0 });
  const [lifts, steps, perfect] = p.week;
  const [check, constancy] = p.month;
  return (
    <section className="card !gap-2.5" aria-labelledby="period-title">
      <h2 id="period-title" className="eyebrow">{t("extra.week")}</h2>
      <ul className="flex flex-col gap-2">
        <PeriodRow icon="dumbbell" name={t("extra.allLifts")} hint={lifts.target ? t("extra.allLiftsHint", { value: lifts.value, target: lifts.target }) : t("extra.noLifts")} xp={lifts.xp} done={lifts.done} pct={lifts.target ? lifts.value / lifts.target : 0} />
        <PeriodRow icon="steps" name={t("extra.weekSteps")} hint={steps.target ? t("extra.weekStepsHint", { value: n(steps.value), target: n(steps.target) }) : t("extra.noSteps")} xp={steps.xp} done={steps.done} pct={steps.target ? steps.value / steps.target : 0} />
        <PeriodRow icon="trophy" name={t("extra.perfectWeek")} hint={perfect.failed ? t("extra.perfectWeekLost") : t("extra.perfectWeekHint", { value: perfect.value })} xp={perfect.xp} done={perfect.done} failed={perfect.failed} pct={perfect.value / 7} />
      </ul>
      <h2 className="eyebrow mt-1">{t("extra.month")}</h2>
      <ul className="flex flex-col gap-2">
        <PeriodRow icon="scale" name={t("extra.monthCheck")} hint={t("extra.monthCheckHint")} xp={check.xp} done={check.done} />
        <PeriodRow icon="star" name={t("extra.monthConstancy")} hint={t("extra.monthConstancyHint", { value: constancy.value === null ? "—" : `${Math.round(constancy.value * 100)}%` })} xp={constancy.xp} done={constancy.done} pct={constancy.value === null ? 0 : constancy.value / constancy.target} />
      </ul>
      <h2 className="eyebrow mt-1">{t("extra.boss")}</h2>
      <ul className="flex flex-col gap-2">
        <PeriodRow icon="flame" name={t("extra.streakBoss", { n: p.boss.nextStreak })} hint={t("extra.streakBossHint", { streak: p.boss.streak, left: p.boss.nextStreak - p.boss.streak })} xp={p.boss.xp} pct={p.boss.streak / p.boss.nextStreak} />
        <PeriodRow icon="bolt" name={t("extra.prBoss")} hint={t("extra.prBossHint", { xp: p.boss.prXp, count: p.boss.prs })} xp={p.boss.prXp} />
      </ul>
    </section>
  );
}
