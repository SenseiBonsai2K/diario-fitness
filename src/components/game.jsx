import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./ui.jsx";
import { useStore } from "../lib/store.jsx";
import { today } from "../lib/dates.js";
import { DEFAULT_STYLE, STYLES, QUEST_TYPES, evaluateDay, gameState, startMonday } from "../lib/game.js";
import { feedback } from "../lib/sfx.js";
import { StyleEmblem } from "./emblems.jsx";
import { Burst } from "./fx.jsx";
import { activityLabel, exerciseNames } from "../lib/program.js";

const GameContext = createContext(null);
const ToastContext = createContext(() => {});

/** Pops a short message at the top: { kind, title, sub, xp }. */
export function useToast() {
  return useContext(ToastContext);
}

const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

/**
 * The game state for today, recomputed from the logs on every change. It also
 * starts the game on first use and records when each of today's quests was
 * completed (days[today].fatto), which deadlines are checked against.
 */
export function GameProvider({ children }) {
  const { data, patch, setGame } = useStore();
  const { t } = useTranslation("game");
  const now = today();
  const state = useMemo(() => gameState(data, now), [data, now]);
  const [toasts, setToasts] = useState([]);
  const prefs = useRef(data.prefs);
  prefs.current = data.prefs;
  const style = STYLES.includes(data.prefs.style) ? data.prefs.style : DEFAULT_STYLE;

  const toast = useCallback((x) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-2), { ...x, id }]);
    setTimeout(() => setToasts((list) => list.filter((y) => y.id !== id)), x.ms || 3200);
  }, []);

  // The game starts on the next Monday (or today, if it is one), with a whole new week.
  useEffect(() => {
    const want = startMonday(data.game.startDate || now);
    if (data.game.startDate !== want) setGame({ startDate: want });
  }, [data.game.startDate, now, setGame]);

  // Today's quests as they get done: record the time (deadlines are checked
  // against it) and celebrate. The first look at a day only takes note of what
  // is already done, so opening the app or importing a backup stays quiet.
  const seen = useRef(null);
  useEffect(() => {
    const day = evaluateDay(data, now, false);
    const times = data.days[now]?.fatto || {};
    const fresh = day.quests.filter((x) => x.complete && !times[x.key]);
    if (fresh.length) patch("days", now, { fatto: { ...times, ...Object.fromEntries(fresh.map((x) => [x.key, hhmm()])) } });

    const done = new Set(day.quests.filter((x) => x.complete).map((x) => x.key));
    const before = seen.current?.date === now ? seen.current : null;
    seen.current = { date: now, done, perfect: day.perfect };
    if (!before || state.notStarted) return;
    const newly = day.quests.filter((x) => x.complete && !before.done.has(x.key));
    if (!newly.length) return;
    if (day.perfect && !before.perfect) {
      toast({ kind: "perfect", title: t(`words.${style}.perfect`), xp: day.xp, ms: 4200 });
      feedback("perfect", prefs.current);
    } else if (newly.length > 2) {
      toast({ kind: "quest", title: t("toast.many", { count: newly.length }) });
      feedback("quest", prefs.current);
    } else {
      for (const x of newly) {
        const name = x.quest.type === "workout" ? activityLabel(data, x.quest.session, t) : t(`quest.${x.quest.type}`);
        toast({ kind: "quest", icon: QUEST_TYPES[x.quest.type].icon, title: t(`words.${style}.questDone`), sub: name, xp: x.xp });
      }
      feedback("quest", prefs.current);
    }
  }, [data, now, patch, toast, t, style, state.notStarted]);

  // Weekly / monthly / boss quests, records and trophies earned since the last look.
  const known = useRef(null);
  useEffect(() => {
    const evKeys = new Set(state.events.map((e) => `${e.kind}|${e.date}|${e.period || e.exercise || e.n || ""}`));
    const badgeKeys = new Set(state.badges.filter((b) => b.unlocked).map((b) => b.id));
    const before = known.current;
    known.current = { evKeys, badgeKeys };
    if (!before) return;
    const names = exerciseNames(data);
    const fresh = state.events.filter((e) => e.date === now && !before.evKeys.has(`${e.kind}|${e.date}|${e.period || e.exercise || e.n || ""}`));
    // Many at once means a backup was just loaded: stay quiet.
    const freshBadges = state.badges.filter((b) => b.unlocked && !before.badgeKeys.has(b.id));
    if (fresh.length + freshBadges.length > 3) return;
    for (const e of fresh) {
      if (e.kind === "pr") {
        toast({ kind: "pr", title: t(`words.${style}.pr`), sub: t("events.pr", { exercise: names[e.exercise] || e.exercise, value: e.value }), xp: e.xp, ms: 4500 });
        feedback("pr", prefs.current);
      } else {
        toast({ kind: "perfect", title: t(`events.${e.kind}`, { n: e.n }), xp: e.xp, ms: 4000 });
        feedback("perfect", prefs.current);
      }
    }
    for (const b of freshBadges) {
      toast({ kind: "badge", title: t(`words.${style}.badge`), sub: t(`badges.${b.id}.name`), ms: 4500 });
      feedback("pr", prefs.current);
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GameContext.Provider value={state}>
      <ToastContext.Provider value={toast}>
        {children}
        <Toasts list={toasts} onClose={(id) => setToasts((l) => l.filter((y) => y.id !== id))} />
      </ToastContext.Provider>
    </GameContext.Provider>
  );
}

function Toasts({ list, onClose }) {
  const { t } = useTranslation("game");
  return (
    <div aria-live="polite" className="fixed left-1/2 -translate-x-1/2 top-[max(10px,env(safe-area-inset-top))] z-40 w-[min(92vw,26rem)] flex flex-col gap-2 pointer-events-none">
      {list.map((x) => (
        <div key={x.id} className="toast-in pointer-events-auto rounded-card border border-accent/50 bg-surface/95 backdrop-blur shadow-float px-4 py-3 flex items-center gap-3">
          <span className={`w-9 h-9 shrink-0 rounded-full grid place-items-center ${x.kind === "pr" ? "bg-warn/20 text-warn" : x.kind === "badge" ? "bg-accent-soft text-accent" : "bg-good/20 text-good"}`}>
            <Icon name={x.kind === "pr" ? "bolt" : x.kind === "badge" ? "trophy" : x.kind === "perfect" ? "trophy" : x.icon || "check"} size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display uppercase tracking-wide leading-tight">{x.title}</span>
            {x.sub && <span className="block text-xs text-muted truncate">{x.sub}</span>}
          </span>
          {x.xp > 0 && <span className="font-display font-bold text-good num shrink-0">{t("toast.xp", { xp: x.xp })}</span>}
          <button type="button" onClick={() => onClose(x.id)} aria-label={t("toast.close")} className="w-7 h-7 -mr-1 grid place-items-center text-muted shrink-0"><Icon name="close" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function useGame() {
  return useContext(GameContext);
}

export function useStyle() {
  const { data } = useStore();
  return STYLES.includes(data.prefs.style) ? data.prefs.style : DEFAULT_STYLE;
}

export function useRankName() {
  const { t } = useTranslation("game");
  const style = useStyle();
  return (tier) => t(`ranks.${style}.${tier}`);
}

const tierVar = (tier) => ({ "--tier-color": `var(--tier-${tier})`, color: `rgb(var(--tier-${tier}))` });

/** The rank emblem in the current style (see emblems.jsx). */
export function Emblem({ tier, level, size = 56, className = "" }) {
  const style = useStyle();
  return (
    <span className={`relative inline-grid place-items-center shrink-0 ${tier >= 5 ? "glow" : ""} ${className}`} style={{ ...tierVar(tier), width: size, height: size }} aria-hidden="true">
      <StyleEmblem style={style} tier={tier} level={level} size={size} />
    </span>
  );
}

export function XpBar({ into, need, tier, label }) {
  const pct = need ? Math.min(100, (into / need) * 100) : 0;
  return (
    <div className="xp-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={need} aria-valuenow={into} style={tierVar(tier)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Always-visible bar at the top: emblem, level, rank, XP and streak. */
export function Hud({ onProfile, onSettings }) {
  const { t } = useTranslation("game");
  const g = useGame();
  const rank = useRankName();
  if (!g) return null;
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onProfile} aria-label={t("hud.open")} className="flex-1 min-w-0 flex items-center gap-3 rounded-card bg-surface border border-line/70 shadow-card px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Emblem tier={g.tier} level={g.level} size={44} />
        <span className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-display font-semibold uppercase tracking-wide text-[1.05rem] leading-none truncate" style={tierVar(g.tier)}>{rank(g.tier)}</span>
            <span className="text-[0.7rem] text-muted num shrink-0">{t("hud.level", { n: g.level })} · {t("hud.xp", { into: g.into, need: g.need })}</span>
          </span>
          <XpBar into={g.into} need={g.need} tier={g.tier} label={t("hud.level", { n: g.level })} />
        </span>
        <span className="flex flex-col items-end gap-0.5 shrink-0" title={t("hud.streak", { n: g.streak })}>
          <span className={`inline-flex items-center gap-0.5 text-sm font-bold num ${g.streak ? "text-warn" : "text-muted"}`}><Icon name="flame" size={16} filled={g.streak > 0} />{g.streak}</span>
          {g.jolly > 0 && <span className="inline-flex items-center gap-0.5 text-[0.7rem] font-semibold text-accent num"><Icon name="star" size={12} filled />{g.jolly}</span>}
          <span className="sr-only">{t("hud.streak", { n: g.streak })}{g.jolly ? ` · ${t("hud.jolly", { n: g.jolly })}` : ""}</span>
        </span>
      </button>
      <button type="button" onClick={onSettings} aria-label={t("hud.settings")} className="w-11 h-11 shrink-0 rounded-full border border-line bg-surface shadow-card grid place-items-center text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Icon name="gear" />
      </button>
    </div>
  );
}

/**
 * Announces a level or rank change (up or down) once: data.game.seen keeps
 * what was last shown. The first time, it only records the current state.
 */
export function LevelUp() {
  const { t } = useTranslation("game");
  const { data, setGame } = useStore();
  const g = useGame();
  const rank = useRankName();
  const seen = data.game.seen;
  const ref = useRef(null);
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (!g || !data.game.startDate) return;
    if (!seen) { setGame({ seen: { level: g.level, tier: g.tier } }); return; }
    if (seen.level !== g.level || seen.tier !== g.tier) setShown({ from: seen, level: g.level, tier: g.tier });
  }, [g?.level, g?.tier, seen, data.game.startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useStyle();
  const up = shown ? shown.level > shown.from.level || (shown.level === shown.from.level && shown.tier > shown.from.tier) : false;
  useEffect(() => {
    if (!shown) return;
    ref.current?.focus();
    feedback(up ? "levelUp" : "levelDown", data.prefs);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  const close = () => { setGame({ seen: { level: shown.level, tier: shown.tier } }); setShown(null); };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lvl-title" className={`levelup fixed inset-0 z-50 grid place-items-center p-6 ${up ? "levelup-up" : "levelup-down"}`} onClick={close} style={tierVar(shown.tier)}>
      <div className="levelup-rays" aria-hidden="true" />
      <div className="relative w-full max-w-xs flex flex-col items-center gap-3 text-center" onClick={(e) => e.stopPropagation()}>
        <span className="levelup-emblem relative grid place-items-center">
          {up && <Burst count={28} color={`rgb(var(--tier-${shown.tier}))`} />}
          <Emblem tier={shown.tier} level={shown.level} size={170} />
        </span>
        <h2 id="lvl-title" className="levelup-title h-display text-[2.6rem] leading-none text-gradient">{up ? t(`words.${style}.levelUp`, { n: shown.level }) : t(`words.${style}.levelDown`, { n: shown.level })}</h2>
        {shown.tier !== shown.from.tier && (
          <p className="levelup-rank font-display uppercase tracking-[0.2em] text-xl" style={tierVar(shown.tier)}>
            {shown.tier > shown.from.tier ? t("levelUp.tierUp", { rank: rank(shown.tier) }) : t("levelUp.tierDown", { rank: rank(shown.tier) })}
          </p>
        )}
        <p className="levelup-lead text-sm text-ink/80">{up ? t("levelUp.upLead") : t("levelUp.downLead")}</p>
        <button ref={ref} type="button" className="levelup-btn btn w-full mt-3" onClick={close}>{t("levelUp.ok")}</button>
      </div>
    </div>
  );
}

/**
 * The big panel on top of the quest screen: emblem inside an XP ring, rank,
 * level, streak, jolly and today's haul. Before the first Monday it counts down.
 */
export function QuestHero({ onProfile }) {
  const { t, i18n } = useTranslation("game");
  const g = useGame();
  const rank = useRankName();
  const style = useStyle();
  if (!g) return null;
  const pct = g.need ? g.into / g.need : 0;
  const R = 74, C = 2 * Math.PI * R;
  const day = g.today;
  const start = new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${g.startDate}T12:00:00`));
  return (
    <section className={`hero hero-${style}`} style={tierVar(g.tier)} aria-label={t("hud.open")}>
      <div className="hero-glow" aria-hidden="true" />
      <button type="button" onClick={onProfile} className="relative w-full flex flex-col items-center gap-2 pt-6 pb-5 px-4 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-card">
        <span className="relative grid place-items-center" style={{ width: 176, height: 176 }}>
          <svg viewBox="0 0 176 176" width="176" height="176" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="88" cy="88" r={R} fill="none" stroke="rgb(var(--ink) / 0.08)" strokeWidth="6" />
            <circle cx="88" cy="88" r={R} fill="none" stroke="url(#hero-xp)" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} className="hero-ring" />
            <defs>
              <linearGradient id="hero-xp" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="rgb(var(--accent))" />
                <stop offset="1" stopColor={`rgb(var(--tier-${g.tier}))`} />
              </linearGradient>
            </defs>
          </svg>
          <span className="hero-emblem"><Emblem tier={g.tier} level={g.level} size={128} /></span>
        </span>
        <span className={`hero-rank font-display text-[2.3rem] leading-none text-gradient ${style === "cyber" ? "glitch" : ""}`} data-text={rank(g.tier)}>{rank(g.tier)}</span>
        <span className="text-sm text-muted num">{t("hud.level", { n: g.level })} · {t("hud.xp", { into: g.into, need: g.need })}</span>
        {g.notStarted ? (
          <span className="hero-countdown mt-1 rounded-full px-4 py-1.5 text-sm font-semibold">
            {t("hero.startsOn", { date: start, count: g.daysToStart })}
          </span>
        ) : (
          <span className="flex items-center gap-2 mt-1 flex-wrap justify-center">
            <span className={`hero-chip ${g.streak ? "hero-chip-hot" : ""}`}><Icon name="flame" size={16} filled={g.streak > 0} /><span className="num">{g.streak}</span><span className="sr-only">{t("hud.streak", { n: g.streak })}</span></span>
            <span className="hero-chip"><Icon name="star" size={15} filled={g.jolly > 0} /><span className="num">{g.jolly}</span><span className="sr-only">{t("hud.jolly", { n: g.jolly })}</span></span>
            <span className="hero-chip hero-chip-xp"><Icon name="bolt" size={15} /><span className="num">+{day.xp}</span> XP</span>
          </span>
        )}
      </button>
    </section>
  );
}
