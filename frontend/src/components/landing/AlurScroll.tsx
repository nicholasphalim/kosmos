"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { AstronotAvatar } from "@/components/brand/AstronotAvatar";
import { Logo } from "@/components/brand/Logo";
import { Camera, MessageCircle, ShieldCheck, Sparkles, type IkonKosmos } from "@/components/icons";
import { KategoriTile, PrioritasBadge } from "@/components/tiket/Badges";
import { klasifikasiKeyword } from "@/lib/klasifikasi";
import { LABEL_KATEGORI } from "@/lib/format";
import { gulirKe } from "./gulir";
import { Stiker } from "@/components/ui/Stiker";
import { BalonWhatsApp } from "@/components/notifikasi/BalonWhatsApp";

const LANGKAH: Array<{ judul: string; isi: string; ikon: IkonKosmos }> = [
  { judul: "Foto masalahnya", isi: "Penghuni menceritakan kerusakan dan melampirkan foto atau video.", ikon: Camera },
  { judul: "Sewa dicek", isi: "Sistem memastikan sewa masih aktif sebelum tiket dibuat.", ikon: ShieldCheck },
  { judul: "AI menilai", isi: "Kategori dan prioritas ditentukan otomatis, jadi yang darurat naik duluan.", ikon: Sparkles },
  { judul: "Semua dikabari", isi: "Penghuni dan pemilik menerima kabar lewat WhatsApp.", ikon: MessageCircle },
];

const CONTOH = "Stop kontak memercikkan api";
const HASIL = klasifikasiKeyword(CONTOH, 1);

/** Foto lampiran laporan di layar iPad. */
function FotoKerusakan() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- foto statis kecil di dalam mockup
    <img
      src="/art/stop-kontak-percik.jpg"
      alt=""
      width={960}
      height={540}
      loading="lazy"
      draggable={false}
      className="block h-36 min-h-0 w-full flex-1 object-cover object-[46%_50%] sm:h-auto"
    />
  );
}

function Tahap({ on, children, className }: { on: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div data-on={on} className={clsx("tahap", className)}>
      {children}
    </div>
  );
}

/** Cara kerja: di desktop mengikuti scroll, di layar kecil lewat tombol langkah. */
export function AlurScroll() {
  const wadah = useRef<HTMLDivElement>(null);
  const [aktif, setAktif] = useState(0);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    let raf = 0;
    const hitung = () => {
      raf = 0;
      const el = wadah.current;
      if (!el || !desktop.matches) return;
      const kotak = el.getBoundingClientRect();
      const jarak = kotak.height - (window.innerHeight - 80);
      const p = Math.min(0.999, Math.max(0, (80 - kotak.top) / jarak));
      setAktif(Math.floor(p * LANGKAH.length));
    };
    const jadwal = () => {
      if (!raf) raf = requestAnimationFrame(hitung);
    };
    window.addEventListener("scroll", jadwal, { passive: true });
    window.addEventListener("resize", jadwal);
    jadwal();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", jadwal);
      window.removeEventListener("resize", jadwal);
    };
  }, []);

  function pilih(i: number) {
    const el = wadah.current;
    if (!el || !window.matchMedia("(min-width: 1024px)").matches) return setAktif(i);
    const atas = el.getBoundingClientRect().top + window.scrollY - 80;
    const jarak = el.offsetHeight - (window.innerHeight - 80);
    gulirKe(atas + jarak * ((i + 0.5) / LANGKAH.length));
  }

  return (
    <div ref={wadah} className="lg:h-[340vh]">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 py-20 sm:px-8 lg:sticky lg:top-20 lg:h-[calc(100svh-5rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:py-0">
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-4">
            <p className="tracked text-violet">Cara kerja</p>
            <h2 className="wide text-[clamp(2rem,3.6vw,3.25rem)]">
              Dari Laporan sampai <span className="aksen-teks">Pemilik Tahu</span>
            </h2>
          </div>
          <ol className="relative">
            <span aria-hidden className="absolute top-0 bottom-0 left-0 w-0.5 bg-plum/12" />
            <span aria-hidden className="absolute top-0 left-0 w-0.5 bg-violet transition-[height] duration-500 ease-out-expo" style={{ height: `${((aktif + 1) / LANGKAH.length) * 100}%` }} />
            {LANGKAH.map((l, i) => {
              const ini = i === aktif;
              return (
                <li key={l.judul}>
                  <button type="button" aria-current={ini ? "step" : undefined} onClick={() => pilih(i)} className="flex w-full cursor-pointer items-start gap-4 py-3 pl-6 text-left">
                    <l.ikon className={clsx("size-11 transition-all duration-500 ease-out-expo", ini ? "scale-110" : "opacity-45 grayscale-[.6]")} />
                    <span className="flex min-w-0 flex-col pt-1.5">
                      <span className={clsx("text-lg font-semibold transition-colors duration-300", ini ? "text-plum" : "text-subtle")}>{l.judul}</span>
                      <span className={clsx("grid transition-[grid-template-rows] duration-500 ease-out-expo", ini ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                        <span className="overflow-hidden leading-relaxed text-navy-soft">
                          <span className="block pt-1">{l.isi}</span>
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div aria-hidden className="ipad-wadah relative mx-auto w-full max-w-[760px]">
          <div className="ipad">
            <span className="ipad-kamera" />
            <span className="ipad-daya" />
            <span className="ipad-volume" />
            <div className="ipad-layar">
              <div className="flex items-center justify-between px-5 pt-2.5 text-[11px] font-semibold text-plum">
                <span>09.41</span>
                <span className="flex items-center gap-1.5">
                  <svg viewBox="0 0 16 12" className="h-2.5 w-3.5" fill="currentColor"><path d="M8 11.5 5.6 8.9a3.4 3.4 0 0 1 4.8 0L8 11.5ZM3.7 7a6.1 6.1 0 0 1 8.6 0l1.3-1.4a8 8 0 0 0-11.2 0L3.7 7ZM.8 4.1a10.2 10.2 0 0 1 14.4 0L16 3.2A11.5 11.5 0 0 0 0 3.2l.8.9Z" /></svg>
                  <span className="flex h-2.5 w-5 items-center rounded-[3px] border border-plum/60 p-px"><span className="block h-full w-[78%] rounded-[1.5px] bg-plum" /></span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-plum/10 px-4 py-2.5 sm:px-5">
                <Logo size={24} />
                <span className="rounded-full bg-lilac-100 px-3 py-1 text-xs font-semibold text-plum">Kamar B-201</span>
              </div>

              <div className="grid gap-2.5 p-3 sm:grid-cols-[minmax(0,.92fr)_minmax(0,1fr)] sm:p-4">
                <Tahap on={aktif >= 0} className="flex flex-col overflow-hidden rounded-2xl border border-plum/10 bg-white text-plum sm:row-span-2">
                  <FotoKerusakan />
                  <span className="block p-3">
                    <span className="block text-xs text-muted">Penghuni menulis</span>
                    <span className="block text-[15px] leading-snug font-semibold">{CONTOH}</span>
                  </span>
                </Tahap>

                <Tahap on={aktif >= 1} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-plum/10 bg-white p-3 text-plum">
                  <span className="flex items-center gap-2.5">
                    <AstronotAvatar suasana="senang" className="size-10" />
                    <span>
                      <span className="block text-xs text-muted">Validasi sewa</span>
                      <span className="block text-sm font-semibold">Fredo, B-201</span>
                    </span>
                  </span>
                  <span className="cap block"><Stiker varian="aktif">Sewa aktif</Stiker></span>
                </Tahap>

                <Tahap on={aktif >= 2} className="flex flex-col gap-2.5 rounded-2xl border border-plum/10 bg-white p-3 text-plum">
                  <span className="flex items-center gap-2.5">
                    <KategoriTile kategori={HASIL.kategori} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted">Hasil penilaian</span>
                      <span className="block text-sm font-semibold">{LABEL_KATEGORI[HASIL.kategori]}</span>
                    </span>
                    <PrioritasBadge prioritas={HASIL.urgensi} />
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-lilac-100">
                    <span className="block h-full origin-left rounded-full bg-violet transition-transform delay-200 duration-1000 ease-out-expo" style={{ width: `${HASIL.confidence * 100}%`, transform: aktif >= 2 ? "scaleX(1)" : "scaleX(0)" }} />
                  </span>
                </Tahap>

                <Tahap on={aktif >= 3} className="sm:col-span-2">
                  <BalonWhatsApp penerima="Pak Derren" pesan="Prioritas tinggi di B-201. Mohon segera dicek." />
                </Tahap>
              </div>
              <span className="mx-auto mb-1.5 block h-1 w-28 rounded-full bg-plum/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
