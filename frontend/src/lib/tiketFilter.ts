import type { StatusTiket, TiketRingkas, Urgensi } from "./api/types";
import { prioritasTiket, URUTAN_PRIORITAS } from "./format";

/** Tab dashboard pemilik. "aksi" = tiket yang menunggu keputusan pemilik. */
export type TabPemilik = "aksi" | "diproses" | "selesai" | "dibatalkan";
export type FilterUrgensi = "semua" | Urgensi;

export const TAB_PEMILIK: Array<{ id: TabPemilik; label: string }> = [
  { id: "aksi", label: "Perlu tindakan" },
  { id: "diproses", label: "Diproses" },
  { id: "dibatalkan", label: "Dibatalkan" },
];

export function tabDariStatus(status: StatusTiket): TabPemilik {
  return status === "dibuat" || status === "diklasifikasi" ? "aksi" : status;
}

export function filterTiketPemilik(
  tiket: TiketRingkas[],
  f: { tab: TabPemilik; urgensi: FilterUrgensi; cari: string },
): TiketRingkas[] {
  const cari = f.cari.trim().toLowerCase();
  return tiket
    .filter((t) => tabDariStatus(t.status) === f.tab)
    .filter((t) => f.urgensi === "semua" || t.urgensi === f.urgensi)
    .filter(
      (t) =>
        !cari ||
        [t.unit.nomor_unit, t.unit.nama_properti, t.penghuni.nama, t.judul, t.kode].some((s) =>
          s.toLowerCase().includes(cari),
        ),
    )
    .sort(
      (a, b) =>
        URUTAN_PRIORITAS[prioritasTiket(a)] - URUTAN_PRIORITAS[prioritasTiket(b)] ||
        b.created_at.localeCompare(a.created_at),
    );
}

export function hitungPerTab(tiket: TiketRingkas[]): Record<TabPemilik, number> {
  const hasil: Record<TabPemilik, number> = { aksi: 0, diproses: 0, selesai: 0, dibatalkan: 0 };
  for (const t of tiket) hasil[tabDariStatus(t.status)]++;
  return hasil;
}
