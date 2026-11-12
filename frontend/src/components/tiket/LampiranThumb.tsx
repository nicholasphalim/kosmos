"use client";

import { Image as ImageIcon, Play } from "lucide-react";
import { useState } from "react";
import type { Lampiran } from "@/lib/api/types";

/**
 * Thumbnail lampiran. Di mode mock URL berupa object URL yang hilang saat reload,
 * jadi gambar yang gagal dimuat jatuh ke ikon.
 */
export function LampiranThumb({ lampiran }: { lampiran: Lampiran }) {
  const [gagal, setGagal] = useState(false);
  const video = lampiran.mime.startsWith("video/");

  if (video) {
    return (
      <a
        href={lampiran.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Video ${lampiran.nama_file}`}
        className="flex size-22 items-center justify-center rounded-2xl bg-navy text-lavender"
      >
        <Play className="size-6 fill-current" aria-hidden />
      </a>
    );
  }

  if (gagal) {
    return (
      <span
        role="img"
        aria-label={`Foto ${lampiran.nama_file}`}
        className="flex size-22 items-center justify-center rounded-2xl bg-lilac-100 text-violet"
      >
        <ImageIcon className="size-7.5" aria-hidden />
      </span>
    );
  }

  return (
    <a href={lampiran.url} target="_blank" rel="noreferrer" className="block size-22 overflow-hidden rounded-2xl bg-lilac-100">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL lampiran dinamis (object URL / storage) */}
      <img src={lampiran.url} alt={`Foto ${lampiran.nama_file}`} className="size-full object-cover" onError={() => setGagal(true)} />
    </a>
  );
}
