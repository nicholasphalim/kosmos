import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Clock, PrioritasRendah, PrioritasReview, PrioritasSedang, PrioritasTinggi, SewaAktif, SewaBerakhir, type IkonKosmos } from "@/components/icons";

export type VarianStiker = "aktif" | "berakhir" | "tinggi" | "sedang" | "rendah" | "review" | "netral";

export const IKON_STIKER: Record<VarianStiker, IkonKosmos> = {
  aktif: SewaAktif,
  berakhir: SewaBerakhir,
  tinggi: PrioritasTinggi,
  sedang: PrioritasSedang,
  rendah: PrioritasRendah,
  review: PrioritasReview,
  netral: Clock,
};

/** Badge status bergaya stiker, satu keluarga dengan ikon dan maskot Kosmos. */
export function Stiker({ varian, ikon, children, className }: { varian: VarianStiker; ikon?: IkonKosmos; children: ReactNode; className?: string }) {
  const Ikon = ikon ?? IKON_STIKER[varian];
  return (
    <span data-varian={varian} className={clsx("stiker", className)}>
      <Ikon aria-hidden />
      <span className="relative">{children}</span>
    </span>
  );
}
