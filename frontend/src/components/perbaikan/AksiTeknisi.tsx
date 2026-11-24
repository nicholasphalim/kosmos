"use client";

import { clsx } from "clsx";
import { Camera, Check, House, MessageCircle, Send, ShieldCheck, Wrench, X } from "@/components/icons";
import { useEffect, useId, useMemo, useState } from "react";
import { validasiFile } from "@/components/keluhan/MediaPicker";
import { Button } from "@/components/ui/Button";
import { useCatatLog, useUnggahBukti } from "@/lib/api/hooks";
import type { WorkOrder } from "@/lib/api/types";
import { jadwal, rupiah } from "@/lib/format";
import { HasilVerifikasi, SubJudul } from "./Bagian";

function FotoSlot({ label, file, onChange, onError }: { label: string; file: File | null; onChange: (f: File | null) => void; onError: (p: string | null) => void }) {
  const id = useId();
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold">{label}</span>
      {preview ? (
        <div className="relative aspect-square overflow-hidden rounded-[18px] bg-lilac-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau object URL lokal */}
          <img src={preview} alt={`Pratinjau foto ${label.toLowerCase()}`} className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Hapus foto ${label.toLowerCase()}`}
            className="absolute top-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-navy"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-violet-300 bg-white/60 text-sm font-bold text-violet transition-colors duration-200 focus-within:outline-3 focus-within:outline-violet-400 hover:bg-lilac-100"
        >
          <Camera className="size-8" aria-hidden />
          Ambil foto
          <input
            id={id}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label={`Foto ${label.toLowerCase()}`}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (!f) return;
              const salah = validasiFile(f) ?? (f.type.startsWith("image/") ? null : `${f.name}: bukti harus berupa foto.`);
              onError(salah);
              if (!salah) onChange(f);
            }}
          />
        </label>
      )}
    </div>
  );
}

function FormBukti({ wo }: { wo: WorkOrder }) {
  const unggah = useUnggahBukti();
  const [sebelum, setSebelum] = useState<File | null>(null);
  const [sesudah, setSesudah] = useState<File | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const ditolak = wo.verifikasi && !wo.verifikasi.valid ? wo.verifikasi : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sebelum || !sesudah) return setGalat("Lengkapi foto sebelum dan sesudah perbaikan.");
        unggah.mutate({ idWo: wo.id, sebelum, sesudah }, { onSuccess: (r) => r.verifikasi.valid || (setSebelum(null), setSesudah(null)) });
      }}
    >
      <div className="flex flex-col gap-1">
        <SubJudul>Unggah bukti perbaikan</SubJudul>
        <p className="text-sm text-navy-soft">Foto kondisi sebelum dan sesudah. Sistem memeriksa kelengkapan dan keaslian foto sebelum penghuni diminta konfirmasi.</p>
      </div>
      {ditolak && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-danger-bg p-4">
          <span className="text-sm font-bold text-danger">Bukti sebelumnya ditolak. Unggah ulang:</span>
          <HasilVerifikasi verifikasi={ditolak} />
        </div>
      )}
      <fieldset disabled={unggah.isPending} className="grid grid-cols-2 gap-3">
        <FotoSlot label="Sebelum" file={sebelum} onChange={setSebelum} onError={setGalat} />
        <FotoSlot label="Sesudah" file={sesudah} onChange={setSesudah} onError={setGalat} />
      </fieldset>
      {(galat ?? unggah.error?.message) && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {galat ?? unggah.error?.message}
        </p>
      )}
      <Button type="submit" size="lg" loading={unggah.isPending} icon={<ShieldCheck className="size-4.5" aria-hidden />}>
        {unggah.isPending ? "Memverifikasi bukti…" : "Kirim bukti"}
      </Button>
    </form>
  );
}

function FormCatatan({ wo }: { wo: WorkOrder }) {
  const log = useCatatLog();
  const [catatan, setCatatan] = useState("");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        log.mutate({ idWo: wo.id, aktivitas: "catatan", catatan }, { onSuccess: () => setCatatan("") });
      }}
    >
      <label htmlFor="catatan-teknisi" className="text-sm font-bold">
        Catatan servis
      </label>
      <div className="flex gap-2">
        <input
          id="catatan-teknisi"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          maxLength={300}
          placeholder="Contoh: ganti saklar, kabel masih bagus"
          className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-white px-4 text-[15px] focus:border-violet-400 focus:shadow-[0_0_0_4px_#8a6ff029] focus:outline-none"
        />
        <Button type="submit" variant="outline" loading={log.isPending} disabled={!catatan.trim()} aria-label="Simpan catatan" className="w-11 px-0!" icon={log.isPending ? undefined : <Send className="size-4" aria-hidden />} />
      </div>
      {log.error && <p className="text-sm font-semibold text-danger">{log.error.message}</p>}
    </form>
  );
}

/** Aksi teknisi sesuai status work order (Add Log Servis, unggah bukti). */
export function AksiTeknisi({ wo }: { wo: WorkOrder }) {
  const log = useCatatLog();
  const sudahMulai = wo.log.some((l) => l.aktivitas === "mulai");
  const sedang = log.isPending ? log.variables.aktivitas : null;

  if (wo.status === "menunggu_jadwal") {
    return (
      <div className="flex items-start gap-3.5 rounded-[22px] bg-lavender/60 p-5">
        <MessageCircle className="size-7 shrink-0" aria-hidden />
        <p className="text-[15px] text-navy-soft">
          Hubungi {wo.penghuni.nama} lewat WhatsApp untuk menyepakati waktu. Penghuni memilih jadwal di Kosmos, lalu kamu dikabari.
        </p>
      </div>
    );
  }

  if (wo.status === "dijadwalkan") {
    return (
      <div className="flex flex-col gap-4 rounded-[22px] bg-lavender/60 p-5">
        <p className="text-[15px] text-navy-soft">
          Jadwal: <b className="text-navy">{wo.jadwal_kunjungan && jadwal(wo.jadwal_kunjungan)}</b>. Tunjukkan identitas Kosmos saat tiba di unit.
        </p>
        <Button size="lg" loading={sedang === "tiba"} icon={<House className="size-4.5" aria-hidden />} className="self-start" onClick={() => log.mutate({ idWo: wo.id, aktivitas: "tiba" })}>
          Saya sudah tiba
        </Button>
        {log.error && <p className="text-sm font-semibold text-danger">{log.error.message}</p>}
      </div>
    );
  }

  if (wo.status === "dikerjakan") {
    return (
      <div className="flex flex-col gap-6">
        {!sudahMulai && (
          <div className="flex flex-col gap-2">
            <Button size="lg" loading={sedang === "mulai"} icon={<Wrench className="size-4.5" aria-hidden />} className="self-start" onClick={() => log.mutate({ idWo: wo.id, aktivitas: "mulai" })}>
              Mulai perbaikan
            </Button>
            {log.error && <p className="text-sm font-semibold text-danger">{log.error.message}</p>}
          </div>
        )}
        {wo.log.at(-1)?.aktivitas === "belum_beres" && (
          <p role="alert" className="rounded-2xl bg-warn-bg px-4.5 py-3.5 text-sm font-semibold text-warn">
            Penghuni menandai belum beres{wo.log.at(-1)?.catatan ? `: “${wo.log.at(-1)?.catatan}”` : "."} Perbaiki lalu unggah bukti baru.
          </p>
        )}
        <FormCatatan wo={wo} />
        <div className={clsx("border-t border-line-soft pt-6", !sudahMulai && "opacity-60")}>
          <FormBukti wo={wo} />
        </div>
      </div>
    );
  }

  if (wo.status === "menunggu_konfirmasi") {
    return (
      <p className="flex items-center gap-3 rounded-[22px] bg-info-bg px-4.5 py-4 text-[15px] font-semibold text-info">
        <ShieldCheck className="size-6 shrink-0" aria-hidden />
        Bukti terverifikasi. Menunggu {wo.penghuni.nama} mengonfirmasi perbaikan selesai.
      </p>
    );
  }

  if (wo.status === "selesai") {
    return (
      <p className="flex items-center gap-3 rounded-[22px] bg-ok-bg px-4.5 py-4 text-[15px] font-semibold text-ok">
        <Check className="size-6 shrink-0" aria-hidden />
        Selesai. Pembayaran {rupiah(wo.biaya_final)} diteruskan ke kamu setelah penghuni membayar, dipotong komisi Kosmos.
      </p>
    );
  }

  return <p className="text-[15px] text-navy-soft">Work order ini dibatalkan.</p>;
}
