import { clsx } from "clsx";
import { Check, X } from "lucide-react";
import type { Layer, TraceStep } from "@/lib/api/types";
import { formatDurasi } from "@/lib/format";

const GAYA_LAYER: Record<Layer, string> = {
  Task: "bg-navy text-white",
  Entity: "bg-info-bg text-info",
  Utility: "bg-lilac-100 text-violet",
};

/**
 * Jejak pemanggilan service dari response ajukanKeluhan.
 * Alat peraga SOA: menunjukkan Task mengorkestrasi Entity dan Utility secara berurutan.
 */
export function ServiceTrace({ steps }: { steps: TraceStep[] }) {
  const total = steps.reduce((sum, s) => sum + s.ms, 0);
  return (
    <details className="rounded-2xl border border-line bg-white p-5 open:pb-3">
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 font-bold">
        Jejak layanan (SOA)
        <span className="font-mono text-xs font-medium text-muted">
          {steps.length} operasi · {formatDurasi(total)}
        </span>
      </summary>
      <ol className="mt-3 flex flex-col">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft py-2.5">
            <span
              aria-label={s.ok ? "berhasil" : "gagal"}
              className={clsx(
                "flex size-6 items-center justify-center rounded-full",
                s.ok ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger",
              )}
            >
              {s.ok ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">{s.service}</span>
                <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", GAYA_LAYER[s.layer])}>{s.layer}</span>
              </span>
              <span className="font-mono text-xs break-words text-muted">{s.operasi}</span>
            </span>
            <span className="font-mono text-xs text-muted">{formatDurasi(s.ms)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
