"use client";

import { ArrowLeft } from "@/components/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { InvoiceKartu } from "@/components/tagihan/InvoiceKartu";
import { PanelBayar } from "@/components/tagihan/PanelBayar";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { ApiError } from "@/lib/api/client";
import { useInvoice } from "@/lib/api/hooks";

/**
 * Layanan Pembayaran & Rekonsiliasi (consumer: Pemilik, provider: Task CSM).
 * Pemilik yang memanggil teknisi, jadi pemilik yang menerima dan membayar tagihan perbaikan.
 */
export default function TagihanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const idInvoice = Number(id);
  const inv = useInvoice(idInvoice);

  return (
    <main className="page-rise mx-auto flex max-w-[1080px] flex-col gap-6 px-3 pt-8 pb-16 sm:px-6">
      <Link
        href={inv.data ? `/pemilik/tiket/${inv.data.id_tiket}` : "/pemilik/keuangan"}
        className="flex items-center gap-2 self-start text-sm font-semibold text-hero-sub no-underline hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {inv.data ? `Tiket ${inv.data.kode_tiket}` : "Keuangan"}
      </Link>
      <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">{inv.data?.jenis === "kunjungan" ? "Tagihan biaya kunjungan" : "Tagihan perbaikan"}</h1>

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
