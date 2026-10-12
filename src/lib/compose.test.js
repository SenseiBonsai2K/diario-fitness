import { describe, expect, it } from "vitest";
import { buildPlanFile, editablePlan, emptyDraft, knownExercises, macroKcal, nextMonday, num, startFrom, suggestId, tableToText, textToTable } from "./compose.js";
import { emptyData, hasLogs, mergePlan, normalise } from "./storage.js";

const TODAY = "2026-10-14"; // a Wednesday
const NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const NOW = new Date("2026-10-14T10:00:00");

function base() {
  const d = emptyData();
  d.profile = { ...d.profile, phase: "cut", kcal: 2200, prot: 170, carb: 235, fat: 65, rules: { cutMin: 0.3, step: "100–150" } };
  d.programs = {
    "ul-2026-10": {
      id: "ul-2026-10", name: "Upper Lower", startDate: "2026-10-12", endDate: null, volume: [{ name: "Quad", sets: 16 }],
      week: { 0: "yoga", 1: "upperA", 2: "rest", 3: "run", 4: "rest", 5: "rest", 6: "run" },
      sessions: [{ id: "upperA", name: "Upper A", exercises: [{ id: "bench", name: "Panca piana", sets: 3, reps: [5, 7], rest: 180 }] }],
    },
  };
  d.activeProgram = "ul-2026-10";
  d.diets = { "dieta-2026-10": { id: "dieta-2026-10", name: "Dieta", days: [{ id: "lun", meals: [] }], week: { 1: "lun" } } };
  d.activeDiet = "dieta-2026-10";
  d.days = { "2026-10-12": { peso: "82,6" } };
  return d;
}

describe("small helpers", () => {
  it("reads decimal commas", () => {
    expect(num("82,5")).toBe(82.5);
    expect(num("")).toBeUndefined();
    expect(num("abc")).toBeUndefined();
  });
  it("computes kcal from macros", () => expect(macroKcal(170, 235, 65)).toBe(2205));
  it("finds next Monday", () => {
    expect(nextMonday(TODAY)).toBe("2026-10-19");
    expect(nextMonday("2026-10-19")).toBe("2026-10-26");
  });
  it("suggests a fresh id", () => {
    expect(suggestId("ul-2026-10", {}, "2026-11-02")).toBe("ul-2026-11");
    expect(suggestId("ul-2026-10", { "ul-2026-10": {} }, TODAY)).toBe("ul-2026-10-b");
  });
  it("lists known exercise ids", () => expect(knownExercises(base())).toEqual({ bench: "Panca piana" }));
});

describe("buildPlanFile", () => {
  it("asks for at least one section", () => {
    const r = buildPlanFile(emptyDraft(TODAY, NAMES), base(), NOW);
    expect(r.errors).toBe(1);
    expect(r.issues[0].key).toBe("nothingIncluded");
  });

  it("builds a profile change that keeps the stored rules", () => {
    const draft = emptyDraft(TODAY, NAMES, base());
    draft.include.profile = true;
    draft.include.history = true;
    draft.profile.kcal = "2050";
    draft.profile.carb = "198";
    draft.profile.rules.cutMax = "0,8";
    draft.history.title = "−150 kcal";
    const r = buildPlanFile(draft, base(), NOW);
    expect(r.errors).toBe(0);
    expect(r.file.data.profile).toMatchObject({ kcal: 2050, carb: 198, rules: { cutMin: 0.3, cutMax: 0.8, step: "100–150" } });
    expect(r.file.data.history).toEqual([{ date: TODAY, title: "−150 kcal" }]);
    expect(r.fileName).toBe("diario-fitness-piano-profile-history-2026-10-14.json");
  });

  it("copies a program under a new id and closes the previous one", () => {
    const b = base();
    const draft = emptyDraft(TODAY, NAMES, b);
    const s = startFrom("program", "copy:ul-2026-10", b, TODAY, NAMES);
    draft.programMode = s.mode;
    draft.program = s.value;
    draft.include.program = true;
    draft.include.history = true;
    draft.history.title = "Nuova scheda";
    const r = buildPlanFile(draft, b, NOW);
    expect(r.errors).toBe(0);
    const id = "ul-2026-10-b";
    expect(r.file.data.activeProgram).toBe(id);
    expect(r.file.data.programs[id].startDate).toBe("2026-10-19");
    expect(r.file.data.programs[id].volume).toEqual([{ name: "Quad", sets: 16 }]);
    expect(r.file.data.programs[id].sessions[0].exercises[0]).toEqual({ id: "bench", name: "Panca piana", sets: 3, reps: [5, 7], rest: 180 });
    expect(r.file.data.programs["ul-2026-10"].endDate).toBe("2026-10-18");
  });

  it("refuses a new program with an id that exists", () => {
    const b = base();
    const draft = emptyDraft(TODAY, NAMES, b);
    draft.include.program = true;
    draft.program.id = "ul-2026-10";
    expect(buildPlanFile(draft, b, NOW).issues.map((i) => i.key)).toContain("programIdTaken");
  });

  it("flags renamed ids, too many sets, bad supersets and unplanned sessions", () => {
    const b = base();
    const draft = emptyDraft(TODAY, NAMES, b);
    draft.include.program = true;
    draft.include.history = true;
    draft.history.title = "x";
    draft.program.id = "nuova-2026-10";
    draft.program.sessions = [{ id: "full", name: "Full", exercises: [
      { id: "bench", name: "Squat", sets: "4", reps: ["8", "6"], rest: "", superset: true },
    ] }];
    const keys = buildPlanFile(draft, b, NOW).issues.map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["exerciseRenamed", "manySets", "repsOrder", "supersetLast", "sessionUnplanned"]));
  });

  it("drops empty food rows and keeps the diet importable", () => {
    const b = base();
    const draft = emptyDraft(TODAY, NAMES, b);
    draft.include.diet = true;
    draft.include.history = true;
    draft.history.title = "Dieta nuova";
    draft.diet.id = "dieta-nuova-2026-10";
    draft.diet.name = "Nuova";
    draft.diet.days.forEach((d) => { d.meals = [{ name: "Colazione", items: [{ food: "Yogurt greco", qty: "150", unit: "g", note: "" }, { food: "", qty: "", unit: "g" }] }]; });
    const r = buildPlanFile(draft, b, NOW);
    expect(r.errors).toBe(0);
    const diet = r.file.data.diets["dieta-nuova-2026-10"];
    expect(diet.days[0].meals[0].items).toEqual([{ food: "Yogurt greco", qty: 150, unit: "g" }]);
    expect(r.file.data.diets["dieta-2026-10"].endDate).toBe("2026-10-18");
    expect(r.file.data.activeDiet).toBe("dieta-nuova-2026-10");
  });

  it("produces a file that normalise accepts and mergePlan applies without touching logs", () => {
    const b = base();
    const draft = emptyDraft(TODAY, NAMES, b);
    const s = startFrom("program", "edit:ul-2026-10", b, TODAY, NAMES);
    draft.programMode = s.mode;
    draft.program = s.value;
    draft.program.sessions[0].exercises[0].rest = "150";
    draft.include.program = true;
    draft.include.history = true;
    draft.history.title = "Recupero panca";
    const r = buildPlanFile(draft, b, NOW);
    expect(r.errors).toBe(0);
    const incoming = normalise(r.file);
    expect(hasLogs(incoming)).toBe(false);
    const next = mergePlan(b, incoming, "2026-10-14T10:00:00Z");
    expect(next.days).toEqual(b.days);
    expect(next.programs["ul-2026-10"].sessions[0].exercises[0].rest).toBe(150);
    expect(next.archive).toHaveLength(1);
    expect(next.archive[0]).toMatchObject({ kind: "program", id: "ul-2026-10" });
    expect(next.history.at(-1).title).toBe("Recupero panca");
  });

  it("round-trips the plan text and yoga, and warns when a pose id disappears", () => {
    const b = base();
    b.plan = { updatedAt: "2026-10-10", sections: [{ id: "corsa", title: "Corsa", bullets: ["Z2"], table: { head: ["Fase", "Kcal"], rows: [["Cut", "2200"]] } }],
      yoga: { title: "Yoga", blocks: [{ name: "Apertura", poses: [{ id: "diaphragm", name: "Respiro", hold: "3'" }, { id: "cat", name: "Gatto", hold: "1'" }] }] } };
    const draft = emptyDraft(TODAY, NAMES, b);
    expect(draft.plan.sections[0].table).toBe("Fase | Kcal\nCut | 2200");
    draft.include.plan = true;
    draft.include.history = true;
    draft.history.title = "Piano";
    draft.plan.sections[0].bullets.push("Una lunga a settimana");
    draft.plan.yoga.blocks[0].poses.pop();
    const r = buildPlanFile(draft, b, NOW);
    expect(r.errors).toBe(0);
    expect(r.issues.map((i) => i.key)).toContain("poseRemoved");
    expect(r.file.data.plan.sections[0]).toEqual({ id: "corsa", title: "Corsa", bullets: ["Z2", "Una lunga a settimana"], table: { head: ["Fase", "Kcal"], rows: [["Cut", "2200"]] } });
    const next = mergePlan(b, normalise(r.file));
    expect(next.archive.at(-1).kind).toBe("plan");
    expect(next.plan.yoga.blocks[0].poses).toEqual([{ id: "diaphragm", name: "Respiro", hold: "3'" }]);
  });

  it("keeps food alternatives, meal options, swaps and day targets", () => {
    const b = base();
    const draft = emptyDraft(TODAY, NAMES, b);
    draft.include.diet = true;
    draft.include.history = true;
    draft.history.title = "Dieta";
    draft.diet.id = "dieta-x-2026-10";
    draft.diet.name = "X";
    draft.diet.substitutions = [{ food: "Riso 90 g", alt: ["Pasta 90 g", " "], note: "" }];
    draft.diet.days.forEach((d) => {
      d.targets = { kcal: "2100", prot: "", carb: "", fat: "" };
      d.meals = [{ name: "Pranzo", items: [{ food: "Riso", qty: "90", unit: "g", alt: ["Farro 90 g", ""] }], options: [{ name: "Opzione 2", items: [{ food: "Pane", qty: "100", unit: "g", alt: [] }] }] }];
    });
    const r = buildPlanFile(draft, b, NOW);
    expect(r.errors).toBe(0);
    const diet = r.file.data.diets["dieta-x-2026-10"];
    expect(diet.substitutions).toEqual([{ food: "Riso 90 g", alt: ["Pasta 90 g"] }]);
    expect(diet.days[0].targets).toEqual({ kcal: 2100 });
    expect(diet.days[0].meals[0]).toEqual({ name: "Pranzo", items: [{ food: "Riso", qty: 90, unit: "g", alt: ["Farro 90 g"] }], options: [{ name: "Opzione 2", items: [{ food: "Pane", qty: 100, unit: "g" }] }] });
  });

  it("converts tables to text and back", () => {
    expect(textToTable(tableToText({ head: ["a", "b"], rows: [["1", "2"]] }))).toEqual({ head: ["a", "b"], rows: [["1", "2"]] });
    expect(textToTable("  ")).toBeNull();
    expect(editablePlan(undefined)).toEqual({ sections: [], yoga: null });
  });
});
