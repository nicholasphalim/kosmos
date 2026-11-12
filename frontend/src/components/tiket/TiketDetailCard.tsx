import { ChartNoAxesColumnIncreasing, Sparkles, TriangleExclamationPoint } from "lucide-react";
import type { TiketDetail } from "@/lib/api/types";
import { LABEL_KATEGORI, LABEL_PRIORITAS, prioritasTiket, waktuLengkap } from "@/lib/format";
import { IKON_KATEGORI, KategoriTile } from "./Badges";
import { LampiranThumb } from "./LampiranThumb";
import { StatusStepper } from "./StatusStepper";

const GAYA_CHIP_PRIORITAS = {
  tinggi: "bg-danger-bg text-danger",
  sedang: "bg-warn-bg text-warn",
  rendah: "bg-info-bg text-info",
  review: "bg-lilac-100 text-violet",
} as const;

/** Kartu detail tiket: identitas, hasil klasifikasi AI, lampiran, dan status. */
export function TiketDetailCard({ tiket }: { tiket: TiketDetail }) {
  const prioritas = prioritasTiket(tiket);
  const IkonKat = tiket.kategori ? IKON_KATEGORI[tiket.kategori] : null;

  return (
    <section aria-labelledby="tiket-judul" className="flex flex-col gap-6 rounded-3xl border border-line bg-white p-6 sm:p-8">
      <div className="flex items-center gap-4.5">
        <KategoriTile kategori={tiket.kategori} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="tiket-judul" className="font-display text-[26px] leading-tight font-extrabold tracking-tight">
            {tiket.judul}
          </h2>
          <span className="text-sm text-muted">
            <span className="font-mono">{tiket.kode}</span> · {waktuLengkap(tiket.created_at)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {tiket.kategori && IkonKat && (
          <span className="flex items-center gap-2 rounded-xl bg-lilac-50 px-3.5 py-2 text-sm font-semibold">
            <IkonKat className="size-4 text-violet" aria-hidden />
            Kategori: {LABEL_KATEGORI[tiket.kategori]}
          </span>
        )}
        <span className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold ${GAYA_CHIP_PRIORITAS[prioritas]}`}>
          <ChartNoAxesColumnIncreasing className="size-4" aria-hidden />
          {prioritas === "review" ? "Menunggu penilaian" : `Prioritas ${LABEL_PRIORITAS[prioritas].toLowerCase()}`}
        </span>
        {tiket.ai_confidence !== null && (
          <span className="flex items-center gap-2 rounded-xl bg-lilac-100 px-3.5 py-2 text-sm font-semibold text-violet">
            <Sparkles className="size-4" aria-hidden />
            Diklasifikasi AI
          </span>
        )}
      </div>

      <p className="rounded-2xl border border-line-soft px-4.5 py-3.5 text-[15px] leading-relaxed text-navy-soft">
        “{tiket.keluhan.deskripsi}”
      </p>

      {tiket.keluhan.lampiran.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {tiket.keluhan.lampiran.map((l) => (
            <LampiranThumb key={l.id} lampiran={l} />
          ))}
        </div>
      )}

      {tiket.ai_alasan ? (
        <details className="rounded-2xl bg-lilac-50 px-4.5 py-4">
          <summary className="cursor-pointer text-[15px] font-bold">
            Kenapa {prioritas === "review" ? "perlu review" : `prioritas ${LABEL_PRIORITAS[prioritas].toLowerCase()}`}?
          </summary>
          <p className="mt-2.5 text-[15px] leading-relaxed text-navy-soft">
            {tiket.ai_alasan}{" "}
            {tiket.ai_confidence !== null && (
              <span className="text-muted">Keyakinan AI {Math.round(tiket.ai_confidence * 100)}%.</span>
            )}
          </p>
        </details>
      ) : (
        <p className="flex items-center gap-2.5 rounded-2xl bg-lilac-50 px-4.5 py-4 text-[15px] text-navy-soft">
          <TriangleExclamationPoint className="size-4.5 shrink-0 text-violet" aria-hidden />
          AI belum menilai laporan ini. Pemilik akan meninjau dan mengklasifikasikannya.
        </p>
      )}

      <div className="flex flex-col gap-4.5 border-t border-line-soft pt-6">
        <h3 className="font-bold">Status tiket</h3>
        <StatusStepper status={tiket.status} riwayat={tiket.riwayat} />
      </div>
    </section>
  );
}
