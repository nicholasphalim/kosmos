import { clsx } from "clsx";
import { PesanWhatsApp, Terkirim } from "@/components/icons";

/** Pratinjau pesan WhatsApp bergaya stiker, dipakai di landing page. */
export function BalonWhatsApp({ penerima, pesan, waktu = "09.41", className }: { penerima: string; pesan: string; waktu?: string; className?: string }) {
  return (
    <div className={clsx("balon-wa", className)}>
      <PesanWhatsApp aria-hidden className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-tight font-bold text-[#0b4726]">
          Kosmos <span className="font-medium opacity-75">ke {penerima}</span>
        </p>
        <p className="mt-0.5 text-sm leading-snug text-ink">{pesan}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 self-end text-[11px] font-semibold text-[#0b4726]/75">
        {waktu}
        <Terkirim aria-hidden className="size-4" />
      </span>
    </div>
  );
}
