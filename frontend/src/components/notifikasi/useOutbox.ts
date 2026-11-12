"use client";

import { useState } from "react";
import { useNotifikasi } from "@/lib/api/hooks";

const key = (idPengguna: number) => `kosmos.outbox.dibaca.${idPengguna}`;

function bacaTerakhir(idPengguna: number): number {
  try {
    return Number(localStorage.getItem(key(idPengguna)) ?? 0);
  } catch {
    return 0;
  }
}

/** Outbox WhatsApp milik pengguna + jumlah pesan yang belum dibuka. */
export function useOutbox(idPengguna: number) {
  const query = useNotifikasi();
  const [terakhirDibaca, setTerakhirDibaca] = useState(() => bacaTerakhir(idPengguna));
  const pesan = query.data ?? [];
  const belumDibaca = pesan.filter((p) => p.id > terakhirDibaca).length;

  function tandaiDibaca() {
    const maks = pesan.reduce((m, p) => Math.max(m, p.id), 0);
    setTerakhirDibaca(maks);
    try {
      localStorage.setItem(key(idPengguna), String(maks));
    } catch {
      /* abaikan */
    }
  }

  return { ...query, pesan, belumDibaca, tandaiDibaca };
}
