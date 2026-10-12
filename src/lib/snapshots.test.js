import { describe, expect, it } from "vitest";
import { KEEP, WEEK_MS, toPrune, weeklyDue } from "./snapshots.js";

const day = (n) => new Date(Date.UTC(2026, 0, 1) + n * 86400000).toISOString();

describe("snapshots", () => {
  it("is due with no weekly copy, or when the last one is a week old", () => {
    expect(weeklyDue([])).toBe(true);
    expect(weeklyDue([{ at: day(0), kind: "beforeEdit" }], Date.parse(day(1)))).toBe(true);
    expect(weeklyDue([{ at: day(0), kind: "weekly" }], Date.parse(day(0)) + WEEK_MS - 1)).toBe(false);
    expect(weeklyDue([{ at: day(0), kind: "weekly" }], Date.parse(day(7)))).toBe(true);
  });

  it("keeps the newest copies of each kind", () => {
    const weekly = Array.from({ length: KEEP.weekly + 2 }, (_, i) => ({ at: day(i * 7), kind: "weekly" }));
    const before = Array.from({ length: KEEP.before + 1 }, (_, i) => ({ at: day(i * 7 + 1), kind: i % 2 ? "beforeEdit" : "beforeImport" }));
    const drop = toPrune([...weekly, ...before]);
    expect(drop).toEqual(expect.arrayContaining([day(0), day(7), day(1)]));
    expect(drop).toHaveLength(3);
  });
});
