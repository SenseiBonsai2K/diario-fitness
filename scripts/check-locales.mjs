// Fails when a translation key exists in one locale but not the other.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/locales/", import.meta.url).pathname;
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const base = (k) => k.replace(/_(one|other|zero|two|few|many)$/, "");
const langs = readdirSync(root).filter((d) => !d.includes("."));
const keys = {};
for (const l of langs) {
  keys[l] = new Set();
  for (const f of readdirSync(join(root, l)).filter((f) => f.endsWith(".json"))) {
    const ns = f.replace(".json", "");
    for (const k of flat(JSON.parse(readFileSync(join(root, l, f), "utf8")))) keys[l].add(`${ns}:${base(k)}`);
  }
}
let failed = false;
for (const a of langs) for (const b of langs) {
  if (a === b) continue;
  const missing = [...keys[a]].filter((k) => !keys[b].has(k));
  if (missing.length) { failed = true; console.error(`Missing in ${b} (present in ${a}):\n  ${missing.join("\n  ")}`); }
}
if (failed) process.exit(1);
console.log(`Locales OK: ${langs.join(", ")} · ${keys[langs[0]].size} keys each`);
