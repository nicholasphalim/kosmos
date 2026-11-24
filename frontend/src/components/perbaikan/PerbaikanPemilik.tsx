"use client";

import { clsx } from "clsx";
import { Check, CheckCheck, HardHat, Receipt, RotateCcw, Search, Sparkles, Wallet, Wrench, X } from "@/components/icons";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import {
  useBuatEstimasi,
  useEstimasiTiket,
  useInvoice,
  usePenerimaanPemilik,
  usePersetujuanBiaya,
  usePersetujuanBiayaTambahan,
  useUbahStatusTiket,
  useWorkOrderTiket,
} from "@/lib/api/hooks";
import type { EstimasiBiaya, TiketDetail, WorkOrder } from "@/lib/api/types";
import { jadwal, rupiah, tanggal, waktuLengkap } from "@/lib/format";
import {
  BuktiPerbaikan,
  DaftarBiayaTambahan,
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
        Kalau disetujui, biaya ini ditagihkan ke kamu setelah kamu menerima hasil perbaikan. Biaya tambahan dari teknisi harus kamu setujui dulu. Kalau ditolak,
        tiket tetap terbuka dan kamu bisa mencari teknisi lain. Estimasi dibuat {waktuLengkap(estimasi.created_at)} dan juga dikirim ke WhatsApp kamu.
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

/** Pemilik memutuskan biaya tambahan yang diajukan teknisi. */
function AksiBiayaTambahan({ wo, idTambahan }: { wo: WorkOrder; idTambahan: number }) {
  const putuskan = usePersetujuanBiayaTambahan();
  const sedang = putuskan.isPending ? (putuskan.variables.disetujui ? "setuju" : "tolak") : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={sedang === "setuju"}
          disabled={sedang !== null}
          icon={<Check className="size-4" aria-hidden />}
          onClick={() => putuskan.mutate({ idWo: wo.id, idTambahan, disetujui: true })}
        >
          Setujui tambahan
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={sedang === "tolak"}
          disabled={sedang !== null}
          icon={<X className="size-4" aria-hidden />}
          onClick={() => putuskan.mutate({ idWo: wo.id, idTambahan, disetujui: false })}
        >
          Tolak tambahan
        </Button>
      </div>
      {putuskan.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {putuskan.error.message}
        </p>
      )}
    </div>
  );
}

/**
 * Pemilik menerima hasil (invoice terbit) atau meminta perbaikan ulang.
 * Dari menunggu_konfirmasi berarti penghuni belum merespons; pemilik boleh memutuskan sendiri.
 */
function TerimaHasil({ wo }: { wo: WorkOrder }) {
  const terima = usePenerimaanPemilik();
  const [ulang, setUlang] = useState(false);
  const [catatan, setCatatan] = useState("");
  const tanpaPenghuni = wo.status === "menunggu_konfirmasi";
  const tambahanMenunggu = wo.biaya_tambahan.some((b) => b.status === "menunggu");
  const sedang = terima.isPending ? (terima.variables.diterima ? "terima" : "ulang") : null;

  return (
    <div className="flex flex-col gap-4 rounded-[22px] bg-lavender/60 p-5">
      <span className="flex flex-col gap-1">
        <span className="font-display text-lg font-extrabold tracking-tight">
          {tanpaPenghuni ? "Penghuni belum mengonfirmasi" : `${wo.penghuni.nama} sudah mengonfirmasi beres`}
        </span>
        <span className="text-sm text-navy-soft">
          {tanpaPenghuni
            ? "Bukti sudah terverifikasi. Kalau penghuni tidak merespons, kamu bisa memeriksa hasilnya sendiri lalu menerimanya."
            : "Cek foto bukti di atas. Tagihan baru terbit ke kamu setelah kamu menerima hasilnya."}
        </span>
      </span>
      {tambahanMenunggu && (
        <p role="status" className="text-sm font-semibold text-warn">
          Putuskan dulu biaya tambahan dari teknisi sebelum menerima hasil.
        </p>
      )}
      {ulang ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            terima.mutate({ idWo: wo.id, diterima: false, catatan: catatan.trim() || undefined });
          }}
        >
          <label htmlFor="catatan-ulang" className="text-sm font-bold">
            Apa yang perlu diperbaiki lagi?
          </label>
          <textarea
            id="catatan-ulang"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            maxLength={300}
            rows={2}
            className="w-full resize-none rounded-2xl border border-line-strong bg-white px-3.5 py-2.5 text-sm focus:border-violet-400 focus:shadow-[0_0_0_4px_#8a6ff029] focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={sedang === "ulang"} disabled={sedang !== null} icon={<RotateCcw className="size-4" aria-hidden />}>
              Kirim ke teknisi
            </Button>
            <Button variant="ghost" disabled={sedang !== null} onClick={() => setUlang(false)}>
              Batal
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            className="flex-[1_1_220px]"
            loading={sedang === "terima"}
            disabled={sedang !== null || tambahanMenunggu}
            icon={<Check className="size-4.5" aria-hidden />}
            onClick={() => terima.mutate({ idWo: wo.id, diterima: true })}
          >
            Terima hasil · tagih {rupiah(wo.biaya_final)}
          </Button>
          <Button size="lg" variant="outline" className="flex-[0_1_200px]" disabled={sedang !== null} onClick={() => setUlang(true)}>
            Minta perbaikan ulang
          </Button>
        </div>
      )}
      {terima.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {terima.error.message}
        </p>
      )}
    </div>
  );
}

function ProgresWorkOrder({ wo }: { wo: WorkOrder }) {
  const inv = useInvoice(wo.id_invoice ?? Number.NaN);
  const bisaTerima = wo.status === "menunggu_pemilik" || wo.status === "menunggu_konfirmasi";
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
            <dt className="text-muted">Biaya final</dt>
            <dd className="font-bold">{rupiah(wo.biaya_final)}</dd>
          </div>
        </dl>
      </div>
      <DaftarBiayaTambahan wo={wo} aksi={(b) => <AksiBiayaTambahan wo={wo} idTambahan={b.id} />} />
      <BuktiPerbaikan wo={wo} />
      {bisaTerima && <TerimaHasil wo={wo} />}
      {inv.data && (
        <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-line-soft p-4">
          <Receipt className="size-9" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-bold">
              {inv.data.jenis === "kunjungan" ? "Biaya kunjungan" : "Invoice"} <span className="font-mono">{inv.data.kode}</span> · {rupiah(inv.data.total)}
            </span>
            <span className="text-[13px] text-muted">
              {inv.data.status === "lunas" && inv.data.dibayar_at
                ? `Dibayar ${waktuLengkap(inv.data.dibayar_at)}`
                : `Ditagihkan ke kamu · jatuh tempo ${tanggal(inv.data.jatuh_tempo)}`}
            </span>
          </span>
          {inv.data.status === "lunas" ? (
            <StatusInvoiceStiker status="lunas" />
          ) : (
            <>
              {inv.data.terlambat && <StatusInvoiceStiker status="belum_dibayar" terlambat />}
              <ButtonLink href={`/pemilik/tagihan/${inv.data.id}`} icon={<Wallet className="size-4.5" aria-hidden />}>
                Bayar tagihan
              </ButtonLink>
            </>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3">
        <h4 className="font-bold">Log servis</h4>
        <LogServisTimeline log={wo.log} />
      </div>
    </div>
  );
}

/** Pemilik menilai tiket dulu: panggil teknisi (berbayar) atau tutup tanpa teknisi. */
function PutuskanTiket({ tiket, estimasiDitolak, onPanggil }: { tiket: TiketDetail; estimasiDitolak: EstimasiBiaya | null; onPanggil: () => void }) {
  const tutup = useUbahStatusTiket();
  const [tanpaTeknisi, setTanpaTeknisi] = useState(false);
  const [catatan, setCatatan] = useState("");
  const dibukaUlang = tiket.riwayat.findLast((r) => r.dari === "selesai" && r.ke === "diklasifikasi");

  return (
    <div className="flex flex-col gap-4">
      {dibukaUlang && (
        <p role="status" className="rounded-2xl bg-warn-bg px-4 py-3 text-sm font-semibold text-warn">
          Dibuka ulang oleh {dibukaUlang.oleh}
          {dibukaUlang.catatan ? `: “${dibukaUlang.catatan}”` : "."}
        </p>
      )}
      {estimasiDitolak && (
        <p role="status" className="rounded-2xl bg-lilac-50 px-4 py-3 text-sm text-navy-soft">
          Estimasi {rupiah(estimasiDitolak.total)} dari {estimasiDitolak.teknisi.nama} kamu tolak. Kamu bisa mencari teknisi lain atau menanganinya sendiri.
        </p>
      )}
      <p className="text-[15px] leading-relaxed text-navy-soft">
        Cek dulu laporan {tiket.penghuni.nama}. Kalau bisa kamu tangani sendiri, tutup tiketnya tanpa teknisi. Kalau perlu tukang, panggil teknisi dan
        biayanya ditagihkan ke kamu.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[22px] bg-white/70 p-4.5">
          <span className="flex items-center gap-2 font-bold">
            <HardHat className="size-6" aria-hidden />
            Perlu teknisi
          </span>
          <p className="flex-1 text-[13px] text-muted">
            Kosmos mencarikan teknisi <b>terverifikasi</b> terdekat dengan unit {tiket.unit.nomor_unit} dan menghitung estimasi biaya. Tagihan baru terbit
            kalau kamu menyetujui estimasinya.
          </p>
          <Button icon={<Search className="size-4.5" aria-hidden />} disabled={tutup.isPending} onClick={onPanggil}>
            {estimasiDitolak ? "Cari teknisi lain" : "Panggil teknisi"}
          </Button>
        </div>
        <div className="flex flex-col gap-3 rounded-[22px] bg-white/70 p-4.5">
          <span className="flex items-center gap-2 font-bold">
            <Wrench className="size-6" aria-hidden />
            Tidak perlu teknisi
          </span>
          {tanpaTeknisi ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                tutup.mutate({ idTiket: tiket.id, status: "selesai", catatan: catatan.trim() || undefined });
              }}
            >
              <label htmlFor="catatan-tutup" className="text-[13px] font-bold">
                Catatan untuk penghuni (opsional)
              </label>
              <textarea
                id="catatan-tutup"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Contoh: engselnya sudah saya kencangkan"
                className="w-full resize-none rounded-2xl border border-line-strong bg-white px-3.5 py-2.5 text-sm focus:border-violet-400 focus:shadow-[0_0_0_4px_#8a6ff029] focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline" loading={tutup.isPending} icon={<Check className="size-4" aria-hidden />}>
                  Tandai sudah ditangani
                </Button>
                <Button variant="ghost" disabled={tutup.isPending} onClick={() => setTanpaTeknisi(false)}>
                  Batal
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="flex-1 text-[13px] text-muted">
                Kamu tangani sendiri, atau masalahnya memang tidak perlu diperbaiki. Tiket selesai tanpa biaya; penghuni masih bisa membuka ulang dalam 7 hari.
              </p>
              <Button variant="outline" onClick={() => setTanpaTeknisi(true)}>
                Tangani sendiri
              </Button>
            </>
          )}
          {tutup.error && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {tutup.error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sisi pemilik proses Repair Verification:
 * tinjau tiket -> tutup tanpa teknisi, atau cari teknisi + estimasi (HMR) -> setujui/tolak
 * -> pantau work order -> bayar invoice yang ditagihkan ke pemilik.
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
        // Menolak tidak membatalkan tiket: pemilik kembali ke pilihan cari teknisi lain / tangani sendiri.
        onPutuskan={(setuju) => putuskan.mutate({ idEstimasi: menunggu.id, disetujui: setuju })}
      />
    );
  } else if (tiket.status === "diklasifikasi") {
    const ditolak = est?.status === "ditolak" && est.diputuskan_oleh ? est : null;
    isi = cari.isPending ? <ProsesCari /> : <PutuskanTiket tiket={tiket} estimasiDitolak={ditolak} onPanggil={() => cari.mutate(tiket.id)} />;
  } else if (tiket.status === "dibuat") {
    isi = <p className="text-[15px] text-navy-soft">Tiket belum diklasifikasi. Jalankan klasifikasi ulang dari dashboard sebelum mencari teknisi.</p>;
  } else if (tiket.status === "selesai") {
    isi = (
      <div className="flex flex-col gap-3 rounded-[22px] bg-ok-bg px-4.5 py-4 text-ok">
        <p className="flex items-center gap-3 text-[15px] font-semibold">
          <CheckCheck className="size-6 shrink-0" aria-hidden />
          Kamu menangani tiket ini tanpa teknisi. Tidak ada tagihan.
        </p>
        {tiket.catatan_penanganan && <p className="text-sm text-navy-soft">Catatanmu: “{tiket.catatan_penanganan}”</p>}
        {tiket.bisa_dibuka_ulang && <p className="text-[13px] text-navy-soft">Penghuni masih bisa membuka ulang tiket ini bila masalahnya belum beres.</p>}
      </div>
    );
  } else {
    isi = (
      <p className="text-[15px] text-navy-soft">
Tiket ini tidak dalam proses perbaikan.
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
