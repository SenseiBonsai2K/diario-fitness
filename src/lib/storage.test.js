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

const sampleDiet = (kcal = 2200) => ({
  id: "d1",
  name: "Definizione",
  targets: { kcal, prot: 170, carb: 235, fat: 65 },
  days: [{ id: "std", name: "Standard", meals: [{ name: "Colazione", items: [{ food: "Avena", qty: 60, unit: "g", alt: ["Pane 80 g"] }] }] }],
});

describe("full backup coverage", () => {
  it("round-trips every part of the document, diets, archive and language included", () => {
    const d = emptyData();
    d.profile.kcal = 2200;
    d.programs = { p: { id: "p", name: "Scheda", sessions: [{ id: "a", name: "A", exercises: [] }] } };
    d.activeProgram = "p";
    d.diets = { d1: sampleDiet() };
    d.activeDiet = "d1";
    d.plan = { sections: [{ id: "s", title: "Corsa" }], yoga: { title: "Yoga", blocks: [] }, updatedAt: "2026-10-10", extra: 1 };
    d.history = [{ date: "2026-10-10", title: "x" }];
    d.archive = [{ at: "2026-10-01", kind: "plan", data: { sections: [] } }];
    d.prefs = { lang: "it" };
    for (const c of ["days", "workouts", "runs", "yoga", "weeks", "months"]) d[c] = { k: { v: 1 } };
    const restored = normalise(JSON.parse(JSON.stringify(toBackup(d))));
    expect(restored).toEqual({ ...d, version: SCHEMA_VERSION });
  });

  it("keeps keys it doesn't know instead of dropping them", () => {
    const restored = normalise({ version: 2, futureThing: { a: 1 } });
    expect(restored.futureThing).toEqual({ a: 1 });
  });

  it("imports v2 backups with no diet or archive", () => {
    const restored = normalise({ version: 2, programs: {} });
    expect(restored.diets).toEqual({});
    expect(restored.archive).toEqual([]);
    expect(restored.activeDiet).toBe(null);
  });

  it("rejects a malformed diet", () => {
    expect(() => normalise({ version: 3, diets: { d: { name: "x" } } })).toThrow("corrupt");
    expect(() => normalise({ version: 3, diets: { d: { days: [{ name: "x" }] } } })).toThrow("corrupt");
  });
});

describe("plan import archives what it replaces", () => {
  it("archives the old plan, profile targets, program and diet with the same id", () => {
    const current = emptyData();
    current.plan = { sections: [{ id: "s", title: "Vecchio" }], yoga: null };
    current.profile.kcal = 2200;
    current.programs = { p: { id: "p", name: "Vecchia", sessions: [] } };
    current.diets = { d1: sampleDiet(2200) };
    current.workouts = { "2026-10-12": { a: 1 } };
    const incoming = emptyData();
    incoming.plan = { sections: [{ id: "s", title: "Nuovo" }], yoga: null };
    incoming.profile.kcal = 2100;
    incoming.programs = { p: { id: "p", name: "Nuova", sessions: [] } };
    incoming.diets = { d1: sampleDiet(2100) };
    incoming.activeDiet = "d1";
    const out = mergePlan(current, incoming, "2026-11-01T10:00:00Z");
    expect(out.workouts).toEqual(current.workouts);
    expect(out.diets.d1.targets.kcal).toBe(2100);
    expect(out.archive.map((a) => a.kind).sort()).toEqual(["diet", "plan", "profile", "program"]);
    expect(out.archive.find((a) => a.kind === "diet").data.targets.kcal).toBe(2200);
    expect(out.archive.find((a) => a.kind === "profile").data.kcal).toBe(2200);
  });

  it("archives nothing when the same file is imported twice", () => {
    const incoming = emptyData();
    incoming.plan = { sections: [{ id: "s", title: "A" }], yoga: null };
    incoming.diets = { d1: sampleDiet() };
    incoming.profile.kcal = 2200;
    const once = mergePlan(emptyData(), incoming);
    const twice = mergePlan(once, incoming);
    expect(twice.archive).toHaveLength(0);
    expect(twice.diets).toEqual(once.diets);
  });

  it("keeps archived versions carried by the incoming file", () => {
    const incoming = emptyData();
    incoming.archive = [{ at: "2026-09-01", kind: "plan", data: { sections: [] } }];
    expect(mergePlan(emptyData(), incoming).archive).toHaveLength(1);
  });
});

describe("partial plan files", () => {
  it("a diet-only file leaves plan, profile and programs as they are", () => {
    const current = emptyData();
    current.plan = { sections: [{ id: "s", title: "Corsa" }], yoga: null };
    current.profile.kcal = 2200;
    current.programs = { p: { id: "p", name: "Scheda", sessions: [] } };
    current.activeProgram = "p";
    const incoming = normalise({ version: 3, diets: { d1: sampleDiet() }, activeDiet: "d1" });
    const out = mergePlan(current, incoming);
    expect(out.plan).toEqual(current.plan);
    expect(out.profile.kcal).toBe(2200);
    expect(out.activeProgram).toBe("p");
    expect(out.activeDiet).toBe("d1");
    expect(out.archive).toHaveLength(0);
  });
});
