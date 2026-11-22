import { clsx } from "clsx";
import { useId } from "react";

type Tone = "dark" | "light";

const BINTANG = [
  { x: 456, y: 78, r: 48, redup: false },
  { x: 526, y: 126, r: 22, redup: true },
  { x: 104, y: 178, r: 30, redup: true },
  { x: 52, y: 262, r: 36, redup: false },
  { x: 74, y: 482, r: 24, redup: true },
];

const RUMAH =
  "M170 247Q170 235 179 227L286 131Q300 119 314 131L421 227Q430 235 430 247V456Q430 470 416 470H352V392Q352 378 338 378H262Q248 378 248 392V470H184Q170 470 170 456Z";
const CINCIN_BELAKANG = "M16 300A284 62 0 0 1 584 300A284 40 0 0 0 16 300Z";
const CINCIN_DEPAN = "M16 300A284 78 0 0 0 584 300A284 42 0 0 1 16 300Z";

function bintang(x: number, y: number, r: number) {
  const k = r * 0.14;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
}

/** Logo vector Kosmos, sama dengan komponen di Figma. Tone "light" untuk latar gelap. */
export function LogoMark({ size = 40, tone = "dark" }: { size?: number; tone?: Tone }) {
  const idGradien = useId();
  const gelap = tone === "light";
  const cincin = gelap ? "#7b5cf2" : "#1c3364";
  return (
    <svg width={Math.round((size * 640) / 520)} height={size} viewBox="0 0 640 520" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={idGradien} x1="170" y1="120" x2="430" y2="470" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f3ecff" />
          <stop offset="1" stopColor="#b9a0f2" />
        </linearGradient>
      </defs>
      {BINTANG.map((b) => (
        <path
          key={`${b.x}-${b.y}`}
          d={bintang(b.x, b.y, b.r)}
          fill={gelap ? (b.redup ? "#b9a6f5" : "#ffffff") : b.redup ? "#8a6ff0" : "#1c3364"}
        />
      ))}
      <path transform="rotate(-22 300 300)" d={CINCIN_BELAKANG} fill={cincin} />
      {gelap ? (
        <path d={RUMAH} fill={`url(#${idGradien})`} />
      ) : (
        <path d={RUMAH} fill="#d8cbff" stroke="#1c3364" strokeWidth="12" strokeLinejoin="round" />
      )}
      <path transform="rotate(-22 300 300)" d={CINCIN_DEPAN} fill={cincin} />
    </svg>
  );
}

export function Logo({ tone = "dark", size = 40, className }: { tone?: Tone; size?: number; className?: string }) {
  return (
    <span className={clsx("flex items-center gap-1.5", className)}>
      <LogoMark tone={tone} size={size} />
      <span
        style={{ fontSize: Math.round(size * 0.62) }}
        className={clsx("font-bold tracking-[-0.03em]", tone === "dark" ? "text-[#1c3364]" : "text-white")}
      >
        Kosmos
      </span>
    </span>
  );
}
