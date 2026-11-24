"use client";

import { ChevronRight, Clock, Receipt } from "@/components/icons";
import Link from "next/link";
import { StatusInvoiceStiker } from "@/components/perbaikan/Bagian";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useInvoiceList } from "@/lib/api/hooks";
import { rupiah, tanggal, waktuRelatif } from "@/lib/format";

/** Daftar invoice perbaikan milik penghuni (Get Invoice). */
export default function TagihanPage() {
  const inv = useInvoiceList();
  const belum = inv.data?.filter((i) => i.status === "belum_dibayar") ?? [];

  return (
    <main className="page-rise mx-auto flex max-w-[860px] flex-col gap-6 px-3 pt-8 pb-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">Tagihan</h1>
        <p className="text-lg text-hero-sub">
          {inv.data
            ? belum.length
              ? `${belum.length} tagihan menunggu dibayar, total ${rupiah(belum.reduce((s, i) => s + i.total, 0))}.`
              : "Semua tagihan perbaikan sudah lunas."
            : "Memuat tagihan…"}
        </p>
      </div>

      <section className="panel overflow-hidden">
        {inv.isPending && (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
        {inv.isError && <ErrorState pesan={inv.error.message} onRetry={() => inv.refetch()} />}
        {inv.data?.length === 0 && <EmptyState judul="Belum ada tagihan" />}
        {inv.data && inv.data.length > 0 && (
          <ul>
            {inv.data.map((i) => (
              <li key={i.id} className="border-t border-line-soft first:border-t-0">
                <Link href={`/penghuni/tagihan/${i.id}`} className="flex items-center gap-4 px-5 py-4 text-navy no-underline hover:bg-lilac-50">
                  <span aria-hidden className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-lilac-100">
                    <Receipt className="size-9" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{i.judul}</span>
                      <StatusInvoiceStiker status={i.status} />
                    </span>
                    <span className="flex flex-wrap items-center gap-3.5 text-[13px] text-muted">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5" aria-hidden />
                        {i.status === "lunas" ? `Dibayar ${waktuRelatif(i.dibayar_at ?? i.created_at)}` : `Jatuh tempo ${tanggal(i.jatuh_tempo)}`}
                      </span>
                      <span className="font-mono text-xs">{i.kode}</span>
                    </span>
                  </span>
                  <span className="font-display text-lg font-extrabold whitespace-nowrap">{rupiah(i.total)}</span>
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
