import { clsx } from "clsx";
import { LoaderCircle, Sparkles, TriangleExclamationPoint } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export function Spinner({ label = "Memuat…", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={clsx("flex items-center gap-2 text-sm font-semibold text-muted", className)}>
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

/** Kerangka abu-abu saat data dimuat. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={clsx("block animate-pulse rounded-xl bg-line", className)} />;
}

export function ErrorState({ pesan, onRetry }: { pesan: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-bg text-danger">
        <TriangleExclamationPoint className="size-6" aria-hidden />
      </span>
      <p className="font-bold">{pesan}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ judul, aksi }: { judul: string; aksi?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
      <span className="flex size-16 items-center justify-center rounded-[22px] bg-lilac-100 text-violet-400">
        <Sparkles className="size-7" aria-hidden />
      </span>
      <p className="font-bold">{judul}</p>
      {aksi}
    </div>
  );
}
