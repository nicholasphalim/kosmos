import type { Kategori, KlasifikasiResponse, Urgensi } from "./api/types";

/**
 * Aturan klasifikasi berbasis keyword.
 * Dipakai oleh: (1) MockClassifier di MSW, (2) petunjuk "Terdeteksi" di form.
 * Backend MockClassifier (Python) WAJIB memakai aturan yang sama, supaya mode mock dan live konsisten.
 * Di hasil akhir, klasifikasi sungguhan dilakukan LLM API multimodal di backend.
 */
const KATEGORI_RULES: Array<{ kategori: Exclude<Kategori, "lainnya">; pola: RegExp }> = [
  { kategori: "AC", pola: /\b(ac|dingin|freon|remote ac)\b/i },
  { kategori: "listrik", pola: /\b(listrik|lampu|stop ?kontak|mcb|korslet|sekring|colokan)\b/i },
  { kategori: "air", pola: /\b(air|bocor|keran|kran|pipa|wc|toilet|wastafel|mampet)\b/i },
];

const URGENSI_TINGGI = /\b(korslet|percikan|memercik|api|banjir|gosong|asap|setrum)\b/i;
const URGENSI_SEDANG = /\b(bocor|menetes|mati total|mampet|tidak dingin|tidak menyala|mati)\b/i;

export function deteksiKategori(teks: string): Kategori | null {
  if (teks.trim().length < 10) return null;
  return KATEGORI_RULES.find((r) => r.pola.test(teks))?.kategori ?? null;
}

function deteksiUrgensi(teks: string): Urgensi {
  if (URGENSI_TINGGI.test(teks)) return "tinggi";
  if (URGENSI_SEDANG.test(teks)) return "sedang";
  return "rendah";
}

/** Judul tiket: kalimat pertama, dipotong rapi di batas kata. */
export function buatJudul(teks: string, maks = 42): string {
  const kalimat = teks.trim().split(/[.!?\n]/)[0] ?? teks;
  if (kalimat.length <= maks) return kalimat;
  const potong = kalimat.slice(0, maks);
  return `${potong.slice(0, potong.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

export function klasifikasiKeyword(teks: string, jumlahGambar: number): KlasifikasiResponse {
  const kategori = deteksiKategori(teks);
  const urgensi = deteksiUrgensi(teks);
  const confidence = kategori ? Math.min(0.95, 0.78 + jumlahGambar * 0.07) : 0.45;
  const alasan = kategori
    ? `Deskripsi memuat kata kunci kategori ${kategori === "AC" ? "AC" : kategori}` +
      (urgensi === "tinggi"
        ? " dan tanda bahaya, sehingga perlu segera ditangani."
        : urgensi === "sedang"
          ? ". Tidak berbahaya, tetapi mengganggu penggunaan unit."
          : ". Tidak mendesak.")
    : "Tidak ada kata kunci yang cocok. Pemilik perlu meninjau kategori secara manual.";
  return { kategori: kategori ?? "lainnya", urgensi, confidence, alasan, judul: buatJudul(teks) };
}
