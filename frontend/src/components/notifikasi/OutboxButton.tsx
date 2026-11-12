"use client";

import { MessageCircle, X } from "lucide-react";
import { useRef } from "react";
import type { Pengguna } from "@/lib/api/types";
import { useOutbox } from "./useOutbox";
import { WhatsAppPhone } from "./WhatsAppPhone";

/** Tombol header + dialog berisi outbox WhatsApp (simulasi) milik pengguna. */
export function OutboxButton({ pengguna }: { pengguna: Pengguna }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { pesan, belumDibaca, tandaiDibaca } = useOutbox(pengguna.id);

  function buka() {
    dialogRef.current?.showModal();
    tandaiDibaca();
  }

  return (
    <>
      <button
        type="button"
        onClick={buka}
        aria-label={belumDibaca ? `Pesan WhatsApp, ${belumDibaca} baru` : "Pesan WhatsApp"}
        className="relative flex size-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-white text-navy hover:bg-lilac-50"
      >
        <MessageCircle className="size-5" aria-hidden />
        {belumDibaca > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-violet px-1 text-[11px] font-bold text-white">
            {belumDibaca}
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="outbox-judul"
        className="m-auto w-[min(380px,calc(100vw-32px))] bg-transparent p-0"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-2.5">
            <h2 id="outbox-judul" className="font-display text-lg font-extrabold tracking-tight">
              WhatsApp Outbox
            </h2>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-lavender px-2.5 py-1 text-xs font-bold">Simulasi</span>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Tutup"
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-lilac-100"
              >
                <X className="size-4.5" aria-hidden />
              </button>
            </span>
          </div>
          <WhatsAppPhone pesan={pesan} namaPenerima={pengguna.nama} />
        </div>
      </dialog>
    </>
  );
}
