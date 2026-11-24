"use client";

import { ArrowLeft, Building, Info, Wallet } from "@/components/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusInvoiceStiker } from "@/components/perbaikan/Bagian";
import { PanelBayarUmum } from "@/components/tagihan/PanelBayar";
import { Stiker } from "@/components/ui/Stiker";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { ApiError } from "@/lib/api/client";
import { useBayarSewa, useTagihanSewa } from "@/lib/api/hooks";
import { LABEL_METODE, labelPeriode, rupiah, tanggal, waktuLengkap } from "@/lib/format";

/** Layanan Pembayaran Sewa (consumer: Penghuni, provider: Task Rent Billing). */
export default function SewaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTagihanSewa(Number(id));
  const bayar = useBayarSewa();

  return (
    <main className="page-rise mx-auto flex max-w-[1080px] flex-col gap-6 px-3 pt-8 pb-16 sm:px-6">
      <Link href="/penghuni/sewa" className="flex items-center gap-2 self-start text-sm font-semibold text-hero-sub no-underline hover:text-white">
        <ArrowLeft className="size-4" aria-hidden />
        Semua tagihan sewa
      </Link>
      <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">{t.data ? `Sewa ${labelPeriode(t.data.periode)}` : "Tagihan sewa"}</h1>

      {t.isPending && <Skeleton className="h-[420px] rounded-3xl" />}
      {t.isError && (
        <ErrorState
          pesan={t.error instanceof ApiError && t.error.status === 404 ? "Tagihan sewa tidak ditemukan." : t.error.message}
          onRetry={() => t.refetch()}
        />
      )}
      {t.data && (
        <div className="flex flex-wrap items-start gap-6">
          <section aria-labelledby="sewa-judul" className="panel flex min-w-0 flex-[999_1_520px] flex-col gap-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <span aria-hidden className="flex size-16 items-center justify-center rounded-[20px] bg-lilac-100">
                  <Wallet className="size-11" />
                </span>
                <div className="flex flex-col gap-1">
                  <h2 id="sewa-judul" className="font-display text-[26px] leading-tight font-extrabold tracking-tight">
                    {rupiah(t.data.jumlah)}
                  </h2>
                  <span className="font-mono text-sm text-muted">{t.data.kode}</span>
                </div>
              </div>
              <StatusInvoiceStiker status={t.data.status} terlambat={t.data.terlambat} />
            </div>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 text-sm">
              {[
                { label: "Unit", nilai: `${t.data.unit.nama_properti} · ${t.data.unit.nomor_unit}` },
                { label: "Periode", nilai: labelPeriode(t.data.periode) },
                { label: "Jatuh tempo", nilai: tanggal(t.data.jatuh_tempo) },
              ].map((d) => (
                <div key={d.label} className="flex items-center gap-2.5 rounded-2xl bg-white/60 px-3.5 py-3">
                  <Building className="size-6 shrink-0" aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <dt className="text-xs text-muted">{d.label}</dt>
                    <dd className="truncate font-bold">{d.nilai}</dd>
                  </span>
                </div>
              ))}
            </dl>
            <p className="flex items-start gap-2.5 rounded-2xl bg-lilac-50 px-4 py-3 text-[13px] text-navy-soft">
              <Info className="size-4.5 shrink-0" aria-hidden />
              Ini hanya tagihan sewa kamar. Biaya perbaikan kerusakan ditanggung pemilik kos.
            </p>
            {t.data.pembayaran.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-line-soft pt-5">
                <h3 className="font-bold">Riwayat pembayaran</h3>
                <ol className="flex flex-col">
                  {[...t.data.pembayaran].reverse().map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                      <span className="min-w-0 flex-1">
                        <span className="font-bold">{LABEL_METODE[p.metode]}</span>
                        <span className="text-muted"> · {waktuLengkap(p.created_at)}</span>
                        {p.alasan_gagal && <span className="block text-[13px] text-danger">{p.alasan_gagal}</span>}
                      </span>
                      <span className="font-mono text-xs text-muted">{p.ref_gateway}</span>
                      <Stiker varian={p.status === "berhasil" ? "aktif" : p.status === "gagal" ? "berakhir" : "netral"}>
                        {p.status === "berhasil" ? "Berhasil" : p.status === "gagal" ? "Gagal" : "Pending"}
                      </Stiker>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
          <PanelBayarUmum
            judul="Bayar sewa"
            total={t.data.jumlah}
            lunas={t.data.status === "lunas" ? { dibayar_at: t.data.dibayar_at, pembayaran: t.data.pembayaran.findLast((p) => p.status === "berhasil") } : null}
            isPending={bayar.isPending}
            gagal={bayar.data?.hasil === "gagal" ? bayar.data.alasan : null}
            error={bayar.error?.message ?? null}
            onBayar={(metode, simulasiGagal) => bayar.mutate({ id: t.data!.id, metode, simulasiGagal })}
          />
        </div>
      )}
    </main>
  );
}
