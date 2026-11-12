import { clsx } from "clsx";
import { CheckCheck, FilePlus, Sparkles, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { LogoMark } from "@/components/brand/Logo";
import type { Notifikasi } from "@/lib/api/types";
import { jamSaja } from "@/lib/format";

const JENIS: Record<Notifikasi["jenis"], { label: string; icon: LucideIcon; warna: string }> = {
  tiket_dibuat: { label: "Tiket baru", icon: FilePlus, warna: "text-wa" },
  diklasifikasi: { label: "Diklasifikasi", icon: Sparkles, warna: "text-violet" },
  prioritas_tinggi: { label: "Prioritas TINGGI", icon: Zap, warna: "text-danger" },
  diproses: { label: "Diproses", icon: Wrench, warna: "text-violet" },
  dibatalkan: { label: "Dibatalkan", icon: X, warna: "text-muted" },
};

/**
 * Tampilan HP berisi pesan WhatsApp yang "dikirim" layanan Notification (adapter mock).
 * Tidak ada WhatsApp sungguhan yang terkirim.
 */
export function WhatsAppPhone({
  pesan,
  namaPenerima,
  className,
}: {
  pesan: Notifikasi[];
  namaPenerima: string;
  className?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const noTujuan = pesan.at(-1)?.no_tujuan;

  // Gulir ke pesan terbaru setiap ada pesan baru.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [pesan.length]);

  return (
    <div className={clsx("overflow-hidden rounded-[40px] border-10 border-navy bg-wa-chat", className)}>
      <div className="flex items-center gap-3 bg-wa px-4 pt-5 pb-3.5 text-white">
        <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-white">
          <LogoMark size={28} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-bold">Kosmos</span>
          <span className="text-xs text-wa-sub">
            ke {namaPenerima}
            {noTujuan ? ` · ${noTujuan}` : ""}
          </span>
        </span>
      </div>
      <ol ref={listRef} className="flex max-h-[460px] min-h-[420px] flex-col gap-2.5 overflow-y-auto px-3.5 pt-4 pb-5">
        {pesan.length === 0 && <li className="m-auto text-sm text-muted">Belum ada pesan.</li>}
        {pesan.map((p) => {
          const j = JENIS[p.jenis];
          const Icon = j.icon;
          return (
            <li
              key={p.id}
              className="flex max-w-[90%] flex-col gap-1 self-start rounded-[4px_14px_14px_14px] bg-white px-3 pt-2.5 pb-2 shadow-[0_1px_1px_rgba(18,39,90,0.08)]"
            >
              <span className={clsx("flex items-center gap-1.5 text-xs font-bold", j.warna)}>
                <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />
                {j.label} · {p.kode_tiket}
              </span>
              <span className="text-sm leading-snug text-ink">{p.isi}</span>
              <span className="flex items-center gap-1 self-end text-[11px] text-[#5e6470]">
                {jamSaja(p.created_at)}
                <CheckCheck
                  className={clsx("size-3.5", p.status_kirim === "terkirim" ? "text-wa-tick" : "text-danger")}
                  aria-label={p.status_kirim}
                />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
