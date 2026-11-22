"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { Check, X } from "@/components/icons";

const BARIS = [
  { topik: "Keluhan", tanpa: "Tenggelam di chat pribadi", dengan: "Jadi tiket dengan status jelas" },
  { topik: "Prioritas", tanpa: "Semua terasa sama pentingnya", dengan: "Yang darurat naik duluan" },
  { topik: "Kabar", tanpa: "Penghuni harus menagih kabar", dengan: "Update otomatis lewat WhatsApp" },
];

export function SebelumSesudah() {
  const [kosmos, setKosmos] = useState(true);
  return (
    <div className="flex max-w-[600px] flex-col gap-5">
      <div role="group" aria-label="Bandingkan cara mengurus kos" className="relative grid w-full max-w-[380px] grid-cols-2 rounded-full bg-lilac-100 p-1">
        <span aria-hidden className={clsx("absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-plum transition-transform duration-500 ease-out-expo", kosmos && "translate-x-full")} />
        {[
          { nilai: false, label: "Cara lama" },
          { nilai: true, label: "Dengan Kosmos" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={kosmos === o.nilai}
            onClick={() => setKosmos(o.nilai)}
            className={clsx("relative h-11 cursor-pointer rounded-full text-sm font-semibold transition-colors duration-300", kosmos === o.nilai ? "text-white" : "text-plum")}
          >
            {o.label}
          </button>
        ))}
      </div>
      <ul>
        {BARIS.map((b, i) => (
          <li key={b.topik} className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 border-t border-plum/15 py-4 sm:grid-cols-[120px_minmax(0,1fr)]">
            <span className="tracked text-violet">{b.topik}</span>
            <span key={String(kosmos)} className="tukar flex items-center gap-3 font-medium" style={{ animationDelay: `${i * 70}ms` }}>
              {kosmos ? <Check className="size-5" /> : <X className="size-5 opacity-60 grayscale" />}
              <span className={kosmos ? "text-plum" : "text-subtle line-through decoration-plum/30"}>{kosmos ? b.dengan : b.tanpa}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
