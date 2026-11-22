"use client";

import { House } from "@/components/icons";
import { useRouter } from "next/navigation";
import { AlurSetelahKirim } from "@/components/keluhan/AlurSetelahKirim";
import { KeluhanForm } from "@/components/keluhan/KeluhanForm";
import { LaporanDitolak } from "@/components/keluhan/LaporanDitolak";
import { KosmosScene } from "@/components/three/KosmosScene";
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
    <main className="page-rise mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pt-5 pb-16 sm:px-6">
      <section className="night flex min-h-[340px] flex-col justify-end gap-5 rounded-[36px] p-7 sm:p-12">
        <KosmosScene variant="tukang" className="absolute inset-y-0 right-0 hidden w-[56%] [mask-image:linear-gradient(90deg,transparent,#000_16%)] md:block" />
        <h1 className="display relative max-w-[720px] text-[clamp(3rem,7vw,5.75rem)]">
          Ada yang <span className="text-glow">rusak?</span>
        </h1>
        <p className="relative max-w-[460px] text-lg text-hero-sub">Foto masalahnya, kami kabari pemilik lewat WhatsApp.</p>
        <div className="relative flex flex-wrap items-center gap-2.5 self-start rounded-full border border-white/20 bg-white/10 py-1.5 pr-1.5 pl-3.5 backdrop-blur">
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
