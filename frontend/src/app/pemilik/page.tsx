"use client";

import { ChevronRight, TriangleExclamationPoint } from "lucide-react";
import { useState } from "react";
import { SparkleCluster } from "@/components/brand/Art";
import { useOutbox } from "@/components/notifikasi/useOutbox";
import { WhatsAppPhone } from "@/components/notifikasi/WhatsAppPhone";
import { TiketFilterBar } from "@/components/pemilik/TiketFilterBar";
import { TiketPemilikItem } from "@/components/pemilik/TiketPemilikItem";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useKlasifikasiUlang, useTiketList, useUbahStatusTiket } from "@/lib/api/hooks";
import { useSession } from "@/lib/session";
import { filterTiketPemilik, hitungPerTab, tabDariStatus, type FilterUrgensi, type TabPemilik } from "@/lib/tiketFilter";

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
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-6 pt-8 pb-16">
      <section className="relative flex flex-wrap items-center justify-between gap-5 overflow-hidden rounded-[28px] bg-navy px-8 py-9 text-white sm:px-10">
        <SparkleCluster
          className="pointer-events-none absolute top-0 right-0 hidden w-[300px] md:block"
          tones={["var(--color-lavender)", "var(--color-violet-400)", "#4b5f9a"]}
        />
        <div className="relative flex flex-col gap-2">
          <h1 className="font-display text-[44px] leading-none font-extrabold tracking-[-0.04em]">Halo, {pengguna.nama}</h1>
          <p className="text-[17px] text-hero-sub">
            {tiket.data ? `${aktif} tiket aktif${properti ? ` di ${properti}` : ""}` : "Memuat tiket…"}
          </p>
        </div>
        {tinggi > 0 && (
          <Button
            variant="light"
            size="lg"
            className="relative h-13 rounded-2xl pr-5 pl-3.5 text-[15px]"
            onClick={() => {
              setTab("aksi");
              setUrgensi("tinggi");
            }}
            icon={
              <span aria-hidden className="flex size-8 items-center justify-center rounded-[10px] bg-danger-bg text-danger">
                <TriangleExclamationPoint className="size-4.5" />
              </span>
            }
          >
            {tinggi} prioritas tinggi
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        )}
      </section>

      {gagal && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
          {gagal.message}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <main className="min-w-0 flex-[999_1_620px] overflow-hidden rounded-3xl border border-line bg-white">
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
            <span className="rounded-full bg-lavender px-2.5 py-1 text-xs font-bold">Simulasi</span>
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
