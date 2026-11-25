"use client";

import { CirclePlus } from "@/components/icons";
import { useState } from "react";
import { FormTambahPenghuni, PenghuniItem } from "@/components/pemilik/KelolaPenghuni";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { usePenghuniList } from "@/lib/api/hooks";
import type { PenghuniTerdaftar } from "@/lib/api/types";

/** Kelola penghuni (Entity Tenant and Lease): daftarkan email Google, koreksi data, sewa lagi. */
export default function PenghuniPage() {
  const daftar = usePenghuniList();
  const [form, setForm] = useState(false);
  const [baru, setBaru] = useState<PenghuniTerdaftar | null>(null);

  return (
    <div className="page-rise mx-auto flex max-w-[1240px] flex-col gap-6 px-3 pt-5 pb-16 sm:px-6">
      <section className="night flex flex-col gap-4 rounded-[36px] p-7 sm:p-10 lg:p-12">
        <h1 className="display relative text-[clamp(2.75rem,6vw,5rem)]">Penghuni</h1>
        <p className="relative max-w-[720px] text-lg text-hero-sub">
          Daftarkan email Google penghuni beserta unit dan periode sewanya. Setelah terdaftar, penghuni bisa langsung masuk dengan akun Google-nya.
        </p>
      </section>

      <main className="panel flex flex-col gap-4 overflow-hidden pt-5 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6">
          <h2 className="text-xl font-bold">Daftar penghuni</h2>
          {!form && (
            <Button icon={<CirclePlus className="size-4.5" aria-hidden />} onClick={() => (setForm(true), setBaru(null))}>
              Tambah penghuni
            </Button>
          )}
        </div>

        {form && (
          <div className="flex flex-col gap-2 px-4">
            <FormTambahPenghuni onSelesai={(p) => (setBaru(p), setForm(false))} />
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setForm(false)}>
              Batal
            </Button>
          </div>
        )}

        {baru && (
          <p role="status" className="mx-4 rounded-2xl bg-ok-bg px-4 py-3 text-sm font-semibold text-ok">
            {baru.pengguna.nama} terdaftar di {baru.unit.nomor_unit}. Minta dia masuk dengan Google memakai {baru.email}.
          </p>
        )}

        {daftar.isPending && <Skeleton className="mx-4 h-16" />}
        {daftar.isError && <ErrorState pesan={daftar.error.message} onRetry={() => daftar.refetch()} />}
        {daftar.data?.length === 0 && <EmptyState judul="Belum ada penghuni terdaftar" />}
        {daftar.data && daftar.data.length > 0 && (
          <ul>
            {daftar.data.map((p) => (
              <PenghuniItem key={p.pengguna.id} p={p} baru={p.pengguna.id === baru?.pengguna.id} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
