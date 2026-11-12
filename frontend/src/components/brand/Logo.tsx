import { clsx } from "clsx";

type Tone = "dark" | "light";

/** Logo Kosmos: rumah dengan cincin planet + bintang. Tone "light" untuk latar navy. */
export function LogoMark({ size = 38, tone = "dark" }: { size?: number; tone?: Tone }) {
  const stroke = tone === "dark" ? "var(--color-navy)" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <g transform="rotate(-16 24 30)">
        <path d="M3 30a21 7 0 0 1 42 0" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" />
      </g>
      <path
        d="M12 41V23L24 12l12 11v18H22v-7h-5v7z"
        fill="var(--color-lavender)"
        stroke={stroke}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <g transform="rotate(-16 24 30)">
        <path d="M3 30a21 7 0 0 0 42 0" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" />
      </g>
      <path d="M9 4Q9 8 13 8Q9 8 9 12Q9 8 5 8Q9 8 9 4Z" fill="var(--color-lavender)" stroke={stroke} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M40 2Q40 5 43 5Q40 5 40 8Q40 5 37 5Q40 5 40 2Z" fill="var(--color-lavender)" stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ tone = "dark", className }: { tone?: Tone; className?: string }) {
  return (
    <span className={clsx("flex items-center gap-2", className)}>
      <LogoMark tone={tone} />
      <span
        className={clsx(
          "font-display text-[26px] font-extrabold tracking-[-0.035em]",
          tone === "dark" ? "text-navy" : "text-white",
        )}
      >
        Kosmos
      </span>
    </span>
  );
}
