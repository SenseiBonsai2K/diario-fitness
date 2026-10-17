import { describe, expect, it } from "vitest";
import { dietDayIdOn, menuChanged, menuEntries } from "./diet.js";
import { emptyData, mergePlan, normalise } from "./storage.js";

// Saturday 2026-10-17 = "sab", Sunday 2026-10-18 = "dom".
function sample() {
  const d = emptyData();
  const ids = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  d.diets.x = { id: "x", days: ids.map((id) => ({ id, name: id, meals: [] })), week: Object.fromEntries(ids.map((id, i) => [String(i), id])) };
  d.activeDiet = "x";
  return d;
}
const apply = (d, entries) => {
  const days = { ...d.days };
  for (const [k, menu] of Object.entries(entries)) {
    const next = { ...(days[k] || {}), menu };
    if (!menu) delete next.menu;
    if (Object.keys(next).length) days[k] = next; else delete days[k];
  }
  return { ...d, days };
};

describe("changing the menu of a day", () => {
  it("follows the diet's weekly scheme by default", () => {
    expect(dietDayIdOn(sample(), "2026-10-17")).toBe("sab");
    expect(menuChanged(sample(), "2026-10-17")).toBe(false);
  });

  it("eats Sunday's menu on Saturday, Sunday unchanged", () => {
    const d = apply(sample(), menuEntries(sample(), "2026-10-17", "2026-10-18", false));
    expect(dietDayIdOn(d, "2026-10-17")).toBe("dom");
    expect(dietDayIdOn(d, "2026-10-18")).toBe("dom");
    expect(dietDayIdOn(d, "2026-10-24")).toBe("sab");
  });

  it("swaps the two menus", () => {
    const d = apply(sample(), menuEntries(sample(), "2026-10-17", "2026-10-18", true));
    expect(dietDayIdOn(d, "2026-10-17")).toBe("dom");
    expect(dietDayIdOn(d, "2026-10-18")).toBe("sab");
    const back = apply(d, menuEntries(d, "2026-10-17", "2026-10-18", true));
    expect(back.days).toEqual({});
  });

  it("keeps the ticks and the rest of the day log, and survives imports", () => {
    let d = sample();
    d.days["2026-10-17"] = { peso: "82,6" };
    d = apply(d, menuEntries(d, "2026-10-17", "2026-10-18", false));
    expect(d.days["2026-10-17"]).toEqual({ peso: "82,6", menu: "dom" });
    expect(mergePlan(d, normalise({ version: 4, diets: { x: sample().diets.x } })).days).toEqual(d.days);
  });

  it("falls back to the scheme when the stored day type no longer exists", () => {
    const d = { ...sample(), days: { "2026-10-17": { menu: "gone" } } };
    expect(dietDayIdOn(d, "2026-10-17")).toBe("sab");
  });
});
