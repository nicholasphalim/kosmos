import { useId } from "react";

const TEMA = {
  senang: { latar: "#e4dbff", helm: "#fbf9ff", aksen: "#8a6ff0", visor: "#1b1147", wajah: "#efe8ff", pipi: "#ff9fd0" },
  sedih: { latar: "#fde4e0", helm: "#fff6f4", aksen: "#e5372a", visor: "#4f1016", wajah: "#ffe7e3", pipi: "#ff8f82" },
  pemilik: { latar: "#2f1a63", helm: "#fbf9ff", aksen: "#b9a6f5", visor: "#1b1147", wajah: "#efe8ff", pipi: "#ff9fd0" },
  teknisi: { latar: "#d4f3e0", helm: "#fbf9ff", aksen: "#1f9d57", visor: "#1b1147", wajah: "#efe8ff", pipi: "#ff9fd0" },
} as const;

/** Maskot astronot kecil untuk akun penghuni: senang saat sewa aktif, sedih saat sewa berakhir. */
export function AstronotAvatar({ suasana, className }: { suasana: keyof typeof TEMA; className?: string }) {
  const idClip = useId();
  const t = TEMA[suasana];
  const senang = suasana !== "sedih";
  const pemilik = suasana === "pemilik";
  const garis = { stroke: t.wajah, strokeWidth: 2.2, strokeLinecap: "round", fill: "none" } as const;

  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <defs>
        <clipPath id={idClip}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${idClip})`}>
        <rect width="64" height="64" fill={t.latar} />
        <g transform="translate(32 38) scale(1.18) translate(-32 -35)">
        {pemilik ? null : senang ? (
          <>
            <path d="M41 17L44.5 12.5" stroke={t.aksen} strokeWidth="2" strokeLinecap="round" />
            <circle cx="45.5" cy="11" r="2.8" fill={t.aksen} />
          </>
        ) : (
          <>
            <path d="M41 17Q47 10 52 15" stroke={t.aksen} strokeWidth="2" strokeLinecap="round" />
            <circle cx="53" cy="17" r="3" fill={t.aksen} />
          </>
        )}

        <rect x="9.5" y="28" width="6" height="14" rx="3" fill={t.aksen} />
        <rect x="48.5" y="28" width="6" height="14" rx="3" fill={t.aksen} />
        <circle cx="32" cy="34" r="20" fill={t.helm} stroke={t.aksen} strokeOpacity="0.4" strokeWidth="1.2" />
        <rect x="17" y="24" width="30" height="22" rx="11" fill={t.visor} />
        <path d="M22 29.5Q24 27 28 26.6" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="1.6" strokeLinecap="round" />
        {pemilik && (
          <>
            <path d="M14 25Q15 11 32 11Q49 11 50 25Q32 17 14 25Z" fill="#24155f" />
            <path d="M13 26Q32 17 51 26" stroke={t.aksen} strokeWidth="2.6" strokeLinecap="round" />
            <path d="M32 12.5Q32.5 15.5 35.5 16Q32.5 16.5 32 19.5Q31.5 16.5 28.5 16Q31.5 15.5 32 12.5Z" fill="#e6dcff" />
          </>
        )}

        {senang ? (
          <>
            <path d="M23.5 35q2.5-3.6 5 0" {...garis} />
            <path d="M35.5 35q2.5-3.6 5 0" {...garis} />
            <path d="M28.3 38.4q3.7 3.8 7.4 0" {...garis} />
            <circle cx="22.8" cy="39.4" r="1.9" fill={t.pipi} fillOpacity="0.75" />
            <circle cx="41.2" cy="39.4" r="1.9" fill={t.pipi} fillOpacity="0.75" />
          </>
        ) : (
          <>
            <path d="M22.8 32L27.6 30" {...garis} strokeWidth={1.8} />
            <path d="M36.4 30L41.2 32" {...garis} strokeWidth={1.8} />
            <circle cx="26" cy="35" r="1.9" fill={t.wajah} />
            <circle cx="38" cy="35" r="1.9" fill={t.wajah} />
            <path d="M28.5 42q3.5-3.6 7 0" {...garis} />
            <path d="M41.5 38q2.3 3 0 4.6q-2.3-1.6 0-4.6Z" fill={t.pipi} />
          </>
        )}
        </g>
      </g>
    </svg>
  );
}
