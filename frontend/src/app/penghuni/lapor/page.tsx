"use client";

import { House } from "lucide-react";
import { useRouter } from "next/navigation";
import { PlanetHouseArt } from "@/components/brand/Art";
import { AlurSetelahKirim } from "@/components/keluhan/AlurSetelahKirim";
import { KeluhanForm } from "@/components/keluhan/KeluhanForm";
import { LaporanDitolak } from "@/components/keluhan/LaporanDitolak";
import { SewaBadge } from "@/components/tiket/Badges";
import { Skeleton } from "@/components/ui/States";
import { useAjukanKeluhan, useProfilPenghuni } from "@/lib/api/hooks";

/** Layanan Pengajuan Keluhan (consumer: Penghuni, provider: Task HMR). */
export default function LaporPage() {
  const router = useRouter();
  const profil = useProfilPenghuni();
  const ajukan = useAjukanKeluhan();

  if (ajukan.data?.hasil === "ditolak") {
    return <LaporanDitolak hasil={ajukan.data} unit={profil.data?.unit} onKembali={() => ajukan.reset()} />;
  }

  return (
    <main className="mx-auto flex max-w-[1160px] flex-col gap-6 px-6 pt-8 pb-16">
      <section className="relative flex flex-col gap-4.5 overflow-hidden rounded-[28px] bg-navy p-8 text-white sm:p-10">
        <PlanetHouseArt className="pointer-events-none absolute top-1/2 right-6 hidden w-[260px] -translate-y-1/2 md:block" />
        <h1 className="relative max-w-[560px] font-display text-[44px] leading-none font-extrabold tracking-[-0.04em] sm:text-[52px]">
          Ada yang rusak?
        </h1>
        <p className="relative max-w-[460px] text-[17px] text-hero-sub">Foto masalahnya, kami kabari pemilik lewat WhatsApp.</p>
        <div className="relative flex flex-wrap items-center gap-2.5 self-start rounded-full bg-white/10 py-2 pr-2 pl-3.5">
          <House className="size-4.5 text-lavender" aria-hidden />
          {profil.data ? (
            <>
              <span className="text-[15px] font-semibold">
                {profil.data.unit.nama_properti} · {profil.data.unit.nomor_unit}
              </span>
              <SewaBadge status={profil.data.sewa.status_sewa} />
            </>
          ) : (
            <Skeleton className="h-6 w-48 bg-white/20" />
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <KeluhanForm
          pending={ajukan.isPending}
          serverError={ajukan.error?.message ?? null}
          onSubmit={(input) =>
            ajukan.mutate(input, {
              onSuccess: (res) => {
                if (res.hasil === "diterima" && res.tiket) router.push(`/penghuni/tiket/${res.tiket.id}?baru=1`);
              },
            })
          }
        />
        <AlurSetelahKirim aktif={ajukan.isPending} />
      </div>
    </main>
  );
}
