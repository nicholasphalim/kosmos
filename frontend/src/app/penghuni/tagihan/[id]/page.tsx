"use client";

import { ArrowLeft, Check } from "@/components/icons";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { SparkleCluster } from "@/components/brand/Art";
import { InvoiceKartu } from "@/components/tagihan/InvoiceKartu";
import { PanelBayar } from "@/components/tagihan/PanelBayar";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { ApiError } from "@/lib/api/client";
import { useInvoice } from "@/lib/api/hooks";

/** Layanan Pembayaran & Rekonsiliasi (consumer: Penghuni, provider: Task CSM). */
export default function TagihanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const baru = useSearchParams().get("baru") === "1";
  const idInvoice = Number(id);
  const inv = useInvoice(idInvoice);

  return (
    <main className="page-rise mx-auto flex max-w-[1080px] flex-col gap-6 px-3 pt-8 pb-16 sm:px-6">
      <Link href="/penghuni/tagihan" className="flex items-center gap-2 self-start text-sm font-semibold text-hero-sub no-underline hover:text-white">
        <ArrowLeft className="size-4" aria-hidden />
        Semua tagihan
      </Link>

      {baru && inv.data?.status === "belum_dibayar" && (
        <section className="relative flex flex-wrap items-center gap-6 overflow-hidden rounded-[28px] bg-lavender px-8 py-9 text-navy sm:px-10">
          <SparkleCluster className="pointer-events-none absolute top-2 right-4 hidden w-[130px] md:block" tones={["#ffffff", "var(--color-violet-300)", "var(--color-navy)"]} />
          <span aria-hidden className="relative flex size-18 items-center justify-center rounded-3xl bg-navy">
            <Check className="size-9" />
          </span>
          <div className="relative flex flex-col gap-1.5">
            <h1 className="display text-[clamp(2.25rem,5vw,3.5rem)]">Perbaikan selesai</h1>
            <p className="text-[17px] text-navy-soft">Terima kasih sudah mengonfirmasi. Tagihan sudah terbit.</p>
          </div>
        </section>
      )}
      {!(baru && inv.data?.status === "belum_dibayar") && <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">Tagihan</h1>}

      {inv.isPending && <Skeleton className="h-[520px] rounded-3xl" />}
      {inv.isError && (
        <ErrorState
          pesan={inv.error instanceof ApiError && inv.error.status === 404 ? "Tagihan tidak ditemukan." : inv.error.message}
          onRetry={() => inv.refetch()}
        />
      )}
      {inv.data && (
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[999_1_520px]">
            <InvoiceKartu invoice={inv.data} />
          </div>
          <PanelBayar invoice={inv.data} />
        </div>
      )}

    </main>
  );
}
