import { useId } from "react";

/** Metal of each rank tier: [highlight, body, shadow]. */
export const TIER_METAL = [
  ["#E4E9EF", "#9AA3AE", "#4A5059"], // iron
  ["#F6C994", "#B9773F", "#5E3517"], // bronze
  ["#FFFFFF", "#C7CFD9", "#6F7986"], // silver
  ["#FFF2A6", "#E8B63C", "#7E520C"], // gold
  ["#E9FFFC", "#7FE0D6", "#24726D"], // platinum
  ["#EAF4FF", "#7AB6FF", "#24469E"], // diamond
  ["#FBE6FF", "#C88EFF", "#4F1A92"], // adamantine
];

function Metal({ id, tier }) {
  const [hi, mid, lo] = TIER_METAL[tier] || TIER_METAL[0];
  return (
    <>
      <linearGradient id={`${id}-m`} x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor={hi} />
        <stop offset="0.45" stopColor={mid} />
        <stop offset="0.55" stopColor={lo} />
        <stop offset="1" stopColor={mid} />
      </linearGradient>
      <radialGradient id={`${id}-g`} cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stopColor={mid} stopOpacity="0.55" />
        <stop offset="1" stopColor={mid} stopOpacity="0" />
      </radialGradient>
    </>
  );
}

/** Fantasy: a heraldic shield; wings from gold, a crown from diamond, gems and stars by tier. */
function FantasyEmblem({ id, tier, level }) {
  const [hi, mid, lo] = TIER_METAL[tier];
  return (
    <>
      <circle cx="50" cy="50" r="48" fill={`url(#${id}-g)`} />
      {tier >= 3 && (
        <g fill={`url(#${id}-m)`} stroke={lo} strokeWidth="1">
          <path d="M22 34 C8 30 2 40 4 52 C9 47 13 46 17 47 C10 52 9 60 12 66 C16 60 19 58 22 58 Z" />
          <path d="M78 34 C92 30 98 40 96 52 C91 47 87 46 83 47 C90 52 91 60 88 66 C84 60 81 58 78 58 Z" />
        </g>
      )}
      <path d="M50 10 L82 21 V47 C82 69 67 84 50 92 C33 84 18 69 18 47 V21 Z" fill={`url(#${id}-m)`} stroke={lo} strokeWidth="2" />
      <path d="M50 17 L75 26 V47 C75 64 64 77 50 84 C36 77 25 64 25 47 V26 Z" fill="#120E0A" opacity="0.86" />
      <path d="M50 17 L75 26 V47 C75 64 64 77 50 84" fill="none" stroke={hi} strokeOpacity="0.35" strokeWidth="1" />
      {tier >= 5 && (
        <path d="M34 12 L38 2 L44 9 L50 0 L56 9 L62 2 L66 12 Z" fill={`url(#${id}-m)`} stroke={lo} strokeWidth="1" />
      )}
      {tier >= 2 && <path d="M50 74 l5 6 -5 6 -5 -6 z" fill={mid} stroke={hi} strokeWidth="0.8" />}
      {Array.from({ length: Math.min(3, tier) }, (_, i) => (
        <path key={i} transform={`translate(${50 + (i - (Math.min(3, tier) - 1) / 2) * 11} 30) scale(0.32)`} d="M0 -10 L3 -3 10 -3 4.5 1.5 6.5 9 0 4.5 -6.5 9 -4.5 1.5 -10 -3 -3 -3 Z" fill={hi} />
      ))}
      <text x="50" y="62" textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontWeight="700" fontSize={level >= 100 ? 20 : 26} fill={hi}>{level}</text>
    </>
  );
}

/** System: a glowing hexagonal crystal inside a slowly turning ring of runes. */
function SystemEmblem({ id, tier, level }) {
  const [hi, mid] = TIER_METAL[tier];
  return (
    <>
      <circle cx="50" cy="50" r="48" fill={`url(#${id}-g)`} />
      <g className="emblem-spin">
        <circle cx="50" cy="50" r="45" fill="none" stroke={mid} strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="2 5 14 5" />
      </g>
      <g className="emblem-spin-rev">
        <circle cx="50" cy="50" r="39" fill="none" stroke={hi} strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="1 3" />
      </g>
      <path d="M50 16 L79 33 V67 L50 84 L21 67 V33 Z" fill="#050A18" stroke={`url(#${id}-m)`} strokeWidth="3" />
      <path d="M50 24 L72 37 V63 L50 76 L28 63 V37 Z" fill="none" stroke={mid} strokeOpacity="0.6" strokeWidth="1" />
      <path d="M50 16 L50 24 M79 33 L72 37 M79 67 L72 63 M50 84 L50 76 M21 67 L28 63 M21 33 L28 37" stroke={hi} strokeOpacity="0.7" strokeWidth="1" />
      {tier >= 4 && <path d="M50 8 L54 14 L50 12 L46 14 Z M50 92 L54 86 L50 88 L46 86 Z" fill={hi} />}
      <text x="50" y="59" textAnchor="middle" fontFamily="Rajdhani, sans-serif" fontWeight="700" fontSize={level >= 100 ? 22 : 28} fill={hi} style={{ filter: `drop-shadow(0 0 4px ${mid})` }}>{level}</text>
    </>
  );
}

/** Cyberpunk: a neon chip with cut corners and circuit traces. */
function CyberEmblem({ id, tier, level }) {
  const [hi, mid] = TIER_METAL[tier];
  return (
    <>
      <circle cx="50" cy="50" r="48" fill={`url(#${id}-g)`} />
      <g stroke={mid} strokeOpacity="0.7" strokeWidth="1.2" fill="none">
        <path d="M2 50 H14 M86 50 H98 M50 2 V14 M50 86 V98" />
        {tier >= 2 && <path d="M8 30 H18 L24 36 M92 30 H82 L76 36 M8 70 H18 L24 64 M92 70 H82 L76 64" />}
      </g>
      <g fill={mid}>
        <circle cx="2" cy="50" r="1.6" /><circle cx="98" cy="50" r="1.6" /><circle cx="50" cy="2" r="1.6" /><circle cx="50" cy="98" r="1.6" />
      </g>
      <path d="M30 14 H70 L86 30 V70 L70 86 H30 L14 70 V30 Z" fill="#0A0612" stroke={`url(#${id}-m)`} strokeWidth="2.5" />
      <path d="M33 22 H67 L78 33 V67 L67 78 H33 L22 67 V33 Z" fill="none" stroke={hi} strokeOpacity="0.25" strokeWidth="1" />
      <g className="emblem-glitch">
        <text x="51.5" y="59" textAnchor="middle" fontFamily="Orbitron, sans-serif" fontWeight="700" fontSize={level >= 100 ? 18 : 24} fill="#00E5FF" opacity="0.7">{level}</text>
        <text x="48.5" y="59" textAnchor="middle" fontFamily="Orbitron, sans-serif" fontWeight="700" fontSize={level >= 100 ? 18 : 24} fill="#FF2BD6" opacity="0.7">{level}</text>
      </g>
      <text x="50" y="59" textAnchor="middle" fontFamily="Orbitron, sans-serif" fontWeight="700" fontSize={level >= 100 ? 18 : 24} fill={hi}>{level}</text>
    </>
  );
}

const BY_STYLE = { fantasy: FantasyEmblem, system: SystemEmblem, cyber: CyberEmblem };

/** The rank emblem for a style. Decorative: the level and rank are always also written in text. */
export function StyleEmblem({ style = "fantasy", tier = 0, level = 1, size = 56, className = "" }) {
  const id = useId().replace(/:/g, "");
  const Body = BY_STYLE[style] || FantasyEmblem;
  const t = Math.max(0, Math.min(6, tier));
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className={`shrink-0 overflow-visible ${className}`}>
      <defs><Metal id={id} tier={t} /></defs>
      <Body id={id} tier={t} level={level} />
    </svg>
  );
}
