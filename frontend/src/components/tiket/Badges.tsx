import { clsx } from "clsx";
import { CircleQuestionMark, Droplet, Snowflake, Wrench, Zap, type IkonKosmos } from "@/components/icons";
import type { Kategori, StatusSewa } from "@/lib/api/types";
import { LABEL_PRIORITAS, type Prioritas } from "@/lib/format";
import { Stiker } from "@/components/ui/Stiker";

export const IKON_KATEGORI: Record<Kategori, IkonKosmos> = {
  AC: Snowflake,
  listrik: Zap,
  air: Droplet,
  lainnya: Wrench,
};

/** Kotak ikon kategori. Tanpa kategori (AI belum menilai) tampil tanda tanya. */
export function KategoriTile({ kategori, size = "md" }: { kategori: Kategori | null; size?: "md" | "lg" }) {
  const Icon = kategori ? IKON_KATEGORI[kategori] : CircleQuestionMark;
  return (
    <span
      aria-hidden
      className={clsx(
        "flex shrink-0 items-center justify-center",
        size === "lg" ? "size-16 rounded-[20px]" : "size-13 rounded-2xl",
        "bg-lilac-100",
      )}
    >
      <Icon className={size === "lg" ? "size-11" : "size-9"} />
    </span>
  );
}

export function PrioritasBadge({ prioritas }: { prioritas: Prioritas }) {
  return <Stiker varian={prioritas}>{LABEL_PRIORITAS[prioritas]}</Stiker>;
}

export function SewaBadge({ status }: { status: StatusSewa["status_sewa"] }) {
  const aktif = status === "aktif";
  return <Stiker varian={aktif ? "aktif" : "berakhir"}>{aktif ? "Sewa aktif" : "Sewa berakhir"}</Stiker>;
}
