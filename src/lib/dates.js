// Date helpers. Every stored key is a local calendar date ("YYYY-MM-DD"),
// an ISO week ("YYYY-Www") or a month ("YYYY-MM"); never a timestamp.

const pad = (n) => String(n).padStart(2, "0");

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function today() {
  return iso(new Date());
}

/** Monday of the week containing d. */
export function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  return x;
}

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(w)}`;
}

/** The seven "YYYY-MM-DD" keys of the week starting at monday. */
export function weekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
}

export function monthKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function fmtDate(s, lang, opts = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat(lang, opts).format(parseIso(s));
}

export function fmtMonth(key, lang) {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}
