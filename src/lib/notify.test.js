import { describe, expect, it } from "vitest";
import { emptyData } from "./storage.js";
import { defaultNotifications, notificationsOf, syncPayload } from "./notify.js";

const t = (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k);

function sample() {
  const d = emptyData();
  d.programs.p = { id: "p", week: { 1: "upperA" }, sessions: [{ id: "upperA", name: "Upper A", exercises: [{ id: "bench", sets: 1 }] }] };
  d.activeProgram = "p";
  d.game.startDate = "2026-11-09";
  d.game.routine = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((k) => [k, [{ type: "steps", target: 10000, mode: "prop" }]]));
  return d;
}

describe("notifications", () => {
  it("fills missing rules with the defaults and keeps the user's changes", () => {
    const d = sample();
    d.prefs.notifications = { rules: [{ id: "steps", time: "20:15", enabled: false }], quiet: { start: "23:00", end: "07:30" } };
    const n = notificationsOf(d);
    expect(n.rules).toHaveLength(defaultNotifications().rules.length);
    expect(n.rules.find((r) => r.id === "steps")).toMatchObject({ kind: "steps", time: "20:15", enabled: false });
    expect(n.quiet).toEqual({ start: "23:00", end: "07:30" });
  });

  it("sends only quest keys, labels and done flags for today and the next 7 days", () => {
    const d = sample();
    d.days["2026-11-09"] = { passi: "12000", peso: "82,4", cibi: ["x"] };
    const p = syncPayload(d, "2026-11-09", t, "it", null);
    expect(Object.keys(p.days)).toHaveLength(8);
    expect(p.days["2026-11-09"]).toEqual({ due: { "workout:upperA": "Upper A", steps: "10.000 game:unit.steps" }, done: ["steps"], pending: 1 });
    expect(p.days["2026-11-10"].due).toEqual({ steps: "10.000 game:unit.steps" });
    expect(JSON.stringify(p)).not.toContain("82,4");
    expect(p.rules.find((r) => r.kind === "workout")).toMatchObject({ title: "notify:text.workoutTitle", body: "notify:text.workoutBody" });
  });
});
