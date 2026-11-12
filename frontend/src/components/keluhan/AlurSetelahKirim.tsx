import { clsx } from "clsx";
import { MessageCircle, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";

const LANGKAH: Array<{ judul: string; ket: string; icon: LucideIcon; gaya: string }> = [
  { judul: "Sewa dicek", ket: "Hanya sewa aktif yang bisa lapor", icon: ShieldCheck, gaya: "bg-lilac-100 text-violet" },
  { judul: "AI menilai", ket: "Kategori dan prioritas otomatis", icon: Sparkles, gaya: "bg-lavender text-navy" },
  { judul: "Pemilik dikabari", ket: "Notifikasi WhatsApp ke kamu dan pemilik", icon: MessageCircle, gaya: "bg-navy text-white" },
];

/** Penjelasan alur layanan untuk penghuni. Saat `aktif`, langkah dianimasikan selama request berjalan. */
export function AlurSetelahKirim({ aktif }: { aktif: boolean }) {
  return (
    <aside aria-labelledby="alur-judul" className="flex min-w-0 flex-[1_1_300px] flex-col gap-5 rounded-3xl border border-line bg-white p-7">
      <h2 id="alur-judul" className="font-display text-xl font-extrabold tracking-tight">
        Setelah dikirim
      </h2>
      <ol className="flex flex-col">
        {LANGKAH.map((l, i) => (
          <li key={l.judul} className="grid grid-cols-[48px_minmax(0,1fr)] gap-3.5">
            <span className="flex flex-col items-center">
              <span
                aria-hidden
                className={clsx("flex size-12 items-center justify-center rounded-2xl", l.gaya, aktif && "animate-pulse")}
                style={aktif ? { animationDelay: `${i * 300}ms` } : undefined}
              >
                <l.icon className="size-5.5" />
              </span>
              {i < LANGKAH.length - 1 && <span aria-hidden className="min-h-5 w-0.5 flex-1 bg-line" />}
            </span>
            <span className="flex flex-col gap-0.5 pt-1 pb-5">
              <span className="text-[15px] font-bold">{l.judul}</span>
              <span className="text-sm text-muted">{l.ket}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
