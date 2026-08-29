// The plant this software commissions, drawn as one continuous scene: a wind
// farm on the ridge, a substation lattice tower and transmission run through
// the middle, and a data-center hall with its server rows on the right.
// Vector rather than photographic — it loads instantly, stays sharp at any
// width, and its contrast is controlled rather than whatever a stock photo
// happened to have.
export function HeroScene() {
  return (
    <svg
      className="hero-art"
      viewBox="0 0 1200 320"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="cxSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#123a86" />
          <stop offset="55%" stopColor="#0d2a63" />
          <stop offset="100%" stopColor="#07152f" />
        </linearGradient>
        <linearGradient id="cxGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#06d4f0" stopOpacity="0" />
          <stop offset="100%" stopColor="#06d4f0" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="cxHall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b3f8f" />
          <stop offset="100%" stopColor="#0a1c3f" />
        </linearGradient>
        <linearGradient id="cxRidge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16346f" />
          <stop offset="100%" stopColor="#0a1a3a" />
        </linearGradient>
      </defs>

      <rect width="1200" height="320" fill="url(#cxSky)" />

      {/* horizon glow */}
      <rect x="0" y="196" width="1200" height="60" fill="url(#cxGlow)" opacity="0.4" />

      {/* ridge line behind everything */}
      <path
        d="M0 232 L120 214 L215 226 L330 200 L430 218 L540 198 L660 216 L780 202 L900 218 L1030 206 L1200 222 L1200 320 L0 320 Z"
        fill="url(#cxRidge)"
      />

      {/* ── wind farm ─────────────────────────────────────────────── */}
      <g stroke="#7fb4ff" strokeWidth="2" fill="none" opacity="0.85">
        {[
          { x: 150, y: 214, s: 1 },
          { x: 258, y: 224, s: 0.76 },
          { x: 62, y: 226, s: 0.62 },
        ].map((t, i) => (
          <g key={i} transform={`translate(${t.x} ${t.y}) scale(${t.s})`}>
            <line x1="0" y1="0" x2="0" y2="-74" strokeWidth={2.4} />
            <circle cx="0" cy="-74" r="3.4" fill="#bcd8ff" stroke="none" />
            <line x1="0" y1="-74" x2="0" y2="-112" />
            <line x1="0" y1="-74" x2="33" y2="-56" />
            <line x1="0" y1="-74" x2="-33" y2="-56" />
          </g>
        ))}
      </g>

      {/* ── substation: lattice tower + transmission run ──────────── */}
      <g stroke="#8fc2ff" fill="none" opacity="0.9">
        <g transform="translate(430 218)">
          <path d="M-26 0 L-11 -96 M26 0 L11 -96" strokeWidth="2.4" />
          <path d="M-11 -96 L11 -96" strokeWidth="2.4" />
          <path d="M-22 -26 L22 -26 M-18 -52 L18 -52 M-14 -76 L14 -76" strokeWidth="1.5" />
          <path d="M-22 -26 L18 -52 M22 -26 L-18 -52 M-18 -52 L14 -76 M18 -52 L-14 -76" strokeWidth="1.1" opacity="0.75" />
          {/* cross-arms */}
          <path d="M-46 -70 L46 -70 M-38 -90 L38 -90" strokeWidth="2" />
          <circle cx="-46" cy="-70" r="2.6" fill="#bcd8ff" stroke="none" />
          <circle cx="46" cy="-70" r="2.6" fill="#bcd8ff" stroke="none" />
          <circle cx="-38" cy="-90" r="2.6" fill="#bcd8ff" stroke="none" />
          <circle cx="38" cy="-90" r="2.6" fill="#bcd8ff" stroke="none" />
        </g>

        <g transform="translate(640 216)">
          <path d="M-20 0 L-8 -74 M20 0 L8 -74" strokeWidth="2" />
          <path d="M-8 -74 L8 -74" strokeWidth="2" />
          <path d="M-17 -22 L17 -22 M-13 -46 L13 -46" strokeWidth="1.3" />
          <path d="M-36 -56 L36 -56 M-29 -72 L29 -72" strokeWidth="1.8" />
        </g>

        {/* catenary conductors */}
        <path d="M476 -0 Q560 34 604 160" transform="translate(0 88)" strokeWidth="1.3" opacity="0.5" />
        <path d="M384 148 Q300 168 214 158" strokeWidth="1.3" opacity="0.5" />
        <path d="M476 148 Q560 176 604 170" strokeWidth="1.3" opacity="0.55" />
        <path d="M676 160 Q760 186 840 172" strokeWidth="1.3" opacity="0.5" />
        <path d="M476 128 Q560 156 604 150" strokeWidth="1.3" opacity="0.4" />
        <path d="M676 140 Q760 166 840 154" strokeWidth="1.3" opacity="0.4" />
      </g>

      {/* transformer + breaker bay at grade */}
      <g stroke="#8fc2ff" fill="none" opacity="0.75">
        <rect x="510" y="196" width="34" height="26" rx="3" strokeWidth="1.6" />
        <circle cx="519" cy="209" r="6" strokeWidth="1.4" />
        <circle cx="535" cy="209" r="6" strokeWidth="1.4" />
        <path d="M527 196 L527 178 M527 178 L556 178" strokeWidth="1.4" />
        <rect x="556" y="171" width="13" height="14" rx="2" strokeWidth="1.4" />
      </g>

      {/* ── data centre hall ──────────────────────────────────────── */}
      <g opacity="0.95">
        <path d="M856 222 L856 128 L1016 96 L1016 200 Z" fill="url(#cxHall)" stroke="#4d84e0" strokeWidth="1.6" />
        <path d="M1016 96 L1160 124 L1160 216 L1016 200 Z" fill="#0c2050" stroke="#4d84e0" strokeWidth="1.6" />
        {/* server rows on the lit face */}
        <g fill="#06d4f0" opacity="0.85">
          {[0, 1, 2, 3, 4].map((c) =>
            [0, 1, 2, 3].map((r) => (
              <rect
                key={`${c}-${r}`}
                x={874 + c * 28}
                y={148 + r * 16 - c * 6}
                width={18}
                height={7}
                rx={1.5}
                opacity={0.35 + ((c + r) % 3) * 0.24}
              />
            ))
          )}
        </g>
        {/* cooling stacks */}
        <g stroke="#4d84e0" strokeWidth="1.5" fill="#0c2050">
          <rect x="1044" y="104" width="16" height="20" rx="2" />
          <rect x="1076" y="112" width="16" height="20" rx="2" />
          <rect x="1108" y="120" width="16" height="20" rx="2" />
        </g>
      </g>

      {/* feeder from substation into the hall */}
      <path
        d="M676 176 Q780 206 856 190"
        stroke="#06d4f0"
        strokeWidth="1.6"
        fill="none"
        opacity="0.6"
      />

      {/* ground plane */}
      <path d="M0 258 L1200 240 L1200 320 L0 320 Z" fill="#050f24" opacity="0.85" />
    </svg>
  )
}
