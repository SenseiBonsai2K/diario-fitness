import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleEmblem } from "./emblems.jsx";

const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const rgb = (name) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(Number);
  return v.length === 3 && v.every((x) => !Number.isNaN(x)) ? v : [140, 160, 255];
};

/**
 * The living background behind every screen: embers rising (fantasy), motes
 * and a scan line (system), sparse digital rain (cyberpunk). Small canvas,
 * ~30 fps, paused when the app is hidden, off with reduced motion.
 */
export function Backdrop({ style }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduced()) return undefined;
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, raf = 0, last = 0, parts = [], running = true;
    const accent = rgb("--accent");
    const scale = 0.5; // half resolution: soft and cheap
    const resize = () => {
      w = Math.ceil(window.innerWidth * scale); h = Math.ceil(window.innerHeight * scale);
      canvas.width = w; canvas.height = h;
    };
    const rand = (a, b) => a + Math.random() * (b - a);
    const spawn = (initial) => {
      if (style === "cyber") return { x: Math.floor(rand(0, w / 7)) * 7, y: initial ? rand(-h, h) : rand(-60, -10), v: rand(0.6, 1.6), len: Math.floor(rand(4, 12)), seed: Math.random() };
      if (style === "system") return { x: rand(0, w), y: rand(0, h), r: rand(0.4, 1.4), vx: rand(-0.06, 0.06), vy: rand(-0.12, -0.02), a: rand(0.15, 0.6), p: rand(0, 6.28) };
      return { x: rand(0, w), y: initial ? rand(0, h) : h + 4, r: rand(0.5, 1.6), vx: rand(-0.12, 0.12), vy: rand(-0.45, -0.15), life: rand(0.5, 1), p: rand(0, 6.28) };
    };
    const count = style === "cyber" ? 26 : style === "system" ? 46 : 38;
    resize();
    parts = Array.from({ length: count }, () => spawn(true));
    const ember = style === "fantasy" ? [255, 176, 92] : accent;
    let scan = 0;
    const frame = (t) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return;
      const dt = Math.min(3, (t - last) / 16.7);
      last = t;
      ctx.clearRect(0, 0, w, h);
      if (style === "cyber") {
        ctx.font = "7px monospace";
        for (const q of parts) {
          q.y += q.v * dt;
          for (let i = 0; i < q.len; i++) {
            const alpha = (1 - i / q.len) * 0.35;
            const pink = (q.seed + i) % 1 > 0.5;
            ctx.fillStyle = pink ? `rgba(${accent.join(",")},${alpha})` : `rgba(0,229,255,${alpha * 0.8})`;
            ctx.fillText(String.fromCharCode(0x30a0 + Math.floor(((q.seed * 97 + i * 13 + Math.floor(t / 400)) % 1) * 96)), q.x, q.y - i * 8);
          }
          if (q.y - q.len * 8 > h) Object.assign(q, spawn(false));
        }
      } else if (style === "system") {
        for (const q of parts) {
          q.x += q.vx * dt; q.y += q.vy * dt; q.p += 0.02 * dt;
          if (q.y < -4) { q.y = h + 4; q.x = rand(0, w); }
          const a = q.a * (0.6 + 0.4 * Math.sin(q.p));
          ctx.fillStyle = `rgba(${accent.join(",")},${a})`;
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.fill();
        }
        scan = (scan + 0.6 * dt) % (h + 80);
        const g = ctx.createLinearGradient(0, scan - 40, 0, scan);
        g.addColorStop(0, `rgba(${accent.join(",")},0)`);
        g.addColorStop(1, `rgba(${accent.join(",")},0.07)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, scan - 40, w, 40);
      } else {
        for (const q of parts) {
          q.x += (q.vx + Math.sin(q.p) * 0.08) * dt; q.y += q.vy * dt; q.p += 0.03 * dt; q.life -= 0.0016 * dt;
          if (q.y < -4 || q.life <= 0) Object.assign(q, spawn(false));
          const a = Math.max(0, q.life) * (0.55 + 0.45 * Math.sin(q.p * 3));
          ctx.fillStyle = `rgba(${ember.join(",")},${a * 0.8})`;
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.fill();
          ctx.fillStyle = `rgba(${ember.join(",")},${a * 0.15})`;
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 4, 0, 6.283); ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      if (document.visibilityState === "hidden") { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", onVis); };
  }, [style]);
  return <canvas ref={ref} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none z-0 opacity-90" />;
}

const SPLASH_KEY = "splash-seen";

/**
 * The opening: about 1.8 s once per session, a different entrance per style
 * (a forged emblem, the System window, a glitching boot). Tap to skip.
 */
export function Splash({ style, tier, level, rank, line }) {
  const { t } = useTranslation("game");
  const [show, setShow] = useState(() => { try { return !sessionStorage.getItem(SPLASH_KEY); } catch { return false; } });
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!show) return undefined;
    try { sessionStorage.setItem(SPLASH_KEY, "1"); } catch { /* ignore */ }
    const quick = reduced();
    const a = setTimeout(() => setLeaving(true), quick ? 500 : 1900);
    const b = setTimeout(() => setShow(false), quick ? 700 : 2350);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [show]);
  if (!show) return null;
  const skip = () => { setLeaving(true); setTimeout(() => setShow(false), 300); };
  return (
    <div role="presentation" onClick={skip} className={`splash splash-${style} ${leaving ? "splash-out" : ""} fixed inset-0 z-[70] grid place-items-center overflow-hidden`}>
      <div className="splash-rays" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-4 text-center px-8">
        {style === "system" && <div className="splash-sys-bar font-display tracking-[0.3em] text-sm">[ SYSTEM ]</div>}
        <div className="splash-emblem"><StyleEmblem style={style} tier={tier} level={level} size={148} /></div>
        <div className="splash-title font-display text-[2.1rem] leading-none" data-text="DIARIO FITNESS">DIARIO FITNESS</div>
        <div className="splash-sub font-display uppercase tracking-[0.25em] text-sm" style={{ color: `rgb(var(--tier-${tier}))` }}>{rank}</div>
        {line && <div className="splash-line text-sm text-muted max-w-xs">{line}</div>}
      </div>
      <span className="sr-only">{t("splash.skip")}</span>
    </div>
  );
}

/** Particles flying out of a point (level up, perfect day). Pure CSS, a few dozen spans. */
export function Burst({ count = 24, color = "rgb(var(--accent))" }) {
  return (
    <span aria-hidden="true" className="burst-root">
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * 360 + (i % 3) * 7;
        const d = 70 + (i % 5) * 18;
        return <span key={i} className="burst-dot" style={{ "--a": `${a}deg`, "--d": `${d}px`, background: color, animationDelay: `${(i % 4) * 40}ms` }} />;
      })}
    </span>
  );
}
