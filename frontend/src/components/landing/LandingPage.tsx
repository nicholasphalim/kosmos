import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ArrowDown, ChartNoAxesColumnIncreasing, Ticket, Wrench, type IkonKosmos } from "@/components/icons";
import { AlurScroll } from "./AlurScroll";
import { CobaLaporan } from "./CobaLaporan";
import { HeroArt } from "./HeroArt";
import { LandingMotion } from "./LandingMotion";
import { SebelumSesudah } from "./SebelumSesudah";

const NAV = [
  { href: "#tentang", label: "Tentang" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#coba", label: "Coba" },
  { href: "#peran", label: "Untuk siapa" },
  { href: "#layanan", label: "Layanan" },
];

const LAYANAN: Array<{ nama: string; isi: string; ikon: IkonKosmos }> = [
  { nama: "Complaint Handling", isi: "Keluhan, validasi sewa, klasifikasi AI, dan notifikasi.", ikon: Ticket },
  { nama: "Repair Verification", isi: "Pencarian teknisi, estimasi biaya, dan verifikasi foto bukti.", ikon: Wrench },
  { nama: "Billing & Commission", isi: "Invoice, pembayaran, rekonsiliasi, dan laporan kas pemilik.", ikon: ChartNoAxesColumnIncreasing },
];

const PERAN = [
  { nama: "Penghuni", isi: "Lapor kerusakan dalam hitungan langkah dan pantau statusnya tanpa perlu menagih kabar.", art: "astronot-hp", gaya: "bg-lavender text-plum", label: "text-violet", teks: "text-navy-soft" },
  { nama: "Pemilik", isi: "Lihat semua tiket dari setiap kos, tahu mana yang darurat, dan tindak lanjuti dari satu dashboard.", art: "astronot-pemilik", gaya: "bg-plum text-white", label: "text-lavender", teks: "text-hero-sub" },
];

/** Motif Kosmos: rasi bintang berbentuk rumah, dipakai berulang sebagai penanda section. */
function Rasi({ className }: { className?: string }) {
  const titik = [[6, 44], [6, 22], [30, 4], [54, 22], [54, 44], [38, 44], [38, 31], [22, 31], [22, 44]];
  return (
    <svg viewBox="0 0 88 50" fill="none" aria-hidden="true" className={className}>
      <path pathLength={1} className="rasi-garis" d={`M${titik.map((t) => t.join(" ")).join("L")}Z`} stroke="currentColor" strokeOpacity=".45" strokeWidth="1" />
      {titik.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="currentColor" />
      ))}
      <path d="M72 6Q72.8 13 80 14Q72.8 15 72 22Q71.2 15 64 14Q71.2 13 72 6Z" fill="currentColor" />
      <circle cx="84" cy="30" r="1.6" fill="currentColor" />
    </svg>
  );
}

function Maskot({ nama, className }: { nama: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- ilustrasi SVG statis
  return <img src={`/art/${nama}.svg`} alt="" width={520} height={650} loading="lazy" draggable={false} className={className} />;
}

/** Judul yang naik per kata saat halaman dibuka. */
function KataNaik({ teks, mulai = 0, className }: { teks: string; mulai?: number; className?: string }) {
  return teks.split(" ").map((k, i) => (
    <span key={`${k}-${i}`}>
      <span className="kata">
        <span className={className} style={{ "--i": mulai + i } as React.CSSProperties}>
          {k}
        </span>
      </span>{" "}
    </span>
  ));
}

export function LandingPage() {
  return (
    <div id="landing" className="overflow-x-clip bg-paper text-plum">
      <LandingMotion rootId="landing" />

      <header className="fixed inset-x-0 top-0 z-30 border-b border-plum/10 bg-paper">
        <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between gap-6 px-5 sm:px-8">
          <Link href="/" aria-label="Kosmos, beranda" className="no-underline">
            <Logo size={36} />
          </Link>
          <nav aria-label="Navigasi utama" className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="garis-nav text-[15px] font-medium text-plum no-underline hover:text-violet">
                {n.label}
              </a>
            ))}
          </nav>
          <Link href="/login" className="inline-flex h-10 items-center rounded-lg bg-plum px-5 text-sm font-semibold text-white no-underline transition-colors duration-200 hover:bg-violet">
            Login
          </Link>
        </div>
        <span data-progres aria-hidden className="absolute inset-x-0 -bottom-px block h-0.5 origin-left scale-x-0 bg-violet" />
      </header>

      <main>
        <section className="sorot relative overflow-hidden bg-plum pt-20 text-white">
          <div className="relative mx-auto grid min-h-[calc(100svh-5rem)] max-w-[1240px] items-center gap-6 px-5 pt-14 sm:px-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] lg:pt-0">
            <div className="relative z-10 flex flex-col items-start gap-7">
              <h1 className="wide text-[clamp(2.25rem,5vw,4.5rem)]">
                <KataNaik teks="Semua Urusan Kos dalam" />
                <KataNaik teks="Satu Tempat" mulai={4} className="text-lavender" />
              </h1>
              <p className="muncul max-w-[480px] text-lg leading-relaxed text-hero-sub">Keluhan, perbaikan, dan tagihan kos, rapi dari laporan pertama sampai pembayaran tercatat.</p>
              <div className="muncul flex flex-wrap items-center gap-7" style={{ animationDelay: "620ms" }}>
                <a href="#coba" className="tracked inline-flex h-12 items-center rounded-full bg-lavender px-7 text-plum no-underline transition-[background-color,transform] duration-300 hover:-translate-y-0.5 hover:bg-white">
                  Coba sekarang
                </a>
                <a href="#cara-kerja" className="tracked group inline-flex items-center gap-2 text-white no-underline hover:text-lavender">
                  Cara kerja
                  <ArrowDown className="size-4 transition-transform duration-300 group-hover:translate-y-1" />
                </a>
              </div>
            </div>
            <HeroArt />
          </div>
        </section>

        <section id="tentang" className="scroll-mt-20 overflow-hidden px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
            <div data-reveal className="group mx-auto w-full max-w-[420px] overflow-hidden rounded-t-full bg-lilac-100 px-8 pt-16">
              <div data-parallax="-0.07">
                <Maskot nama="astronot-kunci" className="w-full transition-transform duration-700 ease-out-expo group-hover:-rotate-2 group-hover:scale-105" />
              </div>
            </div>
            <div className="flex flex-col gap-7">
              <div data-reveal className="flex flex-col gap-6">
                <p className="tracked text-violet">Tentang Kosmos</p>
                <h2 className="wide text-[clamp(2rem,4vw,3.5rem)]">Ngurus Kos Tanpa Buku dan Chat Pribadi</h2>
                <p className="max-w-[580px] text-lg leading-relaxed text-navy-soft">
                  Di banyak kos, tagihan masih dicatat manual, keluhan tenggelam di WhatsApp, dan teknisi dicari lewat kenalan. Kosmos merapikan alurnya dari keluhan masuk sampai pembayaran tercatat.
                </p>
              </div>
              <div data-reveal style={{ "--tunda": "120ms" } as React.CSSProperties}>
                <SebelumSesudah />
              </div>
            </div>
          </div>
        </section>

        <section className="band-malam px-5 py-28 text-center text-white lg:py-40">
          <Rasi className="mx-auto w-24 text-lavender" />
          <p data-baca className="wide mx-auto mt-9 max-w-[980px] text-[clamp(1.9rem,4.4vw,3.75rem)]">
            {"“Keluhan nggak lagi".split(" ").map((k) => (
              <span key={k}>
                <span data-kata>{k}</span>{" "}
              </span>
            ))}
            {"tenggelam di chat.”".split(" ").map((k) => (
              <span key={k}>
                <span data-kata className="text-lavender">{k}</span>{" "}
              </span>
            ))}
          </p>
        </section>

        <section id="cara-kerja" className="scroll-mt-20">
          <AlurScroll />
        </section>

        <section id="coba" className="scroll-mt-20 bg-lilac-100 px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-12">
            <div data-reveal className="flex flex-wrap items-end justify-between gap-6">
              <div className="flex max-w-[760px] flex-col gap-5">
                <p className="tracked text-violet">Coba sendiri</p>
                <h2 className="wide text-[clamp(2rem,4vw,3.5rem)]">
                  Laporkan Kerusakan, <span className="aksen-teks">Lihat Hasilnya</span>
                </h2>
              </div>
            </div>
            <div data-reveal>
              <CobaLaporan />
            </div>
          </div>
        </section>

        <section id="peran" className="flex scroll-mt-20 flex-col md:flex-row">
          {PERAN.map((p) => (
            <article key={p.nama} tabIndex={-1} className={`peran group flex flex-col items-center gap-8 overflow-hidden px-8 pt-16 text-center ${p.gaya}`}>
              <div data-reveal className="flex max-w-[420px] flex-col gap-4">
                <p className={`tracked ${p.label}`}>Untuk</p>
                <h2 className="wide text-[clamp(2rem,3.4vw,3rem)]">{p.nama}</h2>
                <p className={`leading-relaxed ${p.teks}`}>{p.isi}</p>
              </div>
              <Maskot nama={p.art} className="mt-auto -mb-4 w-[min(70vw,330px)] origin-bottom transition-transform duration-700 ease-out-expo group-hover:scale-[1.09]" />
            </article>
          ))}
        </section>

        <section id="layanan" className="scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <div data-reveal>
              <p className="tracked text-violet">Layanan</p>
              <h2 className="wide mt-5 text-[clamp(2rem,4vw,3.5rem)]">Dimulai dari Keluhan</h2>
            </div>
            <ul className="mt-14">
              {LAYANAN.map((l, i) => (
                <li key={l.nama} data-reveal style={{ "--tunda": `${i * 90}ms` } as React.CSSProperties} className="baris-layanan group relative grid items-center gap-x-8 gap-y-3 border-t border-plum/15 py-8 md:grid-cols-[72px_minmax(0,4fr)_minmax(0,5fr)]">
                  <l.ikon className="size-16 transition-transform duration-500 ease-out-expo group-hover:scale-110 group-hover:-rotate-6" />
                  <h3 className="wide text-[clamp(1.25rem,2vw,1.75rem)] transition-transform duration-500 ease-out-expo md:group-hover:translate-x-2">{l.nama}</h3>
                  <p className="leading-relaxed text-navy-soft">{l.isi}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="bg-plum px-5 py-16 text-white sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-end justify-between gap-8">
          <div className="flex flex-col gap-4">
            <Logo tone="light" size={52} />
            <p className="max-w-[360px] leading-relaxed text-hero-sub">Platform manajemen kos untuk keluhan, perbaikan, dan tagihan.</p>
          </div>
          <p className="text-sm text-hero-sub">II3120 Layanan Sistem dan Teknologi Informasi</p>
        </div>
      </footer>
    </div>
  );
}
