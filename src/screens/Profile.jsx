import { useTranslation } from "react-i18next";
import { Card, Grid, Icon, Stat } from "../components/ui.jsx";
import { Emblem, XpBar, useGame, useRankName } from "../components/game.jsx";
import { JOLLY_EVERY, MAX_JOLLY, QUEST_TYPES, TIER_LEVELS } from "../lib/game.js";
import { fmtDate, parseIso } from "../lib/dates.js";

const pct = (v) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
const tone = (v) => (v === null || v === undefined ? undefined : v >= 0.85 ? "good" : v >= 0.7 ? undefined : v >= 0.5 ? "warn" : "bad");

/** Level, rank, XP, streak, jolly and constancy: the player's sheet. */
export default function Profile({ onRoutine }) {
  const { t, i18n } = useTranslation("game");
  const g = useGame();
  const rank = useRankName();
  const lang = i18n.language;
  if (!g) return null;
  const last7 = g.days.slice(-7);
  const maxXp = Math.max(1, ...last7.map((d) => Math.max(d.xp, d.penalty)));
  const types = Object.keys(QUEST_TYPES).filter((k) => g.perType[k]);

  return (
    <>
      <section className="card items-center text-center !gap-2 !py-6" style={{ "--tier-color": `var(--tier-${g.tier})` }}>
        <Emblem tier={g.tier} level={g.level} size={112} />
        <div className="h-display text-[2.2rem] mt-2" style={{ color: `rgb(var(--tier-${g.tier}))` }}>{rank(g.tier)}</div>
        <div className="text-sm text-muted">{t("hud.level", { n: g.level })} · <span className="num">{g.xp.toLocaleString(lang)}</span> XP</div>
        {g.tier < g.baseTier && <p className="text-xs text-warn max-w-xs">{t("profile.rankDown", { rank: rank(g.baseTier) })}</p>}
        <div className="w-full max-w-xs mt-2 flex flex-col gap-1">
          <XpBar into={g.into} need={g.need} tier={g.tier} label={t("hud.level", { n: g.level })} />
          <span className="text-xs text-muted num">{t("profile.toNext", { xp: g.need - g.into, n: g.level + 1 })}</span>
        </div>
        <span className="text-[0.7rem] text-muted mt-1">{t("profile.since", { date: fmtDate(g.startDate, lang, { day: "numeric", month: "long", year: "numeric" }) })}</span>
      </section>

      <Card title={t("profile.streak")}>
        <Grid cols={3}>
          <Stat label={t("profile.streak")} value={<span className="inline-flex items-center gap-1 text-warn"><Icon name="flame" size={22} filled={g.streak > 0} />{g.streak}</span>} sub={t("profile.days", { count: g.streak })} />
          <Stat label={t("profile.best")} value={g.best} sub={t("profile.days", { count: g.best })} />
          <Stat label={t("profile.jolly")} value={<span className="inline-flex items-center gap-1 text-accent"><Icon name="star" size={20} filled={g.jolly > 0} />{g.jolly}/{MAX_JOLLY}</span>} />
        </Grid>
        <p className="text-xs text-muted">{t("profile.jollyHint", { every: JOLLY_EVERY, max: MAX_JOLLY })}</p>
      </Card>

      <Card title={t("profile.constancy")}>
        <Grid cols={3}>
          <Stat label={t("profile.week")} value={pct(g.constancy.week)} tone={tone(g.constancy.week)} />
          <Stat label={t("profile.month")} value={pct(g.constancy.month)} tone={tone(g.constancy.month)} />
          <Stat label={t("profile.all")} value={pct(g.constancy.all)} tone={tone(g.constancy.all)} />
        </Grid>
        {types.length > 0 && (
          <>
            <h3 className="eyebrow mt-1">{t("profile.perQuest")}</h3>
            <ul className="flex flex-col gap-2">
              {types.map((k) => {
                const p = g.perType[k];
                return (
                  <li key={k} className="flex items-center gap-3 text-sm">
                    <Icon name={QUEST_TYPES[k].icon} size={18} className="text-muted shrink-0" />
                    <span className="w-32 shrink-0 truncate">{t(`quest.${k}`)}</span>
                    <span className="bar flex-1" aria-hidden="true"><span style={{ width: `${(p.ratio || 0) * 100}%` }} /></span>
                    <span className="w-24 text-right num text-muted shrink-0">{pct(p.ratio)} · {p.done}/{p.total}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <Card title={t("profile.last7")}>
        <div className="grid grid-cols-7 gap-1.5 items-end h-28" role="list">
          {last7.map((d) => {
            const net = d.xp - (d.saved ? 0 : d.penalty);
            return (
              <div key={d.date} role="listitem" className="flex flex-col items-center gap-1 h-full justify-end" aria-label={`${fmtDate(d.date, lang)}: ${net} XP`}>
                <span className={`text-[0.6rem] font-semibold num ${net < 0 ? "text-bad" : "text-muted"}`}>{net}</span>
                <span className={`w-full rounded-t ${d.perfect ? "bg-good" : net < 0 ? "bg-bad/70" : "bg-accent/70"}`} style={{ height: `${Math.max(4, (Math.abs(net) / maxXp) * 80)}%` }} />
                <span className="text-[0.6rem] text-muted uppercase">{new Intl.DateTimeFormat(lang, { weekday: "narrow" }).format(parseIso(d.date))}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <button type="button" className="btn w-full" onClick={onRoutine}><Icon name="edit" size={18} />{t("profile.editRoutine")}</button>

      <Card title={t("profile.ranks")}>
        <ol className="flex flex-col gap-2">
          {TIER_LEVELS.map((lv, i) => (
            <li key={i} className={`flex items-center gap-3 ${i === g.tier ? "" : "opacity-60"}`}>
              <Emblem tier={i} level={lv} size={36} />
              <span className="font-display uppercase tracking-wide text-lg leading-none flex-1" style={{ color: `rgb(var(--tier-${i}))` }}>{rank(i)}</span>
              <span className="text-xs text-muted">{t("profile.fromLevel", { n: lv })}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title={t("profile.rules")}>
        <ul className="flex flex-col gap-1.5 text-sm list-disc pl-5">
          {["rule1", "rule2", "rule3", "rule4"].map((k) => <li key={k}>{t(`profile.${k}`)}</li>)}
        </ul>
      </Card>
    </>
  );
}
