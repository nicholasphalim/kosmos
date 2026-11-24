"use client";

import { clsx } from "clsx";
import { ChartNoAxesColumnIncreasing, HardHat, Receipt, Sparkles, Wallet, type IkonKosmos } from "@/components/icons";
import Link from "next/link";
import { useState } from "react";
import { StatusInvoiceStiker } from "@/components/perbaikan/Bagian";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { Stiker, type VarianStiker } from "@/components/ui/Stiker";
import { useInvoiceList, useLaporanKas } from "@/lib/api/hooks";
import type { TransaksiKas } from "@/lib/api/types";
import { rupiah, tanggal, waktuLengkap } from "@/lib/format";

const JENIS: Record<TransaksiKas["jenis"], { label: string; varian: VarianStiker; ikon: IkonKosmos }> = {
  pemasukan: { label: "Pemasukan", varian: "aktif", ikon: Wallet },
  pembayaran_teknisi: { label: "Ke teknisi", varian: "rendah", ikon: HardHat },
  komisi: { label: "Komisi", varian: "review", ikon: Sparkles },
};

type Tab = "kas" | "invoice";

/** Get Laporan Kas (Financial Ledger) + daftar invoice, sisi Pemilik. */
export default function KeuanganPage() {
  const laporan = useLaporanKas();
  const inv = useInvoiceList();
  const [tab, setTab] = useState<Tab>("kas");
  const r = laporan.data?.ringkasan;

  const kartu = [
    { label: "Dibayar penghuni", nilai: r?.pemasukan, ket: r ? `${r.invoice_lunas} invoice lunas` : "" },
    { label: "Diteruskan ke teknisi", nilai: r?.pembayaran_teknisi, ket: "Setelah dipotong komisi" },
    { label: "Komisi Kosmos", nilai: r?.komisi, ket: "Dari bagian teknisi" },
    { label: "Belum dibayar", nilai: r?.nilai_tertunda, ket: r ? `${r.invoice_tertunda} invoice` : "" },
  ];

  return (
    <div className="page-rise mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pt-5 pb-16 sm:px-6">
      <section className="night flex flex-col gap-8 rounded-[36px] p-7 sm:p-10 lg:p-12">
        <div className="relative flex max-w-[720px] flex-col gap-4">
          <h1 className="display text-[clamp(2.75rem,6vw,5rem)]">Laporan kas</h1>
          <p className="text-lg text-hero-sub">Setiap pembayaran perbaikan tercatat otomatis setelah lunas dan direkonsiliasi.</p>
        </div>
        <dl className="relative grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {kartu.map((k) => (
            <div key={k.label} className="flex flex-col gap-1 rounded-[20px] border border-white/15 bg-white/10 p-3.5 backdrop-blur sm:p-4">
              <dt className="text-xs font-semibold text-hero-sub sm:text-[13px]">{k.label}</dt>
              <dd className="display text-[clamp(1.35rem,3vw,2rem)]">{k.nilai === undefined ? "–" : rupiah(k.nilai)}</dd>
              <dd className="text-xs text-hero-sub">{k.ket}</dd>
            </div>
          ))}
        </dl>
      </section>

      <main className="panel overflow-hidden">
        <div className="flex flex-col gap-4 px-6 pt-5">
          <div role="group" aria-label="Pilih tampilan" className="flex w-fit flex-wrap gap-1 rounded-[26px] bg-lilac-100/70 p-1">
            {(
              [
                { id: "kas", label: "Transaksi kas", ikon: ChartNoAxesColumnIncreasing },
                { id: "invoice", label: "Invoice", ikon: Receipt },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  "flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors duration-200",
                  tab === t.id ? "bg-white text-navy shadow-[0_1px_3px_rgba(18,39,90,0.12)]" : "text-muted hover:text-navy",
                )}
              >
                <t.ikon className="size-5" aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "kas" && (
          <>
            {laporan.isPending && (
              <div className="flex flex-col gap-3 p-5">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            )}
            {laporan.isError && <ErrorState pesan={laporan.error.message} onRetry={() => laporan.refetch()} />}
            {laporan.data?.transaksi.length === 0 && <EmptyState judul="Belum ada transaksi" />}
            {laporan.data && laporan.data.transaksi.length > 0 && (
              <div className="overflow-x-auto px-2 pt-3 pb-2">
                <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th scope="col" className="px-4 py-2 font-semibold">Waktu</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Keterangan</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Jenis</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laporan.data.transaksi.map((t) => {
                      const j = JENIS[t.jenis];
                      return (
                        <tr key={t.id} className="border-t border-line-soft hover:bg-lilac-50">
                          <td className="px-4 py-3 text-[13px] whitespace-nowrap text-muted">{waktuLengkap(t.waktu)}</td>
                          <td className="px-4 py-3">
                            <span className="block font-semibold">{t.keterangan}</span>
                            <span className="text-xs text-muted">
                              <span className="font-mono">{t.ref}</span> · {t.properti}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Stiker varian={j.varian} ikon={j.ikon}>{j.label}</Stiker>
                          </td>
                          <td className={clsx("px-4 py-3 text-right font-mono font-bold whitespace-nowrap", t.jumlah >= 0 ? "text-ok" : "text-navy")}>
                            {t.jumlah >= 0 ? "+" : ""}
                            {rupiah(t.jumlah)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "invoice" && (
          <>
            {inv.isPending && (
              <div className="flex flex-col gap-3 p-5">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            )}
            {inv.isError && <ErrorState pesan={inv.error.message} onRetry={() => inv.refetch()} />}
            {inv.data?.length === 0 && <EmptyState judul="Belum ada invoice" />}
            {inv.data && inv.data.length > 0 && (
              <ul className="px-2 pt-3 pb-2">
                {inv.data.map((i) => (
                  <li key={i.id} className="border-t border-line-soft first:border-t-0">
                    <Link href={`/pemilik/tiket/${i.id_tiket}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] px-4 py-4 text-navy no-underline hover:bg-lilac-50">
                      <Receipt className="size-10 shrink-0" aria-hidden />
                      <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
                        <span className="font-bold">{i.judul}</span>
                        <span className="text-[13px] text-muted">
                          <span className="font-mono">{i.kode}</span> · {i.unit.nomor_unit} · {i.penghuni.nama} ·{" "}
                          {i.status === "lunas" && i.dibayar_at ? `dibayar ${waktuLengkap(i.dibayar_at)}` : `jatuh tempo ${tanggal(i.jatuh_tempo)}`}
                        </span>
                      </span>
                      <span className="font-display text-lg font-extrabold">{rupiah(i.total)}</span>
                      <StatusInvoiceStiker status={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
