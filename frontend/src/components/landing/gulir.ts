import type Lenis from "lenis";

let lenisAktif: Lenis | null = null;

export function setLenis(lenis: Lenis | null) {
  lenisAktif = lenis;
}

/** Gulir ke elemen atau posisi. Jarak header untuk elemen diatur lewat `scroll-margin-top`. */
export function gulirKe(target: HTMLElement | number) {
  if (lenisAktif) {
    lenisAktif.scrollTo(target, { duration: 1.15 });
  } else if (typeof target === "number") {
    window.scrollTo({ top: target });
  } else {
    target.scrollIntoView();
  }
}
