import { storeKey } from "./lib/ns.js";
import { useEffect, useLayoutEffect, useState } from "react";
import { applyAppearance } from "./lib/themes-apply.js";
import { useTranslation } from "react-i18next";
import { Icon } from "./components/ui.jsx";
import { today } from "./lib/dates.js";
import { useStore } from "./lib/store.jsx";
import { hasLogs, hasPlan } from "./lib/storage.js";
import { weeklySnapshot } from "./lib/snapshots.js";
import Today from "./screens/Today.jsx";
import Workout from "./screens/Workout.jsx";
import Progress from "./screens/Progress.jsx";
import Plan from "./screens/Plan.jsx";
import Settings from "./screens/Settings.jsx";
import Profile from "./screens/Profile.jsx";
import Routine from "./screens/Routine.jsx";
import { Hud, LevelUp, useGame, useRankName, useStyle } from "./components/game.jsx";
import { Backdrop, Splash } from "./components/fx.jsx";
import { NotifySync } from "./components/Notifications.jsx";

// The dock: the quest screen is the big button in the middle.
const DOCK = [
  { id: "workout", icon: "dumbbell" },
  { id: "progress", icon: "chart" },
  { id: "today", icon: "shield" },
  { id: "plan", icon: "book" },
  { id: "profile", icon: "user" },
];

function readTab() {
  try { return sessionStorage.getItem(storeKey("tab")) || "today"; } catch { return "today"; }
}

export default function App() {
  const { t } = useTranslation();
  const { saveError, data } = useStore();
  const { bg, accent, theme, style } = data.prefs;
  useLayoutEffect(() => {
    const prefs = { bg, accent, theme, style };
    applyAppearance(prefs);
    // "Automatic" follows the phone switching between light and dark.
    let q = null;
    try { q = window.matchMedia("(prefers-color-scheme: dark)"); } catch { /* not supported */ }
    const on = () => applyAppearance(prefs);
    q?.addEventListener?.("change", on);
    return () => q?.removeEventListener?.("change", on);
  }, [bg, accent, theme, style]);
  // One automatic copy a week, taken when the app is opened (see Settings → Automatic copies).
  useEffect(() => { weeklySnapshot(data, hasLogs(data) || hasPlan(data)); }, []); // once per opening, with the data loaded at start

  const [tab, setTab] = useState(readTab);
  const g = useGame();
  const gameStyle = useStyle();
  const rank = useRankName();
  const { t: tg, i18n } = useTranslation("game");
  const startLabel = g ? new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${g.startDate}T12:00:00`)) : "";
  const splashLine = !g ? "" : g.notStarted ? tg("splash.starts", { date: startLabel }) : tg("splash.quests", { count: g.today.required });
  const [date, setDate] = useState(today);
  const [activity, setActivity] = useState(null);
  // The routine editor opens over any tab and goes back to it when closed.
  const [routine, setRoutine] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem(storeKey("tab"), tab); } catch { /* ignore */ }
    window.scrollTo(0, 0);
  }, [tab, routine]);
  const go = (next) => { setRoutine(false); setTab(next); };

  const openWorkout = (d, a) => { setDate(d); setActivity(a); go("workout"); };

  return (
    <div className="min-h-full flex flex-col">
      <Backdrop style={gameStyle} />
      {g && <Splash style={gameStyle} tier={g.tier} level={g.level} rank={rank(g.tier)} line={splashLine} />}
      <main className="relative z-10 flex-1 w-full max-w-xl mx-auto px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(118px+env(safe-area-inset-bottom))] flex flex-col gap-4">
        {saveError && (
          <div role="alert" className="rounded-card border border-bad text-bad px-4 py-3 text-sm">{t("errors.saveFailed")}</div>
        )}
        {(routine || tab !== "today") && <Hud onProfile={() => go("profile")} onSettings={() => go("settings")} />}
        <div key={routine ? "routine" : tab} className="screen-enter flex flex-col gap-4">
        {routine && <Routine onClose={() => setRoutine(false)} />}
        {!routine && tab === "today" && <Today date={date} setDate={setDate} openWorkout={openWorkout} goTo={go} onRoutine={() => setRoutine(true)} onProfile={() => go("profile")} />}
        {!routine && tab === "workout" && <Workout date={date} setDate={setDate} activity={activity} setActivity={setActivity} />}
        {!routine && tab === "progress" && <Progress />}
        {!routine && tab === "plan" && <Plan />}
        {!routine && tab === "profile" && <Profile onRoutine={() => setRoutine(true)} />}
        {!routine && tab === "settings" && <Settings />}
        </div>
      </main>
      <nav aria-label={t("nav.label")} className="dock fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
        <div className="dock-bar max-w-xl mx-auto grid grid-cols-5 items-end">
          {DOCK.map((x) => {
            const active = !routine && tab === x.id;
            const main = x.id === "today";
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => go(x.id)}
                aria-current={active ? "page" : undefined}
                className={`dock-item group ${main ? "dock-main" : ""} ${active ? "dock-active" : ""}`}
              >
                <span className="dock-icon"><Icon name={x.icon} size={main ? 28 : 22} /></span>
                <span className="dock-label">{t(`dock.${x.id}`)}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <LevelUp />
      <NotifySync />
    </div>
  );
}
