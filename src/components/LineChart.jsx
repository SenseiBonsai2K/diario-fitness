import { parseIso } from "../lib/dates.js";

/**
 * Small time-series chart in inline SVG. `points` are drawn as dots, `trend`
 * as a line with an emphasised, labelled endpoint. Colours come from tokens.
 */
export function LineChart({ points = [], trend = [], unit = "", lang, ariaLabel, decimals = 1 }) {
  const all = [...points, ...trend];
  if (all.length < 2) return null;

  const W = 340, H = 190, L = 34, R = 10, T = 18, B = 24;
  const times = all.map((p) => parseIso(p.date).getTime());
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const span = Math.max(t1 - t0, 86400000);
  const vals = all.map((p) => p.value);
  const pad = Math.max((Math.max(...vals) - Math.min(...vals)) * 0.15, 0.5);
  let lo = Math.min(...vals) - pad, hi = Math.max(...vals) + pad;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const x = (d) => L + ((parseIso(d).getTime() - t0) / span) * (W - L - R);
  const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const fmt = (v, dp = decimals) => v.toLocaleString(lang, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const dateFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });

  const grid = [];
  for (let g = lo; g <= hi + step / 2; g += step) grid.push(g);
  const gridDp = step < 1 ? 1 : 0;
  const ticks = [t0, t0 + span / 2, t1];
  const last = (trend.length ? trend : points)[(trend.length ? trend : points).length - 1];
  const lineSeries = trend.length ? trend : points;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="w-full h-auto block">
      {grid.map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="rgb(var(--line))" strokeWidth="1" />
          <text x={L - 5} y={y(g) + 3.5} textAnchor="end" fontSize="10" fill="rgb(var(--muted))" className="num">{fmt(g, gridDp)}</text>
        </g>
      ))}
      {ticks.map((tt, i) => (
        <text key={i} x={L + ((tt - t0) / span) * (W - L - R)} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize="10" fill="rgb(var(--muted))">
          {dateFmt.format(new Date(tt))}
        </text>
      ))}
      {trend.length > 0 && points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="2.6" fill="rgb(var(--muted) / 0.55)" />
      ))}
      <polyline
        fill="none"
        stroke="rgb(var(--accent))"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={lineSeries.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
      />
      {!trend.length && points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="3" fill="rgb(var(--accent))" />)}
      <circle cx={x(last.date)} cy={y(last.value)} r="4.5" fill="rgb(var(--accent))" stroke="rgb(var(--surface))" strokeWidth="2" />
      <text x={Math.min(x(last.date), W - R)} y={Math.max(y(last.value) - 9, 11)} textAnchor="end" fontSize="11" fontWeight="600" fill="rgb(var(--accent))" className="num">
        {fmt(last.value)} {unit}
      </text>
    </svg>
  );
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
