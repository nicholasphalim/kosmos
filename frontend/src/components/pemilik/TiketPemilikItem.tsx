"use client";

import { Building, Clock, RefreshCw, User, Wrench, X } from "lucide-react";
import { KategoriTile, PrioritasBadge } from "@/components/tiket/Badges";
import { Button } from "@/components/ui/Button";
import type { TiketRingkas } from "@/lib/api/types";
import { prioritasTiket, waktuRelatif } from "@/lib/format";

type Aksi = "proses" | "batal" | "klasifikasi";

type Props = {
  tiket: TiketRingkas;
  /** Aksi yang sedang berjalan untuk tiket ini (untuk spinner). */
  sedang: Aksi | null;
  onAksi: (aksi: Aksi) => void;
};

/** Satu baris tiket di dashboard pemilik beserta aksi yang sah untuk statusnya. */
export function TiketPemilikItem({ tiket: t, sedang, onAksi }: Props) {
  const sibuk = sedang !== null;
  return (
    <li className="flex flex-wrap items-center gap-x-4.5 gap-y-3.5 border-t border-line-soft px-4 py-4.5 first:border-t-0">
      <KategoriTile kategori={t.kategori} />

      <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{t.judul}</span>
          <PrioritasBadge prioritas={prioritasTiket(t)} />
        </span>
        <span className="flex flex-wrap items-center gap-3.5 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <Building className="size-3.5" aria-hidden />
            {t.unit.nomor_unit}
          </span>
          <span className="flex items-center gap-1.5">
            <User className="size-3.5" aria-hidden />
            {t.penghuni.nama}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden />
            {waktuRelatif(t.created_at)}
          </span>
          <span className="font-mono text-xs">{t.kode}</span>
        </span>
      </span>

      <span className="flex items-center gap-2">
        {t.status === "dibuat" && (
          <Button
            variant="outline"
            disabled={sibuk}
            loading={sedang === "klasifikasi"}
            icon={<RefreshCw className="size-4" aria-hidden />}
            onClick={() => onAksi("klasifikasi")}
          >
            Klasifikasi ulang
          </Button>
        )}
        {t.status === "diklasifikasi" && (
          <Button
            disabled={sibuk}
            loading={sedang === "proses"}
            icon={<Wrench className="size-4" aria-hidden />}
            onClick={() => onAksi("proses")}
          >
            Tandai diproses
          </Button>
        )}
        {t.status === "diproses" && (
          <span className="flex h-11 items-center gap-2 rounded-xl bg-lilac-100 px-3.5 text-sm font-bold text-violet">
            <Wrench className="size-4" aria-hidden />
            Diproses
          </span>
        )}
        {t.status === "dibatalkan" && (
          <span className="flex h-11 items-center gap-2 rounded-xl bg-neutral-bg px-3.5 text-sm font-bold text-muted">
            <X className="size-4" aria-hidden />
            Dibatalkan
          </span>
        )}
        {t.status !== "dibatalkan" && t.status !== "selesai" && (
          <Button
            variant="outline"
            disabled={sibuk}
            loading={sedang === "batal"}
            aria-label={`Batalkan ${t.kode}`}
            title="Batalkan"
            className="w-11 border-line px-0 text-muted"
            onClick={() => onAksi("batal")}
            icon={sedang === "batal" ? undefined : <X className="size-4" strokeWidth={2.4} aria-hidden />}
          />
        )}
      </span>
    </li>
  );
}
