import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./ui.jsx";
import { useStore } from "../lib/store.jsx";
import { today } from "../lib/dates.js";
import { DEFAULT_STYLE, STYLES, evaluateDay, gameState } from "../lib/game.js";

const GameContext = createContext(null);

const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

/**
 * The game state for today, recomputed from the logs on every change. It also
 * starts the game on first use and records when each of today's quests was
 * completed (days[today].fatto), which deadlines are checked against.
 */
export function GameProvider({ children }) {
  const { data, patch, setGame } = useStore();
  const now = today();
  const state = useMemo(() => gameState(data, now), [data, now]);

  useEffect(() => { if (!data.game.startDate) setGame({ startDate: now }); }, [data.game.startDate, now, setGame]);

  useEffect(() => {
    const day = evaluateDay(data, now, false);
    const times = data.days[now]?.fatto || {};
    const fresh = day.quests.filter((x) => x.complete && !times[x.key]);
    if (fresh.length) patch("days", now, { fatto: { ...times, ...Object.fromEntries(fresh.map((x) => [x.key, hhmm()])) } });
  }, [data, now, patch]);

  return <GameContext.Provider value={state}>{children}</GameContext.Provider>;
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

/** The rank's emblem: a shield in the tier's colour, more ornate as tiers go up. */
export function Emblem({ tier, level, size = 56, className = "" }) {
  const stars = Math.min(3, Math.floor(tier / 2));
  return (
    <span className={`relative inline-grid place-items-center shrink-0 ${tier >= 5 ? "glow" : ""} ${className}`} style={{ ...tierVar(tier), width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 48 48" width={size} height={size} className="absolute inset-0">
        <defs>
          <linearGradient id={`em-${tier}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        {tier >= 3 && <path d="M4 14l6-6M44 14l-6-6M2 24h5M41 24h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />}
        <path d="M24 3l17 6v12c0 11-7.5 18-17 23C14.5 39 7 32 7 21V9z" fill={`url(#em-${tier})`} stroke="currentColor" strokeWidth="1.5" />
        <path d="M24 8l12 4.3V21c0 8-5.3 13.4-12 17-6.7-3.6-12-9-12-17v-8.7z" fill="rgb(var(--surface))" opacity="0.88" />
        {Array.from({ length: stars }, (_, i) => (
          <circle key={i} cx={24 + (i - (stars - 1) / 2) * 6} cy={40.5} r="1.6" fill="rgb(var(--surface))" />
        ))}
      </svg>
      <span className="relative font-display font-bold leading-none num text-ink" style={{ fontSize: size * 0.34 }}>{level}</span>
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
            <span className="text-[0.7rem] text-muted num shrink-0">{t("hud.xp", { into: g.into, need: g.need })}</span>
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

  useEffect(() => { if (shown) ref.current?.focus(); }, [shown]);
  if (!shown) return null;
  const up = shown.level > shown.from.level || (shown.level === shown.from.level && shown.tier > shown.from.tier);
  const close = () => { setGame({ seen: { level: shown.level, tier: shown.tier } }); setShown(null); };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lvl-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-6" onClick={close}>
      <div className="pop-in w-full max-w-xs rounded-card bg-surface border border-line p-6 flex flex-col items-center gap-3 text-center shadow-float" onClick={(e) => e.stopPropagation()}>
        <Emblem tier={shown.tier} level={shown.level} size={96} className={up ? "glow" : ""} />
        <h2 id="lvl-title" className="h-display text-3xl">{up ? t("levelUp.up", { n: shown.level }) : t("levelUp.down", { n: shown.level })}</h2>
        {shown.tier !== shown.from.tier && (
          <p className="font-display uppercase tracking-wide text-lg" style={tierVar(shown.tier)}>
            {shown.tier > shown.from.tier ? t("levelUp.tierUp", { rank: rank(shown.tier) }) : t("levelUp.tierDown", { rank: rank(shown.tier) })}
          </p>
        )}
        <p className="text-sm text-muted">{up ? t("levelUp.upLead") : t("levelUp.downLead")}</p>
        <button ref={ref} type="button" className="btn w-full mt-1" onClick={close}>{t("levelUp.ok")}</button>
      </div>
    </div>
  );
}
