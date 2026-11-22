"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AstronotAvatar } from "@/components/brand/AstronotAvatar";
import { LoaderCircle, Send } from "@/components/icons";
import { KategoriTile, PrioritasBadge } from "@/components/tiket/Badges";
import type { KlasifikasiResponse } from "@/lib/api/types";
import { LABEL_KATEGORI } from "@/lib/format";
import { deteksiKategori, klasifikasiKeyword } from "@/lib/klasifikasi";
import { BalonWhatsApp } from "@/components/notifikasi/BalonWhatsApp";

const CONTOH = ["Stop kontak memercikkan api", "Keran kamar mandi bocor terus", "AC tidak dingin sejak kemarin", "Engsel pintu lemari lepas"];

type Hasil = KlasifikasiResponse & { perluTinjau: boolean };

/** Demo langsung memakai aturan klasifikasi yang sama dengan mode mock prototype. Tidak ada data yang dikirim. */
export function CobaLaporan() {
  const [teks, setTeks] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  function nilai(isi: string) {
    if (timer.current) window.clearTimeout(timer.current);
    setGalat(null);
    setHasil(null);
    setProses(true);
    timer.current = window.setTimeout(() => {
      setHasil({ ...klasifikasiKeyword(isi, 0), perluTinjau: deteksiKategori(isi) === null });
      setProses(false);
    }, 850);
  }

  function kirim(e: FormEvent) {
    e.preventDefault();
    const isi = teks.trim();
    if (isi.length < 10) return setGalat("Ceritakan masalahnya minimal 10 karakter.");
    nilai(isi);
  }

  const darurat = hasil?.urgensi === "tinggi" && !hasil.perluTinjau;

  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-2">
      <form onSubmit={kirim} noValidate className="flex flex-col gap-5 rounded-[28px] bg-white p-6 shadow-[0_30px_60px_-40px_#24124f] sm:p-8">
        <label htmlFor="coba-kerusakan" className="text-xl font-semibold">
          Apa yang rusak di kamarmu?
        </label>
        <textarea
          id="coba-kerusakan"
          rows={3}
          value={teks}
          maxLength={200}
          onChange={(e) => {
            setTeks(e.target.value);
            setGalat(null);
          }}
          placeholder="Contoh: lampu kamar mandi mati sejak pagi"
          aria-invalid={galat ? true : undefined}
          aria-describedby={galat ? "coba-galat" : undefined}
          className="resize-none rounded-2xl border border-line-strong bg-paper px-4 py-3.5 text-base leading-relaxed text-plum transition-[border-color,box-shadow] duration-200 placeholder:text-subtle focus:border-violet-400 focus:shadow-[0_0_0_4px_#8a6ff029] focus:outline-none aria-invalid:border-danger-dot"
        />
        {galat && (
          <p id="coba-galat" role="alert" className="-mt-2 text-sm font-semibold text-danger">
            {galat}
          </p>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Contoh laporan">
          {CONTOH.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setTeks(c);
                nilai(c);
              }}
              className="min-h-9 cursor-pointer rounded-full border border-plum/15 px-3.5 py-1.5 text-left text-[13px] font-medium text-plum transition-colors duration-200 hover:border-violet hover:bg-lilac-100"
            >
              {c}
            </button>
          ))}
        </div>
        <button type="submit" disabled={proses} className="btn-primary mt-auto inline-flex h-13 cursor-pointer items-center justify-center gap-2 rounded-full px-6 font-semibold transition-transform duration-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70">
          {proses ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}
          {proses ? "Sedang menilai…" : "Nilai laporan ini"}
        </button>
      </form>

      <div aria-live="polite" className="relative flex min-h-[430px] flex-col justify-center overflow-hidden rounded-[28px] bg-plum p-5 text-white sm:p-7">
        {!hasil && !proses && (
          <div className="tukar mx-auto flex max-w-[300px] flex-col items-center gap-4 text-center">
            <AstronotAvatar suasana="senang" className="size-24" />
            <p className="text-lg font-semibold">Tulis kerusakannya, nanti aku nilai.</p>
          </div>
        )}
        {proses && (
          <div className="mx-auto flex flex-col items-center gap-4 text-center">
            <AstronotAvatar suasana="senang" className="size-24 animate-bounce" />
            <p className="text-lg font-semibold">Membaca laporanmu…</p>
          </div>
        )}
        {hasil && (
          <div className="tukar flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <AstronotAvatar suasana={darurat ? "sedih" : "senang"} className="size-16 shrink-0" />
              <p className="sapa-stiker">{hasil.perluTinjau ? "Perlu dicek manusia" : darurat ? "Waduh, ini darurat!" : "Sudah kebaca!"}</p>
            </div>

            <article className="tiket-hasil">
              <div className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="tracked text-muted">Tiket baru</span>
                  <PrioritasBadge prioritas={hasil.perluTinjau ? "review" : hasil.urgensi} />
                </div>
                <div className="flex items-center gap-3">
                  <KategoriTile kategori={hasil.kategori} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted">{LABEL_KATEGORI[hasil.kategori]}</p>
                    <p className="text-lg leading-snug font-semibold break-words">{hasil.judul}</p>
                  </div>
                </div>
              </div>
              <span aria-hidden className="tiket-sobek" />
              <p className="px-4 py-3 text-sm leading-relaxed text-navy-soft">{hasil.alasan}</p>
            </article>

            <BalonWhatsApp
              penerima="pemilik"
              pesan={`${hasil.perluTinjau ? "Laporan baru perlu ditinjau." : `${LABEL_KATEGORI[hasil.kategori]} · prioritas ${hasil.urgensi}.`} ${hasil.judul}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
