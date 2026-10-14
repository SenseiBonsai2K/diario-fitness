import { describe, expect, it } from "vitest";
import { adviceKey, e1rm, lastPerformance, shouldIncrease, weekStats, weightSeries } from "./stats.js";
import { emptyData } from "./storage.js";

function withDays(entries) {
  const d = emptyData();
  for (const [k, v] of Object.entries(entries)) d.days[k] = v;
  return d;
}

describe("weekStats", () => {
  it("averages this week and the previous one, parsing decimal commas", () => {
    const d = withDays({
      "2026-10-05": { peso: "83,0" }, "2026-10-07": { peso: "83.4" },
      "2026-10-12": { peso: "82,6", kcal: "2200" }, "2026-10-14": { peso: "82.8", kcal: 2100 },
    });
    d.workouts["2026-10-12"] = { session: "lowerA", sets: { squat: [{ kg: "100", reps: "6", done: true }] } };
    d.workouts["2026-10-13"] = { session: "upperA", sets: { bench: [{ kg: "80", reps: "6", done: false }] } };
    d.runs["2026-10-14"] = { km: "10" };
    d.yoga["2026-10-18"] = { done: true };
    const s = weekStats(d, "2026-10-12");
    expect(s.avgWeight).toBeCloseTo(82.7);
    expect(s.prevWeight).toBeCloseTo(83.2);
    expect(s.delta).toBeCloseTo(-0.5);
    expect(s.kcal).toBe(2150);
    expect(s.lifts).toBe(1); // a session with no completed set doesn't count
    expect(s.runs).toBe(1);
    expect(s.km).toBe(10);
    expect(s.yoga).toBe(1);
  });
});

describe("adviceKey", () => {
  const rules = { cutMin: 0.3, cutMax: 0.8, bulkMin: 0.1, bulkMax: 0.3, maintainBand: 0.3, step: "100–150" };
  it("follows the calorie rules stored in the profile", () => {
    expect(adviceKey(-0.5, "cut", null)).toBe("noRules");
    expect(adviceKey(null, "cut", rules)).toBe("needData");
    expect(adviceKey(-0.1, "cut", rules)).toBe("cutSlow");
    expect(adviceKey(-0.5, "cut", rules)).toBe("cutOk");
    expect(adviceKey(-1.0, "minicut", rules)).toBe("cutFast");
    expect(adviceKey(0.05, "bulk", rules)).toBe("bulkSlow");
    expect(adviceKey(0.2, "bulk", rules)).toBe("bulkOk");
    expect(adviceKey(0.4, "bulk", rules)).toBe("bulkFast");
    expect(adviceKey(0.1, "maintain", rules)).toBe("maintainOk");
  });
});

describe("progression", () => {
  const squat = { id: "squat", sets: 3, reps: [5, 7] };
  const d = emptyData();
  d.workouts["2026-10-12"] = { session: "lowerA", sets: { squat: [
    { kg: "100", reps: "7", done: true }, { kg: "100", reps: "7", done: true }, { kg: "100", reps: "7", done: true },
  ] } };
  d.workouts["2026-10-15"] = { session: "lowerB", sets: {} };

  it("finds the last session that included the exercise", () => {
    const p = lastPerformance(d, "squat", "2026-10-19");
    expect(p.date).toBe("2026-10-12");
    expect(p.sets).toHaveLength(3);
  });

  it("suggests more weight only when every planned set hit the top of the range", () => {
    expect(shouldIncrease(squat, lastPerformance(d, "squat", "2026-10-19"))).toBe(true);
    d.workouts["2026-10-12"].sets.squat[2].reps = "6";
    expect(shouldIncrease(squat, lastPerformance(d, "squat", "2026-10-19"))).toBe(false);
  });

  it("estimates 1RM with Epley", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 6)).toBeCloseTo(120);
  });
});

describe("weightSeries", () => {
  it("returns daily points and a trailing 7-day mean", () => {
    const d = withDays({ "2026-10-01": { peso: 84 }, "2026-10-02": { peso: 82 } });
    const s = weightSeries(d);
    expect(s.points).toHaveLength(2);
    expect(s.trend.at(-1).value).toBe(83);
  });
});

describe("running", () => {
  it("reads run times typed with a comma or a colon", async () => {
    const { parseDuration } = await import("./stats.js");
    expect(parseDuration("52,30")).toBe(3150);
    expect(parseDuration("52:30")).toBe(3150);
    expect(parseDuration("52.30")).toBe(3150);
    expect(parseDuration("52,5")).toBe(3125);
    expect(parseDuration("1,02,30")).toBe(3750);
    expect(parseDuration("52")).toBe(3120);
    expect(parseDuration(" 48 , 05 ")).toBe(2885);
    expect(parseDuration("52,75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });

  it("formats durations and paces", async () => {
    const { fmtDuration } = await import("./stats.js");
    expect(fmtDuration(3150)).toBe("52:30");
    expect(fmtDuration(3750)).toBe("1:02:30");
    expect(fmtDuration(315)).toBe("5:15");
    expect(fmtDuration(null)).toBe("—");
  });

  it("builds run series, totals and weekly km", async () => {
    const { runSeries, runTotals, weeklyKmSeries } = await import("./stats.js");
    const data = emptyData();
    data.runs["2026-10-14"] = { km: "10", durata: "60,00", fc: "135" };
    data.runs["2026-10-17"] = { km: "8,5", durata: "51,00", fc: "145" };
    data.runs["2026-10-21"] = { km: "10", durata: "", fc: "" };
    data.runs["2026-10-22"] = { km: "", durata: "30,00" };
    const runs = runSeries(data);
    expect(runs.map((r) => r.date)).toEqual(["2026-10-14", "2026-10-17", "2026-10-21"]);
    expect(runs[0].pace).toBe(360);
    const tot = runTotals(runs.slice(0, 2));
    expect(tot.km).toBe(18.5);
    expect(tot.sec).toBe(6660);
    expect(tot.pace).toBeCloseTo(6660 / 18.5);
    expect(tot.fc).toBe(140);
    expect(runTotals(runs).pace).toBeCloseTo(6660 / 18.5);
    expect(weeklyKmSeries(data)).toEqual([{ date: "2026-10-12", value: 18.5 }, { date: "2026-10-19", value: 10 }]);
    expect(runSeries(data, "2026-10-15").length).toBe(2);
  });
});
