"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { IKON_KATEGORI } from "@/components/tiket/Badges";
import { Button } from "@/components/ui/Button";
import { LABEL_KATEGORI } from "@/lib/format";
import { deteksiKategori } from "@/lib/klasifikasi";
import { MediaPicker } from "./MediaPicker";

/** Aturan sama dengan KeluhanRequest di kontrak (minLength 10, maxLength 1000). */
const schema = z.object({
  deskripsi: z
    .string()
    .trim()
    .min(10, "Ceritakan masalahnya minimal 10 karakter.")
    .max(1000, "Maksimal 1000 karakter."),
});

export type KeluhanInput = { deskripsi: string; lampiran: File[] };

export function KeluhanForm({
  onSubmit,
  pending,
  serverError,
}: {
  onSubmit: (input: KeluhanInput) => void;
  pending: boolean;
  serverError: string | null;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { deskripsi: "" } });

  const deskripsi = useWatch({ control, name: "deskripsi" }) ?? "";
  // Petunjuk saja; kategori final ditentukan layanan AI Classification di server.
  const terdeteksi = deteksiKategori(deskripsi);
  const IkonKategori = terdeteksi ? IKON_KATEGORI[terdeteksi] : null;

  return (
    <form
      noValidate
      onSubmit={handleSubmit((v) => onSubmit({ deskripsi: v.deskripsi, lampiran: files }))}
      className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 rounded-3xl border border-line bg-white p-6 sm:p-8"
    >
      <div className="flex flex-col gap-2.5">
        <label htmlFor="deskripsi" className="font-display text-[22px] font-extrabold tracking-tight">
          Apa masalahnya?
        </label>
        <textarea
          id="deskripsi"
          rows={4}
          disabled={pending}
          placeholder="Contoh: lampu kamar mandi mati sejak pagi"
          aria-invalid={errors.deskripsi ? true : undefined}
          aria-describedby="deskripsi-info"
          className="resize-y rounded-2xl border-[1.5px] border-line-strong bg-[#fbfafe] px-4.5 py-4 text-base leading-relaxed text-navy placeholder:text-subtle aria-invalid:border-danger-dot"
          {...register("deskripsi")}
        />
        <div id="deskripsi-info" className="flex flex-wrap items-center justify-between gap-3">
          {errors.deskripsi ? (
            <span role="alert" className="text-sm font-semibold text-danger">
              {errors.deskripsi.message}
            </span>
          ) : terdeteksi && IkonKategori ? (
            <span className="flex items-center gap-2 rounded-full bg-lilac-100 py-1.5 pr-3 pl-2 text-[13px] font-semibold text-violet">
              <Sparkles className="size-4 text-violet-400" aria-hidden />
              Terdeteksi: {LABEL_KATEGORI[terdeteksi]}
              <IkonKategori className="size-3.5" aria-hidden />
            </span>
          ) : (
            <span />
          )}
          <span className="font-mono text-[13px] text-muted">{deskripsi.length}/1000</span>
        </div>
      </div>

      <MediaPicker files={files} onChange={setFiles} onError={setFileError} disabled={pending} />
      {fileError && (
        <p role="alert" className="-mt-4 text-sm font-semibold text-danger">
          {fileError}
        </p>
      )}

      {serverError && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
          {serverError}
        </p>
      )}

      <Button type="submit" size="lg" loading={pending} icon={<Send className="size-4.5" aria-hidden />} className="text-[17px]">
        {pending ? "Mengirim dan menganalisis…" : "Kirim laporan"}
      </Button>
    </form>
  );
}
