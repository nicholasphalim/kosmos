import { clsx } from "clsx";
import { Check, CircleQuestionMark, Droplet, Snowflake, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import type { Kategori, StatusSewa } from "@/lib/api/types";
import { LABEL_PRIORITAS, type Prioritas } from "@/lib/format";

export const IKON_KATEGORI: Record<Kategori, LucideIcon> = {
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
        kategori ? "bg-navy text-lavender" : "bg-lilac-100 text-violet",
      )}
    >
      <Icon className={size === "lg" ? "size-7.5" : "size-6"} />
    </span>
  );
}

const GAYA_PRIORITAS: Record<Prioritas, { badge: string; dot: string }> = {
  tinggi: { badge: "bg-danger-bg text-danger", dot: "bg-danger-dot" },
  review: { badge: "bg-lilac-100 text-violet", dot: "bg-violet-400" },
  sedang: { badge: "bg-warn-bg text-warn", dot: "bg-warn-dot" },
  rendah: { badge: "bg-info-bg text-info", dot: "bg-info-dot" },
};

export function prioritasDot(p: Prioritas) {
  return GAYA_PRIORITAS[p].dot;
}

export function PrioritasBadge({ prioritas }: { prioritas: Prioritas }) {
  const g = GAYA_PRIORITAS[prioritas];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", g.badge)}>
      <span aria-hidden className={clsx("size-1.5 rounded-full", g.dot)} />
      {LABEL_PRIORITAS[prioritas]}
    </span>
  );
}

export function SewaBadge({ status }: { status: StatusSewa["status_sewa"] }) {
  const aktif = status === "aktif";
  const Icon = aktif ? Check : X;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold whitespace-nowrap",
        aktif ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger",
      )}
    >
      <Icon className="size-3.5" strokeWidth={3} aria-hidden />
      {aktif ? "Sewa aktif" : "Sewa berakhir"}
    </span>
  );
}
