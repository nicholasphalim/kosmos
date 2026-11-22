"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { gulirKe, setLenis } from "./gulir";

const batas = (n: number) => Math.min(1, Math.max(0, n));

/** Motion landing page: smooth scroll, reveal, parallax, progres baca. Konten tetap utuh tanpa JS. */
export function LandingMotion({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;

    const hemat = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const parallax = hemat ? [] : Array.from(root.querySelectorAll<HTMLElement>("[data-parallax]"));
    const baca = Array.from(root.querySelectorAll<HTMLElement>("[data-baca]"));
    const progres = root.querySelector<HTMLElement>("[data-progres]");

    let pengamat: IntersectionObserver | null = null;
    if (!hemat) {
      root.classList.add("motion");
      pengamat = new IntersectionObserver(
        (entri) => {
          entri.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              pengamat?.unobserve(e.target);
            }
          });
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
      );
      root.querySelectorAll("[data-reveal]").forEach((el) => pengamat?.observe(el));
    }

    const lenis = hemat ? null : new Lenis({ lerp: 0.105, wheelMultiplier: 0.95 });
    setLenis(lenis);

    let terakhirY = -1;
    let terakhirTinggi = -1;
    const perbarui = () => {
      const vh = window.innerHeight;
      const total = document.documentElement.scrollHeight - vh;
      if (progres) progres.style.transform = `scaleX(${total > 0 ? batas(window.scrollY / total) : 0})`;
      parallax.forEach((el) => {
        const kotak = (el.parentElement ?? el).getBoundingClientRect();
        if (kotak.bottom < -200 || kotak.top > vh + 200) return;
        const y = (kotak.top + kotak.height / 2 - vh / 2) * Number(el.dataset.parallax);
        el.style.translate = `0 ${y.toFixed(1)}px`;
      });
      baca.forEach((el) => {
        const kotak = el.getBoundingClientRect();
        const p = batas((vh * 0.84 - kotak.top) / (kotak.height + vh * 0.36));
        const kata = el.querySelectorAll<HTMLElement>("[data-kata]");
        kata.forEach((k, i) => {
          k.style.opacity = String(0.2 + 0.8 * batas(p * kata.length - i));
        });
      });
    };

    let raf = 0;
    const putar = (t: number) => {
      lenis?.raf(t);
      if (window.scrollY !== terakhirY || window.innerHeight !== terakhirTinggi) {
        terakhirY = window.scrollY;
        terakhirTinggi = window.innerHeight;
        perbarui();
      }
      raf = requestAnimationFrame(putar);
    };
    raf = requestAnimationFrame(putar);

    const klikJangkar = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      const tujuan = a && document.getElementById(a.hash.slice(1));
      if (!tujuan) return;
      e.preventDefault();
      gulirKe(tujuan);
      history.replaceState(null, "", a.hash);
    };
    root.addEventListener("click", klikJangkar);

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("click", klikJangkar);
      pengamat?.disconnect();
      lenis?.destroy();
      setLenis(null);
    };
  }, [rootId]);

  return null;
}
