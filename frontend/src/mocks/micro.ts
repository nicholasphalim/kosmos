/**
 * Layer Microservice (D1 slide 21): satu logika bisnis spesifik, stateless, bisa berubah mandiri.
 *
 *   Technician Matching    matchTeknisi
 *   Cost Estimation        estimasiBiaya
 *   Evidence Verification  verifikasiBukti
 *   Commission Calculation hitungKomisi
 *
 * Modul ini tidak membaca database. Semua data masuk lewat argumen dari Task,
 * jadi aturan yang sama dipakai seed data maupun orkestrasi di services.ts.
 */
import type { Kategori, KandidatTeknisi, RincianBiaya, TeknisiRingkas, Urgensi, VerifikasiBukti } from "@/lib/api/types";

type Titik = { lat: number; lng: number };

/** Jarak garis lurus (haversine), dibulatkan 1 desimal. */
export function jarakKm(a: Titik, b: Titik): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

const km = (n: number) => `${n.toFixed(1).replace(".", ",")} km`;

/* ===================================================================== */
/* Technician Matching                                                    */
/* ===================================================================== */

export const KAPASITAS_TEKNISI = 2;

export type CalonTeknisi = {
  teknisi: TeknisiRingkas;
  tersedia: boolean;
  jarak_km: number;
  /** Jumlah work order aktif yang sedang dipegang. */
  beban: number;
  /** Alasan teknisi ini tidak boleh dipilih lagi untuk tiket ini (mis. estimasinya ditolak pemilik). */
  dikecualikan?: string;
};

/**
 * Match Teknisi: filter (keahlian, terverifikasi, tersedia, kapasitas) lalu ranking.
 * Urgensi tinggi memberi bobot jarak lebih besar karena teknisi harus cepat tiba.
 */
export function matchTeknisi(kategori: Kategori, urgensi: Urgensi, calon: CalonTeknisi[]): KandidatTeknisi[] {
  const bobotJarak = urgensi === "tinggi" ? 0.7 : 0.5;
  const hasil = calon.map((c): KandidatTeknisi => {
    const t = c.teknisi;
    const tolak = (alasan: string): KandidatTeknisi => ({ teknisi: t, tersedia: c.tersedia, jarak_km: c.jarak_km, lolos: false, skor: null, alasan });
    if (c.dikecualikan) return tolak(c.dikecualikan);
    if (!t.keahlian.includes(kategori)) return tolak("Bukan keahlian kategori ini");
    if (!t.terverifikasi) return tolak("Belum terverifikasi");
    if (!c.tersedia) return tolak("Sedang tidak tersedia");
    if (c.beban >= KAPASITAS_TEKNISI) return tolak(`Sedang memegang ${c.beban} pekerjaan`);
    const skor = (1 - bobotJarak) * (t.rating / 5) + bobotJarak * Math.max(0, 1 - c.jarak_km / 10);
    return {
      teknisi: t,
      tersedia: true,
      jarak_km: c.jarak_km,
      lolos: true,
      skor: Math.round(skor * 100) / 100,
      alasan: `Terverifikasi · ${km(c.jarak_km)} · ★ ${t.rating.toFixed(1)}`,
    };
  });
  return hasil.sort((a, b) => Number(b.lolos) - Number(a.lolos) || (b.skor ?? 0) - (a.skor ?? 0) || a.jarak_km - b.jarak_km);
}

/* ===================================================================== */
/* Cost Estimation                                                        */
/* ===================================================================== */

const JASA: Record<Kategori, RincianBiaya> = {
  AC: { label: "Jasa servis AC", jumlah: 150_000 },
  listrik: { label: "Jasa perbaikan listrik", jumlah: 120_000 },
  air: { label: "Jasa perbaikan saluran air", jumlah: 100_000 },
  lainnya: { label: "Jasa perbaikan umum", jumlah: 80_000 },
};

const MATERIAL: Array<{ pola: RegExp; label: string; jumlah: number }> = [
  { pola: /freon|tidak dingin|kurang dingin/i, label: "Isi ulang freon", jumlah: 250_000 },
  { pola: /stop ?kontak|colokan/i, label: "Material: stop kontak & kabel", jumlah: 45_000 },
  { pola: /saklar/i, label: "Material: saklar", jumlah: 30_000 },
  { pola: /lampu|bohlam/i, label: "Material: bohlam & fitting", jumlah: 35_000 },
  { pola: /keran|kran/i, label: "Material: keran & seal", jumlah: 60_000 },
  { pola: /pipa|bocor/i, label: "Material: pipa & lem PVC", jumlah: 75_000 },
  { pola: /mampet|wastafel|wc|toilet/i, label: "Material: pembersih saluran", jumlah: 40_000 },
  { pola: /engsel|pintu|lemari/i, label: "Material: engsel & sekrup", jumlah: 25_000 },
];

/** Estimate Biaya: tarif jasa per kategori + material dari deskripsi + prioritas + transport. */
export function estimasiBiaya(input: { kategori: Kategori; urgensi: Urgensi; deskripsi: string; jarak_km: number }) {
  const material = MATERIAL.find((m) => m.pola.test(input.deskripsi)) ?? { label: "Material umum", jumlah: 30_000 };
  const rincian: RincianBiaya[] = [JASA[input.kategori], { label: material.label, jumlah: material.jumlah }];
  if (input.urgensi === "tinggi") rincian.push({ label: "Penanganan prioritas (< 4 jam)", jumlah: 50_000 });
  rincian.push({ label: `Transport teknisi (${km(input.jarak_km)})`, jumlah: Math.max(10_000, Math.round(input.jarak_km * 5) * 1000) });
  return { rincian, total: rincian.reduce((s, r) => s + r.jumlah, 0) };
}

export const BIAYA_PENGECEKAN = 50_000;

/**
 * Biaya kunjungan saat tiket dibatalkan setelah teknisi tiba di lokasi:
 * transport dari estimasi yang disetujui + biaya pengecekan tetap.
 */
export function biayaKunjungan(rincianEstimasi: RincianBiaya[]) {
  const transport = rincianEstimasi.find((r) => r.label.startsWith("Transport teknisi"));
  const rincian: RincianBiaya[] = [
    { label: "Biaya pengecekan (perbaikan dibatalkan)", jumlah: BIAYA_PENGECEKAN },
    ...(transport ? [transport] : []),
  ];
  return { rincian, total: rincian.reduce((s, r) => s + r.jumlah, 0) };
}

/* ===================================================================== */
/* Evidence Verification                                                  */
/* ===================================================================== */

type Foto = { nama_file: string; mime: string; ukuran_byte: number } | null;

/** Verify Bukti Perbaikan: kelengkapan dan keaslian foto (aturan mock, backend nanti bisa memakai AI vision). */
export function verifikasiBukti(sebelum: Foto, sesudah: Foto): VerifikasiBukti {
  const dua = [sebelum, sesudah].filter((f): f is NonNullable<Foto> => f !== null);
  const pemeriksaan = [
    { label: "Foto sebelum dan sesudah lengkap", ok: dua.length === 2 },
    { label: "Berformat gambar (JPG, PNG, WebP)", ok: dua.length > 0 && dua.every((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.mime)) },
    {
      label: "Bukan foto yang sama",
      ok: !(sebelum && sesudah && sebelum.nama_file === sesudah.nama_file && sebelum.ukuran_byte === sesudah.ukuran_byte),
    },
    { label: "Ukuran foto wajar (≥ 1 KB)", ok: dua.length > 0 && dua.every((f) => f.ukuran_byte >= 1024) },
  ];
  const lolos = pemeriksaan.filter((p) => p.ok).length;
  return { valid: lolos === pemeriksaan.length, skor: Math.round((lolos / pemeriksaan.length) * 100) / 100, pemeriksaan };
}

/* ===================================================================== */
/* Commission Calculation                                                 */
/* ===================================================================== */

export const PERSEN_KOMISI = 10;

/** Calculate Komisi: persentase dari biaya final, dibulatkan ke ratusan rupiah. */
export function hitungKomisi(biaya: number, persen = PERSEN_KOMISI) {
  return { persen, komisi: Math.round((biaya * persen) / 100 / 100) * 100 };
}
