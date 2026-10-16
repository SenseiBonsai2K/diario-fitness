import { describe, expect, it } from "vitest";
import { addEntry, moveEntries, plannedListOn, plannedOn, removeEntry, undoEntries } from "./program.js";
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

describe("moving and adding", () => {
  it("follows the weekly scheme when nothing was moved", () => {
    expect(plannedOn(sample(), "2026-10-16")).toBe("lowerB");
    expect(plannedOn(sample(), "2026-10-23")).toBe("lowerB");
  });

  it("swaps two days only on those dates", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "lowerB", "swap"));
    expect(plannedListOn(d, "2026-10-16")).toEqual(["run"]);
    expect(plannedListOn(d, "2026-10-17")).toEqual(["lowerB"]);
    expect(plannedOn(d, "2026-10-23")).toBe("lowerB");
  });

  it("can leave the first day as rest and skip what was there", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "lowerB", "replace"));
    expect(plannedListOn(d, "2026-10-16")).toEqual(["rest"]);
    expect(plannedListOn(d, "2026-10-17")).toEqual(["lowerB"]);
  });

  it("chains moves: Lower B to Saturday, then the run to Sunday with yoga", () => {
    let d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "lowerB", "both"));
    expect(plannedListOn(d, "2026-10-17")).toEqual(["lowerB", "run"]);
    d = apply(d, moveEntries(d, "2026-10-17", "2026-10-18", "run", "both"));
    expect(plannedListOn(d, "2026-10-16")).toEqual(["rest"]);
    expect(plannedListOn(d, "2026-10-17")).toEqual(["lowerB"]);
    expect(plannedListOn(d, "2026-10-18")).toEqual(["run", "yoga"]);
  });

  it("forgets a change that goes back to the scheme", () => {
    let d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "lowerB", "both"));
    d = apply(d, moveEntries(d, "2026-10-17", "2026-10-16", "lowerB", "both"));
    expect(d.moves).toEqual({});
  });

  it("restores one day or the whole week", () => {
    let d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "lowerB", "both"));
    d = apply(d, moveEntries(d, "2026-10-17", "2026-10-18", "run", "both"));
    expect(Object.keys(apply(d, undoEntries(d, "2026-10-18")).moves)).toEqual(["2026-10-16", "2026-10-17"]);
    expect(apply(d, undoEntries(d, ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"])).moves).toEqual({});
  });

  it("is a log: kept by backups and by plan imports", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", "lowerB", "swap"));
    expect(normalise(JSON.parse(JSON.stringify(d))).moves).toEqual(d.moves);
    const merged = mergePlan(d, normalise({ version: 3, programs: { p: sample().programs.p } }));
    expect(merged.moves).toEqual(d.moves);
  });

  it("still reads older single-activity entries", () => {
    const d = { ...sample(), moves: { "2026-10-16": { activity: "run", pair: "2026-10-17" } } };
    expect(plannedListOn(d, "2026-10-16")).toEqual(["run"]);
  });

  it("adds and removes a session on one day, without duplicates", () => {
    let d = apply(sample(), addEntry(sample(), "2026-10-16", "run"));
    expect(plannedListOn(d, "2026-10-16")).toEqual(["lowerB", "run"]);
    d = apply(d, addEntry(d, "2026-10-16", "run"));
    expect(plannedListOn(d, "2026-10-16")).toEqual(["lowerB", "run"]);
    d = apply(d, addEntry(d, "2026-10-12", "lowerB"));
    expect(plannedListOn(d, "2026-10-12")).toEqual(["lowerB"]);
    d = apply(d, removeEntry(d, "2026-10-16", "run"));
    expect(d.moves["2026-10-16"]).toBeUndefined();
  });
});

describe("more than one session a day", () => {
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
