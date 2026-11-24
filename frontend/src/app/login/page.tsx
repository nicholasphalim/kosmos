"use client";

import { clsx } from "clsx";
import { ChevronRight, HardHat, House, RotateCcw, X } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";
import { AstronotAvatar } from "@/components/brand/AstronotAvatar";
import { Logo } from "@/components/brand/Logo";
import { KosmosScene } from "@/components/three/KosmosScene";
import { BERANDA_ROLE } from "@/components/layout/RoleGuard";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useAkunDemo, useDemoLogin } from "@/lib/api/hooks";
import type { AkunDemo } from "@/lib/api/types";
import { resetDemo } from "@/lib/demoReset";
import { useSession } from "@/lib/session";
import { Stiker } from "@/components/ui/Stiker";

/** Avatar akun: pemilik memakai ikon orang, penghuni memakai maskot sesuai status sewa. */
function AvatarAkun({ label }: { label: AkunDemo["label_sewa"] }) {
  if (label === "pemilik" || label === "teknisi") {
    return <AstronotAvatar suasana={label} className="size-12 shrink-0" />;
  }
  return (
    <>
      <AstronotAvatar suasana={label === "aktif" ? "senang" : "sedih"} className="size-12 shrink-0" />
      {/* Status tetap terbaca oleh screen reader walau labelnya tidak ditampilkan. */}
      <span className="sr-only">{label === "aktif" ? "Sewa aktif" : "Sewa berakhir"}</span>
    </>
  );
}

const TAB = [
  { role: "penghuni", label: "Penghuni", kerangka: 3 },
  { role: "pemilik", label: "Pemilik", kerangka: 1 },
  { role: "teknisi", label: "Teknisi", kerangka: 3 },
] as const;

type RoleTab = (typeof TAB)[number]["role"];

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();
  const akun = useAkunDemo();
  const login = useDemoLogin();
  const [tab, setTab] = useState<RoleTab>("penghuni");

  // Sudah masuk: langsung ke beranda role.
  useEffect(() => {
    if (session) router.replace(BERANDA_ROLE[session.pengguna.role]);
  }, [session, router]);

  const tabAktif = TAB.find((t) => t.role === tab)!;
  const items = akun.data?.filter((a) => a.pengguna.role === tab) ?? [];

  function pindahTab(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = TAB.findIndex((t) => t.role === tab);
    const berikut = TAB[(i + (e.key === "ArrowRight" ? 1 : TAB.length - 1)) % TAB.length].role;
    setTab(berikut);
    document.getElementById(`tab-${berikut}`)?.focus();
  }

  return (
    <div
      className="login-bg flex min-h-screen items-center justify-center p-3 sm:p-6 lg:p-8"
      style={{ backgroundImage: "url(/login-bg.webp)" }}
    >
      <div className="page-rise relative grid w-full max-w-[1240px] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[32px] bg-white text-navy shadow-[0_40px_120px_-40px_#7340b2] lg:min-h-[min(760px,calc(100vh-4rem))] lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
        <Link
          href="/"
          aria-label="Tutup dan kembali ke beranda"
          title="Tutup"
          className="absolute top-4 right-4 z-20 flex size-11 items-center justify-center rounded-full bg-lilac-100 text-navy transition-colors duration-200 hover:bg-violet hover:text-white sm:top-5 sm:right-5"
        >
          <X className="size-5" strokeWidth={2.4} aria-hidden />
        </Link>
        <section aria-label="Kosmos" className="night relative flex min-h-[420px] flex-col justify-start gap-4 border-0 p-6 sm:p-9">
          <KosmosScene variant="astronot" className="absolute inset-0" />
          <Logo tone="light" size={46} className="relative" />
          <p className="relative mr-auto ml-[46%] w-fit max-w-[210px] rounded-[20px] rounded-bl-md border border-white/20 bg-white/12 px-4 py-2.5 text-sm font-bold text-white shadow-[0_16px_40px_-18px_#000] backdrop-blur-md max-lg:absolute max-lg:top-24 max-lg:right-4 max-lg:ml-0 max-lg:max-w-[150px] max-lg:text-[13px] lg:-mt-2">
            Halo! Selamat datang di Kosmos.
          </p>        </section>

        <main className="flex flex-col justify-center gap-6 px-5 py-8 sm:px-12 sm:py-10 lg:px-16">
          <h1 className="text-[clamp(2rem,3.5vw,2.75rem)] leading-tight font-bold tracking-[-0.025em]">Masuk sebagai</h1>

          <div role="tablist" aria-label="Jenis akun" className="flex gap-8 border-b border-line-strong">
            {TAB.map((t) => {
              const aktif = t.role === tab;
              return (
                <button
                  key={t.role}
                  id={`tab-${t.role}`}
                  type="button"
                  role="tab"
                  aria-selected={aktif}
                  aria-controls="panel-akun"
                  tabIndex={aktif ? 0 : -1}
                  onClick={() => setTab(t.role)}
                  onKeyDown={pindahTab}
                  className={clsx(
                    "-mb-px cursor-pointer border-b-[3px] pb-3 text-lg font-bold transition-colors duration-200",
                    aktif ? "border-violet text-navy" : "border-transparent text-subtle hover:text-navy",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {akun.isError && <ErrorState pesan="Gagal memuat akun demo." onRetry={() => akun.refetch()} />}
          {login.isError && (
            <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
              {login.error.message}
            </p>
          )}

          <div id="panel-akun" role="tabpanel" aria-labelledby={`tab-${tab}`} className={clsx("min-h-[284px] flex-col gap-2.5", akun.isError ? "hidden" : "flex")}>
            <p className="text-sm font-medium">Pilih akun</p>
            <ul className="flex flex-col gap-2.5">
              {akun.isPending &&
                Array.from({ length: tabAktif.kerangka }, (_, i) => (
                  <li key={i} className="flex min-h-[74px] items-center gap-3.5 rounded-2xl border border-line-strong px-4">
                    <Skeleton className="size-11" />
                    <Skeleton className="h-4 flex-1" />
                  </li>
                ))}
              {items.map((a) => {
                const sedangMasuk = login.isPending && login.variables === a.pengguna.id;
                return (
                  <li key={a.pengguna.id}>
                    <button
                      type="button"
                      disabled={login.isPending}
                      onClick={() => login.mutate(a.pengguna.id)}
                      className="group flex min-h-[74px] w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-line-strong bg-white px-3.5 py-3 text-left transition-colors duration-200 hover:border-violet-400 hover:bg-lilac-50 disabled:cursor-wait"
                    >
                      <AvatarAkun label={a.label_sewa} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">{a.pengguna.nama}</span>
                        <span className="truncate text-sm text-muted">{a.keterangan}</span>
                      </span>
                      {a.label_sewa === "pemilik" && (
                        <Stiker varian="netral" ikon={House}>{a.jumlah_properti ?? 0} kos</Stiker>
                      )}
                      {a.label_sewa === "teknisi" && <Stiker varian="aktif" ikon={HardHat}>Mitra</Stiker>}
                      <ChevronRight
                        className={clsx(
                          "size-4.5 shrink-0 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-violet",
                          sedangMasuk && "animate-pulse",
                        )}
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Mode mock menghapus database di localStorage; mode live memanggil POST /dev/reset di backend. */}
          <p className="flex flex-wrap items-center justify-center gap-1 text-sm text-muted">
            Data demo berantakan?
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Kembalikan semua data demo ke kondisi awal? Tiket dan pesan yang dibuat akan hilang.")) {
                  void resetDemo();
                }
              }}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 font-semibold text-navy hover:text-violet"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reset data demo
            </button>
          </p>
        </main>
      </div>
    </div>
  );
}
