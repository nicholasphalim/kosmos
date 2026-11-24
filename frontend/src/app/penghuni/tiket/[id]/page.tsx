"use client";

import { Check, CirclePlus, Ticket, TriangleExclamationPoint } from "@/components/icons";
import { useParams, useSearchParams } from "next/navigation";
import { SparkleCluster } from "@/components/brand/Art";
import { PerbaikanPenghuni } from "@/components/perbaikan/PerbaikanPenghuni";
import { TiketDetailCard } from "@/components/tiket/TiketDetailCard";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { ApiError } from "@/lib/api/client";
import { useTiketDetail } from "@/lib/api/hooks";

export default function TiketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const baru = useSearchParams().get("baru") === "1";
  const idTiket = Number(id);
  const tiket = useTiketDetail(idTiket);

  return (
    <main className="page-rise mx-auto flex max-w-[860px] flex-col gap-6 px-3 pt-8 pb-16 sm:px-6">
      {baru && tiket.data && (
        <section className="relative flex flex-wrap items-center gap-6 overflow-hidden rounded-[28px] bg-lavender px-8 py-9 text-navy sm:px-10">
          <SparkleCluster
            className="pointer-events-none absolute top-2 right-4 hidden w-[130px] md:block"
            tones={["#ffffff", "var(--color-violet-300)", "var(--color-navy)"]}
          />
          <span aria-hidden className="relative flex size-18 items-center justify-center rounded-3xl bg-navy text-lavender">
            <Check className="size-9" strokeWidth={2.6} />
          </span>
          <div className="relative flex flex-col gap-1.5">
            <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">Laporan diterima</h1>
            <p className="text-[17px] text-navy-soft">Pemilik sudah dikabari lewat WhatsApp.</p>
          </div>
        </section>
      )}

      {baru && tiket.data?.status === "dibuat" && (
        <p role="status" className="flex items-center gap-2.5 rounded-2xl bg-warn-bg px-4.5 py-3.5 text-sm font-semibold text-warn">
          <TriangleExclamationPoint className="size-4.5 shrink-0" aria-hidden />
          Klasifikasi AI sedang tidak tersedia. Tiket tetap dibuat dan akan ditinjau pemilik.
        </p>
      )}

      {!baru && <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">Detail tiket</h1>}

      {tiket.isPending && <Skeleton className="h-[520px] rounded-3xl" />}
      {tiket.isError && (
        <ErrorState
          pesan={tiket.error instanceof ApiError && tiket.error.status === 404 ? "Tiket tidak ditemukan." : tiket.error.message}
          onRetry={() => tiket.refetch()}
        />
      )}
      {tiket.data && <TiketDetailCard tiket={tiket.data} />}
      {tiket.data && <PerbaikanPenghuni idTiket={tiket.data.id} statusTiket={tiket.data.status} />}


      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/penghuni/tiket" size="lg" className="flex-[1_1_220px]" icon={<Ticket className="size-4.5" aria-hidden />}>
          Semua tiket saya
        </ButtonLink>
        <ButtonLink
          href="/penghuni/lapor"
          variant="outline"
          size="lg"
          className="flex-[1_1_220px]"
          icon={<CirclePlus className="size-4.5" aria-hidden />}
        >
          Lapor lagi
        </ButtonLink>
      </div>
    </main>
  );
}
