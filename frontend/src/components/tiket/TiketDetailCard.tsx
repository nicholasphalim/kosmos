import { Sparkles, TriangleExclamationPoint } from "@/components/icons";
import type { TiketDetail } from "@/lib/api/types";
import { LABEL_KATEGORI, LABEL_PRIORITAS, prioritasTiket, waktuLengkap } from "@/lib/format";
import { IKON_KATEGORI, KategoriTile } from "./Badges";
import { LampiranThumb } from "./LampiranThumb";
import { StatusStepper } from "./StatusStepper";
import { Stiker } from "@/components/ui/Stiker";

/** Kartu detail tiket: identitas, hasil klasifikasi AI, lampiran, dan status. */
export function TiketDetailCard({ tiket }: { tiket: TiketDetail }) {
  const prioritas = prioritasTiket(tiket);
  const IkonKat = tiket.kategori ? IKON_KATEGORI[tiket.kategori] : null;

  return (
    <section aria-labelledby="tiket-judul" className="flex flex-col gap-6 panel p-6 sm:p-8">
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
        {tiket.kategori && IkonKat && <Stiker varian="netral" ikon={IkonKat}>Kategori: {LABEL_KATEGORI[tiket.kategori]}</Stiker>}
        <Stiker varian={prioritas}>{prioritas === "review" ? "Menunggu penilaian" : `Prioritas ${LABEL_PRIORITAS[prioritas].toLowerCase()}`}</Stiker>
        {tiket.ai_confidence !== null && <Stiker varian="review" ikon={Sparkles}>Diklasifikasi AI</Stiker>}
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
