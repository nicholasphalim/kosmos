import { clsx } from "clsx";
import { Check, FilePlus, Sparkles, Wrench, X, type LucideIcon } from "lucide-react";
import type { RiwayatStatus, StatusTiket } from "@/lib/api/types";
import { jamSaja, LABEL_STATUS } from "@/lib/format";

const ALUR: Array<{ status: StatusTiket; icon: LucideIcon }> = [
  { status: "dibuat", icon: FilePlus },
  { status: "diklasifikasi", icon: Sparkles },
  { status: "diproses", icon: Wrench },
  { status: "selesai", icon: Check },
];

type Tahap = "done" | "now" | "todo";

const GAYA: Record<Tahap, { lingkar: string; garis: string; teks: string }> = {
  done: { lingkar: "bg-navy text-lavender border-navy", garis: "bg-navy", teks: "text-navy" },
  now: { lingkar: "bg-lavender text-navy border-navy", garis: "bg-line", teks: "text-navy" },
  todo: { lingkar: "bg-white text-subtle border-line", garis: "bg-line", teks: "text-muted" },
};

/** Stepper status tiket (state machine plan §3.2). Tiket dibatalkan ditampilkan terpisah. */
export function StatusStepper({ status, riwayat }: { status: StatusTiket; riwayat: RiwayatStatus[] }) {
  if (status === "dibatalkan") {
    const batal = riwayat.find((r) => r.ke === "dibatalkan");
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-neutral-bg p-4">
        <span className="flex size-11 items-center justify-center rounded-full bg-white text-muted">
          <X className="size-5" aria-hidden />
        </span>
        <span className="flex flex-col">
          <span className="font-bold">Dibatalkan</span>
          {batal && (
            <span className="text-sm text-muted">
              oleh {batal.oleh}, {jamSaja(batal.waktu)}
            </span>
          )}
        </span>
      </div>
    );
  }

  const posisi = ALUR.findIndex((a) => a.status === status);
  return (
    <ol className="grid grid-cols-4">
      {ALUR.map((a, i) => {
        const tahap: Tahap = i < posisi ? "done" : i === posisi ? "now" : "todo";
        const g = GAYA[tahap];
        const waktu = riwayat.find((r) => r.ke === a.status);
        const catatan = waktu ? jamSaja(waktu.waktu) : a.status === "diproses" && tahap === "todo" ? "Menunggu pemilik" : "";
        const Icon = a.icon;
        return (
          <li key={a.status} aria-current={tahap === "now" ? "step" : undefined} className="flex flex-col gap-2.5">
            <span className="flex items-center">
              <span
                aria-hidden
                className={clsx("flex size-11 shrink-0 items-center justify-center rounded-full border-2", g.lingkar)}
              >
                <Icon className="size-5" />
              </span>
              {i < ALUR.length - 1 && (
                <span aria-hidden className={clsx("mx-1.5 h-[3px] flex-1 rounded-full", tahap === "done" ? GAYA.done.garis : "bg-line")} />
              )}
            </span>
            <span className={clsx("text-sm font-bold", g.teks)}>{LABEL_STATUS[a.status]}</span>
            <span className="-mt-1.5 min-h-5 text-[13px] text-muted">{catatan}</span>
          </li>
        );
      })}
    </ol>
  );
}
