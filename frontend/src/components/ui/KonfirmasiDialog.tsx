"use client";

import { clsx } from "clsx";
import { TriangleExclamationPoint } from "@/components/icons";
import { useEffect, useId, useRef } from "react";
import { Button } from "./Button";

type Props = {
  buka: boolean;
  judul: string;
  /** Satu paragraf per elemen. */
  pesan: string[];
  labelKonfirmasi: string;
  labelBatal?: string;
  /** Aksi yang menghapus atau membatalkan sesuatu: tombol konfirmasi berwarna bahaya. */
  bahaya?: boolean;
  onKonfirmasi: () => void;
  onBatal: () => void;
};

/**
 * Pengganti window.confirm yang tampil di dalam halaman, sesuai gaya Kosmos.
 * Memakai <dialog> bawaan: fokus terkunci di dalam dialog, Esc membatalkan, latar belakang tidak bisa diklik.
 */
export function KonfirmasiDialog({ buka, judul, pesan, labelKonfirmasi, labelBatal = "Batal", bahaya, onKonfirmasi, onBatal }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idJudul = useId();
  const idPesan = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (buka && !d.open) d.showModal();
    if (!buka && d.open) d.close();
  }, [buka]);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={idJudul}
      aria-describedby={idPesan}
      onCancel={(e) => {
        e.preventDefault();
        onBatal();
      }}
      onClick={(e) => {
        // Klik di latar belakang (di luar kartu) sama dengan Batal.
        if (e.target === e.currentTarget) onBatal();
      }}
      className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-[28px] bg-white p-0 text-navy shadow-[0_40px_120px_-30px_#3f2378] backdrop:bg-[#140a2a]/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-5 p-6 sm:p-7">
        <div className="flex items-start gap-3.5">
          <span
            className={clsx(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl",
              bahaya ? "bg-danger-bg text-danger" : "bg-lilac-100 text-violet",
            )}
            aria-hidden
          >
            <TriangleExclamationPoint className="size-5" />
          </span>
          <h2 id={idJudul} className="pt-2 text-lg leading-snug font-bold">
            {judul}
          </h2>
        </div>
        <div id={idPesan} className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-navy-soft">
          {pesan.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onBatal} autoFocus>
            {labelBatal}
          </Button>
          <Button variant={bahaya ? "bahaya" : "primary"} onClick={onKonfirmasi}>
            {labelKonfirmasi}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
