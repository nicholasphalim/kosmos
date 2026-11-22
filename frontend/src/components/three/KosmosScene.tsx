"use client";

import { clsx } from "clsx";
import { useEffect, useRef } from "react";
import type { VarianScene } from "./createScene";

/**
 * Wadah scene Three.js (dekoratif). Modul 3D baru diunduh saat wadahnya tampil,
 * jadi layar yang menyembunyikan scene lewat CSS tidak ikut memuatnya.
 */
export function KosmosScene({ variant, className }: { variant: VarianScene; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || host.clientWidth === 0) return;

    let batal = false;
    let hentikan: (() => void) | null = null;
    import("./createScene")
      .then(({ createScene }) => {
        if (!batal) hentikan = createScene(host, variant);
      })
      .catch(() => {
        // Scene hanya hiasan: halaman tetap utuh tanpa 3D.
      });

    return () => {
      batal = true;
      hentikan?.();
    };
  }, [variant]);

  return <div ref={hostRef} aria-hidden className={clsx("pointer-events-none", className)} />;
}
