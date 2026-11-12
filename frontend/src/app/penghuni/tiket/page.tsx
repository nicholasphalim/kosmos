"use client";

import { ChevronRight, CirclePlus, Clock } from "lucide-react";
import Link from "next/link";
import { KategoriTile, PrioritasBadge } from "@/components/tiket/Badges";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useTiketList } from "@/lib/api/hooks";
import { LABEL_STATUS, prioritasTiket, waktuRelatif } from "@/lib/format";

export default function TiketSayaPage() {
  const tiket = useTiketList();

  return (
    <main className="mx-auto flex max-w-[808px] flex-col gap-6 px-6 pt-10 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[34px] font-extrabold tracking-[-0.03em]">Tiket saya</h1>
        <ButtonLink href="/penghuni/lapor" icon={<CirclePlus className="size-4.5" aria-hidden />}>
          Lapor kerusakan
        </ButtonLink>
      </div>

      <section className="overflow-hidden rounded-3xl border border-line bg-white">
        {tiket.isPending && (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
        {tiket.isError && <ErrorState pesan={tiket.error.message} onRetry={() => tiket.refetch()} />}
        {tiket.data?.length === 0 && <EmptyState judul="Belum ada laporan" />}
        {tiket.data && tiket.data.length > 0 && (
          <ul>
            {tiket.data.map((t) => (
              <li key={t.id} className="border-t border-line-soft first:border-t-0">
                <Link
                  href={`/penghuni/tiket/${t.id}`}
                  className="flex items-center gap-4 px-5 py-4 text-navy no-underline hover:bg-lilac-50"
                >
                  <KategoriTile kategori={t.kategori} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{t.judul}</span>
                      <PrioritasBadge prioritas={prioritasTiket(t)} />
                    </span>
                    <span className="flex flex-wrap items-center gap-3.5 text-[13px] text-muted">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5" aria-hidden />
                        {waktuRelatif(t.created_at)}
                      </span>
                      <span className="font-mono text-xs">{t.kode}</span>
                      <span className="font-semibold">{LABEL_STATUS[t.status]}</span>
                    </span>
                  </span>
                  <ChevronRight className="size-4.5 text-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
