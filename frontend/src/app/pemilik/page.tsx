"use client";

import { ChevronRight, TriangleExclamationPoint } from "@/components/icons";
import { useState } from "react";
import { MessageCircle } from "@/components/icons";
import { useOutbox } from "@/components/notifikasi/useOutbox";
import { WhatsAppPhone } from "@/components/notifikasi/WhatsAppPhone";
import { KosmosScene } from "@/components/three/KosmosScene";
import { TiketFilterBar } from "@/components/pemilik/TiketFilterBar";
import { TiketPemilikItem } from "@/components/pemilik/TiketPemilikItem";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useKlasifikasiUlang, useTiketList, useUbahStatusTiket } from "@/lib/api/hooks";
import { useSession } from "@/lib/session";
import { filterTiketPemilik, hitungPerTab, tabDariStatus, type FilterUrgensi, type TabPemilik } from "@/lib/tiketFilter";
import { Stiker } from "@/components/ui/Stiker";

/** Layanan Manajemen dan Klasifikasi Tiket + Notifikasi Status Tiket, sisi Pemilik. */
export default function PemilikPage() {
  const pengguna = useSession()!.pengguna;
  const tiket = useTiketList();
  const outbox = useOutbox(pengguna.id);
  const ubahStatus = useUbahStatusTiket();
  const klasifikasi = useKlasifikasiUlang();

  const [tab, setTab] = useState<TabPemilik>("aksi");
  const [urgensi, setUrgensi] = useState<FilterUrgensi>("semua");
  const [cari, setCari] = useState("");

  const semua = tiket.data ?? [];
  const tampil = filterTiketPemilik(semua, { tab, urgensi, cari });
  const jumlah = hitungPerTab(semua);
  const aktif = semua.filter((t) => t.status !== "dibatalkan" && t.status !== "selesai").length;
  const tinggi = semua.filter((t) => t.urgensi === "tinggi" && tabDariStatus(t.status) === "aksi").length;
  const properti = [...new Set(semua.map((t) => t.unit.nama_properti))].join(" dan ");
  const gagal = ubahStatus.error ?? klasifikasi.error;

  function aksiSedang(idTiket: number) {
    if (ubahStatus.isPending && ubahStatus.variables?.idTiket === idTiket) {
      return ubahStatus.variables.status === "diproses" ? "proses" : "batal";
    }
    if (klasifikasi.isPending && klasifikasi.variables === idTiket) return "klasifikasi";
    return null;
  }

  function jalankan(idTiket: number, kode: string, aksi: "proses" | "batal" | "klasifikasi") {
    if (aksi === "klasifikasi") return klasifikasi.mutate(idTiket);
    if (aksi === "batal" && !window.confirm(`Batalkan tiket ${kode}? Penghuni akan dikabari.`)) return;
    ubahStatus.mutate({ idTiket, status: aksi === "proses" ? "diproses" : "dibatalkan" });
  }

  return (
    <div className="page-rise mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pt-5 pb-16 sm:px-6">
      <section className="night flex flex-col gap-10 rounded-[36px] p-7 sm:p-10 lg:p-12">
        <KosmosScene variant="tukang" className="absolute inset-y-0 right-0 hidden w-[44%] [mask-image:linear-gradient(90deg,transparent,#000_14%)] lg:block" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[720px] flex-col gap-4">
            <h1 className="display text-[clamp(2.75rem,6vw,5rem)]">Halo, {pengguna.nama}</h1>
            <p className="text-lg text-hero-sub">
              {tiket.data ? `${aktif} tiket aktif${properti ? ` di ${properti}` : ""}` : "Memuat tiket…"}
            </p>
          </div>
        </div>
        <div className="relative flex flex-col items-start gap-5">
        <dl className="grid w-full max-w-[640px] grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Perlu aksi", nilai: jumlah.aksi },
            { label: "Sedang jalan", nilai: semua.filter((t) => t.status === "diproses").length },
            { label: "Selesai", nilai: semua.filter((t) => t.status === "selesai").length },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-1 rounded-[20px] border border-white/15 bg-white/10 p-3.5 backdrop-blur sm:p-4">
              <dt className="text-xs font-semibold text-hero-sub sm:text-[13px]">{s.label}</dt>
              <dd className="display text-[clamp(1.75rem,4vw,2.5rem)]">{tiket.data ? s.nilai : "–"}</dd>
            </div>
          ))}
        </dl>
          {tinggi > 0 && (
            <Button
              size="lg"
              className="pr-5 pl-2.5 text-[15px]"
              onClick={() => {
                setTab("aksi");
                setUrgensi("tinggi");
              }}
              icon={
                <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-white/20 text-white">
                  <TriangleExclamationPoint className="size-4.5" />
                </span>
              }
            >
              {tinggi} prioritas tinggi
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </section>

      {gagal && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
          {gagal.message}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <main className="panel min-w-0 flex-[999_1_620px] overflow-hidden">
          <TiketFilterBar
            tab={tab}
            urgensi={urgensi}
            cari={cari}
            jumlah={jumlah}
            onTab={setTab}
            onUrgensi={setUrgensi}
            onCari={setCari}
          />
          {tiket.isPending && (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          )}
          {tiket.isError && <ErrorState pesan={tiket.error.message} onRetry={() => tiket.refetch()} />}
          {tiket.data && tampil.length === 0 && (
            <EmptyState
              judul="Tidak ada tiket di sini"
              aksi={
                (urgensi !== "semua" || cari) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUrgensi("semua");
                      setCari("");
                    }}
                  >
                    Hapus filter
                  </Button>
                )
              }
            />
          )}
          {tampil.length > 0 && (
            <ul className="px-2 pb-2">
              {tampil.map((t) => (
                <TiketPemilikItem key={t.id} tiket={t} sedang={aksiSedang(t.id)} onAksi={(a) => jalankan(t.id, t.kode, a)} />
              ))}
            </ul>
          )}
        </main>

        <aside aria-labelledby="wa-judul" className="mx-auto flex max-w-[380px] min-w-0 flex-[1_1_320px] flex-col gap-3">
          <div className="flex items-center justify-between gap-2.5 px-1">
            <h2 id="wa-judul" className="font-display text-xl font-extrabold tracking-tight">
              WhatsApp Outbox
            </h2>
            <Stiker varian="review" ikon={MessageCircle}>Simulasi</Stiker>
          </div>
          {outbox.isPending ? (
            <Skeleton className="h-[520px] rounded-[40px]" />
          ) : (
            <WhatsAppPhone pesan={outbox.pesan} namaPenerima={pengguna.nama} />
          )}
        </aside>
      </div>
    </div>
  );
}
