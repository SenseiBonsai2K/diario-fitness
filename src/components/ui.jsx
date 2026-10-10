import { useId } from "react";

export function Card({ title, aside, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="eyebrow">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Text field that accepts decimal commas; stores exactly what was typed. */
export function NumField({ label, unit, value, onChange, placeholder, decimal = true, hint }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id} className="label">
        {label}
        {unit && <span className="ml-1 font-mono text-[0.7rem]">{unit}</span>}
      </label>
      <input
        id={id}
        className="input font-mono"
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-xs text-muted num">{hint}</span>}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, multiline = false }) {
  const id = useId();
  const props = {
    id,
    className: `input ${multiline ? "min-h-[84px] resize-y" : ""}`,
    value: value ?? "",
    placeholder,
    onChange: (e) => onChange(e.target.value),
  };
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id} className="label">{label}</label>
      {multiline ? <textarea {...props} /> : <input type="text" {...props} />}
    </div>
  );
}

/** Single-choice row of buttons (radiogroup semantics). Tap the active one again to clear it. */
export function Segmented({ label, options, value, onChange, clearable = true }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {label && <span id={id} className="label">{label}</span>}
      <div role="radiogroup" aria-labelledby={label ? id : undefined} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = String(value) === String(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(active && clearable ? "" : o.value)}
              className={`min-w-[44px] min-h-[40px] px-3 rounded-field border text-sm font-medium transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                ${active ? "bg-accent border-accent text-accent-ink" : "bg-bg border-line text-ink"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }) {
  const toneClass = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="min-w-0 flex flex-col gap-0.5">
      <span className="eyebrow">{label}</span>
      <span className={`font-display text-[1.75rem] font-semibold leading-none num ${toneClass}`}>{value}</span>
      {sub && <span className="text-xs text-muted num">{sub}</span>}
    </div>
  );
}

export function Grid({ children, cols = 2 }) {
  const c = cols === 3 ? "grid-cols-3" : cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2";
  return <div className={`grid ${c} gap-3`}>{children}</div>;
}

/** Previous / label / next control for days, weeks and months. */
export function Stepper({ label, onPrev, onNext, prevLabel, nextLabel, extra }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={onPrev} aria-label={prevLabel} className="w-11 h-11 rounded-field border border-line bg-surface grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Icon name="chevronLeft" />
      </button>
      <div className="flex-1 min-w-0 text-center">
        <div className="h-display text-xl truncate">{label}</div>
        {extra}
      </div>
      <button type="button" onClick={onNext} aria-label={nextLabel} className="w-11 h-11 rounded-field border border-line bg-surface grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}

const PATHS = {
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  today: "M4 7h16M4 7v12h16V7M4 7l1-3h14l1 3M9 12h6M9 16h4",
  dumbbell: "M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12",
  chart: "M4 19h16M6 16l4-5 3 3 5-7",
  book: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-1-3-2 .2-1.3-1.3.2-2-3-1-1 2h-1.8l-1-2-3 1 .2 2L6 7.2 4 7l-1 3 2 1v1.8l-2 1 1 3 2-.2 1.3 1.3-.2 2 3 1 1-2h1.8l1 2 3-1-.2-2 1.3-1.3 2 .2 1-3-2-1z",
  check: "M5 12l5 5 9-11",
  up: "M12 19V5M6 11l6-6 6 6",
  timer: "M12 8v5l3 2M9 2h6M12 22a8 8 0 100-16 8 8 0 000 16z",
  close: "M6 6l12 12M18 6L6 18",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  print: "M7 9V4h10v5M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v6H7z",
  upload: "M12 20V9M7 14l5-5 5 5M5 4h14",
  share: "M8 12l8-5M8 12l8 5M6 14a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM18 19a2 2 0 100-4 2 2 0 000 4z",
};

export function Icon({ name, size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}
