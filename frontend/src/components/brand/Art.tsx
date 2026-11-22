/** Ilustrasi dekoratif (aria-hidden). Dipisah dari halaman agar markup halaman tetap fokus pada konten. */

export function Sparkle({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <path
      d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
      fill={fill}
    />
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
