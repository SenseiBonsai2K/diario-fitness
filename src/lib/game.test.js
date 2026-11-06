import { describe, expect, it } from "vitest";
import { emptyData } from "./storage.js";
import {
  cleanQuests, evaluateDay, gameState, levelFromXp, questDayEntry, questXp, questsOn, tierFor, xpAtLevel, xpToNext,
} from "./game.js";

// Monday 2026-11-09 = upperA, everything else rest; the routine asks only for steps.
function sample() {
  const d = emptyData();
  d.programs.p = {
    id: "p",
    week: { 0: "rest", 1: "upperA", 2: "rest", 3: "rest", 4: "rest", 5: "rest", 6: "rest" },
    sessions: [{ id: "upperA", name: "Upper A", exercises: [{ id: "bench", sets: 2 }, { id: "row", sets: 1 }] }],
  };
  d.activeProgram = "p";
  const steps = [{ type: "steps", target: 10000, mode: "prop" }];
  d.game = { startDate: "2026-11-09", routine: Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((k) => [k, steps])), seen: null };
  return d;
}

const lift = (sets) => ({ program: "p", session: "upperA", sets });
const done = (n) => Array.from({ length: n }, () => ({ kg: "50", reps: "8", done: true }));

describe("quests of a day", () => {
  it("puts one workout quest per planned session before the routine's quests", () => {
    const d = sample();
    expect(questsOn(d, "2026-11-09").map((q) => q.type)).toEqual(["workout", "steps"]);
    expect(questsOn(d, "2026-11-10").map((q) => q.type)).toEqual(["steps"]);
  });

  it("follows a moved session and a day's own quest list", () => {
    const d = sample();
    d.moves["2026-11-10"] = { activities: ["upperA"] };
    d.questDays["2026-11-10"] = { quests: [{ type: "sleep", target: 8 }] };
    expect(questsOn(d, "2026-11-10")).toEqual([
      { type: "workout", session: "upperA", mode: "all" },
      { type: "sleep", mode: "all", target: 8 },
    ]);
  });

  it("drops unknown or repeated quests, and the day entry disappears when it matches the routine", () => {
    expect(cleanQuests([{ type: "steps" }, { type: "run" }, { type: "steps", target: 5 }])).toEqual([{ type: "steps", mode: "prop", target: 10000 }]);
    const d = sample();
    expect(questDayEntry(d, "2026-11-10", [{ type: "steps", target: 10000, mode: "prop" }])).toBeNull();
    expect(questDayEntry(d, "2026-11-10", [])).toEqual({ quests: [] });
  });
});

describe("XP", () => {
  it("scores the three ways of counting partial progress", () => {
    const prog = { value: 8000, fraction: 0.8 };
    expect(questXp({ type: "steps", target: 10000, mode: "prop" }, prog)).toBe(40);
    expect(questXp({ type: "steps", target: 10000, mode: "all" }, prog)).toBe(0);
    expect(questXp({ type: "steps", target: 10000, mode: "threshold", threshold: 0.7 }, prog)).toBe(25);
  });

  it("adds 5 XP every 1,000 extra steps, at most 50", () => {
    expect(questXp({ type: "steps", target: 10000, mode: "prop" }, { value: 12500, fraction: 1.25 })).toBe(60);
    expect(questXp({ type: "steps", target: 10000, mode: "prop" }, { value: 40000, fraction: 4 })).toBe(100);
  });

  it("needs every set for the workout quest", () => {
    const d = sample();
    d.workouts["2026-11-09"] = lift({ bench: done(2) });
    expect(evaluateDay(d, "2026-11-09", false).quests[0]).toMatchObject({ xp: 0, complete: false, prog: { value: 2, target: 3 } });
    d.workouts["2026-11-09"] = lift({ bench: done(3), row: done(1) });
    expect(evaluateDay(d, "2026-11-09", false).quests[0]).toMatchObject({ xp: 100, complete: true, prog: { value: 3 } });
  });

  it("halves a quest done after its deadline", () => {
    const d = sample();
    d.questDays["2026-11-10"] = { quests: [{ type: "weigh", deadline: "10:00" }] };
    d.days["2026-11-10"] = { peso: "82", fatto: { weigh: "09:30" } };
    expect(evaluateDay(d, "2026-11-10", true).xp).toBe(15);
    d.days["2026-11-10"].fatto.weigh = "11:00";
    expect(evaluateDay(d, "2026-11-10", true).xp).toBe(8);
  });

  it("charges half the base XP for a missed required quest only once the day is over, never for a bonus", () => {
    const d = sample();
    expect(evaluateDay(d, "2026-11-10", false).penalty).toBe(0);
    expect(evaluateDay(d, "2026-11-10", true).penalty).toBe(25);
    d.questDays["2026-11-10"] = { quests: [{ type: "steps", target: 10000, mode: "prop", bonus: true }] };
    expect(evaluateDay(d, "2026-11-10", true).penalty).toBe(0);
  });
});

describe("levels and tiers", () => {
  it("needs 300 + 48 per level", () => {
    expect(xpToNext(1)).toBe(300);
    expect(xpToNext(10)).toBe(732);
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 300 });
    expect(levelFromXp(299).level).toBe(1);
    expect(levelFromXp(300)).toEqual({ level: 2, into: 0, need: 348 });
    expect(levelFromXp(xpAtLevel(50)).level).toBe(50);
  });

  it("drops one tier under 70% constancy and two under 50%", () => {
    expect(tierFor(1, null)).toBe(0);
    expect(tierFor(25, 0.9)).toBe(3);
    expect(tierFor(25, 0.65)).toBe(2);
    expect(tierFor(25, 0.4)).toBe(1);
    expect(tierFor(3, 0.1)).toBe(0);
  });
});

describe("game state", () => {
  it("adds XP, takes penalties (losing levels too) and never goes below 0", () => {
    const d = sample();
    d.days["2026-11-09"] = { passi: "10000" };
    d.workouts["2026-11-09"] = lift({ bench: done(2), row: done(1) });
    // Tue 10: nothing → −25.
    const s = gameState(d, "2026-11-11");
    expect(s.days.map((x) => [x.xp, x.penalty])).toEqual([[150, 0], [0, 25], [0, 0]]);
    expect(s.xp).toBe(125);
    const empty = sample();
    expect(gameState(empty, "2026-11-12").xp).toBe(0);
  });

  it("counts the streak, earns a jolly every 14 perfect days and spends it on a missed day", () => {
    const d = sample();
    d.programs.p.week = { 0: "rest", 1: "rest", 2: "rest", 3: "rest", 4: "rest", 5: "rest", 6: "rest" };
    for (let i = 0; i < 14; i++) {
      const date = `2026-11-${String(9 + i).padStart(2, "0")}`;
      d.days[date] = { passi: "10000" };
    }
    // 23 Nov missed, 24 Nov done.
    d.days["2026-11-24"] = { passi: "10000" };
    const s = gameState(d, "2026-11-25");
    expect(s.days[13]).toMatchObject({ perfect: true });
    expect(s.days[14]).toMatchObject({ perfect: false, saved: true, penalty: 25 });
    expect(s.streak).toBe(15);
    expect(s.jolly).toBe(0);
    expect(s.xp).toBe(15 * 50);
  });

  it("measures constancy on finished days only, plus what is already done today", () => {
    const d = sample();
    d.days["2026-11-09"] = { passi: "10000" };
    d.workouts["2026-11-09"] = lift({ bench: done(2), row: done(1) });
    const s = gameState(d, "2026-11-10");
    expect(s.constancy.week).toBe(1);
    // Tue 10: steps missed.
    expect(gameState(d, "2026-11-11").constancy.week).toBeCloseTo(2 / 3);
    expect(gameState(d, "2026-11-11").perType.workout).toEqual({ done: 1, total: 1, ratio: 1 });
  });
});
