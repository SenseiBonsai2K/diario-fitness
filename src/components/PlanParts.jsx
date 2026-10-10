// Building blocks shared by the plan screen and the diet view.

export function Section({ title, sub, children, open = false }) {
  return (
    <details className="card group" open={open}>
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
        <div className="min-w-0">
          <h2 className="h-display text-xl">{title}</h2>
          {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
        </div>
        <span aria-hidden="true" className="w-8 h-8 rounded-full bg-raised grid place-items-center text-muted transition-transform group-open:rotate-90 shrink-0">›</span>
      </summary>
      <div className="flex flex-col gap-3 pt-1 text-[0.95rem] leading-relaxed">{children}</div>
    </details>
  );
}

export function Table({ head, rows, monoFrom = 99, alignLast = false }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm num">
        <thead>
          <tr className="text-left">{head.map((h, i) => <th key={i} className={`eyebrow py-1.5 pr-3 font-semibold whitespace-nowrap ${alignLast && i === head.length - 1 ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => (
                <td key={j} className={`py-2 pr-3 ${j >= monoFrom ? "whitespace-nowrap font-mono text-[0.8rem]" : ""} ${alignLast && j === r.length - 1 ? "text-right" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A plan section from the user's data: paragraphs, bullets, numbered steps, a table, a note. */
export function Content({ s }) {
  return (
    <>
      {(s.paragraphs || []).map((p, i) => <p key={`p${i}`}>{p}</p>)}
      {s.table && <Table head={s.table.head} rows={s.table.rows} />}
      {s.bullets?.length > 0 && <ul className="list-disc pl-5 flex flex-col gap-1.5">{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
      {s.numbered?.length > 0 && <ol className="list-decimal pl-5 flex flex-col gap-1.5">{s.numbered.map((b, i) => <li key={i}>{b}</li>)}</ol>}
      {s.note && <p className="text-sm text-muted">{s.note}</p>}
    </>
  );
}
