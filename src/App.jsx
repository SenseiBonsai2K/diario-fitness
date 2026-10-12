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

const TABS = [
  { id: "today", icon: "today" },
  { id: "workout", icon: "dumbbell" },
  { id: "progress", icon: "chart" },
  { id: "plan", icon: "book" },
  { id: "settings", icon: "settings" },
];

function readTab() {
  try { return sessionStorage.getItem("diario-fitness:tab") || "today"; } catch { return "today"; }
}

export default function App() {
  const { t } = useTranslation();
  const { saveError, data } = useStore();
  const { bg, accent, theme } = data.prefs;
  useLayoutEffect(() => {
    const prefs = { bg, accent, theme };
    applyAppearance(prefs);
    // "Automatic" follows the phone switching between light and dark.
    let q = null;
    try { q = window.matchMedia("(prefers-color-scheme: dark)"); } catch { /* not supported */ }
    const on = () => applyAppearance(prefs);
    q?.addEventListener?.("change", on);
    return () => q?.removeEventListener?.("change", on);
  }, [bg, accent, theme]);
  // One automatic copy a week, taken when the app is opened (see Settings → Automatic copies).
  useEffect(() => { weeklySnapshot(data, hasLogs(data) || hasPlan(data)); }, []); // once per opening, with the data loaded at start

  const [tab, setTab] = useState(readTab);
  const [date, setDate] = useState(today);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    try { sessionStorage.setItem("diario-fitness:tab", tab); } catch { /* ignore */ }
    window.scrollTo(0, 0);
  }, [tab]);

  const openWorkout = (d, a) => { setDate(d); setActivity(a); setTab("workout"); };

  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))] flex flex-col gap-4">
        {saveError && (
          <div role="alert" className="rounded-card border border-bad text-bad px-4 py-3 text-sm">{t("errors.saveFailed")}</div>
        )}
        <div key={tab} className="screen-enter flex flex-col gap-4">
        {tab === "today" && <Today date={date} setDate={setDate} openWorkout={openWorkout} goTo={setTab} />}
        {tab === "workout" && <Workout date={date} setDate={setDate} activity={activity} setActivity={setActivity} />}
        {tab === "progress" && <Progress />}
        {tab === "plan" && <Plan />}
        {tab === "settings" && <Settings />}
        </div>
      </main>
      <nav
        aria-label={t("nav.label")}
        className="fixed bottom-0 inset-x-0 z-20 bg-surface/90 backdrop-blur-md border-t border-line/70 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-xl mx-auto grid grid-cols-5 px-1">
          {TABS.map((x) => {
            const active = tab === x.id;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setTab(x.id)}
                aria-current={active ? "page" : undefined}
                className={`group flex flex-col items-center gap-1 pt-2 pb-2.5 text-[0.7rem] focus-visible:outline-none ${active ? "text-ink font-semibold" : "text-muted font-medium"}`}
              >
                <span className={`grid place-items-center h-8 w-14 rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-accent ${active ? "bg-accent-soft text-accent" : ""}`}>
                  <Icon name={x.icon} size={22} />
                </span>
                {t(`nav.${x.id}`)}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
