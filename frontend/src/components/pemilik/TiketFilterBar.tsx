"use client";

import { clsx } from "clsx";
import { Search } from "lucide-react";
import { prioritasDot } from "@/components/tiket/Badges";
import type { FilterUrgensi, TabPemilik } from "@/lib/tiketFilter";
import { TAB_PEMILIK } from "@/lib/tiketFilter";

const URGENSI: Array<{ id: FilterUrgensi; label: string }> = [
  { id: "semua", label: "Semua" },
  { id: "tinggi", label: "Tinggi" },
  { id: "sedang", label: "Sedang" },
  { id: "rendah", label: "Rendah" },
];

type Props = {
  tab: TabPemilik;
  urgensi: FilterUrgensi;
  cari: string;
  jumlah: Record<TabPemilik, number>;
  onTab: (t: TabPemilik) => void;
  onUrgensi: (u: FilterUrgensi) => void;
  onCari: (s: string) => void;
};

export function TiketFilterBar({ tab, urgensi, cari, jumlah, onTab, onUrgensi, onCari }: Props) {
  return (
    <div className="flex flex-col gap-4 px-6 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Saring status" className="flex flex-wrap gap-1 rounded-[14px] bg-lilac-50 p-1">
          {TAB_PEMILIK.map((t) => {
            const aktif = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={aktif}
                onClick={() => onTab(t.id)}
                className={clsx(
                  "flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-3.5 text-sm font-bold",
                  aktif ? "bg-white text-navy shadow-[0_1px_3px_rgba(18,39,90,0.12)]" : "text-muted hover:text-navy",
                )}
              >
                {t.label}
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-px font-mono text-xs",
                    aktif ? "bg-navy text-white" : "bg-line text-navy",
                  )}
                >
                  {jumlah[t.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4.5 text-muted" aria-hidden />
          <label htmlFor="cari-tiket" className="sr-only">
            Cari tiket
          </label>
          <input
            id="cari-tiket"
            type="search"
            value={cari}
            onChange={(e) => onCari(e.target.value)}
            placeholder="Cari unit atau nama"
            className="h-11 w-[230px] rounded-xl border-[1.5px] border-line bg-white pr-3.5 pl-10 text-[15px] text-navy placeholder:text-subtle"
          />
        </div>
      </div>

      <div role="group" aria-label="Saring prioritas" className="flex flex-wrap gap-2 border-b border-line-soft pb-4">
        {URGENSI.map((u) => {
          const aktif = u.id === urgensi;
          return (
            <button
              key={u.id}
              type="button"
              aria-pressed={aktif}
              onClick={() => onUrgensi(u.id)}
              className={clsx(
                "flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[13px] font-bold",
                aktif ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-line-strong",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "size-2 rounded-full",
                  u.id === "semua" ? (aktif ? "bg-lavender" : "bg-violet-400") : prioritasDot(u.id),
                )}
              />
              {u.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
