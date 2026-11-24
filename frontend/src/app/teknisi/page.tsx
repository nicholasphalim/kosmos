"use client";

import { Building, CalendarCheck, ChevronRight, User } from "@/components/icons";
import Link from "next/link";
import { StatusWoStiker } from "@/components/perbaikan/Bagian";
import { KategoriTile } from "@/components/tiket/Badges";
import { KosmosScene } from "@/components/three/KosmosScene";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useWorkOrderList } from "@/lib/api/hooks";
import type { WorkOrder } from "@/lib/api/types";
import { jadwal, rupiah } from "@/lib/format";
import { useSession } from "@/lib/session";

const AKTIF: WorkOrder["status"][] = ["menunggu_jadwal", "dijadwalkan", "dikerjakan", "menunggu_konfirmasi", "menunggu_pemilik"];

function Daftar({ judul, items }: { judul: string; items: WorkOrder[] }) {
  return (
    <section aria-label={judul} className="panel overflow-hidden">
      <h2 className="px-6 pt-5 font-display text-xl font-extrabold tracking-tight">{judul}</h2>
      {items.length === 0 ? (
        <EmptyState judul="Tidak ada pekerjaan" />
      ) : (
        <ul className="px-2 pt-2 pb-2">
          {items.map((w) => (
            <li key={w.id} className="border-t border-line-soft first:border-t-0">
              <Link href={`/teknisi/${w.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] px-4 py-4 text-navy no-underline hover:bg-lilac-50">
                <KategoriTile kategori={w.kategori} />
                <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{w.judul}</span>
                    <StatusWoStiker status={w.status} />
                  </span>
                  <span className="flex flex-wrap items-center gap-3.5 text-[13px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Building className="size-3.5" aria-hidden />
                      {w.unit.nama_properti} · {w.unit.nomor_unit}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User className="size-3.5" aria-hidden />
                      {w.penghuni.nama}
                    </span>
                    {w.jadwal_kunjungan && (
                      <span className="flex items-center gap-1.5">
                        <CalendarCheck className="size-3.5" aria-hidden />
                        {jadwal(w.jadwal_kunjungan)}
                      </span>
                    )}
                    <span className="font-mono text-xs">{w.kode}</span>
                  </span>
                </span>
                <span className="font-display font-extrabold">{rupiah(w.biaya_final)}</span>
                <ChevronRight className="size-4.5 text-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Beranda teknisi: work order yang ditugaskan (Get Work Order). */
export default function TeknisiPage() {
  const pengguna = useSession()!.pengguna;
  const wo = useWorkOrderList();
  const semua = wo.data ?? [];
  const aktif = semua.filter((w) => AKTIF.includes(w.status));
  const riwayat = semua.filter((w) => !AKTIF.includes(w.status));

  return (
    <div className="page-rise mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pt-5 pb-16 sm:px-6">
      <section className="night flex flex-col gap-10 rounded-[36px] p-7 sm:p-10 lg:p-12">
        <KosmosScene variant="tukang" className="absolute inset-y-0 right-0 hidden w-[44%] [mask-image:linear-gradient(90deg,transparent,#000_14%)] lg:block" />
        <div className="relative flex max-w-[720px] flex-col gap-4">
          <h1 className="display text-[clamp(2.75rem,6vw,5rem)]">Halo, {pengguna.nama}</h1>
          <p className="text-lg text-hero-sub">{wo.data ? `${aktif.length} pekerjaan aktif` : "Memuat pekerjaan…"}</p>
        </div>
        <dl className="relative grid w-full max-w-[640px] grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Perlu dikerjakan", nilai: semua.filter((w) => w.status === "dijadwalkan" || w.status === "dikerjakan").length },
            { label: "Menunggu penghuni/pemilik", nilai: semua.filter((w) => ["menunggu_jadwal", "menunggu_konfirmasi", "menunggu_pemilik"].includes(w.status)).length },
            { label: "Selesai", nilai: semua.filter((w) => w.status === "selesai").length },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-1 rounded-[20px] border border-white/15 bg-white/10 p-3.5 backdrop-blur sm:p-4">
              <dt className="text-xs font-semibold text-hero-sub sm:text-[13px]">{s.label}</dt>
              <dd className="display text-[clamp(1.75rem,4vw,2.5rem)]">{wo.data ? s.nilai : "–"}</dd>
            </div>
          ))}
        </dl>
      </section>

      {wo.isPending && <Skeleton className="h-60 rounded-3xl" />}
      {wo.isError && <ErrorState pesan={wo.error.message} onRetry={() => wo.refetch()} />}
      {wo.data && (
        <>
          <Daftar judul="Pekerjaan aktif" items={aktif} />
          {riwayat.length > 0 && <Daftar judul="Riwayat" items={riwayat} />}
        </>
      )}
    </div>
  );
}
