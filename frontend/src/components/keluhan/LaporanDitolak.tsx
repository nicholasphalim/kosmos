import { ArrowLeft, CalendarX, House } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { ServiceTrace } from "@/components/tiket/ServiceTrace";
import type { KeluhanResponse, UnitRingkas } from "@/lib/api/types";
import { tanggal } from "@/lib/format";
import { Stiker } from "@/components/ui/Stiker";

/** Hasil cabang BPMN "Sewa aktif? Tidak": keluhan ditolak, tidak ada tiket. */
export function LaporanDitolak({
  hasil,
  unit,
  onKembali,
}: {
  hasil: KeluhanResponse;
  unit: UnitRingkas | undefined;
  onKembali: () => void;
}) {
  return (
    <main className="page-rise mx-auto flex max-w-[680px] flex-col gap-6 px-3 pt-10 pb-18 sm:px-6">
      <section className="flex flex-col items-center gap-5 panel p-8 text-center sm:p-10">
        <span aria-hidden className="flex size-24 items-center justify-center rounded-[32px] bg-danger-bg text-danger">
          <CalendarX className="size-11" strokeWidth={1.9} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="display text-[clamp(2.25rem,5vw,3.25rem)]">Sewa kamu sudah berakhir</h1>
          <p className="text-[17px] text-muted">Laporan hanya bisa dikirim selama sewa aktif. Tidak ada tiket yang dibuat.</p>
        </div>

        <div className="flex items-center gap-3.5 self-stretch rounded-[18px] bg-lilac-50 px-4.5 py-4 text-left">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-navy text-lavender">
            <House className="size-5" />
          </span>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{unit ? `${unit.nama_properti} · ${unit.nomor_unit}` : "Unit kamu"}</span>
            {hasil.sewa && <span className="text-sm text-muted">Berakhir {tanggal(hasil.sewa.tanggal_selesai)}</span>}
          </span>
          <Stiker varian="berakhir">Tidak aktif</Stiker>
        </div>

        <span className="font-mono text-xs text-muted">Keluhan {hasil.keluhan.kode} dicatat sebagai ditolak</span>

        <div className="flex flex-wrap gap-3 self-stretch">
          <Button variant="outline" size="lg" className="flex-[1_1_200px]" onClick={onKembali} icon={<ArrowLeft className="size-4.5" aria-hidden />}>
            Kembali
          </Button>
        </div>
      </section>
      <ServiceTrace steps={hasil.trace} />
    </main>
  );
}
