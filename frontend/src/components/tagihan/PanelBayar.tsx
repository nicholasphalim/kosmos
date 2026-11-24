"use client";

import { clsx } from "clsx";
import { Building, Check, CreditCard, ShieldCheck, TriangleExclamationPoint, Wallet, type IkonKosmos } from "@/components/icons";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useBayarInvoice } from "@/lib/api/hooks";
import type { Invoice, MetodePembayaran, Pembayaran } from "@/lib/api/types";
import { config } from "@/lib/config";
import { LABEL_METODE, rupiah, waktuLengkap } from "@/lib/format";

const METODE: Array<{ id: MetodePembayaran; ket: string; ikon: IkonKosmos }> = [
  { id: "qris", ket: "Scan dari aplikasi bank atau e-wallet", ikon: CreditCard },
  { id: "va_bca", ket: "Transfer lewat m-BCA atau ATM", ikon: Building },
  { id: "va_mandiri", ket: "Transfer lewat Livin' atau ATM", ikon: Building },
  { id: "gopay", ket: "Bayar dengan saldo GoPay", ikon: Wallet },
];

type PropsUmum = {
  total: number;
  /** Diisi bila tagihan sudah lunas. */
  lunas: { dibayar_at: string | null; pembayaran: Pembayaran | undefined } | null;
  isPending: boolean;
  /** Alasan gagal dari gateway pada percobaan terakhir. */
  gagal: string | null;
  error: string | null;
  onBayar: (metode: MetodePembayaran, simulasiGagal: boolean) => void;
  judul?: string;
  catatan?: string;
};

/** Set Metode Pembayaran + Process Payment (payment gateway mock), dipakai invoice, bayar sekaligus, dan sewa. */
export function PanelBayarUmum({ total, lunas, isPending, gagal, error, onBayar, judul = "Bayar tagihan", catatan }: PropsUmum) {
  const [metode, setMetode] = useState<MetodePembayaran>("qris");
  const [simulasiGagal, setSimulasiGagal] = useState(false);

  if (lunas) {
    const p = lunas.pembayaran;
    return (
      <aside aria-labelledby="bayar-judul" className="flex min-w-0 flex-[1_1_320px] flex-col items-center gap-4 rounded-[28px] bg-lavender px-6 py-9 text-center text-navy">
        <span aria-hidden className="flex size-18 items-center justify-center rounded-3xl bg-navy">
          <Check className="size-9" />
        </span>
        <h2 id="bayar-judul" className="display text-[clamp(2rem,4vw,2.75rem)]">
          Lunas
        </h2>
        <p className="text-[15px] text-navy-soft">
          {rupiah(total)} dibayar
          {p && ` lewat ${LABEL_METODE[p.metode]}`}
          {lunas.dibayar_at && `, ${waktuLengkap(lunas.dibayar_at)}`}. Bukti bayar sudah dikirim ke WhatsApp.
        </p>
        {p && <span className="font-mono text-xs text-muted">Ref gateway {p.ref_gateway}</span>}
      </aside>
    );
  }

  return (
    <aside aria-labelledby="bayar-judul" className="panel flex min-w-0 flex-[1_1_320px] flex-col gap-5 p-6 sm:p-7">
      <div className="flex flex-col gap-1">
        <h2 id="bayar-judul" className="font-display text-xl font-extrabold tracking-tight">
          {judul}
        </h2>
        <p className="text-sm text-muted">{catatan ?? "Diproses lewat payment gateway. Kosmos tidak menyimpan data kartu atau rekeningmu."}</p>
      </div>

      {gagal && (
        <p role="alert" className="flex items-start gap-2.5 rounded-2xl bg-danger-bg px-4 py-3.5 text-sm font-semibold text-danger">
          <TriangleExclamationPoint className="size-4.5 shrink-0" aria-hidden />
          Pembayaran gagal: {gagal}. Pilih metode lain atau coba lagi.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <fieldset disabled={isPending} className="flex flex-col gap-2.5">
        <legend className="mb-2 text-sm font-bold">Metode pembayaran</legend>
        {METODE.map((m) => (
          <label
            key={m.id}
            className={clsx(
              "flex cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white px-3.5 py-3 transition-colors duration-200",
              metode === m.id ? "border-navy" : "border-transparent hover:border-violet-300",
            )}
          >
            <input type="radio" name="metode" value={m.id} checked={metode === m.id} onChange={() => setMetode(m.id)} className="accent-navy" />
            <m.ikon className="size-8 shrink-0" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-bold">{LABEL_METODE[m.id]}</span>
              <span className="text-[13px] text-muted">{m.ket}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {config.apiMode === "mock" && (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-dashed border-line-strong px-3.5 py-2.5 text-[13px] text-navy-soft">
          <input type="checkbox" checked={simulasiGagal} onChange={(e) => setSimulasiGagal(e.target.checked)} className="size-4 accent-navy" />
          Demo: simulasikan pembayaran gagal di payment gateway
        </label>
      )}

      <Button size="lg" loading={isPending} icon={<ShieldCheck className="size-4.5" aria-hidden />} onClick={() => onBayar(metode, simulasiGagal)}>
        {isPending ? "Menghubungi payment gateway…" : `Bayar ${rupiah(total)}`}
      </Button>
    </aside>
  );
}

/** Panel bayar satu invoice perbaikan (pemilik). */
export function PanelBayar({ invoice }: { invoice: Invoice }) {
  const bayar = useBayarInvoice();
  return (
    <PanelBayarUmum
      total={invoice.total}
      lunas={invoice.status === "lunas" ? { dibayar_at: invoice.dibayar_at, pembayaran: invoice.pembayaran.findLast((p) => p.status === "berhasil") } : null}
      isPending={bayar.isPending}
      gagal={bayar.data?.hasil === "gagal" ? bayar.data.alasan : null}
      error={bayar.error?.message ?? null}
      onBayar={(metode, simulasiGagal) => bayar.mutate({ idInvoice: invoice.id, metode, simulasiGagal })}
    />
  );
}
