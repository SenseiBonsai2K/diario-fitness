import { describe, expect, it } from "vitest";
import { moveEntries, plannedOn, undoEntries } from "./program.js";
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
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", true));
    expect(plannedOn(d, "2026-10-16")).toBe("run");
    expect(plannedOn(d, "2026-10-17")).toBe("lowerB");
    expect(plannedOn(d, "2026-10-23")).toBe("lowerB");
  });

  it("can leave the first day as rest instead", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", false));
    expect(plannedOn(d, "2026-10-16")).toBe("rest");
    expect(plannedOn(d, "2026-10-17")).toBe("lowerB");
  });

  it("restores both days from either one", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", true));
    const back = apply(d, undoEntries(d, "2026-10-17"));
    expect(back.moves).toEqual({});
    expect(plannedOn(back, "2026-10-16")).toBe("lowerB");
  });

  it("is a log: kept by backups and by plan imports", () => {
    const d = apply(sample(), moveEntries(sample(), "2026-10-16", "2026-10-17", true));
    expect(normalise(JSON.parse(JSON.stringify(d))).moves).toEqual(d.moves);
    const merged = mergePlan(d, normalise({ version: 3, programs: { p: sample().programs.p } }));
    expect(merged.moves).toEqual(d.moves);
  });
});
