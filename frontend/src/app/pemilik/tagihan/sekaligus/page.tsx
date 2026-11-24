"use client";

import { ArrowLeft, Receipt } from "@/components/icons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { StatusInvoiceStiker } from "@/components/perbaikan/Bagian";
import { PanelBayarUmum } from "@/components/tagihan/PanelBayar";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useBayarSekaligus, useInvoiceList } from "@/lib/api/hooks";
import { rupiah, tanggal } from "@/lib/format";

/** Bayar beberapa invoice perbaikan sekaligus dalam satu transaksi payment gateway. */
function BayarSekaligus() {
  const ids = (useSearchParams().get("id") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const semua = useInvoiceList();
  const bayar = useBayarSekaligus();
  // Setelah berhasil, tampilkan versi invoice dari respons (sudah lunas).
  const sumber = bayar.data?.hasil === "berhasil" ? bayar.data.invoice : semua.data?.filter((i) => ids.includes(i.id));
  const daftar = sumber ?? [];
  const total = daftar.reduce((s, i) => s + i.total, 0);
  const sudahLunas = bayar.data?.hasil === "berhasil";

  return (
    <main className="page-rise mx-auto flex max-w-[1080px] flex-col gap-6 px-3 pt-8 pb-16 sm:px-6">
      <Link href="/pemilik/keuangan" className="flex items-center gap-2 self-start text-sm font-semibold text-hero-sub no-underline hover:text-white">
        <ArrowLeft className="size-4" aria-hidden />
        Keuangan
      </Link>
      <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">Bayar sekaligus</h1>

      {semua.isPending && <Skeleton className="h-[420px] rounded-3xl" />}
      {semua.isError && <ErrorState pesan={semua.error.message} onRetry={() => semua.refetch()} />}
      {semua.data && daftar.length === 0 && <ErrorState pesan="Tidak ada invoice yang dipilih." />}
      {semua.data && daftar.length > 0 && (
        <div className="flex flex-wrap items-start gap-6">
          <section aria-labelledby="sekaligus-judul" className="panel flex min-w-0 flex-[999_1_520px] flex-col gap-4 p-6 sm:p-8">
            <h2 id="sekaligus-judul" className="font-display text-xl font-extrabold tracking-tight">
              {daftar.length} invoice perbaikan
            </h2>
            <ul className="flex flex-col">
              {daftar.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft py-3 first:border-t-0">
                  <Receipt className="size-8 shrink-0" aria-hidden />
                  <span className="flex min-w-0 flex-[1_1_220px] flex-col">
                    <span className="font-bold">{i.judul}</span>
                    <span className="text-[13px] text-muted">
                      <span className="font-mono">{i.kode}</span> · {i.unit.nomor_unit} · jatuh tempo {tanggal(i.jatuh_tempo)}
                    </span>
                  </span>
                  <span className="font-mono font-bold">{rupiah(i.total)}</span>
                  <StatusInvoiceStiker status={i.status} terlambat={i.terlambat} />
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <span className="font-bold">Total</span>
              <span className="font-display text-2xl font-extrabold">{rupiah(total)}</span>
            </div>
          </section>
          <PanelBayarUmum
            judul="Bayar semua"
            catatan="Satu transaksi di payment gateway untuk semua invoice. Kalau gagal, tidak ada invoice yang ditandai lunas."
            total={total}
            lunas={sudahLunas ? { dibayar_at: daftar[0]?.dibayar_at ?? null, pembayaran: daftar[0]?.pembayaran.findLast((p) => p.status === "berhasil") } : null}
            isPending={bayar.isPending}
            gagal={bayar.data?.hasil === "gagal" ? bayar.data.alasan : null}
            error={bayar.error?.message ?? null}
            onBayar={(metode, simulasiGagal) => bayar.mutate({ ids: daftar.map((i) => i.id), metode, simulasiGagal })}
          />
        </div>
      )}
    </main>
  );
}

export default function BayarSekaligusPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-8 h-[420px] max-w-[1080px] rounded-3xl" />}>
      <BayarSekaligus />
    </Suspense>
  );
}
