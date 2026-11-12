"use client";

import { clsx } from "clsx";
import { Check, ChevronRight, House, Lock, RotateCcw, User, X, Building, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PlanetHouseArt } from "@/components/brand/Art";
import { Logo } from "@/components/brand/Logo";
import { BERANDA_ROLE } from "@/components/layout/RoleGuard";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useAkunDemo, useDemoLogin } from "@/lib/api/hooks";
import type { AkunDemo } from "@/lib/api/types";
import { config } from "@/lib/config";
import { resetDemo } from "@/lib/demoReset";
import { inisial } from "@/lib/format";
import { useSession } from "@/lib/session";

const TAG: Record<AkunDemo["label_sewa"], { teks: (a: AkunDemo) => string; icon: LucideIcon; gaya: string }> = {
  aktif: { teks: () => "Sewa aktif", icon: Check, gaya: "bg-ok-bg text-ok" },
  berakhir: { teks: () => "Sewa berakhir", icon: X, gaya: "bg-danger-bg text-danger" },
  pemilik: { teks: (a) => `${a.jumlah_properti ?? 0} kos`, icon: House, gaya: "bg-lilac-100 text-violet" },
};

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();
  const akun = useAkunDemo();
  const login = useDemoLogin();

  // Sudah masuk: langsung ke beranda role.
  useEffect(() => {
    if (session) router.replace(BERANDA_ROLE[session.pengguna.role]);
  }, [session, router]);

  const grup = [
    { judul: "Penghuni", icon: User, items: akun.data?.filter((a) => a.pengguna.role === "penghuni") ?? [] },
    { judul: "Pemilik", icon: Building, items: akun.data?.filter((a) => a.pengguna.role === "pemilik") ?? [] },
  ];

  return (
    <div className="flex min-h-screen flex-wrap bg-lilac-50">
      <section
        aria-label="Kosmos"
        className="relative flex min-h-90 flex-[1_1_420px] flex-col gap-8 overflow-hidden bg-navy p-10 text-white sm:p-14"
      >
        <PlanetHouseArt className="absolute -right-10 -bottom-6 w-[min(520px,90%)]" />
        <Logo tone="light" className="relative" />
        <p className="relative max-w-[420px] font-display text-5xl leading-[1.02] font-extrabold tracking-[-0.04em]">
          Kerusakan kos, cepat beres.
        </p>
      </section>

      <main className="flex flex-[1_1_480px] items-center justify-center px-6 py-14">
        <div className="flex w-full max-w-[440px] flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.04em]">Masuk sebagai</h1>
            <p className="flex items-center gap-2 text-[15px] text-muted">
              <Lock className="size-4" aria-hidden />
              Akun demo, tanpa kata sandi
            </p>
          </div>

          {akun.isError && <ErrorState pesan="Gagal memuat akun demo." onRetry={() => akun.refetch()} />}
          {login.isError && (
            <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
              {login.error.message}
            </p>
          )}

          {grup.map((g) => (
            <section key={g.judul} className="flex flex-col gap-2.5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-muted">
                <g.icon className="size-4" aria-hidden />
                {g.judul}
              </h2>
              <ul className="overflow-hidden rounded-[20px] border border-line bg-white">
                {akun.isPending &&
                  Array.from({ length: g.judul === "Penghuni" ? 3 : 1 }, (_, i) => (
                    <li key={i} className="flex items-center gap-3.5 border-t border-line-soft px-4.5 py-3.5 first:border-t-0">
                      <Skeleton className="size-11" />
                      <Skeleton className="h-4 flex-1" />
                    </li>
                  ))}
                {g.items.map((a) => {
                  const tag = TAG[a.label_sewa];
                  const sedangMasuk = login.isPending && login.variables === a.pengguna.id;
                  return (
                    <li key={a.pengguna.id} className="border-t border-line-soft first:border-t-0">
                      <button
                        type="button"
                        disabled={login.isPending}
                        onClick={() => login.mutate(a.pengguna.id)}
                        className="flex min-h-18 w-full cursor-pointer items-center gap-3.5 px-4.5 py-3.5 text-left hover:bg-lilac-50 disabled:cursor-wait"
                      >
                        <span
                          aria-hidden
                          className={clsx(
                            "flex size-11 shrink-0 items-center justify-center rounded-[14px] font-display text-lg font-extrabold",
                            a.pengguna.role === "pemilik" ? "bg-navy text-lavender" : "bg-lavender text-navy",
                          )}
                        >
                          {inisial(a.pengguna.nama)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="font-bold">{a.pengguna.nama}</span>
                          <span className="truncate text-sm text-muted">{a.keterangan}</span>
                        </span>
                        <span className={clsx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap", tag.gaya)}>
                          <tag.icon className="size-3" strokeWidth={3} aria-hidden />
                          {tag.teks(a)}
                        </span>
                        <ChevronRight className={clsx("size-4.5 text-subtle", sedangMasuk && "animate-pulse")} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {config.apiMode === "mock" && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Kembalikan semua data demo ke kondisi awal? Tiket dan pesan yang dibuat akan hilang.")) {
                  resetDemo();
                }
              }}
              className="flex h-11 cursor-pointer items-center justify-center gap-2 self-center rounded-xl px-3.5 text-sm font-semibold text-muted hover:bg-lilac-100 hover:text-navy"
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset data demo
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
