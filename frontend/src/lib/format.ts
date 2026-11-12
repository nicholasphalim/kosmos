import type { Kategori, StatusTiket, TiketRingkas, Urgensi } from "./api/types";

export const LABEL_KATEGORI: Record<Kategori, string> = {
  AC: "AC",
  listrik: "Listrik",
  air: "Air",
  lainnya: "Lainnya",
};

export const LABEL_STATUS: Record<StatusTiket, string> = {
  dibuat: "Dibuat",
  diklasifikasi: "Diklasifikasi",
  diproses: "Diproses",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

/** Prioritas yang ditampilkan: urgensi AI, atau "review" bila AI belum/ragu menilai. */
export type Prioritas = Urgensi | "review";

export const LABEL_PRIORITAS: Record<Prioritas, string> = {
  tinggi: "Tinggi",
  review: "Perlu review",
  sedang: "Sedang",
  rendah: "Rendah",
};

/** Urutan tampil di dashboard pemilik: paling mendesak di atas. */
export const URUTAN_PRIORITAS: Record<Prioritas, number> = {
  tinggi: 0,
  review: 1,
  sedang: 2,
  rendah: 3,
};

export function prioritasTiket(t: Pick<TiketRingkas, "urgensi" | "perlu_review">): Prioritas {
  if (t.urgensi === null) return "review";
  return t.urgensi;
}

/** Huruf avatar: "Pak Hendra" -> "H", "Bu Ani" -> "A". */
export function inisial(nama: string): string {
  return nama.replace(/^(pak|bu|ibu|bapak|mas|mbak)\s+/i, "").charAt(0).toUpperCase();
}

const jam = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });
const tanggalPendek = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const tanggalPanjang = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function samaHari(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

/** "10:00", "Kemarin", atau "10 Nov". */
export function waktuRelatif(iso: string, sekarang = new Date()): string {
  const d = new Date(iso);
  if (samaHari(d, sekarang)) return jam.format(d);
  const kemarin = new Date(sekarang);
  kemarin.setDate(sekarang.getDate() - 1);
  if (samaHari(d, kemarin)) return "Kemarin";
  return tanggalPendek.format(d);
}

/** "Hari ini, 10:00" atau "10 Nov, 21:03". */
export function waktuLengkap(iso: string, sekarang = new Date()): string {
  const d = new Date(iso);
  const hari = samaHari(d, sekarang) ? "Hari ini" : tanggalPendek.format(d);
  return `${hari}, ${jam.format(d)}`;
}

export function jamSaja(iso: string): string {
  return jam.format(new Date(iso));
}

export function tanggal(isoDate: string): string {
  return tanggalPanjang.format(new Date(isoDate));
}

export function ukuranFile(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`;
  return `${(byte / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDurasi(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}
