/**
 * Database palsu untuk mode mock. Bentuk tabelnya mengikuti rancangan PostgreSQL
 * di docs/IMPLEMENTATION_PLAN.md §4, supaya perilaku mock = perilaku backend nanti.
 * Disimpan di localStorage agar data demo bertahan saat halaman di-reload.
 */
import type { Kategori, Role, StatusTiket, Urgensi } from "@/lib/api/types";

export type PenggunaRow = { id: number; nama: string; role: Role; no_wa: string };
export type PropertiRow = { id: number; nama: string; id_pemilik: number };
export type UnitRow = { id: number; id_properti: number; nomor_unit: string };
export type SewaRow = {
  id: number;
  id_unit: number;
  id_penghuni: number;
  tanggal_mulai: string;
  tanggal_selesai: string;
};
export type KeluhanRow = {
  id: number;
  id_penghuni: number;
  id_unit: number;
  deskripsi: string;
  status: "diterima" | "ditolak";
  alasan_penolakan: string | null;
  created_at: string;
};
export type LampiranRow = {
  id: number;
  owner_type: "keluhan";
  owner_id: number;
  url: string;
  nama_file: string;
  mime: string;
  ukuran_byte: number;
};
export type TiketRow = {
  id: number;
  id_keluhan: number;
  judul: string;
  status: StatusTiket;
  kategori: Kategori | null;
  urgensi: Urgensi | null;
  perlu_review: boolean;
  ai_confidence: number | null;
  ai_alasan: string | null;
  created_at: string;
  updated_at: string;
};
export type RiwayatRow = {
  id_tiket: number;
  dari: StatusTiket | null;
  ke: StatusTiket;
  waktu: string;
  oleh: string;
};
export type NotifikasiRow = {
  id: number;
  id_penerima: number;
  kode_tiket: string;
  jenis: "tiket_dibuat" | "diklasifikasi" | "prioritas_tinggi" | "diproses" | "dibatalkan";
  isi: string;
  no_tujuan: string;
  status_kirim: "terkirim" | "gagal";
  created_at: string;
};

export type MockDb = {
  version: 1;
  seq: { keluhan: number; tiket: number; lampiran: number; notifikasi: number };
  pengguna: PenggunaRow[];
  properti: PropertiRow[];
  unit: UnitRow[];
  sewa: SewaRow[];
  keluhan: KeluhanRow[];
  lampiran: LampiranRow[];
  tiket: TiketRow[];
  riwayat: RiwayatRow[];
  notifikasi: NotifikasiRow[];
};

const STORAGE_KEY = "kosmos.mockdb.v1";

/* ---------- Seed ---------- */

function menitLalu(menit: number, dari = new Date()) {
  return new Date(dari.getTime() - menit * 60_000).toISOString();
}

function tanggalGeser(hari: number, dari = new Date()) {
  const d = new Date(dari);
  d.setDate(d.getDate() + hari);
  return d.toISOString().slice(0, 10);
}

function seed(): MockDb {
  const now = new Date();
  const db: MockDb = {
    version: 1,
    seq: { keluhan: 102, tiket: 58, lampiran: 1, notifikasi: 1 },
    pengguna: [
      { id: 1, nama: "Dea", role: "penghuni", no_wa: "0812-xxxx-0101" },
      { id: 2, nama: "Qiqa", role: "penghuni", no_wa: "0813-xxxx-0102" },
      { id: 3, nama: "Fredo", role: "penghuni", no_wa: "0815-xxxx-0201" },
      { id: 4, nama: "Pak Derren", role: "pemilik", no_wa: "0812-xxxx-1101" },
      { id: 5, nama: "Halim", role: "penghuni", no_wa: "0817-xxxx-0202" },
      { id: 6, nama: "Nicholas", role: "penghuni", no_wa: "0819-xxxx-0103" },
      { id: 7, nama: "Putra", role: "penghuni", no_wa: "0821-xxxx-0104" },
    ],
    properti: [
      { id: 1, nama: "Kos Melati", id_pemilik: 4 },
      { id: 2, nama: "Kos Kenanga", id_pemilik: 4 },
    ],
    unit: [
      { id: 7, id_properti: 1, nomor_unit: "A-101" },
      { id: 8, id_properti: 1, nomor_unit: "A-102" },
      { id: 9, id_properti: 1, nomor_unit: "A-103" },
      { id: 10, id_properti: 1, nomor_unit: "A-104" },
      { id: 11, id_properti: 2, nomor_unit: "B-201" },
      { id: 12, id_properti: 2, nomor_unit: "B-202" },
    ],
    sewa: [
      { id: 1, id_unit: 7, id_penghuni: 1, tanggal_mulai: tanggalGeser(-135), tanggal_selesai: tanggalGeser(230) },
      { id: 2, id_unit: 8, id_penghuni: 2, tanggal_mulai: tanggalGeser(-378), tanggal_selesai: tanggalGeser(-13) },
      { id: 3, id_unit: 11, id_penghuni: 3, tanggal_mulai: tanggalGeser(-60), tanggal_selesai: tanggalGeser(300) },
      { id: 4, id_unit: 12, id_penghuni: 5, tanggal_mulai: tanggalGeser(-90), tanggal_selesai: tanggalGeser(270) },
      { id: 5, id_unit: 9, id_penghuni: 6, tanggal_mulai: tanggalGeser(-200), tanggal_selesai: tanggalGeser(160) },
      { id: 6, id_unit: 10, id_penghuni: 7, tanggal_mulai: tanggalGeser(-30), tanggal_selesai: tanggalGeser(330) },
    ],
    keluhan: [],
    lampiran: [],
    tiket: [],
    riwayat: [],
    notifikasi: [],
  };

  // Nama selalu diambil dari tabel pengguna di atas, supaya cukup diganti di satu tempat.
  const nama = (id: number) => db.pengguna.find((p) => p.id === id)!.nama;

  // Tiket yang sudah ada sebelum demo dimulai.
  const awal: Array<{
    idTiket: number;
    idKeluhan: number;
    penghuni: number;
    unit: number;
    deskripsi: string;
    judul: string;
    menit: number;
    status: StatusTiket;
    kategori: Kategori | null;
    urgensi: Urgensi | null;
    alasan: string | null;
    confidence: number | null;
  }> = [
    {
      idTiket: 51, idKeluhan: 95, penghuni: 7, unit: 10, menit: 3 * 24 * 60 + 60,
      deskripsi: "Lampu kamar mati total sejak malam, sudah ganti bohlam tetap tidak menyala.",
      judul: "Lampu kamar mati total", status: "diproses", kategori: "listrik", urgensi: "sedang",
      alasan: "Lampu mati total kemungkinan masalah instalasi, bukan bohlam.", confidence: 0.88,
    },
    {
      idTiket: 54, idKeluhan: 98, penghuni: 6, unit: 9, menit: 15 * 60,
      deskripsi: "Engsel pintu lemari lepas, pintunya miring dan susah ditutup.",
      judul: "Engsel pintu lemari lepas", status: "diklasifikasi", kategori: "lainnya", urgensi: "rendah",
      alasan: "Kerusakan furnitur ringan, tidak mendesak.", confidence: 0.81,
    },
    {
      idTiket: 56, idKeluhan: 100, penghuni: 5, unit: 12, menit: 110,
      deskripsi: "Keran kamar mandi tidak bisa ditutup rapat, air terus mengalir pelan.",
      judul: "Keran kamar mandi tidak menutup", status: "dibuat", kategori: null, urgensi: null,
      alasan: null, confidence: null,
    },
    {
      idTiket: 57, idKeluhan: 101, penghuni: 3, unit: 11, menit: 18,
      deskripsi: "Stop kontak dekat meja memercikkan api waktu charger dicolok, ada bau gosong.",
      judul: "Stop kontak memercikkan api", status: "diklasifikasi", kategori: "listrik", urgensi: "tinggi",
      alasan: "Percikan api dan bau gosong adalah tanda korsleting yang berisiko kebakaran.", confidence: 0.94,
    },
  ];

  for (const a of awal) {
    const dibuat = menitLalu(a.menit, now);
    db.keluhan.push({
      id: a.idKeluhan, id_penghuni: a.penghuni, id_unit: a.unit, deskripsi: a.deskripsi,
      status: "diterima", alasan_penolakan: null, created_at: dibuat,
    });
    db.tiket.push({
      id: a.idTiket, id_keluhan: a.idKeluhan, judul: a.judul, status: a.status, kategori: a.kategori,
      urgensi: a.urgensi, perlu_review: a.urgensi === null, ai_confidence: a.confidence,
      ai_alasan: a.alasan, created_at: dibuat, updated_at: dibuat,
    });
    db.riwayat.push({ id_tiket: a.idTiket, dari: null, ke: "dibuat", waktu: dibuat, oleh: "sistem" });
    if (a.status !== "dibuat") {
      db.riwayat.push({ id_tiket: a.idTiket, dari: "dibuat", ke: "diklasifikasi", waktu: dibuat, oleh: "AI Classification" });
    }
    if (a.status === "diproses") {
      db.riwayat.push({ id_tiket: a.idTiket, dari: "diklasifikasi", ke: "diproses", waktu: menitLalu(a.menit - 120, now), oleh: nama(4) });
    }
  }

  const notif = (id_penerima: number, kode: string, jenis: NotifikasiRow["jenis"], isi: string, menit: number) => {
    const p = db.pengguna.find((x) => x.id === id_penerima)!;
    db.notifikasi.push({
      id: db.seq.notifikasi++, id_penerima, kode_tiket: kode, jenis, isi, no_tujuan: p.no_wa,
      status_kirim: "terkirim", created_at: menitLalu(menit, now),
    });
  };
  notif(4, "TKT-0056", "tiket_dibuat", `Keran kamar mandi tidak menutup. Unit B-202 (${nama(5)}).`, 110);
  notif(5, "TKT-0056", "tiket_dibuat", "Laporanmu diterima: Keran kamar mandi tidak menutup.", 110);
  notif(4, "TKT-0057", "prioritas_tinggi", `Stop kontak memercikkan api. Unit B-201 (${nama(3)}). Mohon segera dicek.`, 18);
  notif(3, "TKT-0057", "prioritas_tinggi", "Laporanmu diprioritaskan TINGGI. Pemilik sudah dikabari.", 18);

  return db;
}

/* ---------- Persistensi ---------- */

let instance: MockDb | null = null;

export function db(): MockDb {
  if (instance) return instance;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed.version === 1) return (instance = parsed);
    }
  } catch {
    /* data rusak: seed ulang */
  }
  instance = seed();
  commit();
  return instance;
}

/** Simpan perubahan. Dipanggil setiap selesai operasi tulis (mirip COMMIT transaksi). */
export function commit() {
  if (!instance) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instance));
  } catch {
    /* kuota penuh / mode privat: data tetap di memori */
  }
}

export function resetDb() {
  instance = seed();
  commit();
}
