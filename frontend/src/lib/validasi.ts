/**
 * Aturan validasi input yang mengikuti dunia nyata, sama dengan backend/app/core/validasi.py.
 * Dipakai mock service (mode mock) dan form (pesan cepat sebelum request dikirim).
 * Setiap fungsi mengembalikan pesan galat, atau null bila valid.
 */

const TANDA_NAMA = " .'-";
const MIN_HURUF_TEKS = 3;
const MAKS_HARI_MULAI_DEPAN = 365;
const MAKS_TAHUN_SEWA = 5;

const huruf = (c: string) => /\p{L}/u.test(c);

/** Spasi berlebih dirapikan, seperti di backend. */
export function rapikanNama(nama: string): string {
  return nama.trim().split(/\s+/).join(" ");
}

export function galatNama(namaMentah: string): string | null {
  const nama = rapikanNama(namaMentah);
  if (nama.length < 2 || nama.length > 100) return "Nama harus 2 sampai 100 karakter.";
  if (!huruf(nama[0]) || ![...nama].every((c) => huruf(c) || TANDA_NAMA.includes(c))) {
    return "Nama hanya boleh berisi huruf, spasi, titik, tanda petik, atau tanda hubung.";
  }
  if ([...nama].filter(huruf).length < 2) return "Nama minimal 2 huruf.";
  return null;
}

/** Nomor HP Indonesia (+62, 62, atau 08), 10-13 digit -> "0812-3456-7890", atau null bila tidak valid. */
export function normalisasiNoWa(noWa: string): string | null {
  let angka = noWa.replace(/[\s\-.()]/g, "");
  if (angka.startsWith("+62")) angka = "0" + angka.slice(3);
  else if (angka.startsWith("62")) angka = "0" + angka.slice(2);
  if (!/^08\d{8,11}$/.test(angka)) return null;
  return `${angka.slice(0, 4)}-${angka.slice(4, 8)}-${angka.slice(8)}`;
}

export const GALAT_NO_WA = "Nomor WhatsApp harus nomor HP Indonesia, contoh 0812-3456-7890.";

function geserHari(iso: string, hari: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

function geserTahun(iso: string, tahun: number): string {
  const [th, bl, tg] = iso.split("-").map(Number);
  const hari = bl === 2 && tg === 29 ? 28 : tg; // 29 Februari
  return `${th + tahun}-${String(bl).padStart(2, "0")}-${String(hari).padStart(2, "0")}`;
}

/**
 * Tanggal hari ini (WIB) dalam format YYYY-MM-DD, seperti `today()` di backend.
 * Jangan pakai `new Date().toISOString()`: itu tanggal UTC, yang tertinggal sehari antara pukul 00.00 dan 07.00 WIB.
 */
export function hariIniWib(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Periode sewa baru: selesai setelah mulai, belum berakhir, mulai paling lambat 1 tahun lagi, maks. 5 tahun. */
export function galatPeriodeSewa(mulai: string, selesai: string, hariIni = hariIniWib()): string | null {
  if (!mulai || !selesai || selesai <= mulai) return "Tanggal selesai sewa harus setelah tanggal mulai.";
  if (selesai < hariIni) return "Periode sewa sudah berakhir. Masukkan sewa yang masih berjalan atau akan datang.";
  if (mulai > geserHari(hariIni, MAKS_HARI_MULAI_DEPAN)) return "Sewa paling lambat dimulai 1 tahun dari hari ini.";
  if (selesai > geserTahun(mulai, MAKS_TAHUN_SEWA)) return `Periode sewa maksimal ${MAKS_TAHUN_SEWA} tahun.`;
  return null;
}

/** Teks bebas harus berisi kata, bukan hanya angka atau tanda baca. */
export function teksBermakna(teks: string, minHuruf = MIN_HURUF_TEKS): boolean {
  return [...teks].filter(huruf).length >= minHuruf;
}
