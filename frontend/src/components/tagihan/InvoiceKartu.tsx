import { Building, HardHat, Info, Receipt, User } from "@/components/icons";
import { RincianBiayaTabel, StatusInvoiceStiker } from "@/components/perbaikan/Bagian";
import { Stiker } from "@/components/ui/Stiker";
import type { Invoice } from "@/lib/api/types";
import { LABEL_METODE, rupiah, tanggal, waktuLengkap } from "@/lib/format";

/** Invoice digital (Add Invoice / Get Invoice) beserta riwayat percobaan bayar. */
export function InvoiceKartu({ invoice: i }: { invoice: Invoice }) {
  return (
    <section aria-labelledby="invoice-judul" className="panel flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span aria-hidden className="flex size-16 items-center justify-center rounded-[20px] bg-lilac-100">
            <Receipt className="size-11" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="invoice-judul" className="font-display text-[26px] leading-tight font-extrabold tracking-tight">
              {i.judul}
            </h2>
            <span className="text-sm text-muted">
              <span className="font-mono">{i.kode}</span> · tiket <span className="font-mono">{i.kode_tiket}</span>
            </span>
          </div>
        </div>
        <StatusInvoiceStiker status={i.status} />
      </div>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 text-sm">
        {[
          { ikon: Building, label: "Unit", nilai: `${i.unit.nama_properti} · ${i.unit.nomor_unit}` },
          { ikon: User, label: "Ditagihkan ke", nilai: i.penghuni.nama },
          { ikon: HardHat, label: "Teknisi", nilai: i.teknisi },
        ].map((d) => (
          <div key={d.label} className="flex items-center gap-2.5 rounded-2xl bg-white/60 px-3.5 py-3">
            <d.ikon className="size-6 shrink-0" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted">{d.label}</dt>
              <dd className="truncate font-bold">{d.nilai}</dd>
            </span>
          </div>
        ))}
      </dl>

      <RincianBiayaTabel rincian={i.rincian} total={i.total} totalLabel="Total tagihan" />

      <p className="flex items-start gap-2.5 rounded-2xl bg-lilac-50 px-4 py-3 text-[13px] text-navy-soft">
        <Info className="size-4.5 shrink-0" aria-hidden />
        <span>
          Komisi Kosmos {i.persen_komisi}% ({rupiah(i.komisi)}) sudah termasuk dan dipotong dari bagian teknisi, bukan biaya tambahan.
          {i.status === "belum_dibayar" && ` Jatuh tempo ${tanggal(i.jatuh_tempo)}.`}
        </span>
      </p>

      {i.pembayaran.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line-soft pt-5">
          <h3 className="font-bold">Riwayat pembayaran</h3>
          <ol className="flex flex-col">
            {[...i.pembayaran].reverse().map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{LABEL_METODE[p.metode]}</span>
                  <span className="text-muted"> · {waktuLengkap(p.created_at)}</span>
                  {p.alasan_gagal && <span className="block text-[13px] text-danger">{p.alasan_gagal}</span>}
                </span>
                <span className="font-mono text-xs text-muted">{p.ref_gateway}</span>
                {p.status === "berhasil" ? (
                  <Stiker varian="aktif">{p.direkonsiliasi ? "Berhasil · direkonsiliasi" : "Berhasil"}</Stiker>
                ) : p.status === "gagal" ? (
                  <Stiker varian="berakhir">Gagal</Stiker>
                ) : (
                  <Stiker varian="netral">Pending</Stiker>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
