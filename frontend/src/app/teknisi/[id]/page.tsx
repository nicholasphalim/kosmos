"use client";

import { ArrowLeft, Building, Receipt, User } from "@/components/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AksiTeknisi } from "@/components/perbaikan/AksiTeknisi";
import { BuktiPerbaikan, LogServisTimeline, StatusWoStiker, SubJudul, WoStepper } from "@/components/perbaikan/Bagian";
import { KategoriTile, PrioritasBadge } from "@/components/tiket/Badges";
import { LampiranThumb } from "@/components/tiket/LampiranThumb";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { ApiError } from "@/lib/api/client";
import { useTiketDetail, useWorkOrder } from "@/lib/api/hooks";
import { prioritasTiket, rupiah } from "@/lib/format";

/** Layanan Verifikasi Perbaikan (consumer: Teknisi, provider: Task CSM). */
export default function TeknisiWorkOrderPage() {
  const { id } = useParams<{ id: string }>();
  const idWo = Number(id);
  const wo = useWorkOrder(idWo);
  const tiket = useTiketDetail(wo.data?.id_tiket ?? Number.NaN);
  const w = wo.data;

  return (
    <main className="page-rise mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pt-8 pb-16 sm:px-6">
      <div className="flex flex-col gap-3">
        <Link href="/teknisi" className="flex items-center gap-2 self-start text-sm font-semibold text-hero-sub no-underline hover:text-white">
          <ArrowLeft className="size-4" aria-hidden />
          Semua pekerjaan
        </Link>
        <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">{w ? w.kode : "Pekerjaan"}</h1>
      </div>

      {wo.isPending && <Skeleton className="h-[520px] rounded-3xl" />}
      {wo.isError && (
        <ErrorState
          pesan={wo.error instanceof ApiError && wo.error.status === 404 ? "Pekerjaan tidak ditemukan." : wo.error.message}
          onRetry={() => wo.refetch()}
        />
      )}

      {w && (
        <div className="flex flex-wrap items-start gap-6">
          <section aria-labelledby="wo-judul" className="panel flex min-w-0 flex-[1_1_440px] flex-col gap-6 p-6 sm:p-8">
            <div className="flex items-center gap-4.5">
              <KategoriTile kategori={w.kategori} size="lg" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h2 id="wo-judul" className="font-display text-[26px] leading-tight font-extrabold tracking-tight">
                  {w.judul}
                </h2>
                <span className="flex flex-wrap items-center gap-2">
                  <PrioritasBadge prioritas={prioritasTiket({ urgensi: w.urgensi, perlu_review: false })} />
                  <StatusWoStiker status={w.status} />
                </span>
              </div>
            </div>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 text-sm">
              {[
                { ikon: Building, label: "Lokasi", nilai: `${w.unit.nama_properti} · ${w.unit.nomor_unit}` },
                { ikon: User, label: "Penghuni", nilai: w.penghuni.nama },
                { ikon: Receipt, label: "Biaya disetujui", nilai: rupiah(w.biaya_final) },
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
            {tiket.data && (
              <div className="flex flex-col gap-3">
                <p className="rounded-2xl border border-line-soft px-4.5 py-3.5 text-[15px] leading-relaxed text-navy-soft">“{tiket.data.keluhan.deskripsi}”</p>
                {tiket.data.keluhan.lampiran.length > 0 && (
                  <div className="flex flex-wrap gap-2.5">
                    {tiket.data.keluhan.lampiran.map((l) => (
                      <LampiranThumb key={l.id} lampiran={l} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {w.status !== "dibatalkan" && <WoStepper wo={w} />}
            <BuktiPerbaikan wo={w} />
            <div className="flex flex-col gap-3 border-t border-line-soft pt-6">
              <h3 className="font-bold">Log servis</h3>
              <LogServisTimeline log={w.log} />
            </div>
          </section>

          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
            <section aria-label="Aksi teknisi" className="panel flex flex-col gap-5 p-6 sm:p-8">
              <SubJudul>Langkah berikutnya</SubJudul>
              <AksiTeknisi wo={w} />
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
