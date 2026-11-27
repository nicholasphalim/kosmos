"use client";

import { ArrowLeft, X } from "@/components/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PerbaikanPemilik } from "@/components/perbaikan/PerbaikanPemilik";
import { TiketDetailCard } from "@/components/tiket/TiketDetailCard";
import { Button } from "@/components/ui/Button";
import { KonfirmasiDialog } from "@/components/ui/KonfirmasiDialog";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { ApiError } from "@/lib/api/client";
import { useTiketDetail, useUbahStatusTiket, useWorkOrderTiket } from "@/lib/api/hooks";

/** Detail tiket sisi pemilik: Complaint Handling (kiri) + Repair Verification (kanan). */
export default function PemilikTiketPage() {
  const { id } = useParams<{ id: string }>();
  const idTiket = Number(id);
  const tiket = useTiketDetail(idTiket);
  const batal = useUbahStatusTiket();
  const wo = useWorkOrderTiket(idTiket);
  const bisaBatal = tiket.data && tiket.data.status !== "selesai" && tiket.data.status !== "dibatalkan";
  // Pembatalan setelah teknisi tiba tetap menerbitkan tagihan biaya kunjungan.
  const sudahTiba = wo.data?.log.some((l) => l.aktivitas === "tiba") && wo.data.status !== "selesai" && wo.data.status !== "dibatalkan";
  const [konfirmasiBatal, setKonfirmasiBatal] = useState(false);

  return (
    <main className="page-rise mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pt-8 pb-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Link href="/pemilik" className="flex items-center gap-2 self-start text-sm font-semibold text-hero-sub no-underline hover:text-white">
            <ArrowLeft className="size-4" aria-hidden />
            Semua tiket
          </Link>
          <h1 className="display text-[clamp(2.5rem,6vw,4rem)]">
            {tiket.data ? `${tiket.data.unit.nomor_unit} · ${tiket.data.penghuni.nama}` : "Detail tiket"}
          </h1>
        </div>
        {bisaBatal && (
          <Button
            variant="outline"
            loading={batal.isPending}
            icon={<X className="size-4" aria-hidden />}
            className="hover:border-danger-dot/50 hover:bg-danger-bg hover:text-danger"
            title="Untuk laporan salah atau duplikat. Kalau masalahnya sudah kamu atasi, pakai Tangani sendiri."
            onClick={() => setKonfirmasiBatal(true)}
          >
            Batalkan tiket
          </Button>
        )}
      </div>

      {batal.error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
          {batal.error.message}
        </p>
      )}
      {tiket.isPending && <Skeleton className="h-[520px] rounded-3xl" />}
      {tiket.isError && (
        <ErrorState
          pesan={tiket.error instanceof ApiError && tiket.error.status === 404 ? "Tiket tidak ditemukan." : tiket.error.message}
          onRetry={() => tiket.refetch()}
        />
      )}
      {tiket.data && (
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[1_1_480px]">
            <TiketDetailCard tiket={tiket.data} />
          </div>
          <div className="min-w-0 flex-[1_1_440px]">
            <PerbaikanPemilik tiket={tiket.data} />
          </div>
        </div>
      )}
      {tiket.data && (
        <KonfirmasiDialog
          buka={konfirmasiBatal}
          judul={`Batalkan tiket ${tiket.data.kode}?`}
          pesan={[
            "Laporan ini tidak akan ditindaklanjuti (mis. salah atau duplikat).",
            tiket.data.status === "diklasifikasi" ? "Kalau masalahnya sudah kamu atasi, pilih “Tangani sendiri” saja." : "",
            sudahTiba ? "Teknisi sudah datang, jadi biaya kunjungan tetap ditagihkan ke kamu." : "",
            "Penghuni dan teknisi akan dikabari.",
          ].filter(Boolean)}
          labelKonfirmasi="Batalkan tiket"
          labelBatal="Kembali"
          bahaya
          onBatal={() => setKonfirmasiBatal(false)}
          onKonfirmasi={() => {
            batal.mutate({ idTiket, status: "dibatalkan" });
            setKonfirmasiBatal(false);
          }}
        />
      )}
    </main>
  );
}
