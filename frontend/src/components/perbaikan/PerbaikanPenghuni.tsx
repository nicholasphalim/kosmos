"use client";

import { clsx } from "clsx";
import { CalendarCheck, Check, HardHat, MessageCircle, Receipt, RotateCcw, ShieldCheck, Wallet } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/States";
import { useInvoice, useKonfirmasiJadwal, useKonfirmasiSelesai, useWorkOrderTiket } from "@/lib/api/hooks";
import type { WorkOrder } from "@/lib/api/types";
import { jadwal, rupiah } from "@/lib/format";
import { BuktiPerbaikan, LogServisTimeline, StatusInvoiceStiker, StatusWoStiker, SubJudul, TeknisiKartu, WoStepper } from "./Bagian";

function PilihJadwal({ wo }: { wo: WorkOrder }) {
  const [pilih, setPilih] = useState(wo.slot_jadwal[0] ?? "");
  const konfirmasi = useKonfirmasiJadwal();
  return (
    <form
      className="flex flex-col gap-4 rounded-[22px] bg-lavender/60 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        konfirmasi.mutate({ idWo: wo.id, jadwal: pilih });
      }}
    >
      <fieldset className="flex flex-col gap-3" disabled={konfirmasi.isPending}>
        <legend className="mb-1 flex flex-col gap-1">
          <span className="font-display text-lg font-extrabold tracking-tight">Kapan teknisi boleh datang?</span>
          <span className="text-sm text-navy-soft">{wo.teknisi.nama} juga akan menghubungimu lewat WhatsApp sebelum datang.</span>
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {wo.slot_jadwal.map((slot) => (
            <label
              key={slot}
              className={clsx(
                "flex cursor-pointer items-center gap-2.5 rounded-2xl border-2 bg-white px-3.5 py-3 text-sm font-bold transition-colors duration-200",
                pilih === slot ? "border-navy" : "border-transparent hover:border-violet-300",
              )}
            >
              <input type="radio" name="jadwal" value={slot} checked={pilih === slot} onChange={() => setPilih(slot)} className="accent-navy" />
              {jadwal(slot)}
            </label>
          ))}
        </div>
      </fieldset>
      {konfirmasi.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {konfirmasi.error.message}
        </p>
      )}
      <Button type="submit" size="lg" loading={konfirmasi.isPending} disabled={!pilih} icon={<CalendarCheck className="size-4.5" aria-hidden />} className="self-start">
        Konfirmasi jadwal
      </Button>
    </form>
  );
}

function KonfirmasiSelesai({ wo }: { wo: WorkOrder }) {
  const router = useRouter();
  const konfirmasi = useKonfirmasiSelesai();
  const [belum, setBelum] = useState(false);
  const [catatan, setCatatan] = useState("");
  const sedang = konfirmasi.isPending ? (konfirmasi.variables.selesai ? "ya" : "belum") : null;

  return (
    <div className="flex flex-col gap-4 rounded-[22px] bg-lavender/60 p-5">
      <span className="flex flex-col gap-1">
        <span className="font-display text-lg font-extrabold tracking-tight">Sudah beres?</span>
        <span className="text-sm text-navy-soft">Bukti dari {wo.teknisi.nama} sudah diverifikasi sistem. Cek dulu hasilnya di kamarmu.</span>
      </span>
      {belum ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            konfirmasi.mutate({ idWo: wo.id, selesai: false, catatan });
          }}
        >
          <label htmlFor="catatan-belum" className="text-sm font-bold">
            Apa yang masih bermasalah?
          </label>
          <textarea
            id="catatan-belum"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Contoh: lampu menyala tapi saklarnya masih longgar"
            className="w-full resize-none rounded-2xl border border-line-strong bg-white px-4 py-3 text-[15px] focus:border-violet-400 focus:shadow-[0_0_0_4px_#8a6ff029] focus:outline-none"
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={sedang === "belum"} disabled={sedang !== null} icon={<RotateCcw className="size-4" aria-hidden />}>
              Minta teknisi cek lagi
            </Button>
            <Button variant="ghost" onClick={() => setBelum(false)} disabled={sedang !== null}>
              Batal
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            className="flex-[1_1_220px]"
            loading={sedang === "ya"}
            disabled={sedang !== null}
            icon={<Check className="size-4.5" aria-hidden />}
            onClick={() =>
              konfirmasi.mutate(
                { idWo: wo.id, selesai: true },
                { onSuccess: (res) => res.invoice && router.push(`/penghuni/tagihan/${res.invoice.id}?baru=1`) },
              )
            }
          >
            Ya, sudah beres
          </Button>
          <Button size="lg" variant="outline" className="flex-[0_1_180px]" disabled={sedang !== null} onClick={() => setBelum(true)}>
            Belum beres
          </Button>
        </div>
      )}
      {konfirmasi.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {konfirmasi.error.message}
        </p>
      )}
    </div>
  );
}

function KartuTagihan({ idInvoice }: { idInvoice: number }) {
  const inv = useInvoice(idInvoice);
  if (!inv.data) return <Skeleton className="h-20" />;
  const lunas = inv.data.status === "lunas";
  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-[22px] bg-white/70 p-4.5">
      <Receipt className="size-10" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold">Tagihan perbaikan · {rupiah(inv.data.total)}</span>
        <span className="font-mono text-[13px] text-muted">{inv.data.kode}</span>
      </span>
      {lunas ? (
        <StatusInvoiceStiker status="lunas" />
      ) : (
        <ButtonLink href={`/penghuni/tagihan/${inv.data.id}`} icon={<Wallet className="size-4.5" aria-hidden />}>
          Bayar sekarang
        </ButtonLink>
      )}
    </div>
  );
}

/** Sisi penghuni proses Repair Verification: jadwal, progres, bukti, dan konfirmasi selesai. */
export function PerbaikanPenghuni({ idTiket, statusTiket }: { idTiket: number; statusTiket: string }) {
  const wo = useWorkOrderTiket(idTiket);

  if (wo.isPending) return <Skeleton className="h-48 rounded-3xl" />;
  if (!wo.data) {
    if (statusTiket !== "diklasifikasi") return null;
    return (
      <section className="panel flex items-center gap-4 p-6">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-lilac-100">
          <HardHat className="size-8" />
        </span>
        <p className="text-[15px] text-navy-soft">Pemilik sedang mencarikan teknisi terverifikasi. Kamu akan dikabari lewat WhatsApp saat teknisi ditugaskan.</p>
      </section>
    );
  }

  const w = wo.data;
  return (
    <>
      <section aria-labelledby="perbaikan-judul" className="panel flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-lilac-100">
              <HardHat className="size-8" />
            </span>
            <SubJudul>
              <span id="perbaikan-judul">Perbaikan</span>
            </SubJudul>
          </div>
          <StatusWoStiker status={w.status} />
        </div>

        {w.status !== "dibatalkan" && <WoStepper wo={w} />}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-white/70 p-4.5">
          <TeknisiKartu teknisi={w.teknisi} />
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <MessageCircle className="size-4" aria-hidden />
            {w.teknisi.no_wa}
          </span>
        </div>

        {w.status === "menunggu_jadwal" && <PilihJadwal wo={w} />}
        {w.status === "dijadwalkan" && w.jadwal_kunjungan && (
          <p className="flex items-center gap-3 rounded-[22px] bg-info-bg px-4.5 py-4 text-[15px] font-semibold text-info">
            <CalendarCheck className="size-6 shrink-0" aria-hidden />
            Teknisi datang {jadwal(w.jadwal_kunjungan)}. Pastikan ada yang membukakan pintu.
          </p>
        )}

        {(w.bukti_sebelum || w.bukti_sesudah) && (
          <div className="flex flex-col gap-3">
            <h4 className="flex items-center gap-2 font-bold">
              <ShieldCheck className="size-5" aria-hidden />
              Bukti perbaikan
            </h4>
            <BuktiPerbaikan wo={w} />
          </div>
        )}

        {w.status === "menunggu_konfirmasi" && <KonfirmasiSelesai wo={w} />}
        {w.id_invoice !== null && <KartuTagihan idInvoice={w.id_invoice} />}

        <details className="rounded-2xl border border-line-soft px-4.5 py-3.5" open={w.status === "dikerjakan"}>
          <summary className="cursor-pointer text-[15px] font-bold">Progres servis ({w.log.length})</summary>
          <div className="mt-4">
            <LogServisTimeline log={w.log} />
          </div>
        </details>
      </section>
    </>
  );
}
