import { describe, expect, it } from "vitest";
import { addEntry, moveEntries, plannedListOn, plannedOn, undoEntries } from "./program.js";
import { doneSets, liftLogs, sessionLog, weekStats, workoutDone } from "./stats.js";
import { emptyData, mergePlan, normalise } from "./storage.js";

// Friday 2026-10-16 = lowerB, Saturday 2026-10-17 = run, Sunday = yoga.
function sample() {
  const d = emptyData();
  d.programs.p = {
    id: "p",
    sessions: [{ id: "lowerB", name: "Lower B", exercises: [] }],
    week: { 0: "yoga", 1: "rest", 2: "rest", 3: "rest", 4: "rest", 5: "lowerB", 6: "run" },
  };
  d.activeProgram = "p";
  return d;
}
const apply = (d, entries) => {
  const moves = { ...d.moves };
  for (const [k, v] of Object.entries(entries)) { if (v) moves[k] = v; else delete moves[k]; }
  return { ...d, moves };
};

describe("moving a day", () => {
  it("follows the weekly scheme when nothing was moved", () => {
    expect(plannedOn(sample(), "2026-10-16")).toBe("lowerB");
    expect(plannedOn(sample(), "2026-10-23")).toBe("lowerB");
  });

  it("swaps two days only on those dates", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "swap"));
    expect(plannedOn(d, "2026-10-16")).toBe("run");
    expect(plannedOn(d, "2026-10-17")).toBe("lowerB");
    expect(plannedOn(d, "2026-10-23")).toBe("lowerB");
  });

  it("can leave the first day as rest instead", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "replace"));
    expect(plannedOn(d, "2026-10-16")).toBe("rest");
    expect(plannedOn(d, "2026-10-17")).toBe("lowerB");
  });

  it("restores both days from either one", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "swap"));
    const back = apply(d, undoEntries(d, "2026-10-17"));
    expect(back.moves).toEqual({});
    expect(plannedOn(back, "2026-10-16")).toBe("lowerB");
  });

  it("is a log: kept by backups and by plan imports", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "swap"));
    expect(normalise(JSON.parse(JSON.stringify(d))).moves).toEqual(d.moves);
    const merged = mergePlan(d, normalise({ version: 3, programs: { p: sample().programs.p } }));
    expect(merged.moves).toEqual(d.moves);
  });
});

describe("more than one session a day", () => {
  it("puts both activities on the same day", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "both"));
    expect(plannedListOn(d, "2026-10-17")).toEqual(["lowerB", "run"]);
    expect(plannedListOn(d, "2026-10-16")).toEqual(["rest"]);
    expect(plannedOn(d, "2026-10-17")).toBe("lowerB");
  });

  it("adds a session to a day, also to a rest day, without duplicates", () => {
    let d = apply(sample(), addEntry(sample(), "2026-10-16", "run"));
    expect(plannedListOn(d, "2026-10-16")).toEqual(["lowerB", "run"]);
    d = apply(d, addEntry(d, "2026-10-16", "run"));
    expect(plannedListOn(d, "2026-10-16")).toEqual(["lowerB", "run"]);
    d = apply(d, addEntry(d, "2026-10-12", "lowerB"));
    expect(plannedListOn(d, "2026-10-12")).toEqual(["lowerB"]);
    expect(apply(d, undoEntries(d, "2026-10-16")).moves["2026-10-16"]).toBeUndefined();
  });

  it("reads every session logged on a day", () => {
    const w = {
      program: "p", session: "upperA", sets: { bench: [{ kg: "80", reps: "6", done: true }], crunch: [{ kg: "20", reps: "12", done: true }] },
      more: { lowerA: { program: "p", sets: { squat: [{ kg: "100", reps: "5", done: true }], crunch: [{ kg: "25", reps: "10", done: true }] } } },
    };
    expect(liftLogs(w).map((l) => l.session)).toEqual(["upperA", "lowerA"]);
    expect(sessionLog(w, "lowerA").sets.squat).toHaveLength(1);
    expect(doneSets(w, "crunch")).toHaveLength(2);
    expect(workoutDone({ more: { lowerA: { sets: { squat: [{ done: true }] } } } })).toBe(true);
    const d = { ...sample(), workouts: { "2026-10-13": w } };
    expect(weekStats(d, "2026-10-12").lifts).toBe(2);
  });
});
