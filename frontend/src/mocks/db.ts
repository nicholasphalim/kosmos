/**
 * Database palsu untuk mode mock. Bentuk tabelnya mengikuti rancangan PostgreSQL
 * di docs/IMPLEMENTATION_PLAN.md §4, supaya perilaku mock = perilaku backend nanti.
 * Disimpan di localStorage agar data demo bertahan saat halaman di-reload.
 */
import { estimasiBiaya, hitungKomisi, jarakKm, verifikasiBukti } from "./micro";
import type { Kategori, LogServis, MetodePembayaran, RincianBiaya, Role, StatusTiket, StatusWorkOrder, Urgensi, KandidatTeknisi } from "@/lib/api/types";

export type PenggunaRow = { id: number; nama: string; role: Role; no_wa: string };
export type PropertiRow = { id: number; nama: string; id_pemilik: number; lat: number; lng: number };
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
  owner_type: "keluhan" | "bukti";
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
  jenis:
    | "tiket_dibuat" | "diklasifikasi" | "prioritas_tinggi" | "diproses" | "dibatalkan"
    | "estimasi" | "teknisi_ditugaskan" | "jadwal" | "progres" | "bukti_valid" | "bukti_ditolak"
    | "selesai" | "invoice" | "lunas" | "bayar_gagal";
  isi: string;
  no_tujuan: string;
  status_kirim: "terkirim" | "gagal";
  created_at: string;
};

/* ----- Repair Verification ----- */

/** [Technician] profil mitra teknisi. Satu baris per pengguna ber-role teknisi. */
export type TeknisiRow = {
  id_pengguna: number;
  keahlian: Kategori[];
  terverifikasi: boolean;
  no_sertifikat: string | null;
  tersedia: boolean;
  rating: number;
  lat: number;
  lng: number;
};
/** [Cost Estimation] estimasi + keputusan persetujuan pemilik (Set Persetujuan Biaya). */
export type EstimasiRow = {
  id: number;
  id_tiket: number;
  id_teknisi: number;
  kandidat: KandidatTeknisi[];
  rincian: RincianBiaya[];
  total: number;
  status: "menunggu" | "disetujui" | "ditolak";
  diputuskan_oleh: string | null;
  diputuskan_at: string | null;
  created_at: string;
};
/** [Work Order] */
export type WorkOrderRow = {
  id: number;
  id_tiket: number;
  id_teknisi: number;
  id_estimasi: number;
  status: StatusWorkOrder;
  biaya_final: number;
  slot_jadwal: string[];
  jadwal_kunjungan: string | null;
  id_bukti_sebelum: number | null;
  id_bukti_sesudah: number | null;
  verifikasi: { valid: boolean; skor: number; pemeriksaan: Array<{ label: string; ok: boolean }> } | null;
  created_at: string;
  updated_at: string;
};
export type LogServisRow = { id_work_order: number } & LogServis;

/* ----- Billing & Commission ----- */

/** [Invoice] */
export type InvoiceRow = {
  id: number;
  id_work_order: number;
  rincian: RincianBiaya[];
  biaya: number;
  persen_komisi: number;
  komisi: number;
  total: number;
  status: "belum_dibayar" | "lunas";
  jatuh_tempo: string;
  dibayar_at: string | null;
  created_at: string;
};
/** [Payment] satu baris per percobaan pembayaran ke payment gateway. */
export type PembayaranRow = {
  id: number;
  id_invoice: number;
  ref_gateway: string;
  metode: MetodePembayaran;
  jumlah: number;
  status: "pending" | "berhasil" | "gagal";
  alasan_gagal: string | null;
  direkonsiliasi: boolean;
  created_at: string;
};
/** [Financial Ledger] buku kas per pemilik. */
export type TransaksiKasRow = {
  id: number;
  id_pemilik: number;
  waktu: string;
  jenis: "pemasukan" | "pembayaran_teknisi" | "komisi";
  keterangan: string;
  jumlah: number;
  ref: string;
  properti: string;
};

export type MockDb = {
  version: 2;
  seq: {
    keluhan: number; tiket: number; lampiran: number; notifikasi: number;
    estimasi: number; work_order: number; invoice: number; pembayaran: number; kas: number;
  };
  pengguna: PenggunaRow[];
  properti: PropertiRow[];
  unit: UnitRow[];
  sewa: SewaRow[];
  keluhan: KeluhanRow[];
  lampiran: LampiranRow[];
  tiket: TiketRow[];
  riwayat: RiwayatRow[];
  notifikasi: NotifikasiRow[];
  teknisi: TeknisiRow[];
  estimasi: EstimasiRow[];
  work_order: WorkOrderRow[];
  log_servis: LogServisRow[];
  invoice: InvoiceRow[];
  pembayaran: PembayaranRow[];
  kas: TransaksiKasRow[];
};

const STORAGE_KEY = "kosmos.mockdb.v2";

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
    version: 2,
    seq: { keluhan: 102, tiket: 58, lampiran: 1, notifikasi: 1, estimasi: 1, work_order: 9, invoice: 1, pembayaran: 1, kas: 1 },
    pengguna: [
      { id: 1, nama: "Dea", role: "penghuni", no_wa: "0812-xxxx-0101" },
      { id: 2, nama: "Qiqa", role: "penghuni", no_wa: "0813-xxxx-0102" },
      { id: 3, nama: "Fredo", role: "penghuni", no_wa: "0815-xxxx-0201" },
      { id: 4, nama: "Pak Derren", role: "pemilik", no_wa: "0812-xxxx-1101" },
      { id: 5, nama: "Halim", role: "penghuni", no_wa: "0817-xxxx-0202" },
      { id: 6, nama: "Nicholas", role: "penghuni", no_wa: "0819-xxxx-0103" },
      { id: 7, nama: "Putra", role: "penghuni", no_wa: "0821-xxxx-0104" },
      { id: 8, nama: "Pak Slamet", role: "teknisi", no_wa: "0838-xxxx-2201" },
      { id: 9, nama: "Mas Bayu", role: "teknisi", no_wa: "0857-xxxx-2202" },
      { id: 10, nama: "Bang Ucok", role: "teknisi", no_wa: "0878-xxxx-2203" },
      { id: 11, nama: "Mas Andi", role: "teknisi", no_wa: "0896-xxxx-2204" },
      { id: 12, nama: "Pak Joko", role: "teknisi", no_wa: "0811-xxxx-2205" },
    ],
    properti: [
      { id: 1, nama: "Kos Melati", id_pemilik: 4, lat: -6.879, lng: 107.6105 },
      { id: 2, nama: "Kos Kenanga", id_pemilik: 4, lat: -6.8865, lng: 107.615 },
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
    teknisi: [
      { id_pengguna: 8, keahlian: ["listrik"], terverifikasi: true, no_sertifikat: "SKK-LST-0412", tersedia: true, rating: 4.8, lat: -6.892, lng: 107.613 },
      { id_pengguna: 9, keahlian: ["AC"], terverifikasi: true, no_sertifikat: "SKK-AC-1187", tersedia: true, rating: 4.7, lat: -6.8975, lng: 107.619 },
      { id_pengguna: 10, keahlian: ["air", "lainnya"], terverifikasi: true, no_sertifikat: "SKK-PLB-0750", tersedia: true, rating: 4.6, lat: -6.885, lng: 107.608 },
      { id_pengguna: 11, keahlian: ["listrik", "AC"], terverifikasi: false, no_sertifikat: null, tersedia: true, rating: 4.9, lat: -6.8812, lng: 107.6135 },
      { id_pengguna: 12, keahlian: ["listrik", "air", "lainnya"], terverifikasi: true, no_sertifikat: "SKK-UMM-0033", tersedia: false, rating: 4.5, lat: -6.87, lng: 107.6 },
    ],
    keluhan: [],
    lampiran: [],
    tiket: [],
    riwayat: [],
    notifikasi: [],
    estimasi: [],
    work_order: [],
    log_servis: [],
    invoice: [],
    pembayaran: [],
    kas: [],
  };

  // Nama selalu diambil dari tabel pengguna di atas, supaya cukup diganti di satu tempat.
  const nama = (id: number) => db.pengguna.find((p) => p.id === id)!.nama;
  const unitInfo = (idUnit: number) => {
    const u = db.unit.find((x) => x.id === idUnit)!;
    return { u, p: db.properti.find((x) => x.id === u.id_properti)! };
  };

  /*
   * Tiket yang sudah ada sebelum demo dimulai. Tiket ber-status diproses/selesai
   * ikut membawa jejak Repair Verification (estimasi, work order, log) dan Billing (invoice, kas).
   */
  type Perbaikan = {
    teknisi: number;
    /** Menit sejak sekarang saat pemilik menyetujui estimasi. */
    disetujui: number;
    wo: StatusWorkOrder;
    jadwal: number;
    tiba?: number;
    mulai?: number;
    selesai?: number;
    bayar?: { menit: number; metode: MetodePembayaran; gagalDulu?: MetodePembayaran };
  };
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
    perbaikan?: Perbaikan;
  }> = [
    {
      idTiket: 48, idKeluhan: 92, penghuni: 1, unit: 7, menit: 12 * 24 * 60,
      deskripsi: "AC kamar kurang dingin, cuma keluar angin walau sudah disetel 16 derajat.",
      judul: "AC kamar kurang dingin", status: "selesai", kategori: "AC", urgensi: "sedang",
      alasan: "AC tidak dingin mengganggu kenyamanan, tidak berbahaya.", confidence: 0.9,
      perbaikan: { teknisi: 9, disetujui: 12 * 24 * 60 - 40, wo: "selesai", jadwal: 11 * 24 * 60 + 600, tiba: 11 * 24 * 60 + 600, mulai: 11 * 24 * 60 + 590, selesai: 11 * 24 * 60 + 500, bayar: { menit: 11 * 24 * 60 + 420, metode: "qris" } },
    },
    {
      idTiket: 49, idKeluhan: 93, penghuni: 3, unit: 11, menit: 6 * 24 * 60,
      deskripsi: "Wastafel kamar mandi mampet, airnya menggenang lama baru turun.",
      judul: "Wastafel kamar mandi mampet", status: "selesai", kategori: "air", urgensi: "sedang",
      alasan: "Saluran mampet mengganggu penggunaan kamar mandi.", confidence: 0.86,
      perbaikan: { teknisi: 10, disetujui: 6 * 24 * 60 - 30, wo: "selesai", jadwal: 5 * 24 * 60 + 900, tiba: 5 * 24 * 60 + 900, mulai: 5 * 24 * 60 + 895, selesai: 5 * 24 * 60 + 840, bayar: { menit: 5 * 24 * 60 + 600, metode: "va_bca", gagalDulu: "gopay" } },
    },
    {
      idTiket: 52, idKeluhan: 96, penghuni: 1, unit: 7, menit: 3 * 24 * 60,
      deskripsi: "Lampu depan kamar berkedip terus kalau malam, kadang mati sendiri.",
      judul: "Lampu depan kamar berkedip", status: "selesai", kategori: "listrik", urgensi: "rendah",
      alasan: "Lampu berkedip belum membahayakan, perlu dicek saat sempat.", confidence: 0.85,
      perbaikan: { teknisi: 8, disetujui: 3 * 24 * 60 - 60, wo: "selesai", jadwal: 2 * 24 * 60 + 300, tiba: 2 * 24 * 60 + 300, mulai: 2 * 24 * 60 + 295, selesai: 2 * 24 * 60 + 240 },
    },
    {
      idTiket: 51, idKeluhan: 95, penghuni: 3, unit: 11, menit: 26 * 60,
      deskripsi: "Lampu kamar mandi mati total, sudah ganti bohlam tetap tidak menyala. Saklarnya longgar.",
      judul: "Lampu kamar mandi mati total", status: "diproses", kategori: "listrik", urgensi: "sedang",
      alasan: "Lampu mati total kemungkinan masalah instalasi, bukan bohlam.", confidence: 0.88,
      perbaikan: { teknisi: 8, disetujui: 25 * 60, wo: "dikerjakan", jadwal: 75, tiba: 70, mulai: 62 },
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

    const r = a.perbaikan;
    if (!r || !a.kategori || !a.urgensi) continue;

    // Repair Verification: estimasi disetujui -> work order -> log servis.
    const { u, p } = unitInfo(a.unit);
    const tk = db.teknisi.find((t) => t.id_pengguna === r.teknisi)!;
    const jarak = jarakKm(p, tk);
    const est = estimasiBiaya({ kategori: a.kategori, urgensi: a.urgensi, deskripsi: a.deskripsi, jarak_km: jarak });
    const waktuSetuju = menitLalu(r.disetujui, now);
    const idEst = db.seq.estimasi++;
    db.estimasi.push({
      id: idEst, id_tiket: a.idTiket, id_teknisi: r.teknisi, kandidat: [], rincian: est.rincian, total: est.total,
      status: "disetujui", diputuskan_oleh: nama(4), diputuskan_at: waktuSetuju, created_at: menitLalu(r.disetujui + 5, now),
    });
    db.riwayat.push({ id_tiket: a.idTiket, dari: "diklasifikasi", ke: "diproses", waktu: waktuSetuju, oleh: nama(4) });

    const idWo = db.seq.work_order++;
    const waktuJadwal = menitLalu(r.jadwal, now);
    const log = (aktivitas: LogServis["aktivitas"], menit: number, oleh: string, catatan: string | null = null) =>
      db.log_servis.push({ id_work_order: idWo, aktivitas, catatan, waktu: menitLalu(menit, now), oleh });
    log("dibuat", r.disetujui, "sistem", `Ditugaskan ke ${nama(r.teknisi)}`);
    log("jadwal", r.disetujui - 20, nama(a.penghuni), null);
    if (r.tiba !== undefined) log("tiba", r.tiba, nama(r.teknisi));
    if (r.mulai !== undefined) log("mulai", r.mulai, nama(r.teknisi), "Cek instalasi dan ganti komponen yang rusak.");

    let idSebelum: number | null = null;
    let idSesudah: number | null = null;
    if (r.selesai !== undefined) {
      const foto = (nama_file: string, url: string, ukuran_byte: number) => {
        const id = db.seq.lampiran++;
        db.lampiran.push({ id, owner_type: "bukti", owner_id: idWo, url, nama_file, mime: "image/svg+xml", ukuran_byte });
        return id;
      };
      idSebelum = foto(`sebelum-${u.nomor_unit}.jpg`, "/bukti/sebelum.svg", 184_220);
      idSesudah = foto(`sesudah-${u.nomor_unit}.jpg`, "/bukti/sesudah.svg", 201_904);
      log("bukti_valid", r.selesai + 10, "Evidence Verification", "4 dari 4 pemeriksaan lolos");
      log("selesai", r.selesai, nama(a.penghuni), "Penghuni mengonfirmasi perbaikan selesai");
      db.riwayat.push({ id_tiket: a.idTiket, dari: "diproses", ke: "selesai", waktu: menitLalu(r.selesai, now), oleh: nama(a.penghuni) });
    }
    db.work_order.push({
      id: idWo, id_tiket: a.idTiket, id_teknisi: r.teknisi, id_estimasi: idEst, status: r.wo, biaya_final: est.total,
      slot_jadwal: [waktuJadwal], jadwal_kunjungan: waktuJadwal, id_bukti_sebelum: idSebelum, id_bukti_sesudah: idSesudah,
      verifikasi: r.selesai !== undefined ? verifikasiBukti(
        { nama_file: "sebelum.jpg", mime: "image/jpeg", ukuran_byte: 184_220 },
        { nama_file: "sesudah.jpg", mime: "image/jpeg", ukuran_byte: 201_904 },
      ) : null,
      created_at: waktuSetuju, updated_at: menitLalu(r.selesai ?? r.mulai ?? r.disetujui, now),
    });

    // Billing & Commission: invoice terbit saat penghuni mengonfirmasi selesai.
    if (r.selesai === undefined) continue;
    const { persen, komisi } = hitungKomisi(est.total);
    const terbit = menitLalu(r.selesai, now);
    const idInv = db.seq.invoice++;
    const jatuhTempo = new Date(terbit);
    jatuhTempo.setDate(jatuhTempo.getDate() + 7);
    db.invoice.push({
      id: idInv, id_work_order: idWo, rincian: est.rincian, biaya: est.total, persen_komisi: persen, komisi,
      total: est.total, status: r.bayar ? "lunas" : "belum_dibayar", jatuh_tempo: jatuhTempo.toISOString().slice(0, 10),
      dibayar_at: r.bayar ? menitLalu(r.bayar.menit, now) : null, created_at: terbit,
    });
    if (!r.bayar) continue;
    const ref = () => `PG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (r.bayar.gagalDulu) {
      db.pembayaran.push({
        id: db.seq.pembayaran++, id_invoice: idInv, ref_gateway: ref(), metode: r.bayar.gagalDulu, jumlah: est.total,
        status: "gagal", alasan_gagal: "Saldo e-wallet tidak cukup", direkonsiliasi: false, created_at: menitLalu(r.bayar.menit + 15, now),
      });
    }
    const dibayar = menitLalu(r.bayar.menit, now);
    db.pembayaran.push({
      id: db.seq.pembayaran++, id_invoice: idInv, ref_gateway: ref(), metode: r.bayar.metode, jumlah: est.total,
      status: "berhasil", alasan_gagal: null, direkonsiliasi: true, created_at: dibayar,
    });
    const kode = `INV-${String(idInv).padStart(4, "0")}`;
    const kas = (jenis: TransaksiKasRow["jenis"], keterangan: string, jumlah: number) =>
      db.kas.push({ id: db.seq.kas++, id_pemilik: p.id_pemilik, waktu: dibayar, jenis, keterangan, jumlah, ref: kode, properti: p.nama });
    kas("pemasukan", `Pembayaran perbaikan ${u.nomor_unit} oleh ${nama(a.penghuni)}`, est.total);
    kas("pembayaran_teknisi", `Diteruskan ke ${nama(r.teknisi)}`, -(est.total - komisi));
    kas("komisi", `Komisi Kosmos ${persen}%`, -komisi);
  }

  const notif = (id_penerima: number, kode: string, jenis: NotifikasiRow["jenis"], isi: string, menit: number) => {
    const p = db.pengguna.find((x) => x.id === id_penerima)!;
    db.notifikasi.push({
      id: db.seq.notifikasi++, id_penerima, kode_tiket: kode, jenis, isi, no_tujuan: p.no_wa,
      status_kirim: "terkirim", created_at: menitLalu(menit, now),
    });
  };
  notif(1, "TKT-0052", "invoice", "Tagihan perbaikan INV-0003 Rp 165.000 sudah terbit. Bayar sebelum jatuh tempo.", 2 * 24 * 60 + 240);
  notif(8, "TKT-0051", "teknisi_ditugaskan", "Pekerjaan baru WO-0012: Lampu kamar mandi mati total, Kos Kenanga B-201.", 25 * 60);
  notif(3, "TKT-0051", "progres", "Pak Slamet sudah tiba dan mulai memperbaiki.", 62);
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
      if (parsed.version === 2) return (instance = parsed);
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

