// Plan editor ("compositore"): pure helpers that turn the editor's draft into
// a plan file. The file never carries logs, so applying it (mergePlan) or
// importing it with "Load plan only" keeps everything recorded on the phone.
import { addDays, iso, parseIso } from "./dates.js";
import { BACKUP_APP, SCHEMA_VERSION } from "./storage.js";

export const WEEK_KEYS = ["1", "2", "3", "4", "5", "6", "0"]; // Monday first; "0" = Sunday
export const DIET_DAY_IDS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
export const ACTIVITIES = ["run", "yoga", "rest"];
export const PHASES = ["cut", "maintain", "bulk", "minicut"];
export const PROFILE_FIELDS = ["kcal", "prot", "carb", "fat", "maintenance", "goalWeight", "goalBf", "heightCm", "startWeight", "startBf"];
/** Bumped when the draft shape changes, so an old saved draft is replaced instead of misread. */
export const DRAFT_VERSION = 2;
export const RULE_FIELDS = ["cutMin", "cutMax", "bulkMin", "bulkMax", "maintainBand"];
/** A plan's macros may differ from its kcal by this much before we flag it. */
const KCAL_TOLERANCE = 60;
const MAX_SETS = 3;

const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (v === null || v === undefined ? "" : String(v));
const trimOrDrop = (o, k) => {
  if (typeof o[k] === "string") o[k] = o[k].trim();
  if (o[k] === "" || o[k] === null || o[k] === undefined) delete o[k];
};

/** Reads "82,5", "82.5" or 82.5; anything else (including "") is undefined. */
export function num(v) {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export const macroKcal = (p, c, f) => Math.round(4 * (num(p) || 0) + 4 * (num(c) || 0) + 9 * (num(f) || 0));

export function nextMonday(fromIso) {
  const d = parseIso(fromIso);
  const k = (8 - d.getDay()) % 7 || 7;
  return iso(addDays(d, k));
}

export function dayBefore(s) {
  return iso(addDays(parseIso(s), -1));
}

/** "ul-cristian-2026-10" → "ul-cristian-2026-11" (or "-b", "-c"… if taken). */
export function suggestId(id, existing, todayIso) {
  const base = str(id || "piano").replace(/-\d{4}-\d{2}(-[a-z])?$/, "");
  const month = todayIso.slice(0, 7);
  let candidate = `${base}-${month}`;
  for (let i = 0; existing?.[candidate]; i++) candidate = `${base}-${month}-${"bcdefghijk"[i] || i}`;
  return candidate;
}

export const blankExercise = () => ({ id: "", name: "", sets: "3", reps: ["", ""], rest: "", rir: "", notes: "" });
export const blankSession = () => ({ id: "", name: "", note: "", exercises: [blankExercise()] });
export const blankItem = () => ({ food: "", qty: "", unit: "g", note: "" });
export const blankMeal = (name = "") => ({ name, time: "", note: "", items: [blankItem()] });
export const blankOption = (name = "") => ({ name, items: [blankItem()] });
export const blankSubstitution = () => ({ food: "", alt: [], note: "" });
export const blankVolume = () => ({ name: "", sets: "", detail: "" });
export const blankSection = () => ({ id: "", title: "", paragraphs: [], bullets: [], numbered: [], table: "", note: "" });
export const blankPose = () => ({ id: "", name: "", hold: "" });
export const blankYogaBlock = () => ({ name: "", poses: [blankPose()] });
export const blankYoga = () => ({ title: "", intro: "", why: "", blocks: [blankYogaBlock()] });

/** Tables are edited as text: one line per row, cells split by "|", first line = header. */
export function tableToText(t) {
  if (!t || !Array.isArray(t.head)) return "";
  return [t.head, ...(t.rows || [])].map((r) => r.map(str).join(" | ")).join("\n");
}
export function textToTable(text) {
  const rows = str(text).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split("|").map((c) => c.trim()));
  return rows.length ? { head: rows[0], rows: rows.slice(1) } : null;
}

const list = (v) => (Array.isArray(v) ? v.map(str) : v ? [str(v)] : []);
const cleanList = (v) => list(v).map((x) => x.trim()).filter(Boolean);
const slug = (s) => str(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function editableSection(s) {
  return { ...clone(s), id: str(s.id), title: str(s.title), paragraphs: list(s.paragraphs), bullets: list(s.bullets), numbered: list(s.numbered), table: tableToText(s.table), note: str(s.note) };
}

export function editablePlan(plan) {
  const p = isObj(plan) ? clone(plan) : {};
  const y = isObj(p.yoga) ? p.yoga : null;
  return {
    ...p,
    sections: (Array.isArray(p.sections) ? p.sections : []).map(editableSection),
    yoga: y ? { ...y, title: str(y.title), intro: str(y.intro), why: str(y.why), blocks: (y.blocks || []).map((b) => ({ ...b, name: str(b.name), poses: (b.poses || []).map((x) => ({ ...x, id: str(x.id), name: str(x.name), hold: str(x.hold) })) })) } : null,
  };
}

export function blankProgram(todayIso) {
  return {
    id: `scheda-${todayIso.slice(0, 7)}`, name: "", author: "", goal: "",
    startDate: nextMonday(todayIso), endDate: null,
    week: { 0: "rest", 1: "rest", 2: "rest", 3: "rest", 4: "rest", 5: "rest", 6: "rest" },
    activityNotes: { run: "", yoga: "" },
    sessions: [blankSession()],
    notes: [],
  };
}

/** dayNames: the seven display names, Monday first. */
export function blankDiet(todayIso, dayNames) {
  return {
    id: `dieta-${todayIso.slice(0, 7)}`, name: "", author: "", note: "",
    startDate: nextMonday(todayIso), endDate: null,
    targets: { kcal: "", prot: "", carb: "", fat: "" },
    week: Object.fromEntries(WEEK_KEYS.map((k, i) => [k, DIET_DAY_IDS[i]])),
    days: DIET_DAY_IDS.map((id, i) => ({ id, name: dayNames[i] || id, note: "", meals: [blankMeal()] })),
    notes: [],
  };
}

/** Shape a stored program for the form: reps always [min, max], notes always a list. Unknown keys stay. */
export function editableProgram(p) {
  const out = clone(p);
  out.week = isObj(out.week) ? out.week : {};
  out.activityNotes = isObj(out.activityNotes) ? out.activityNotes : {};
  out.notes = Array.isArray(out.notes) ? out.notes : out.notes ? [str(out.notes)] : [];
  out.sessions = (out.sessions || []).map((s) => ({
    ...s,
    exercises: (s.exercises || []).map((e) => ({
      ...e,
      sets: str(e.sets), rest: str(e.rest),
      reps: Array.isArray(e.reps) ? e.reps.map(str) : e.reps !== undefined ? [str(e.reps), str(e.reps)] : ["", ""],
    })),
  }));
  out.volume = (Array.isArray(out.volume) ? out.volume : []).map((v) => ({ ...v, name: str(v.name), sets: str(v.sets), detail: str(v.detail) }));
  return out;
}

export function editableDiet(d) {
  const out = clone(d);
  out.targets = Object.fromEntries(["kcal", "prot", "carb", "fat"].map((k) => [k, str(out.targets?.[k])]));
  out.week = isObj(out.week) ? out.week : {};
  out.notes = Array.isArray(out.notes) ? out.notes : out.notes ? [str(out.notes)] : [];
  const items = (xs) => (xs || []).map((i) => ({ ...i, qty: str(i.qty), alt: list(i.alt) }));
  out.days = (out.days || []).map((day) => ({
    ...day,
    targets: Object.fromEntries(["kcal", "prot", "carb", "fat"].map((k) => [k, str(day.targets?.[k])])),
    meals: (day.meals || []).map((m) => ({ ...m, items: items(m.items), options: (m.options || []).map((o) => ({ ...o, name: str(o.name), items: items(o.items) })) })),
  }));
  out.substitutions = (Array.isArray(out.substitutions) ? out.substitutions : []).map((x) => ({ ...x, food: str(x.food), alt: list(x.alt), note: str(x.note) }));
  out.sections = (Array.isArray(out.sections) ? out.sections : []).map(editableSection);
  return out;
}

export function editableProfile(p = {}) {
  const out = { phase: p.phase || "" };
  for (const k of PROFILE_FIELDS) out[k] = str(p[k]);
  const r = isObj(p.rules) ? p.rules : {};
  out.rules = Object.fromEntries([...RULE_FIELDS, "step"].map((k) => [k, str(r[k])]));
  out.startDate = str(p.startDate);
  out.zone2 = { min: str(p.zone2?.min), max: str(p.zone2?.max) };
  return out;
}

export function emptyDraft(todayIso, dayNames, base) {
  return {
    v: DRAFT_VERSION,
    include: { profile: false, program: false, diet: false, plan: false, history: false },
    profile: editableProfile(base?.profile),
    programMode: "new",
    program: blankProgram(todayIso),
    programActive: true,
    closePrevProgram: true,
    dietMode: "new",
    diet: blankDiet(todayIso, dayNames),
    dietActive: true,
    closePrevDiet: true,
    plan: editablePlan(base?.plan),
    history: { date: todayIso, title: "", text: "" },
  };
}

/** Load the chosen starting point ("new", "edit:<id>", "copy:<id>") into the draft. */
export function startFrom(kind, mode, base, todayIso, dayNames) {
  const coll = kind === "program" ? base?.programs : base?.diets;
  const [how, id] = mode.split(/:(.*)/s);
  const source = id && coll?.[id];
  if (!source) return { mode: "new", value: kind === "program" ? blankProgram(todayIso) : blankDiet(todayIso, dayNames) };
  const value = kind === "program" ? editableProgram(source) : editableDiet(source);
  if (how === "copy") {
    value.id = suggestId(source.id || id, coll, todayIso);
    value.startDate = nextMonday(todayIso);
    value.endDate = null;
  }
  return { mode, value };
}

/** Every exercise id used in the stored programs, with its latest name. */
export function knownExercises(base) {
  const out = {};
  const programs = Object.values(base?.programs || {}).sort((a, b) => str(a.startDate).localeCompare(str(b.startDate)));
  for (const p of programs) for (const s of p.sessions || []) for (const e of s.exercises || []) if (e.id) out[e.id] = e.name || out[e.id] || "";
  return out;
}

/** Clean plan-shaped sections (plan text, diet sections); ids come from the title when empty. */
function cleanSections(sections, tab, add) {
  const ids = new Set();
  return (sections || []).map((s, i) => {
    const x = { ...s, title: str(s.title).trim() };
    if (!x.title) add("error", "sectionNoTitle", tab, { n: i + 1 });
    x.id = str(s.id).trim() || slug(x.title) || `sezione-${i + 1}`;
    while (ids.has(x.id)) x.id = `${x.id}-${i + 1}`;
    ids.add(x.id);
    for (const k of ["paragraphs", "bullets", "numbered"]) { x[k] = cleanList(s[k]); if (!x[k].length) delete x[k]; }
    const table = typeof s.table === "string" ? textToTable(s.table) : s.table;
    if (table) x.table = table; else delete x.table;
    trimOrDrop(x, "note");
    return x;
  });
}

/**
 * Build the plan file from the draft. `base` is the user's current data (or a
 * loaded backup): it decides which ids already exist and which program and
 * diet are active. Returns the file plus every issue found; issues carry a
 * locale key under "composer:issues", its params, the tab to fix it in and,
 * when relevant, where in the program or diet it is.
 */
export function buildPlanFile(draft, base, now = new Date()) {
  const issues = [];
  const add = (level, key, tab, params = {}, at) => issues.push({ level, key, tab, params, ...(at ? { at } : {}) });
  const error = (...a) => add("error", ...a);
  const warn = (...a) => add("warn", ...a);
  const data = { version: SCHEMA_VERSION };
  const parts = [];
  const inc = draft.include;

  if (inc.profile) {
    parts.push("profile");
    const p = draft.profile;
    const out = {};
    if (p.phase) out.phase = p.phase;
    for (const k of PROFILE_FIELDS) {
      const n = num(p[k]);
      if (str(p[k]).trim() && n === undefined) error("notNumber", "profile", { field: k });
      else if (n !== undefined && n <= 0) error("notPositive", "profile", { field: k });
      else if (n !== undefined) out[k] = n;
    }
    const rules = {};
    for (const k of RULE_FIELDS) { const n = num(p.rules?.[k]); if (n !== undefined) rules[k] = n; }
    if (str(p.rules?.step).trim()) rules.step = str(p.rules.step).trim();
    if (Object.keys(rules).length) out.rules = { ...(isObj(base?.profile?.rules) ? base.profile.rules : {}), ...rules };
    if (str(p.startDate)) out.startDate = str(p.startDate);
    const z = { min: num(p.zone2?.min), max: num(p.zone2?.max) };
    if (z.min !== undefined || z.max !== undefined) {
      if (z.min === undefined || z.max === undefined || z.min >= z.max) error("zone2", "profile");
      else out.zone2 = z;
    }
    if (out.kcal && out.prot && out.carb && out.fat) {
      const calc = macroKcal(out.prot, out.carb, out.fat);
      if (Math.abs(calc - out.kcal) > KCAL_TOLERANCE) warn("macroMismatch", "profile", { calc, kcal: out.kcal });
    }
    if (!Object.keys(out).length) error("profileEmpty", "profile");
    data.profile = out;
  }

  if (inc.program) {
    parts.push("program");
    const isNew = !draft.programMode.startsWith("edit:");
    const known = knownExercises(base);
    const p = clone(draft.program);
    p.id = str(p.id).trim();
    ["name", "author", "goal"].forEach((k) => trimOrDrop(p, k));
    if (!p.id) error("programNoId", "program");
    else if (!/^[a-z0-9][a-z0-9-]*$/i.test(p.id)) warn("idFormat", "program", { id: p.id });
    if (p.id && isNew && base?.programs?.[p.id]) error("programIdTaken", "program", { id: p.id });
    if (!p.name) warn("programNoName", "program");
    if (!p.startDate) warn("noStartDate", "program");
    p.notes = (p.notes || []).map((n) => str(n).trim()).filter(Boolean);
    const notes = Object.fromEntries(Object.entries(p.activityNotes || {}).map(([k, v]) => [k, str(v).trim()]).filter(([, v]) => v));
    if (Object.keys(notes).length) p.activityNotes = notes; else delete p.activityNotes;
    if (!p.sessions?.length) error("noSessions", "program");
    const sessionIds = new Set();
    p.sessions = (p.sessions || []).map((s, si) => {
      s.id = str(s.id).trim();
      trimOrDrop(s, "name");
      trimOrDrop(s, "note");
      const at = { session: si, sessionName: s.name || "" };
      if (!s.id) error("sessionNoId", "program", {}, at);
      else if (sessionIds.has(s.id)) error("sessionIdTwice", "program", { id: s.id }, at);
      sessionIds.add(s.id);
      if (!s.exercises?.length) error("sessionEmpty", "program", {}, at);
      const exIds = new Set();
      s.exercises = (s.exercises || []).map((e, ei) => {
        const x = { ...e };
        const eat = { ...at, exercise: ei, exerciseName: str(e.name).trim() };
        x.id = str(x.id).trim();
        x.name = str(x.name).trim();
        if (!x.id) error("exerciseNoId", "program", {}, eat);
        else if (exIds.has(x.id)) error("exerciseIdTwice", "program", { id: x.id }, eat);
        exIds.add(x.id);
        if (!x.name) error("exerciseNoName", "program", {}, eat);
        const was = known[x.id];
        if (x.id && was && x.name && was.trim().toLowerCase() !== x.name.toLowerCase()) warn("exerciseRenamed", "program", { id: x.id, was }, eat);
        x.sets = num(e.sets);
        if (x.sets === undefined || x.sets < 1 || !Number.isInteger(x.sets)) error("badSets", "program", {}, eat);
        else if (x.sets > MAX_SETS) warn("manySets", "program", { n: x.sets, max: MAX_SETS }, eat);
        let reps = (Array.isArray(e.reps) ? e.reps : [e.reps]).map(num).filter((n) => n !== undefined);
        if (reps.length === 1) reps = [reps[0], reps[0]];
        if (!reps.length) error("noReps", "program", {}, eat);
        else if (reps[0] > reps[1]) error("repsOrder", "program", {}, eat);
        x.reps = reps;
        const rest = num(e.rest);
        if (rest === undefined) { delete x.rest; if (!x.superset) warn("noRest", "program", {}, eat); } else x.rest = rest;
        trimOrDrop(x, "rir");
        trimOrDrop(x, "notes");
        if (x.superset) {
          x.superset = true;
          if (ei === s.exercises.length - 1) error("supersetLast", "program", {}, eat);
          if (x.rest) warn("supersetRest", "program", {}, eat);
        } else delete x.superset;
        if (x.perSide) x.perSide = true; else delete x.perSide;
        return x;
      });
      return s;
    });
    p.week = Object.fromEntries(Object.entries(p.week || {}).filter(([, v]) => v));
    for (const [day, v] of Object.entries(p.week)) {
      if (!ACTIVITIES.includes(v) && !sessionIds.has(v)) error("weekUnknown", "program", { day, id: v });
    }
    for (const id of sessionIds) if (id && !Object.values(p.week || {}).includes(id)) warn("sessionUnplanned", "program", { id });
    p.volume = (p.volume || []).filter((v) => str(v.name).trim() || str(v.sets).trim()).map((v) => {
      const x = { ...v, name: str(v.name).trim(), sets: num(v.sets) };
      if (!x.name || x.sets === undefined) error("volumeRow", "program", { name: x.name || "?" });
      trimOrDrop(x, "detail");
      return x;
    });
    if (!p.volume.length) delete p.volume;
    p.endDate = p.endDate || null;
    data.programs = { [p.id || "-"]: p };
    const prev = base?.activeProgram;
    if (isNew && draft.closePrevProgram && prev && prev !== p.id && base.programs?.[prev] && !base.programs[prev].endDate && p.startDate) {
      data.programs[prev] = { ...base.programs[prev], endDate: dayBefore(p.startDate) };
    }
    if (draft.programActive) data.activeProgram = p.id;
    else if (isNew) warn("programNotActive", "program");
  }

  if (inc.diet) {
    parts.push("diet");
    const isNew = !draft.dietMode.startsWith("edit:");
    const d = clone(draft.diet);
    d.id = str(d.id).trim();
    ["name", "author", "note"].forEach((k) => trimOrDrop(d, k));
    if (!d.id) error("dietNoId", "diet");
    else if (!/^[a-z0-9][a-z0-9-]*$/i.test(d.id)) warn("idFormat", "diet", { id: d.id });
    if (d.id && isNew && base?.diets?.[d.id]) error("dietIdTaken", "diet", { id: d.id });
    if (!d.name) warn("dietNoName", "diet");
    const targets = {};
    for (const k of ["kcal", "prot", "carb", "fat"]) { const n = num(d.targets?.[k]); if (n !== undefined) targets[k] = n; }
    d.targets = targets;
    if (targets.kcal && targets.prot && targets.carb && targets.fat) {
      const calc = macroKcal(targets.prot, targets.carb, targets.fat);
      if (Math.abs(calc - targets.kcal) > KCAL_TOLERANCE) warn("macroMismatch", "diet", { calc, kcal: targets.kcal });
    }
    const profileKcal = inc.profile ? num(draft.profile.kcal) : num(base?.profile?.kcal);
    if (profileKcal && targets.kcal && profileKcal !== targets.kcal) warn("dietVsProfile", "diet", { diet: targets.kcal, profile: profileKcal });
    d.notes = (d.notes || []).map((n) => str(n).trim()).filter(Boolean);
    if (d.days.length !== 7) warn("dayCount", "diet", { n: d.days.length });
    const dayIds = new Set(d.days.map((x) => x.id));
    for (const [day, v] of Object.entries(d.week || {})) if (!dayIds.has(v)) error("dietWeekUnknown", "diet", { day, id: v });
    d.days = d.days.map((day, di) => {
      trimOrDrop(day, "note");
      const dt = {};
      for (const k of ["kcal", "prot", "carb", "fat"]) { const n = num(day.targets?.[k]); if (n !== undefined) dt[k] = n; }
      if (Object.keys(dt).length) day.targets = dt; else delete day.targets;
      const at = { day: di, dayName: day.name || day.id };
      if (!day.meals.length) error("dayNoMeals", "diet", {}, at);
      day.meals = day.meals.map((m, mi) => {
        const mat = { ...at, meal: mi, mealName: str(m.name).trim() };
        m.name = str(m.name).trim();
        trimOrDrop(m, "time");
        trimOrDrop(m, "note");
        if (!m.name) error("mealNoName", "diet", {}, mat);
        const cleanItems = (items) => (items || [])
          .filter((it) => str(it.food).trim() || str(it.qty).trim() || cleanList(it.alt).length)
          .map((it) => {
            const x = { ...it, food: str(it.food).trim() };
            if (!x.food) error("itemNoFood", "diet", {}, mat);
            const q = num(x.qty);
            if (q !== undefined) x.qty = q;
            else if (str(x.qty).trim()) x.qty = str(x.qty).trim();
            else { delete x.qty; if (x.food) warn("itemNoQty", "diet", { food: x.food }, mat); }
            trimOrDrop(x, "unit");
            trimOrDrop(x, "note");
            x.alt = cleanList(x.alt);
            if (!x.alt.length) delete x.alt;
            return x;
          });
        m.items = cleanItems(m.items);
        m.options = (m.options || []).map((o, oi) => {
          const x = { ...o, name: str(o.name).trim(), items: cleanItems(o.items) };
          if (!x.name) error("optionNoName", "diet", { n: oi + 1 }, mat);
          if (!x.items.length) warn("optionEmpty", "diet", { name: x.name || oi + 1 }, mat);
          return x;
        });
        if (!m.options.length) delete m.options;
        if (!m.items.length && !(m.options || []).length) warn("mealEmpty", "diet", {}, mat);
        return m;
      });
      return day;
    });
    d.substitutions = (d.substitutions || []).filter((x) => str(x.food).trim() || cleanList(x.alt).length).map((x) => {
      const o = { ...x, food: str(x.food).trim(), alt: cleanList(x.alt) };
      if (!o.food) error("substitutionNoFood", "diet");
      if (!o.alt.length) warn("substitutionNoAlt", "diet", { food: o.food });
      trimOrDrop(o, "note");
      return o;
    });
    if (!d.substitutions.length) delete d.substitutions;
    d.sections = cleanSections(d.sections, "diet", add);
    if (!d.sections.length) delete d.sections;
    d.endDate = d.endDate || null;
    data.diets = { [d.id || "-"]: d };
    const prev = base?.activeDiet;
    if (isNew && draft.closePrevDiet && prev && prev !== d.id && base.diets?.[prev] && !base.diets[prev].endDate && d.startDate) {
      data.diets[prev] = { ...base.diets[prev], endDate: dayBefore(d.startDate) };
    }
    if (draft.dietActive) data.activeDiet = d.id;
    else if (isNew) warn("dietNotActive", "diet");
  }

  if (inc.plan) {
    parts.push("plan");
    const p = clone(draft.plan || {});
    const sections = cleanSections(p.sections, "plan", add);
    let yoga = null;
    if (p.yoga) {
      yoga = { ...p.yoga };
      ["title", "intro", "why"].forEach((k) => trimOrDrop(yoga, k));
      const poseIds = new Set();
      yoga.blocks = (yoga.blocks || []).map((b, bi) => {
        const x = { ...b, name: str(b.name).trim() };
        if (!x.name) error("yogaBlockNoName", "plan", { n: bi + 1 });
        x.poses = (b.poses || []).filter((q) => str(q.id).trim() || str(q.name).trim()).map((q) => {
          const o = { ...q, id: str(q.id).trim(), name: str(q.name).trim() };
          if (!o.id) error("poseNoId", "plan", { name: o.name || "?" });
          else if (poseIds.has(o.id)) error("poseIdTwice", "plan", { id: o.id });
          poseIds.add(o.id);
          if (!o.name) error("poseNoName", "plan", { id: o.id || "?" });
          trimOrDrop(o, "hold");
          return o;
        });
        return x;
      });
      const before = new Set((base?.plan?.yoga?.blocks || []).flatMap((b) => (b.poses || []).map((q) => q.id)));
      for (const id of before) if (!poseIds.has(id)) warn("poseRemoved", "plan", { id });
    }
    if (!sections.length && !yoga) warn("planEmpty", "plan");
    const { sections: _s, yoga: _y, ...rest } = p;
    data.plan = { ...rest, updatedAt: iso(now), sections, yoga };
  }

  if (inc.history) {
    parts.push("history");
    const h = draft.history;
    const entry = { date: str(h.date), title: str(h.title).trim() };
    if (str(h.text).trim()) entry.text = str(h.text).trim();
    if (!entry.date) error("historyNoDate", "history");
    if (!entry.title) error("historyNoTitle", "history");
    data.history = [entry];
  } else if (parts.length) warn("historySuggested", "history");

  if (!parts.length) error("nothingIncluded", "start");
  return {
    file: { app: BACKUP_APP, exportedAt: now.toISOString(), data },
    parts,
    issues,
    errors: issues.filter((i) => i.level === "error").length,
    fileName: `diario-fitness-piano-${parts.join("-") || "vuoto"}-${iso(now)}.json`,
  };
}
