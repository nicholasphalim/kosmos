"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { Camera, MessageCircle, ShieldCheck, Sparkles, Ticket, Wrench, Zap, type IkonKosmos } from "@/components/icons";

const ALAT: Array<{ Ikon: IkonKosmos; posisi: string; ukuran: string; z: number; tunda: string }> = [
  { Ikon: Wrench, posisi: "left-[1%] top-[17%]", ukuran: "size-14 sm:size-20", z: 30, tunda: "0s" },
  { Ikon: Ticket, posisi: "right-[0%] top-[20%] sm:top-[8%]", ukuran: "size-14 sm:size-[72px]", z: -24, tunda: "-1.6s" },
  { Ikon: MessageCircle, posisi: "right-[-3%] top-[46%]", ukuran: "size-14 sm:size-20", z: 38, tunda: "-3.1s" },
  { Ikon: ShieldCheck, posisi: "left-[-4%] top-[56%]", ukuran: "size-12 sm:size-16", z: -32, tunda: "-4.4s" },
  { Ikon: Camera, posisi: "right-[6%] bottom-[11%]", ukuran: "size-12 sm:size-16", z: 22, tunda: "-2.2s" },
  { Ikon: Zap, posisi: "left-[7%] bottom-[8%]", ukuran: "size-10 sm:size-14", z: 44, tunda: "-5.2s" },
  { Ikon: Sparkles, posisi: "left-[24%] top-[0%]", ukuran: "size-9 sm:size-12", z: -16, tunda: "-3.7s" },
];

const SAPAAN = ["Halo! Ada yang rusak?", "Foto aja, biar aku bantu!", "Pemilik langsung kukabari.", "Coba laporan di bawah, yuk!"];

/** Maskot hero: lapisan alat mengikuti kursor, dan maskot bisa diklik untuk menyapa. */
export function HeroArt() {
  const ref = useRef<HTMLDivElement>(null);
  const [sapa, setSapa] = useState(0);

  useEffect(() => {
    const el = ref.current;
    const hero = el?.closest("section");
    if (!el || !hero) return;
    if (!window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches) return;

    const target = { x: 0, y: 0 };
    const kini = { x: 0, y: 0 };
    let raf = 0;
    const jalan = () => {
      kini.x += (target.x - kini.x) * 0.075;
      kini.y += (target.y - kini.y) * 0.075;
      el.style.setProperty("--hx", kini.x.toFixed(3));
      el.style.setProperty("--hy", kini.y.toFixed(3));
      raf = Math.abs(target.x - kini.x) + Math.abs(target.y - kini.y) > 0.002 ? requestAnimationFrame(jalan) : 0;
    };
    const gerak = (e: PointerEvent) => {
      const kotak = hero.getBoundingClientRect();
      const px = (e.clientX - kotak.left) / kotak.width;
      const py = (e.clientY - kotak.top) / kotak.height;
      target.x = px * 2 - 1;
      target.y = py * 2 - 1;
      hero.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      hero.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      if (!raf) raf = requestAnimationFrame(jalan);
    };
    const keluar = () => {
      target.x = 0;
      target.y = 0;
      if (!raf) raf = requestAnimationFrame(jalan);
    };
    hero.addEventListener("pointermove", gerak, { passive: true });
    hero.addEventListener("pointerleave", keluar);
    return () => {
      cancelAnimationFrame(raf);
      hero.removeEventListener("pointermove", gerak);
      hero.removeEventListener("pointerleave", keluar);
    };
  }, []);

  return (
    <div ref={ref} className="relative mx-auto aspect-[10/11] w-[min(88vw,560px)] self-end">
      <svg viewBox="0 0 600 600" fill="none" aria-hidden="true" className="orbit-lambat absolute inset-[-8%] text-lavender">
        {[210, 270].map((r, i) => (
          <circle key={r} cx="300" cy="300" r={r} stroke="currentColor" strokeOpacity={0.4 - i * 0.13} strokeWidth="2.5" strokeDasharray="1 13" strokeLinecap="round" />
        ))}
        <circle cx="510" cy="300" r="7" fill="currentColor" />
        <circle cx="62" cy="180" r="4" fill="currentColor" fillOpacity=".7" />
      </svg>

      {ALAT.map(({ Ikon, posisi, ukuran, z, tunda }) => (
        <span key={posisi} aria-hidden className={clsx("lapis absolute", posisi)} style={{ "--z": z } as React.CSSProperties}>
          <span className="melayang block" style={{ animationDelay: tunda }}>
            <Ikon className={clsx(ukuran, "drop-shadow-[0_14px_16px_#0a042080]")} />
          </span>
        </span>
      ))}

      <p key={sapa} role="status" className="balon absolute top-[3%] right-0 z-20 w-max max-w-[190px] rounded-2xl rounded-bl-sm bg-white sm:right-auto sm:left-[52%] sm:max-w-[230px] px-4 py-2.5 text-sm font-semibold text-plum shadow-[0_18px_36px_-16px_#0a0420]">
        {SAPAAN[sapa % SAPAAN.length]}
      </p>

      <button
        type="button"
        aria-label="Sapa maskot Kosmos"
        onClick={() => setSapa((s) => s + 1)}
        className="lapis group absolute inset-x-[15%] top-[9%] bottom-0 z-10 cursor-pointer rounded-[40%] outline-offset-4"
        style={{ "--z": 12 } as React.CSSProperties}
      >
        <span key={sapa} className={clsx("block h-full", sapa > 0 && "lompat")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ilustrasi SVG statis */}
          <img src="/art/astronot-halo.svg" alt="" width={520} height={650} draggable={false} className="h-full w-full object-contain transition-transform duration-500 ease-out-expo group-hover:scale-[1.035]" />
        </span>
      </button>
    </div>
  );
}
