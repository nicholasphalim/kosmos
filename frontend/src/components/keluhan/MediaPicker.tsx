"use client";

import { Camera, Info, Play, X } from "@/components/icons";
import { useEffect, useId, useMemo } from "react";
import { ukuranFile } from "@/lib/format";

export const BATAS_LAMPIRAN = {
  maksFile: 3,
  gambarByte: 5 * 1024 * 1024,
  videoByte: 20 * 1024 * 1024,
} as const;

/** Sama dengan EKSTENSI di backend media_storage/service.py. */
export const TIPE_FOTO = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"];
const TIPE_MEDIA = [...TIPE_FOTO, "video/mp4"];
/** Foto bukti perbaikan: format yang lolos Evidence Verification (slide D2 "Berformat gambar (JPG, PNG, WebP)"). */
export const TIPE_BUKTI = ["image/jpeg", "image/png", "image/webp"];

/** Validasi sisi klien (kenyamanan). Backend tetap memvalidasi ulang (422). */
export function validasiFile(file: File): string | null {
  if (!TIPE_MEDIA.includes(file.type)) return `${file.name}: hanya foto (JPG, PNG, WebP, GIF, HEIC) atau video MP4.`;
  const gambar = file.type.startsWith("image/");
  const video = file.type === "video/mp4";
  if (gambar && file.size > BATAS_LAMPIRAN.gambarByte) return `${file.name}: foto maksimal 5 MB.`;
  if (video && file.size > BATAS_LAMPIRAN.videoByte) return `${file.name}: video maksimal 20 MB.`;
  return null;
}

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (pesan: string | null) => void;
  disabled?: boolean;
};

export function MediaPicker({ files, onChange, onError, disabled }: Props) {
  const inputId = useId();

  // Object URL untuk pratinjau; dibersihkan saat daftar file berubah.
  const previews = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  function tambah(list: FileList | null) {
    if (!list) return;
    const baru = Array.from(list);
    const salah = baru.map(validasiFile).find(Boolean);
    if (salah) return onError(salah);
    if (files.length + baru.length > BATAS_LAMPIRAN.maksFile) {
      return onError(`Maksimal ${BATAS_LAMPIRAN.maksFile} file.`);
    }
    onError(null);
    onChange([...files, ...baru]);
  }

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <div className="flex items-baseline justify-between gap-3">
        <legend className="font-display text-[22px] font-extrabold tracking-tight">Foto atau video</legend>
        <span className="text-sm font-semibold text-muted">
          {files.length} / {BATAS_LAMPIRAN.maksFile}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {files.map((f, i) => {
          const preview = previews[i];
          return (
            <div
              key={`${f.name}-${f.lastModified}-${i}`}
              className={
                preview
                  ? "relative aspect-square overflow-hidden rounded-[18px] bg-lilac-100"
                  : "relative flex aspect-square flex-col items-center justify-center gap-2.5 rounded-[18px] bg-navy p-3"
              }
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- pratinjau object URL lokal
                <img src={preview} alt={`Pratinjau ${f.name}`} className="size-full object-cover" />
              ) : (
                <>
                  <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-lavender">
                    <Play className="size-4.5 fill-navy text-navy" />
                  </span>
                  <span className="max-w-full truncate text-xs font-semibold text-white">
                    {f.name} · {ukuranFile(f.size)}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                aria-label={`Hapus ${f.name}`}
                className={
                  preview
                    ? "absolute top-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-navy text-white"
                    : "absolute top-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white text-navy"
                }
              >
                <X className="size-3.5" strokeWidth={2.6} aria-hidden />
              </button>
            </div>
          );
        })}

        {files.length < BATAS_LAMPIRAN.maksFile && (
          <label
            htmlFor={inputId}
            className="relative flex aspect-square cursor-pointer flex-col first:col-span-3 first:aspect-auto first:h-36 items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-violet-300 bg-white/60 text-sm font-bold text-violet transition-colors duration-200 focus-within:outline-3 focus-within:outline-violet-400 hover:bg-lilac-100"
          >
            <Camera className="size-7.5" strokeWidth={1.8} aria-hidden />
            Tambah
            <input
              id={inputId}
              type="file"
              accept={TIPE_MEDIA.join(",")}
              multiple
              className="sr-only"
              onChange={(e) => {
                tambah(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      <span className="flex items-center gap-1.5 text-[13px] text-muted">
        <Info className="size-4" aria-hidden />
        Foto ≤ 5 MB · video mp4 ≤ 20 MB
      </span>
    </fieldset>
  );
}
