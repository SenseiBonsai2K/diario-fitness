import { describe, expect, it } from "vitest";
import { emptyData, mergePlan, normalise, toBackup, SCHEMA_VERSION } from "./storage.js";

describe("backup round trip", () => {
  it("restores exactly what was exported", () => {
    const d = emptyData();
    d.days["2026-10-12"] = { peso: "82,6" };
    d.profile.kcal = 2100;
    const restored = normalise(JSON.parse(JSON.stringify(toBackup(d))));
    expect(restored.days).toEqual(d.days);
    expect(restored.profile.kcal).toBe(2100);
  });

  it("accepts the raw document too and fills missing collections", () => {
    const restored = normalise({ version: 1, days: { "2026-10-12": { peso: 80 } } });
    expect(restored.workouts).toEqual({});
    expect(restored.profile.prot).toBe(null);
    expect(restored.version).toBe(SCHEMA_VERSION);
  });

  it("rejects files that are not backups", () => {
    expect(() => normalise([1, 2])).toThrow("notBackup");
    expect(() => normalise({ hello: "world" })).toThrow("notBackup");
    expect(() => normalise({ version: SCHEMA_VERSION + 1 })).toThrow("newerVersion");
    expect(() => normalise({ version: 1, days: [] })).toThrow("corrupt");
    expect(() => normalise({ version: 2, programs: { a: { name: "x" } } })).toThrow("corrupt");
  });
});

describe("plan-only import", () => {
  it("keeps logs and takes programs, plan, profile and new history", () => {
    const current = emptyData();
    current.days["2026-10-12"] = { peso: "82,9" };
    current.history = [{ date: "2026-10-12", title: "Inizio" }];
    const incoming = emptyData();
    incoming.programs = { p2: { id: "p2", name: "Nuova", sessions: [] } };
    incoming.activeProgram = "p2";
    incoming.profile.kcal = 2300;
    incoming.plan = { sections: [{ id: "x", title: "Corsa" }], yoga: null };
    incoming.history = [{ date: "2026-10-12", title: "Inizio" }, { date: "2026-11-01", title: "Cambio scheda" }];
    incoming.days["2026-01-01"] = { peso: 90 };
    const out = mergePlan(current, incoming);
    expect(out.days).toEqual(current.days);
    expect(out.activeProgram).toBe("p2");
    expect(out.profile.kcal).toBe(2300);
    expect(out.plan.sections).toHaveLength(1);
    expect(out.history).toHaveLength(2);
  });
});
