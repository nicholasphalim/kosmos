"use client";

import { clsx } from "clsx";
import { Check, HardHat, Receipt, Search, Sparkles, X } from "@/components/icons";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useBuatEstimasi, useEstimasiTiket, useInvoice, usePersetujuanBiaya, useWorkOrderTiket } from "@/lib/api/hooks";
import type { EstimasiBiaya, TiketDetail, WorkOrder } from "@/lib/api/types";
import { jadwal, rupiah, waktuLengkap } from "@/lib/format";
import {
  BuktiPerbaikan,
  DaftarKandidat,
  LogServisTimeline,
  RincianBiayaTabel,
  StatusInvoiceStiker,
  StatusWoStiker,
  SubJudul,
  TeknisiKartu,
  WoStepper,
} from "./Bagian";

const LANGKAH_CARI = ["Membaca kategori dan urgensi tiket", "Memeriksa verifikasi dan ketersediaan teknisi", "Mencocokkan teknisi terdekat", "Menghitung estimasi biaya"];

/** Animasi langkah selama orkestrasi HMR berjalan (± 1 detik di mode mock). */
function ProsesCari() {
  const [langkah, setLangkah] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLangkah((l) => Math.min(l + 1, LANGKAH_CARI.length - 1)), 260);
    return () => clearInterval(id);
  }, []);
  return (
    <ol role="status" aria-live="polite" className="flex flex-col gap-2.5">
      {LANGKAH_CARI.map((l, i) => (
        <li key={l} className={clsx("flex items-center gap-2.5 text-sm transition-opacity duration-300", i > langkah && "opacity-40")}>
          <span className={clsx("flex size-6 items-center justify-center rounded-full", i < langkah ? "bg-ok-bg" : "bg-lilac-100")}>
            {i < langkah ? <Check className="size-3.5" /> : <Sparkles className={clsx("size-3.5", i === langkah && "animate-pulse")} />}
          </span>
          <span className={i === langkah ? "font-bold" : "text-navy-soft"}>{l}</span>
        </li>
      ))}
    </ol>
  );
}

function KartuEstimasi({ estimasi, onPutuskan, sedang }: { estimasi: EstimasiBiaya; onPutuskan: (setuju: boolean) => void; sedang: "setuju" | "tolak" | null }) {
  const terpilih = estimasi.kandidat.find((k) => k.teknisi.id === estimasi.teknisi.id);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-[22px] bg-white/70 p-4.5">
        <span className="eyebrow text-muted">Teknisi terpilih</span>
        <TeknisiKartu teknisi={estimasi.teknisi} jarakKm={terpilih?.jarak_km} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="eyebrow text-muted">Estimasi biaya</span>
        <RincianBiayaTabel rincian={estimasi.rincian} total={estimasi.total} totalLabel="Total estimasi" />
      </div>
      <DaftarKandidat kandidat={estimasi.kandidat} />
      <p className="text-[13px] text-muted">
        Biaya dibayar penghuni setelah perbaikan dikonfirmasi selesai. Estimasi dibuat {waktuLengkap(estimasi.created_at)} dan juga dikirim ke WhatsApp kamu.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" className="flex-[1_1_220px]" loading={sedang === "setuju"} disabled={sedang !== null} icon={<Check className="size-4.5" aria-hidden />} onClick={() => onPutuskan(true)}>
          Setujui {rupiah(estimasi.total)}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-[0_1_160px] hover:border-danger-dot/50 hover:bg-danger-bg hover:text-danger"
          loading={sedang === "tolak"}
          disabled={sedang !== null}
          icon={<X className="size-4.5" aria-hidden />}
          onClick={() => onPutuskan(false)}
        >
          Tolak
        </Button>
      </div>
    </div>
  );
}

function ProgresWorkOrder({ wo }: { wo: WorkOrder }) {
  const inv = useInvoice(wo.id_invoice ?? Number.NaN);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-sm text-muted">{wo.kode}</span>
        <StatusWoStiker status={wo.status} />
      </div>
      {wo.status !== "dibatalkan" && <WoStepper wo={wo} />}
      <div className="flex flex-col gap-3 rounded-[22px] bg-white/70 p-4.5">
        <TeknisiKartu teknisi={wo.teknisi} />
        <dl className="grid grid-cols-2 gap-3 border-t border-line-soft pt-3 text-sm">
          <div>
            <dt className="text-muted">Jadwal kunjungan</dt>
            <dd className="font-bold">{wo.jadwal_kunjungan ? jadwal(wo.jadwal_kunjungan) : "Menunggu penghuni"}</dd>
          </div>
          <div>
            <dt className="text-muted">Biaya disetujui</dt>
            <dd className="font-bold">{rupiah(wo.biaya_final)}</dd>
          </div>
        </dl>
      </div>
      <BuktiPerbaikan wo={wo} />
      {inv.data && (
        <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-line-soft p-4">
          <Receipt className="size-9" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-bold">
              Invoice <span className="font-mono">{inv.data.kode}</span> · {rupiah(inv.data.total)}
            </span>
            <span className="text-[13px] text-muted">
              {inv.data.status === "lunas" && inv.data.dibayar_at ? `Dibayar ${waktuLengkap(inv.data.dibayar_at)}` : `Ditagihkan ke ${inv.data.penghuni.nama}`}
            </span>
          </span>
          <StatusInvoiceStiker status={inv.data.status} />
        </div>
      )}
      <div className="flex flex-col gap-3">
        <h4 className="font-bold">Log servis</h4>
        <LogServisTimeline log={wo.log} />
      </div>
    </div>
  );
}

/**
 * Sisi pemilik proses Repair Verification:
 * estimasi dibuat otomatis oleh HMR setelah klasifikasi -> setujui/tolak -> pantau work order sampai invoice.
 * Tombol "Cari ulang teknisi" hanya muncul bila saat itu belum ada teknisi yang cocok.
 */
export function PerbaikanPemilik({ tiket }: { tiket: TiketDetail }) {
  const estimasi = useEstimasiTiket(tiket.id);
  const wo = useWorkOrderTiket(tiket.id);
  const cari = useBuatEstimasi();
  const putuskan = usePersetujuanBiaya();
  const gagal = cari.error ?? putuskan.error;

  const est = estimasi.data;
  const menunggu = est?.status === "menunggu" ? est : null;
  const sedang = putuskan.isPending ? (putuskan.variables.disetujui ? "setuju" : "tolak") : null;

  let isi: React.ReactNode;
  if (estimasi.isPending || wo.isPending) {
    isi = <Skeleton className="h-60" />;
  } else if (estimasi.isError) {
    isi = <ErrorState pesan={estimasi.error.message} onRetry={() => estimasi.refetch()} />;
  } else if (wo.data) {
    isi = <ProgresWorkOrder wo={wo.data} />;
  } else if (menunggu) {
    isi = (
      <KartuEstimasi
        estimasi={menunggu}
        sedang={sedang}
        onPutuskan={(setuju) => {
          if (!setuju && !window.confirm(`Tolak estimasi ${rupiah(menunggu.total)}? Perbaikan dibatalkan dan penghuni dikabari.`)) return;
          putuskan.mutate({ idEstimasi: menunggu.id, disetujui: setuju });
        }}
      />
    );
  } else if (tiket.status === "diklasifikasi") {
    isi = cari.isPending ? (
      <ProsesCari />
    ) : (
      <div className="flex flex-col items-start gap-4">
        <p className="text-[15px] leading-relaxed text-navy-soft">
          Saat tiket diklasifikasi, belum ada teknisi <b>terverifikasi</b> yang tersedia untuk unit {tiket.unit.nomor_unit}. Kosmos bisa mencari lagi dan menghitung estimasi biaya untuk kamu setujui.
        </p>
        <Button size="lg" icon={<Search className="size-4.5" aria-hidden />} onClick={() => cari.mutate(tiket.id)}>
          Cari ulang teknisi
        </Button>
      </div>
    );
  } else if (tiket.status === "dibuat") {
    isi = <p className="text-[15px] text-navy-soft">Tiket belum diklasifikasi. Jalankan klasifikasi ulang dari dashboard sebelum mencari teknisi.</p>;
  } else {
    isi = (
      <p className="text-[15px] text-navy-soft">
        {est?.status === "ditolak" ? `Estimasi ${rupiah(est.total)} ditolak oleh ${est.diputuskan_oleh}. ` : ""}Tiket ini tidak dalam proses perbaikan.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="perbaikan-judul" className="panel flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-lilac-100">
            <HardHat className="size-8" />
          </span>
          <SubJudul>
            <span id="perbaikan-judul">Perbaikan</span>
          </SubJudul>
        </div>
        {gagal && (
          <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
            {gagal.message}
          </p>
        )}
        {isi}
      </section>
      {wo.data?.status === "selesai" && wo.data.id_invoice && (
        <ButtonLink href="/pemilik/keuangan" variant="outline" icon={<Receipt className="size-4.5" aria-hidden />}>
          Lihat laporan kas
        </ButtonLink>
      )}
    </div>
  );
}
