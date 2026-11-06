import { useTranslation } from "react-i18next";
import { useStore } from "../lib/store.jsx";
import { exerciseNames } from "../lib/program.js";
import { Card, Grid, Icon, Stat } from "../components/ui.jsx";
import { Emblem, XpBar, useGame, useRankName } from "../components/game.jsx";
import { JOLLY_EVERY, MAX_JOLLY, QUEST_TYPES, TIER_LEVELS } from "../lib/game.js";
import { fmtDate, parseIso } from "../lib/dates.js";

const pct = (v) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
const tone = (v) => (v === null || v === undefined ? undefined : v >= 0.85 ? "good" : v >= 0.7 ? undefined : v >= 0.5 ? "warn" : "bad");

/** Level, rank, XP, streak, jolly and constancy: the player's sheet. */
function StatBar({ label, value, hint, icon }) {
  return (
    <li className="flex items-center gap-3">
      <Icon name={icon} size={20} className="text-accent shrink-0" />
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-display uppercase tracking-wide leading-none">{label}</span>
          <span className="font-display font-bold text-xl num leading-none">{value}</span>
        </span>
        <span className="xp-bar !h-1.5" aria-hidden="true"><span style={{ width: `${value}%` }} /></span>
        <span className="text-[0.7rem] text-muted num">{hint}</span>
      </span>
    </li>
  );
}

export default function Profile({ onRoutine }) {
  const { t, i18n } = useTranslation("game");
  const { data, setGame } = useStore();
  const g = useGame();
  const rank = useRankName();
  const lang = i18n.language;
  if (!g) return null;
  const last7 = g.days.slice(-7);
  const maxXp = Math.max(1, ...last7.map((d) => Math.max(d.xp, d.penalty)));
  const types = Object.keys(QUEST_TYPES).filter((k) => g.perType[k]);
  const unlocked = g.badges.filter((b) => b.unlocked);
  const names = exerciseNames(data);

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
        {data.game.title && g.badges.find((b) => b.id === data.game.title && b.unlocked) && (
          <span className="text-sm italic text-accent">«{t(`badges.${data.game.title}.title`)}»</span>
        )}
        {g.notStarted && <p className="text-sm text-accent max-w-xs">{t("hero.notStartedProfile", { date: fmtDate(g.startDate, lang, { weekday: "long", day: "numeric", month: "long" }) })}</p>}
        <span className="text-[0.7rem] text-muted mt-1">{t("profile.since", { date: fmtDate(g.startDate, lang, { day: "numeric", month: "long", year: "numeric" }) })}</span>
      </section>

      <Card title={t("stats.title")}>
        <ul className="flex flex-col gap-3">
          <StatBar icon="dumbbell" label={t("stats.strength")} value={g.stats.strength.value} hint={t("stats.strengthHint", { lifts: g.stats.strength.lifts, prs: g.stats.strength.prs })} />
          <StatBar icon="steps" label={t("stats.endurance")} value={g.stats.endurance.value} hint={t("stats.enduranceHint", { steps: g.stats.endurance.steps.toLocaleString(lang) })} />
          <StatBar icon="star" label={t("stats.discipline")} value={g.stats.discipline.value} hint={t("stats.disciplineHint", { perfect: g.stats.discipline.perfect, diet: g.stats.discipline.diet })} />
        </ul>
      </Card>

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

      <Card title={t("achievements.title")} aside={<span className="text-xs text-muted num">{t("achievements.count", { done: unlocked.length, total: g.badges.length })}</span>}>
        <div className="flex flex-col gap-1.5">
          <span id="title-label" className="label">{t("achievements.titleLabel")}</span>
          <div role="radiogroup" aria-labelledby="title-label" className="flex flex-wrap gap-1.5">
            <button type="button" role="radio" aria-checked={!data.game.title} className="chip !min-h-[34px] !text-xs" onClick={() => setGame({ title: null })}>{t("achievements.noTitle")}</button>
            {unlocked.map((b) => (
              <button key={b.id} type="button" role="radio" aria-checked={data.game.title === b.id} className="chip !min-h-[34px] !text-xs" onClick={() => setGame({ title: b.id })}>{t(`badges.${b.id}.title`)}</button>
            ))}
          </div>
          <p className="text-xs text-muted">{t("achievements.titleHint")}</p>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {g.badges.map((b) => (
            <li key={b.id} className={`rounded-field border p-2.5 flex items-start gap-2 ${b.unlocked ? "border-accent/50 bg-accent-soft" : "border-line/60 opacity-55"}`}>
              <span className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${b.unlocked ? "bg-accent text-accent-ink" : "bg-raised text-muted"}`}><Icon name={b.unlocked ? b.icon : "shield"} size={16} /></span>
              <span className="min-w-0">
                <span className="block text-[0.8rem] font-semibold leading-tight">{t(`badges.${b.id}.name`)}</span>
                <span className="block text-[0.68rem] text-muted leading-snug">{t(`badges.${b.id}.desc`)}</span>
              </span>
              <span className="sr-only">{b.unlocked ? "" : t("achievements.locked")}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("records.title")}>
        {g.prs.length ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {g.prs.slice(-6).reverse().map((p) => (
              <li key={`${p.date}-${p.exercise}`} className="flex items-start gap-2">
                <Icon name="bolt" size={16} className="text-warn mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="text-xs text-muted num">{fmtDate(p.date, lang)} · </span>
                  {t("records.line", { exercise: names[p.exercise] || p.exercise, kg: p.kg, reps: p.reps, value: p.value, previous: p.previous })}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">{t("records.empty")}</p>}
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
          {["rule1", "rule2", "rule3", "rule4", "rule5"].map((k) => <li key={k}>{t(`profile.${k}`)}</li>)}
        </ul>
      </Card>
    </>
  );
}
