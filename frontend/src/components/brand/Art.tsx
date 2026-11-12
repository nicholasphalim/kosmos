/** Ilustrasi dekoratif (aria-hidden). Dipisah dari halaman agar markup halaman tetap fokus pada konten. */

export function Sparkle({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <path
      d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
      fill={fill}
    />
  );
}

/** Rumah bercincin planet untuk hero navy (halaman Lapor & Login). */
export function PlanetHouseArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 200" fill="none" aria-hidden="true" className={className}>
      <g transform="rotate(-16 150 120)">
        <path d="M40 120a110 34 0 0 1 220 0" stroke="#4b5f9a" strokeWidth="10" strokeLinecap="round" />
      </g>
      <path
        d="M100 180V108l50-44 50 44v72H164v-34h-28v34z"
        fill="var(--color-lavender)"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <g transform="rotate(-16 150 120)">
        <path d="M40 120a110 34 0 0 0 220 0" stroke="var(--color-violet-400)" strokeWidth="10" strokeLinecap="round" />
      </g>
      <Sparkle x={60} y={40} r={20} fill="var(--color-lavender)" />
      <Sparkle x={230} y={22} r={12} fill="var(--color-lavender)" />
      <Sparkle x={30} y={128} r={8} fill="var(--color-violet-400)" />
    </svg>
  );
}

/** Taburan bintang untuk banner. */
export function SparkleCluster({ className, tones }: { className?: string; tones: [string, string, string] }) {
  return (
    <svg viewBox="0 0 220 160" fill="none" aria-hidden="true" className={className}>
      <Sparkle x={160} y={50} r={30} fill={tones[0]} />
      <Sparkle x={60} y={84} r={14} fill={tones[1]} />
      <Sparkle x={205} y={110} r={10} fill={tones[2]} />
    </svg>
  );
}
