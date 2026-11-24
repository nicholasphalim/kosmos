"use client";

import { Building, Check, Clock, HardHat, RefreshCw, User, X } from "@/components/icons";
import Link from "next/link";
import { StatusWoStiker } from "@/components/perbaikan/Bagian";
import { KategoriTile, PrioritasBadge } from "@/components/tiket/Badges";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Stiker } from "@/components/ui/Stiker";
import type { StatusWorkOrder, TiketRingkas } from "@/lib/api/types";
import { prioritasTiket, waktuRelatif } from "@/lib/format";

type Aksi = "batal" | "klasifikasi";

type Props = {
  tiket: TiketRingkas;
  /** Status work order tiket ini, bila sudah ada (Repair Verification). */
  statusWo?: StatusWorkOrder;
  /** Aksi yang sedang berjalan untuk tiket ini (untuk spinner). */
  sedang: Aksi | null;
  onAksi: (aksi: Aksi) => void;
};

/** Satu baris tiket di dashboard pemilik beserta aksi yang sah untuk statusnya. */
export function TiketPemilikItem({ tiket: t, statusWo, sedang, onAksi }: Props) {
  const sibuk = sedang !== null;
  const href = `/pemilik/tiket/${t.id}`;
  return (
    <li className="flex flex-wrap items-center gap-x-4.5 gap-y-3.5 rounded-[20px] border-t border-line-soft px-4 py-4.5 transition-colors duration-200 first:border-t-0 hover:bg-lilac-50">
      <KategoriTile kategori={t.kategori} />

      <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <Link href={href} className="font-bold text-navy no-underline hover:underline">
            {t.judul}
          </Link>
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
          <ButtonLink href={href} aria-label={`Tinjau ${t.kode}`} icon={<HardHat className="size-4.5" aria-hidden />}>
            Tinjau
          </ButtonLink>
        )}
        {t.status === "diproses" && (
          <Link href={href} aria-label={`Lihat progres ${t.kode}`} className="no-underline">
            {statusWo ? <StatusWoStiker status={statusWo} /> : <Stiker varian="netral">Diproses</Stiker>}
          </Link>
        )}
        {t.status === "selesai" && (
          <Link href={href} aria-label={`Lihat ${t.kode}`} className="no-underline">
            <Stiker varian="aktif" ikon={Check}>{t.penanganan === "sendiri" ? "Selesai · ditangani sendiri" : "Selesai"}</Stiker>
          </Link>
        )}
        {t.status === "dibatalkan" && <Stiker varian="berakhir" ikon={X}>Dibatalkan</Stiker>}
        {(t.status === "dibuat" || t.status === "diklasifikasi") && (
          <Button
            variant="outline"
            disabled={sibuk}
            loading={sedang === "batal"}
            aria-label={`Batalkan ${t.kode}`}
            title="Batalkan"
            className="w-11 shrink-0 border-line px-0! text-muted hover:border-danger-dot/50 hover:bg-danger-bg hover:text-danger"
            onClick={() => onAksi("batal")}
            icon={sedang === "batal" ? undefined : <X className="size-4" strokeWidth={2.4} aria-hidden />}
          />
        )}
      </span>
    </li>
  );
}
