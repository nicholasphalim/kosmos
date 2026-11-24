"use client";

import { ChevronRight, Clock, Wallet } from "@/components/icons";
import Link from "next/link";
import { StatusInvoiceStiker } from "@/components/perbaikan/Bagian";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useTagihanSewaList } from "@/lib/api/hooks";
import { labelPeriode, rupiah, tanggal, waktuRelatif } from "@/lib/format";

/** Tagihan sewa bulanan milik penghuni (Get Tagihan Sewa). Biaya perbaikan tidak di sini: ditanggung pemilik. */
export default function SewaPage() {
  const sewa = useTagihanSewaList();
  const belum = sewa.data?.filter((t) => t.status === "belum_dibayar") ?? [];

  return (
    <main className="page-rise mx-auto flex max-w-[860px] flex-col gap-6 px-3 pt-8 pb-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">Sewa</h1>
        <p className="text-lg text-hero-sub">
          {sewa.data
            ? belum.length
              ? `${belum.length} tagihan sewa menunggu dibayar, total ${rupiah(belum.reduce((s, t) => s + t.jumlah, 0))}.`
              : "Semua tagihan sewa sudah lunas."
            : "Memuat tagihan sewa…"}
        </p>
      </div>

      <section className="panel overflow-hidden">
        {sewa.isPending && (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
        {sewa.isError && <ErrorState pesan={sewa.error.message} onRetry={() => sewa.refetch()} />}
        {sewa.data?.length === 0 && <EmptyState judul="Belum ada tagihan sewa" />}
        {sewa.data && sewa.data.length > 0 && (
          <ul>
            {sewa.data.map((t) => (
              <li key={t.id} className="border-t border-line-soft first:border-t-0">
                <Link href={`/penghuni/sewa/${t.id}`} className="flex items-center gap-4 px-5 py-4 text-navy no-underline hover:bg-lilac-50">
                  <span aria-hidden className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-lilac-100">
                    <Wallet className="size-9" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">Sewa {labelPeriode(t.periode)}</span>
                      <StatusInvoiceStiker status={t.status} terlambat={t.terlambat} />
                    </span>
                    <span className="flex flex-wrap items-center gap-3.5 text-[13px] text-muted">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5" aria-hidden />
                        {t.status === "lunas" ? `Dibayar ${waktuRelatif(t.dibayar_at ?? t.created_at)}` : `Jatuh tempo ${tanggal(t.jatuh_tempo)}`}
                      </span>
                      <span>{t.unit.nama_properti} · {t.unit.nomor_unit}</span>
                      <span className="font-mono text-xs">{t.kode}</span>
                    </span>
                  </span>
                  <span className="font-display text-lg font-extrabold whitespace-nowrap">{rupiah(t.jumlah)}</span>
                  <ChevronRight className="size-4.5 text-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
