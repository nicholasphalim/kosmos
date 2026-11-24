import { clsx } from "clsx";
import {
  CalendarCheck,
  Check,
  HardHat,
  Receipt,
  ShieldCheck,
  Wallet,
  Wrench,
  X,
  type IkonKosmos,
} from "@/components/icons";
import { AstronotAvatar } from "@/components/brand/AstronotAvatar";
import { LampiranThumb } from "@/components/tiket/LampiranThumb";
import { Stiker, type VarianStiker } from "@/components/ui/Stiker";
import type { Invoice, KandidatTeknisi, LogServis, RincianBiaya, StatusWorkOrder, TeknisiRingkas, VerifikasiBukti, WorkOrder } from "@/lib/api/types";
import { jadwal, jamSaja, LABEL_KATEGORI, LABEL_LOG, LABEL_STATUS_WO, rupiah, waktuLengkap } from "@/lib/format";

/* ---------- Badge status ---------- */

const GAYA_WO: Record<StatusWorkOrder, { varian: VarianStiker; ikon: IkonKosmos }> = {
  menunggu_jadwal: { varian: "review", ikon: CalendarCheck },
  dijadwalkan: { varian: "rendah", ikon: CalendarCheck },
  dikerjakan: { varian: "sedang", ikon: Wrench },
  menunggu_konfirmasi: { varian: "review", ikon: ShieldCheck },
  selesai: { varian: "aktif", ikon: Check },
  dibatalkan: { varian: "berakhir", ikon: X },
};

export function StatusWoStiker({ status }: { status: StatusWorkOrder }) {
  const g = GAYA_WO[status];
  return (
    <Stiker varian={g.varian} ikon={g.ikon}>
      {LABEL_STATUS_WO[status]}
    </Stiker>
  );
}

export function StatusInvoiceStiker({ status }: { status: Invoice["status"] }) {
  return status === "lunas" ? (
    <Stiker varian="aktif" ikon={Wallet}>Lunas</Stiker>
  ) : (
    <Stiker varian="sedang" ikon={Receipt}>Belum dibayar</Stiker>
  );
}

/* ---------- Teknisi ---------- */

export function TeknisiKartu({ teknisi, jarakKm, className }: { teknisi: TeknisiRingkas; jarakKm?: number; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-3.5", className)}>
      <AstronotAvatar suasana="teknisi" className="size-13 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{teknisi.nama}</span>
          {teknisi.terverifikasi ? (
            <Stiker varian="aktif" ikon={ShieldCheck}>Terverifikasi</Stiker>
          ) : (
            <Stiker varian="berakhir">Belum terverifikasi</Stiker>
          )}
        </span>
        <span className="text-[13px] text-muted">
          {teknisi.keahlian.map((k) => LABEL_KATEGORI[k]).join(", ")} · ★ {teknisi.rating.toFixed(1)}
          {jarakKm !== undefined && ` · ${jarakKm.toFixed(1).replace(".", ",")} km`}
        </span>
      </span>
    </div>
  );
}

/** Hasil Technician Matching: semua kandidat beserta alasan lolos atau tidak. */
export function DaftarKandidat({ kandidat }: { kandidat: KandidatTeknisi[] }) {
  if (kandidat.length === 0) return null;
  return (
    <details className="rounded-2xl border border-line-soft px-4.5 py-3.5">
      <summary className="cursor-pointer text-[15px] font-bold">Hasil pencocokan teknisi ({kandidat.length} kandidat)</summary>
      <ol className="mt-3 flex flex-col">
        {kandidat.map((k, i) => (
          <li key={k.teknisi.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft py-2.5 first:border-t-0">
            <span className={clsx("w-5 font-mono text-xs", k.lolos ? "text-navy" : "text-subtle")}>{k.lolos ? `#${i + 1}` : "–"}</span>
            <span className={clsx("min-w-0 flex-1 text-sm font-bold", !k.lolos && "text-muted")}>{k.teknisi.nama}</span>
            <span className="text-[13px] text-muted">{k.alasan}</span>
            {k.lolos ? (
              <span className="font-mono text-xs text-muted">skor {k.skor?.toFixed(2)}</span>
            ) : (
              <Stiker varian="berakhir" ikon={X}>Tidak lolos</Stiker>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

/* ---------- Biaya ---------- */

export function RincianBiayaTabel({ rincian, totalLabel = "Total", total }: { rincian: RincianBiaya[]; totalLabel?: string; total: number }) {
  return (
    <dl className="flex flex-col">
      {rincian.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-2 text-[15px]">
          <dt className="text-navy-soft">{r.label}</dt>
          <dd className="font-mono font-semibold whitespace-nowrap">{rupiah(r.jumlah)}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 pt-3">
        <dt className="font-bold">{totalLabel}</dt>
        <dd className="font-display text-2xl font-extrabold tracking-tight whitespace-nowrap">{rupiah(total)}</dd>
      </div>
    </dl>
  );
}

/* ---------- Progres ---------- */

type Tahap = "done" | "now" | "todo";

const LANGKAH_WO: Array<{ label: string; icon: IkonKosmos }> = [
  { label: "Ditugaskan", icon: HardHat },
  { label: "Dijadwalkan", icon: CalendarCheck },
  { label: "Dikerjakan", icon: Wrench },
  { label: "Bukti valid", icon: ShieldCheck },
  { label: "Selesai", icon: Check },
];

const POSISI_WO: Record<StatusWorkOrder, number> = {
  menunggu_jadwal: 1,
  dijadwalkan: 2,
  dikerjakan: 2,
  menunggu_konfirmasi: 4,
  selesai: 5,
  dibatalkan: -1,
};

/** Stepper Repair Verification, satu gaya dengan StatusStepper tiket. */
export function WoStepper({ wo }: { wo: WorkOrder }) {
  const posisi = POSISI_WO[wo.status];
  const waktuLog = (a: LogServis["aktivitas"]) => wo.log.findLast((l) => l.aktivitas === a)?.waktu;
  const catatan = [
    jamSaja(wo.created_at),
    wo.jadwal_kunjungan ? jadwal(wo.jadwal_kunjungan) : "Menunggu penghuni",
    waktuLog("tiba") ? `Tiba ${jamSaja(waktuLog("tiba")!)}` : "",
    waktuLog("bukti_valid") ? jamSaja(waktuLog("bukti_valid")!) : "",
    wo.status === "menunggu_konfirmasi" ? "Menunggu penghuni" : waktuLog("selesai") ? jamSaja(waktuLog("selesai")!) : "",
  ];
  return (
    <ol className="grid grid-cols-[1fr_1fr_1fr_1fr_auto]">
      {LANGKAH_WO.map((l, i) => {
        const tahap: Tahap = i < posisi ? "done" : i === posisi ? "now" : "todo";
        const Icon = l.icon;
        return (
          <li key={l.label} aria-current={tahap === "now" ? "step" : undefined} className="flex flex-col gap-2">
            <span className="flex items-center">
              <span
                aria-hidden
                className={clsx(
                  "flex size-10 shrink-0 items-center justify-center rounded-full border-2 sm:size-11",
                  tahap === "done" && "border-navy bg-navy",
                  tahap === "now" && "border-navy bg-lavender",
                  tahap === "todo" && "border-line bg-white opacity-70",
                )}
              >
                <Icon className="size-5" />
              </span>
              {i < LANGKAH_WO.length - 1 && (
                <span aria-hidden className={clsx("mx-1 h-[3px] flex-1 rounded-full", tahap === "done" ? "bg-navy" : "bg-line")} />
              )}
            </span>
            <span className={clsx("text-[13px] font-bold sm:text-sm", tahap === "todo" ? "text-muted" : "text-navy")}>{l.label}</span>
            <span className="-mt-1.5 min-h-5 pr-1 text-xs text-muted">{tahap === "todo" && i !== 1 ? "" : catatan[i]}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Get Progress Servis: log waktu dan status servis. */
export function LogServisTimeline({ log }: { log: LogServis[] }) {
  const urut = [...log].reverse();
  return (
    <ol className="flex flex-col">
      {urut.map((l, i) => (
        <li key={`${l.waktu}-${i}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-3">
          <span className="flex flex-col items-center pt-1.5">
            <span
              aria-hidden
              className={clsx(
                "size-3 shrink-0 rounded-full border-2",
                l.aktivitas === "bukti_ditolak" || l.aktivitas === "belum_beres" || l.aktivitas === "dibatalkan"
                  ? "border-danger-dot bg-danger-bg"
                  : i === 0
                    ? "border-navy bg-lavender"
                    : "border-navy bg-navy",
              )}
            />
            {i < urut.length - 1 && <span aria-hidden className="w-0.5 flex-1 bg-line" />}
          </span>
          <span className="flex flex-col gap-0.5 pb-4">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-bold">{LABEL_LOG[l.aktivitas]}</span>
              <span className="text-xs text-muted">
                {waktuLengkap(l.waktu)} · {l.oleh}
              </span>
            </span>
            {l.catatan && <span className="text-sm text-navy-soft">{l.catatan}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Bukti ---------- */

export function HasilVerifikasi({ verifikasi }: { verifikasi: VerifikasiBukti }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {verifikasi.pemeriksaan.map((p) => (
        <li key={p.label} className="flex items-center gap-2.5 text-sm">
          <span
            aria-label={p.ok ? "lolos" : "gagal"}
            className={clsx("flex size-5.5 shrink-0 items-center justify-center rounded-full", p.ok ? "bg-ok-bg" : "bg-danger-bg")}
          >
            {p.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          </span>
          <span className={p.ok ? "text-navy-soft" : "font-semibold text-danger"}>{p.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function BuktiPerbaikan({ wo }: { wo: WorkOrder }) {
  if (!wo.bukti_sebelum && !wo.bukti_sesudah) return null;
  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex gap-3">
        {[
          { label: "Sebelum", foto: wo.bukti_sebelum },
          { label: "Sesudah", foto: wo.bukti_sesudah },
        ].map(
          (b) =>
            b.foto && (
              <figure key={b.label} className="flex flex-col items-center gap-1.5">
                <LampiranThumb lampiran={b.foto} />
                <figcaption className="text-xs font-semibold text-muted">{b.label}</figcaption>
              </figure>
            ),
        )}
      </div>
      {wo.verifikasi && (
        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <span className="text-sm font-bold">
            Evidence Verification · {wo.verifikasi.valid ? "valid" : "ditolak"}
          </span>
          <HasilVerifikasi verifikasi={wo.verifikasi} />
        </div>
      )}
    </div>
  );
}

/** Judul kecil di dalam panel. */
export function SubJudul({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-xl font-extrabold tracking-tight">{children}</h3>;
}
