/**
 * Service layer palsu. Strukturnya sengaja meniru backend FastAPI (plan §1.2, §7):
 *
 *   Task     hmr, csm             -> satu-satunya yang mengorkestrasi
 *   Micro    micro.ts (matching, estimasi, verifikasi bukti, komisi) -> logika spesifik, stateless
 *   Entity   tenantLease, complaintTicket, technician, workOrder, invoice, payment, ledger
 *            -> hanya mengelola tabelnya sendiri
 *   Utility  mediaStorage, aiClassification, notification -> tidak tahu domain
 *
 * Aturan: Task boleh memanggil Micro, Entity & Utility; Entity/Utility tidak saling memanggil.
 * Fungsi view*() di bagian bawah hanya merakit DTO response (read model), bukan logika bisnis.
 */
import type {
  AkunDemo,
  Keluhan,
  KeluhanResponse,
  KlasifikasiResponse,
  Lampiran,
  Notifikasi,
  Pengguna,
  PenggunaSaya,
  PenghuniBaruRequest,
  PenghuniTerdaftar,
  ProfilPenghuni,
  SewaBaruRequest,
  UbahPenghuniRequest,
  UnitPemilik,
  StatusSewa,
  StatusTiket,
  TiketDetail,
  TiketRingkas,
  TraceStep,
  BayarResponse,
  BayarSekaligusResponse,
  BayarSewaResponse,
  BiayaTambahan,
  BuktiResponse,
  EstimasiBiaya,
  EstimasiResponse,
  Invoice,
  KonfirmasiResponse,
  LaporanKas,
  LogServis,
  MetodePembayaran,
  Pembayaran,
  PersetujuanResponse,
  StatusWorkOrder,
  TagihanSewa,
  TeknisiRingkas,
  TerbitkanSewaResponse,
  Urgensi,
  WorkOrder,
} from "@/lib/api/types";
import { jadwal as fmtJadwal, kodeInvoice, kodeTagihanSewa, LABEL_KATEGORI, LABEL_METODE, labelPeriode, rupiah, tanggal } from "@/lib/format";
import { buatJudul, klasifikasiKeyword } from "@/lib/klasifikasi";
import {
  commit,
  db,
  type EstimasiRow,
  type InvoiceRow,
  type KeluhanRow,
  type LampiranRow,
  type NotifikasiRow,
  type PembayaranRow,
  type PenggunaRow,
  type TeknisiRow,
  type TiketRow,
  type SewaRow,
  type TagihanSewaRow,
  type TransaksiKasRow,
  type WorkOrderRow,
  periodeDari,
} from "./db";
import { biayaKunjungan, estimasiBiaya, hitungKomisi, jarakKm, matchTeknisi, verifikasiBukti } from "./micro";

/* ===================================================================== */
/* Error & util                                                           */
/* ===================================================================== */

export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly kode: string,
    pesan: string,
  ) {
    super(pesan);
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const nowIso = () => new Date().toISOString();
const kodeTiket = (id: number) => `TKT-${String(id).padStart(4, "0")}`;
const kodeKeluhan = (id: number) => `KLH-${String(id).padStart(4, "0")}`;
const kodeWo = (id: number) => `WO-${String(id).padStart(4, "0")}`;

/** Pencatat jejak service untuk ditampilkan di UI (field `trace`). */
class Tracer {
  readonly steps: TraceStep[] = [];
  async run<T>(
    service: string,
    layer: TraceStep["layer"],
    operasi: string | ((hasil: T) => string),
    latensi: number,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    const mulai = performance.now();
    await delay(latensi);
    try {
      const hasil = await fn();
      this.steps.push({
        service,
        layer,
        operasi: typeof operasi === "function" ? operasi(hasil) : operasi,
        ok: true,
        ms: Math.round(performance.now() - mulai),
      });
      return hasil;
    } catch (e) {
      this.steps.push({
        service,
        layer,
        operasi: `${typeof operasi === "string" ? operasi : service} → gagal`,
        ok: false,
        ms: Math.round(performance.now() - mulai),
      });
      throw e;
    }
  }
}

/* ===================================================================== */
/* Auth (demo)                                                            */
/* ===================================================================== */

export const auth = {
  /** Mode mock memakai token "demo.<id>". Backend nanti menerbitkan JWT sungguhan. */
  login(idPengguna: number): { token: string; pengguna: Pengguna } {
    const p = db().pengguna.find((x) => x.id === idPengguna);
    if (!p) throw new ServiceError(404, "PENGGUNA_TIDAK_ADA", "Akun demo tidak ditemukan.");
    return { token: `demo.${p.id}`, pengguna: toPengguna(p) };
  },

  currentUser(authorization: string | null): PenggunaRow {
    const id = Number(authorization?.match(/^Bearer demo\.(\d+)$/)?.[1]);
    const p = db().pengguna.find((x) => x.id === id);
    if (!p) throw new ServiceError(401, "TIDAK_TERAUTENTIKASI", "Silakan masuk terlebih dahulu.");
    return p;
  },

  requireRole(user: PenggunaRow, role: PenggunaRow["role"]) {
    if (user.role !== role) {
      throw new ServiceError(403, "AKSES_DITOLAK", `Operasi ini hanya untuk ${role}.`);
    }
  },

  /** GET /auth/me. Di backend, pengguna dicari dari email di JWT Supabase. */
  me(user: PenggunaRow): PenggunaSaya {
    return { ...toPengguna(user), email: user.email };
  },

  akunDemo(): AkunDemo[] {
    const ids = [1, 2, 3, 4, 8, 9, 10];
    return ids.map((id) => {
      const p = db().pengguna.find((x) => x.id === id)!;
      if (p.role === "teknisi") {
        const t = technician.getRow(p.id);
        return {
          pengguna: toPengguna(p),
          keterangan: `Teknisi ${t.keahlian.map((k) => LABEL_KATEGORI[k].toLowerCase()).join(", ")} · ${t.terverifikasi ? "terverifikasi" : "belum terverifikasi"}`,
          label_sewa: "teknisi" as const,
          jumlah_properti: null,
        };
      }
      if (p.role === "pemilik") {
        const jumlah = db().properti.filter((x) => x.id_pemilik === p.id);
        return {
          pengguna: toPengguna(p),
          keterangan: jumlah.map((x) => x.nama).join(", "),
          label_sewa: "pemilik",
          jumlah_properti: jumlah.length,
        };
      }
      const profil = tenantLease.profil(p.id);
      return {
        pengguna: toPengguna(p),
        keterangan: `${profil.unit.nama_properti} · ${profil.unit.nomor_unit}`,
        label_sewa: profil.sewa.status_sewa === "aktif" ? "aktif" : "berakhir",
        jumlah_properti: null,
      };
    });
  },
};

const toPengguna = (p: PenggunaRow): Pengguna => ({ id: p.id, nama: p.nama, role: p.role });

/* ===================================================================== */
/* Entity: Tenant and Lease                                               */
/* ===================================================================== */

export const tenantLease = {
  /** Get ID Unit: unit dari sewa terbaru milik penghuni. */
  getIdUnit(idPenghuni: number): number {
    const sewa = db()
      .sewa.filter((s) => s.id_penghuni === idPenghuni)
      .sort((a, b) => b.tanggal_mulai.localeCompare(a.tanggal_mulai))[0];
    if (!sewa) throw new ServiceError(404, "UNIT_TIDAK_ADA", "Penghuni tidak memiliki unit.");
    return sewa.id_unit;
  },

  /** Get Status Sewa: dihitung dari tanggal, tidak disimpan (plan §4). */
  getStatusSewa(idUnit: number): StatusSewa {
    const sewa = db()
      .sewa.filter((s) => s.id_unit === idUnit)
      .sort((a, b) => b.tanggal_mulai.localeCompare(a.tanggal_mulai))[0];
    if (!sewa) throw new ServiceError(404, "SEWA_TIDAK_ADA", "Unit belum pernah disewa.");
    const hariIni = new Date().toISOString().slice(0, 10);
    const aktif = sewa.tanggal_mulai <= hariIni && hariIni <= sewa.tanggal_selesai;
    return {
      id_unit: idUnit,
      status_sewa: aktif ? "aktif" : "tidak_aktif",
      tanggal_mulai: sewa.tanggal_mulai,
      tanggal_selesai: sewa.tanggal_selesai,
    };
  },

  unitRingkas(idUnit: number) {
    const u = db().unit.find((x) => x.id === idUnit)!;
    const p = db().properti.find((x) => x.id === u.id_properti)!;
    return { id: u.id, nomor_unit: u.nomor_unit, nama_properti: p.nama, id_pemilik: p.id_pemilik };
  },

  profil(idPenghuni: number): ProfilPenghuni {
    const p = db().pengguna.find((x) => x.id === idPenghuni)!;
    const idUnit = tenantLease.getIdUnit(idPenghuni);
    const { id_pemilik: _, ...unit } = tenantLease.unitRingkas(idUnit);
    return { pengguna: toPengguna(p), unit, sewa: tenantLease.getStatusSewa(idUnit) };
  },

  pengguna(id: number): PenggunaRow {
    return db().pengguna.find((x) => x.id === id)!;
  },

  /** Koordinat properti tempat unit berada (untuk menghitung jarak teknisi). */
  lokasiProperti(idUnit: number): { lat: number; lng: number } {
    const u = db().unit.find((x) => x.id === idUnit)!;
    const p = db().properti.find((x) => x.id === u.id_properti)!;
    return { lat: p.lat, lng: p.lng };
  },

  /* ----- Pendaftaran penghuni oleh pemilik (pengganti sign up) ----- */

  /** Unit di properti milik pemilik. */
  unitMilik(idPemilik: number) {
    const idProperti = new Set(db().properti.filter((p) => p.id_pemilik === idPemilik).map((p) => p.id));
    return db().unit.filter((u) => idProperti.has(u.id_properti));
  },

  /** Sewa yang aktif hari ini di sebuah unit, atau null. */
  sewaAktif(idUnit: number): SewaRow | null {
    const hariIni = new Date().toISOString().slice(0, 10);
    return db().sewa.find((s) => s.id_unit === idUnit && s.tanggal_mulai <= hariIni && hariIni <= s.tanggal_selesai) ?? null;
  },

  listUnitPemilik(user: PenggunaRow): UnitPemilik[] {
    auth.requireRole(user, "pemilik");
    return tenantLease.unitMilik(user.id).map((u) => {
      const { id_pemilik: _, ...ringkas } = tenantLease.unitRingkas(u.id);
      const sw = tenantLease.sewaAktif(u.id);
      return {
        ...ringkas,
        harga_bulanan: u.harga_bulanan,
        penghuni: sw ? toPengguna(tenantLease.pengguna(sw.id_penghuni)) : null,
        sewa: sw ? tenantLease.getStatusSewa(u.id) : null,
      };
    });
  },

  /** Satu baris per penghuni: sewa terbarunya di properti pemilik. */
  penghuniTerdaftar(p: PenggunaRow, sw: SewaRow): PenghuniTerdaftar {
    const { id_pemilik: _, ...unit } = tenantLease.unitRingkas(sw.id_unit);
    const hariIni = new Date().toISOString().slice(0, 10);
    return {
      pengguna: toPengguna(p),
      email: p.email,
      no_wa: p.no_wa,
      unit,
      sewa: {
        id_unit: sw.id_unit,
        status_sewa: sw.tanggal_mulai <= hariIni && hariIni <= sw.tanggal_selesai ? "aktif" : "tidak_aktif",
        tanggal_mulai: sw.tanggal_mulai,
        tanggal_selesai: sw.tanggal_selesai,
      },
      terhubung_google: p.auth_user_id !== null,
    };
  },

  /** Sewa terbaru tiap penghuni di unit milik pemilik. */
  sewaTerbaruPerPenghuni(idPemilik: number): Map<number, SewaRow> {
    const idUnit = new Set(tenantLease.unitMilik(idPemilik).map((u) => u.id));
    const hasil = new Map<number, SewaRow>();
    for (const sw of db().sewa.filter((s) => idUnit.has(s.id_unit))) {
      const lama = hasil.get(sw.id_penghuni);
      if (!lama || sw.tanggal_mulai > lama.tanggal_mulai) hasil.set(sw.id_penghuni, sw);
    }
    return hasil;
  },

  listPenghuni(user: PenggunaRow): PenghuniTerdaftar[] {
    auth.requireRole(user, "pemilik");
    return [...tenantLease.sewaTerbaruPerPenghuni(user.id).entries()]
      .map(([idPenghuni, sw]) => tenantLease.penghuniTerdaftar(tenantLease.pengguna(idPenghuni), sw))
      .sort((a, b) => a.pengguna.nama.localeCompare(b.pengguna.nama));
  },

  addPenghuni(user: PenggunaRow, req: PenghuniBaruRequest): PenghuniTerdaftar {
    auth.requireRole(user, "pemilik");
    const nama = req.nama?.trim() ?? "";
    const email = normalisasiEmail(req.email);
    const noWa = req.no_wa?.trim() ?? "";
    if (nama.length < 2) throw new ServiceError(422, "VALIDASI_GAGAL", "Nama minimal 2 karakter.");
    if (!EMAIL_RE.test(email)) throw new ServiceError(422, "VALIDASI_GAGAL", "Format email tidak valid.");
    if (noWa.length < 8) throw new ServiceError(422, "VALIDASI_GAGAL", "Nomor WhatsApp tidak valid.");
    if (!req.tanggal_mulai || !req.tanggal_selesai || req.tanggal_mulai > req.tanggal_selesai) {
      throw new ServiceError(422, "VALIDASI_GAGAL", "Tanggal selesai sewa harus setelah tanggal mulai.");
    }
    if (!tenantLease.unitMilik(user.id).some((u) => u.id === req.id_unit)) {
      throw new ServiceError(404, "UNIT_TIDAK_ADA", "Unit tidak ditemukan di properti Anda.");
    }
    if (db().pengguna.some((p) => p.email === email)) {
      throw new ServiceError(409, "EMAIL_SUDAH_TERDAFTAR", "Email ini sudah terdaftar.");
    }
    const bentrok = db().sewa.some(
      (s) => s.id_unit === req.id_unit && s.tanggal_mulai <= req.tanggal_selesai && req.tanggal_mulai <= s.tanggal_selesai,
    );
    if (bentrok) throw new ServiceError(409, "UNIT_SUDAH_DISEWA", "Periode sewa bertabrakan dengan sewa lain di unit ini.");

    const p: PenggunaRow = {
      id: Math.max(...db().pengguna.map((x) => x.id)) + 1,
      nama, role: "penghuni", no_wa: noWa, email, auth_user_id: null,
    };
    const sw: SewaRow = {
      id: Math.max(0, ...db().sewa.map((x) => x.id)) + 1,
      id_unit: req.id_unit, id_penghuni: p.id, tanggal_mulai: req.tanggal_mulai, tanggal_selesai: req.tanggal_selesai,
    };
    db().pengguna.push(p);
    db().sewa.push(sw);
    commit();
    return tenantLease.penghuniTerdaftar(p, sw);
  },

  ubahPenghuni(user: PenggunaRow, idPengguna: number, req: UbahPenghuniRequest): PenghuniTerdaftar {
    auth.requireRole(user, "pemilik");
    const sw = tenantLease.sewaTerbaruPerPenghuni(user.id).get(idPengguna);
    if (!sw) throw new ServiceError(404, "PENGHUNI_TIDAK_ADA", "Penghuni tidak ditemukan di properti Anda.");
    const p = tenantLease.pengguna(idPengguna);
    if (req.nama === undefined && req.email === undefined && req.no_wa === undefined) {
      throw new ServiceError(422, "VALIDASI_GAGAL", "Tidak ada data yang diubah.");
    }
    const nama = req.nama?.trim();
    const noWa = req.no_wa?.trim();
    const email = req.email === undefined ? undefined : normalisasiEmail(req.email);
    if (nama !== undefined && nama.length < 2) throw new ServiceError(422, "VALIDASI_GAGAL", "Nama minimal 2 karakter.");
    if (noWa !== undefined && noWa.length < 8) throw new ServiceError(422, "VALIDASI_GAGAL", "Nomor WhatsApp tidak valid.");
    if (email !== undefined && email !== p.email) {
      if (!EMAIL_RE.test(email)) throw new ServiceError(422, "VALIDASI_GAGAL", "Format email tidak valid.");
      if (p.auth_user_id !== null) {
        throw new ServiceError(409, "SUDAH_TERHUBUNG", "Email tidak bisa diubah karena penghuni sudah login dengan akun Google.");
      }
      if (db().pengguna.some((x) => x.email === email)) {
        throw new ServiceError(409, "EMAIL_SUDAH_TERDAFTAR", "Email ini sudah terdaftar.");
      }
      p.email = email;
    }
    if (nama !== undefined) p.nama = nama;
    if (noWa !== undefined) p.no_wa = noWa;
    commit();
    return tenantLease.penghuniTerdaftar(p, sw);
  },

  /** Sewa baru untuk penghuni lama (perpanjang atau pindah unit). */
  addSewa(user: PenggunaRow, idPengguna: number, req: SewaBaruRequest): PenghuniTerdaftar {
    auth.requireRole(user, "pemilik");
    if (!tenantLease.sewaTerbaruPerPenghuni(user.id).has(idPengguna)) {
      throw new ServiceError(404, "PENGHUNI_TIDAK_ADA", "Penghuni tidak ditemukan di properti Anda.");
    }
    if (!req.tanggal_mulai || !req.tanggal_selesai || req.tanggal_mulai > req.tanggal_selesai) {
      throw new ServiceError(422, "VALIDASI_GAGAL", "Tanggal selesai sewa harus setelah tanggal mulai.");
    }
    if (!tenantLease.unitMilik(user.id).some((u) => u.id === req.id_unit)) {
      throw new ServiceError(404, "UNIT_TIDAK_ADA", "Unit tidak ditemukan di properti Anda.");
    }
    const beririsan = (s: SewaRow) => s.tanggal_mulai <= req.tanggal_selesai && req.tanggal_mulai <= s.tanggal_selesai;
    if (db().sewa.some((s) => s.id_unit === req.id_unit && beririsan(s))) {
      throw new ServiceError(409, "UNIT_SUDAH_DISEWA", "Periode sewa bertabrakan dengan sewa lain di unit ini.");
    }
    if (db().sewa.some((s) => s.id_penghuni === idPengguna && beririsan(s))) {
      throw new ServiceError(409, "SEWA_BENTROK", "Penghuni masih punya sewa lain pada periode itu.");
    }
    const sw: SewaRow = {
      id: Math.max(0, ...db().sewa.map((x) => x.id)) + 1,
      id_unit: req.id_unit, id_penghuni: idPengguna, tanggal_mulai: req.tanggal_mulai, tanggal_selesai: req.tanggal_selesai,
    };
    db().sewa.push(sw);
    commit();
    return tenantLease.penghuniTerdaftar(tenantLease.pengguna(idPengguna), sw);
  },

  /** GET /unit/{id}/sewa: hanya pemilik unit atau penghuni yang pernah menyewa unit itu. */
  statusSewaUntuk(user: PenggunaRow, idUnit: number): StatusSewa {
    const unit = db().unit.find((u) => u.id === idUnit);
    const boleh =
      unit !== undefined &&
      (tenantLease.unitRingkas(idUnit).id_pemilik === user.id ||
        db().sewa.some((s) => s.id_unit === idUnit && s.id_penghuni === user.id));
    if (!boleh) throw new ServiceError(404, "UNIT_TIDAK_ADA", "Unit tidak ditemukan.");
    return tenantLease.getStatusSewa(idUnit);
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalisasiEmail = (email: string | undefined) => (email ?? "").trim().toLowerCase();

/* ===================================================================== */
/* Entity: Complaint Ticket                                               */
/* ===================================================================== */

/** Transisi status legal (plan §3.2). Transisi lain -> 409. */
const TRANSISI: Record<StatusTiket, StatusTiket[]> = {
  dibuat: ["diklasifikasi", "dibatalkan"],
  // diklasifikasi -> selesai: pemilik menilai tidak perlu teknisi (ditangani sendiri, tanpa biaya).
  diklasifikasi: ["diproses", "selesai", "dibatalkan"],
  diproses: ["selesai", "dibatalkan"],
  // selesai -> diklasifikasi: penghuni membuka ulang tiket yang ditangani sendiri (dijaga di hmr.bukaUlang).
  selesai: ["diklasifikasi"],
  dibatalkan: [],
};

/** Batas penghuni boleh membuka ulang tiket yang ditangani sendiri oleh pemilik. */
const HARI_BUKA_ULANG = 7;

export const complaintTicket = {
  addKeluhan(input: Omit<KeluhanRow, "id" | "created_at">): KeluhanRow {
    const row: KeluhanRow = { ...input, id: db().seq.keluhan++, created_at: nowIso() };
    db().keluhan.push(row);
    return row;
  },

  addTiket(idKeluhan: number, judul: string): TiketRow {
    const waktu = nowIso();
    const row: TiketRow = {
      id: db().seq.tiket++, id_keluhan: idKeluhan, judul, status: "dibuat", kategori: null,
      urgensi: null, perlu_review: true, ai_confidence: null, ai_alasan: null,
      penanganan: null, catatan_penanganan: null, created_at: waktu, updated_at: waktu,
    };
    db().tiket.push(row);
    db().riwayat.push({ id_tiket: row.id, dari: null, ke: "dibuat", waktu, oleh: "sistem", catatan: null });
    return row;
  },

  getTiketRow(idTiket: number): TiketRow {
    const t = db().tiket.find((x) => x.id === idTiket);
    if (!t) throw new ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.");
    return t;
  },

  getKeluhanRow(idKeluhan: number): KeluhanRow {
    const k = db().keluhan.find((x) => x.id === idKeluhan);
    if (!k) throw new ServiceError(404, "KELUHAN_TIDAK_ADA", "Keluhan tidak ditemukan.");
    return k;
  },

  setKategoriUrgensi(idTiket: number, hasil: KlasifikasiResponse) {
    const t = complaintTicket.getTiketRow(idTiket);
    t.kategori = hasil.kategori;
    t.urgensi = hasil.urgensi;
    t.ai_confidence = hasil.confidence;
    t.ai_alasan = hasil.alasan;
    t.judul = hasil.judul;
    t.perlu_review = hasil.confidence < 0.6;
  },

  setStatusTiket(idTiket: number, ke: StatusTiket, oleh: string, catatan: string | null = null): TiketRow {
    const t = complaintTicket.getTiketRow(idTiket);
    if (!TRANSISI[t.status].includes(ke)) {
      throw new ServiceError(409, "TRANSISI_TIDAK_VALID", `Status tidak bisa berubah dari ${t.status} ke ${ke}.`);
    }
    const waktu = nowIso();
    db().riwayat.push({ id_tiket: idTiket, dari: t.status, ke, waktu, oleh, catatan });
    t.status = ke;
    t.updated_at = waktu;
    return t;
  },

  /** Set Penanganan: dicatat saat tiket selesai, direset saat dibuka ulang. */
  setPenanganan(idTiket: number, penanganan: TiketRow["penanganan"], catatan: string | null = null) {
    const t = complaintTicket.getTiketRow(idTiket);
    t.penanganan = penanganan;
    t.catatan_penanganan = catatan;
  },

  /** Tiket yang ditangani sendiri boleh dibuka ulang penghuni maksimal HARI_BUKA_ULANG hari setelah ditutup. */
  bisaDibukaUlang(t: TiketRow, sekarang = new Date()): boolean {
    if (t.status !== "selesai" || t.penanganan !== "sendiri") return false;
    const tutup = db().riwayat.findLast((r) => r.id_tiket === t.id && r.ke === "selesai");
    if (!tutup) return false;
    return sekarang.getTime() - new Date(tutup.waktu).getTime() <= HARI_BUKA_ULANG * 24 * 60 * 60 * 1000;
  },

  /** Filter otorisasi data: penghuni -> miliknya, pemilik -> properti miliknya. */
  bolehLihat(user: PenggunaRow, t: TiketRow): boolean {
    const k = complaintTicket.getKeluhanRow(t.id_keluhan);
    if (user.role === "penghuni") return k.id_penghuni === user.id;
    // Teknisi hanya melihat tiket yang work order-nya ditugaskan kepadanya.
    if (user.role === "teknisi") return db().work_order.some((w) => w.id_tiket === t.id && w.id_teknisi === user.id);
    return tenantLease.unitRingkas(k.id_unit).id_pemilik === user.id;
  },

  toKeluhan(k: KeluhanRow): Keluhan {
    return {
      id: k.id, kode: kodeKeluhan(k.id), id_penghuni: k.id_penghuni, id_unit: k.id_unit,
      deskripsi: k.deskripsi, status: k.status, alasan_penolakan: k.alasan_penolakan,
      lampiran: mediaStorage.listByOwner(k.id), created_at: k.created_at,
    };
  },

  toRingkas(t: TiketRow): TiketRingkas {
    const k = complaintTicket.getKeluhanRow(t.id_keluhan);
    const { id_pemilik: _, ...unit } = tenantLease.unitRingkas(k.id_unit);
    return {
      id: t.id, kode: kodeTiket(t.id), judul: t.judul, status: t.status, kategori: t.kategori,
      urgensi: t.urgensi, perlu_review: t.perlu_review, penanganan: t.penanganan, unit,
      penghuni: toPengguna(tenantLease.pengguna(k.id_penghuni)),
      created_at: t.created_at, updated_at: t.updated_at,
    };
  },

  toDetail(t: TiketRow): TiketDetail {
    return {
      ...complaintTicket.toRingkas(t),
      keluhan: complaintTicket.toKeluhan(complaintTicket.getKeluhanRow(t.id_keluhan)),
      ai_confidence: t.ai_confidence,
      ai_alasan: t.ai_alasan,
      catatan_penanganan: t.catatan_penanganan,
      bisa_dibuka_ulang: complaintTicket.bisaDibukaUlang(t),
      riwayat: db()
        .riwayat.filter((r) => r.id_tiket === t.id)
        .map(({ dari, ke, waktu, oleh, catatan }) => ({ dari, ke, waktu, oleh, catatan })),
    };
  },

  list(user: PenggunaRow): TiketRingkas[] {
    return db()
      .tiket.filter((t) => complaintTicket.bolehLihat(user, t))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(complaintTicket.toRingkas);
  },

  detail(user: PenggunaRow, idTiket: number): TiketDetail {
    const t = complaintTicket.getTiketRow(idTiket);
    if (!complaintTicket.bolehLihat(user, t)) {
      throw new ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.");
    }
    return complaintTicket.toDetail(t);
  },
};

/* ===================================================================== */
/* Utility: Media Storage                                                 */
/* ===================================================================== */

const BATAS = { maksFile: 3, gambar: 5 * 1024 * 1024, video: 20 * 1024 * 1024 };

export const mediaStorage = {
  validasi(files: File[]) {
    if (files.length > BATAS.maksFile) {
      throw new ServiceError(422, "LAMPIRAN_TERLALU_BANYAK", "Maksimal 3 file lampiran.");
    }
    for (const f of files) {
      const gambar = f.type.startsWith("image/");
      const video = f.type === "video/mp4";
      if (!gambar && !video) {
        throw new ServiceError(422, "TIPE_FILE_DITOLAK", `${f.name}: hanya gambar atau video mp4.`);
      }
      if ((gambar && f.size > BATAS.gambar) || (video && f.size > BATAS.video)) {
        throw new ServiceError(422, "FILE_TERLALU_BESAR", `${f.name} melebihi batas ukuran.`);
      }
    }
  },

  /** Add Lampiran Media. Mock: URL berupa object URL browser (hilang saat reload). */
  simpan(file: File, ownerId: number | null, ownerType: LampiranRow["owner_type"] = "keluhan"): Lampiran {
    const row: LampiranRow = {
      id: db().seq.lampiran++,
      owner_type: ownerType,
      owner_id: ownerId ?? 0,
      url: URL.createObjectURL(file),
      nama_file: file.name,
      mime: file.type,
      ukuran_byte: file.size,
    };
    db().lampiran.push(row);
    const { owner_type: _t, owner_id: _o, ...lampiran } = row;
    return lampiran;
  },

  tautkan(idLampiran: number[], ownerId: number) {
    for (const l of db().lampiran) if (idLampiran.includes(l.id)) l.owner_id = ownerId;
  },

  listByOwner(ownerId: number): Lampiran[] {
    return db()
      .lampiran.filter((l) => l.owner_type === "keluhan" && l.owner_id === ownerId)
      .map(({ owner_type: _t, owner_id: _o, ...l }) => l);
  },

  get(id: number | null): Lampiran | null {
    const row = id === null ? undefined : db().lampiran.find((l) => l.id === id);
    if (!row) return null;
    const { owner_type: _t, owner_id: _o, ...l } = row;
    return l;
  },
};

/* ===================================================================== */
/* Utility: AI Classification                                             */
/* ===================================================================== */

export const aiClassification = {
  /**
   * MockClassifier: aturan keyword (lib/klasifikasi.ts).
   * Tulis "#gagal-ai" di deskripsi untuk menyimulasikan AI tidak tersedia (skenario demo 4).
   */
  classify(teks: string, jumlahGambar: number): KlasifikasiResponse {
    if (teks.includes("#gagal-ai")) {
      throw new ServiceError(503, "AI_TIDAK_TERSEDIA", "Layanan AI Classification sedang tidak tersedia.");
    }
    return klasifikasiKeyword(teks, jumlahGambar);
  },
};

/* ===================================================================== */
/* Utility: Notification (WhatsApp mock)                                  */
/* ===================================================================== */

export const notification = {
  /** Set Notifikasi: adapter MockWhatsApp hanya mencatat pesan ke outbox. */
  kirim(penerima: PenggunaRow[], kode: string, jenis: NotifikasiRow["jenis"], isi: (p: PenggunaRow) => string) {
    for (const p of penerima) {
      db().notifikasi.push({
        id: db().seq.notifikasi++, id_penerima: p.id, kode_tiket: kode, jenis, isi: isi(p),
        no_tujuan: p.no_wa, status_kirim: "terkirim", created_at: nowIso(),
      });
    }
    return penerima.length;
  },

  list(user: PenggunaRow): Notifikasi[] {
    return db()
      .notifikasi.filter((n) => n.id_penerima === user.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ id_penerima: _, ...n }) => ({ ...n, kanal: "whatsapp" as const }));
  },
};

/* ===================================================================== */
/* Task: Handle Maintenance Request                                       */
/* ===================================================================== */

type Penerima = { penghuni: PenggunaRow; pemilik: PenggunaRow; unit: string };

function penerimaTiket(t: TiketRow): Penerima {
  const k = complaintTicket.getKeluhanRow(t.id_keluhan);
  const unit = tenantLease.unitRingkas(k.id_unit);
  return {
    penghuni: tenantLease.pengguna(k.id_penghuni),
    pemilik: tenantLease.pengguna(unit.id_pemilik),
    unit: unit.nomor_unit,
  };
}

/** Pesan WhatsApp per jenis; isi untuk pemilik dan penghuni dibedakan. */
type JenisTiket = Extract<NotifikasiRow["jenis"], "tiket_dibuat" | "diklasifikasi" | "prioritas_tinggi" | "diproses" | "dibatalkan" | "selesai"> | "dibuka_ulang";

function kabariPerubahan(t: TiketRow, jenis: JenisTiket, catatan?: string) {
  const { penghuni, pemilik, unit } = penerimaTiket(t);
  const kode = kodeTiket(t.id);
  const kat = t.kategori ? LABEL_KATEGORI[t.kategori] : "";
  // Judul yang dipotong sudah berakhir "…", jangan ditambah titik lagi.
  const judul = t.judul.endsWith("…") ? t.judul : `${t.judul}.`;
  const pesan: Record<JenisTiket, [string, string]> = {
    tiket_dibuat: [`${judul} Unit ${unit} (${penghuni.nama}).`, `Laporanmu diterima: ${judul}`],
    diklasifikasi: [
      `${kat} · prioritas ${t.urgensi}. Unit ${unit} (${penghuni.nama}).`,
      `Laporanmu dikategorikan ${kat}, prioritas ${t.urgensi}.`,
    ],
    prioritas_tinggi: [
      `${judul} Unit ${unit} (${penghuni.nama}). Mohon segera dicek.`,
      "Laporanmu diprioritaskan TINGGI. Pemilik sudah dikabari.",
    ],
    diproses: [`Tiket ${unit} ditandai diproses.`, "Pemilik sedang memproses laporanmu."],
    dibatalkan: [`Tiket ${unit} dibatalkan.`, `Laporanmu dibatalkan oleh pemilik.${catatan ? ` Catatan: ${catatan}` : ""}`],
    selesai: [
      `Tiket ${unit} ditutup tanpa teknisi.`,
      `Pemilik menangani laporanmu tanpa memanggil teknisi.${catatan ? ` Catatan: ${catatan}` : ""} Kalau masih bermasalah, buka ulang tiketnya dalam ${HARI_BUKA_ULANG} hari.`,
    ],
    dibuka_ulang: [
      `${penghuni.nama} membuka ulang tiket ${unit}: ${catatan ?? "masih bermasalah"}. Mohon ditinjau lagi.`,
      "Tiketmu dibuka ulang. Pemilik akan meninjaunya lagi.",
    ],
  };
  const jenisNotif: NotifikasiRow["jenis"] = jenis === "dibuka_ulang" ? "tiket_dibuat" : jenis;
  return notification.kirim([pemilik, penghuni], kode, jenisNotif, (p) =>
    p.id === pemilik.id ? pesan[jenis][0] : pesan[jenis][1],
  );
}

export const hmr = {
  /** Operasi Add Keluhan: orkestrasi lengkap Complaint Handling (plan §3). */
  async ajukanKeluhan(user: PenggunaRow, deskripsi: string, files: File[]): Promise<{ status: 200 | 201; body: KeluhanResponse }> {
    auth.requireRole(user, "penghuni");
    const teks = deskripsi.trim();
    if (teks.length < 10 || teks.length > 1000) {
      throw new ServiceError(422, "DESKRIPSI_TIDAK_VALID", "Deskripsi harus 10 sampai 1000 karakter.");
    }
    mediaStorage.validasi(files);

    const tr = new Tracer();
    await tr.run("Handle Maintenance Request", "Task", `ajukanKeluhan(deskripsi, ${files.length} file)`, 2, () => null);
    const idUnit = await tr.run("Tenant and Lease", "Entity", (u: number) => `getIdUnit(penghuni=${user.id}) → ${u}`, jitter(3, 6), () =>
      tenantLease.getIdUnit(user.id),
    );
    const sewa = await tr.run("Tenant and Lease", "Entity", (s: StatusSewa) => `getStatusSewa(unit=${idUnit}) → ${s.status_sewa}`, jitter(3, 6), () =>
      tenantLease.getStatusSewa(idUnit),
    );

    // Cabang BPMN: sewa tidak aktif -> keluhan ditolak, tidak ada tiket.
    if (sewa.status_sewa !== "aktif") {
      const unit = tenantLease.unitRingkas(idUnit);
      const alasan = `Sewa ${unit.nama_properti} · ${unit.nomor_unit} berakhir ${tanggal(sewa.tanggal_selesai)}.`;
      const keluhan = await tr.run("Complaint Ticket", "Entity", "addKeluhan(status=ditolak)", jitter(5, 10), () =>
        complaintTicket.addKeluhan({ id_penghuni: user.id, id_unit: idUnit, deskripsi: teks, status: "ditolak", alasan_penolakan: alasan }),
      );
      commit();
      return {
        status: 200,
        body: { hasil: "ditolak", keluhan: complaintTicket.toKeluhan(keluhan), tiket: null, alasan, sewa, warning: null, trace: tr.steps },
      };
    }

    // Lampiran disimpan sebelum data keluhan ditulis (aturan kontrak D2 slide 9).
    const lampiran = await tr.run("Media Storage", "Utility", (l: Lampiran[]) => `addLampiranMedia(${l.length} file) → ${l.length} url`, files.length ? jitter(150, 260) : 4, () =>
      files.map((f) => mediaStorage.simpan(f, null)),
    );

    // Satu "transaksi": keluhan + tiket.
    const tiket = await tr.run("Complaint Ticket", "Entity", "addKeluhan + addTiket → status dibuat", jitter(8, 14), () => {
      const k = complaintTicket.addKeluhan({ id_penghuni: user.id, id_unit: idUnit, deskripsi: teks, status: "diterima", alasan_penolakan: null });
      mediaStorage.tautkan(lampiran.map((l) => l.id), k.id);
      const t = complaintTicket.addTiket(k.id, buatJudul(teks));
      commit();
      return t;
    });

    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(tiket_dibuat) × ${n} (WA mock)`, jitter(6, 10), () =>
      kabariPerubahan(tiket, "tiket_dibuat"),
    );

    // Panggilan AI di luar "transaksi"; bila gagal, tiket tetap ada berstatus "dibuat".
    const jumlahGambar = lampiran.filter((l) => l.mime.startsWith("image/")).length;
    let warning: string | null = null;
    try {
      const hasil = await tr.run(
        "AI Classification", "Utility",
        (h: KlasifikasiResponse) => `classifyKeluhan → ${LABEL_KATEGORI[h.kategori]}, ${h.urgensi}, ${h.confidence.toFixed(2)}`,
        jitter(1200, 2200),
        () => aiClassification.classify(teks, jumlahGambar),
      );
      await tr.run("Complaint Ticket", "Entity", "setKategoriUrgensi + setStatusTiket(diklasifikasi)", jitter(4, 8), () => {
        complaintTicket.setKategoriUrgensi(tiket.id, hasil);
        complaintTicket.setStatusTiket(tiket.id, "diklasifikasi", "AI Classification");
      });
      await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(${hasil.urgensi === "tinggi" ? "prioritas_tinggi" : "diklasifikasi"}) × ${n} (WA mock)`, jitter(6, 10), () =>
        kabariPerubahan(tiket, hasil.urgensi === "tinggi" ? "prioritas_tinggi" : "diklasifikasi"),
      );
    } catch (e) {
      if (!(e instanceof ServiceError) || e.status !== 503) throw e;
      warning = "Klasifikasi AI gagal. Tiket tetap dibuat dan menunggu klasifikasi ulang oleh pemilik.";
    }
    commit();

    const t = complaintTicket.getTiketRow(tiket.id);
    return {
      status: 201,
      body: {
        hasil: "diterima",
        keluhan: complaintTicket.toKeluhan(complaintTicket.getKeluhanRow(t.id_keluhan)),
        tiket: complaintTicket.toDetail(t),
        alasan: null,
        sewa,
        warning,
        trace: tr.steps,
      },
    };
  },

  /**
   * Keputusan pemilik atas tiket tanpa memanggil teknisi:
   * - "selesai": pemilik menilai tidak perlu teknisi (ditangani sendiri). Hanya dari "diklasifikasi", tanpa biaya.
   * - "dibatalkan": tiket dibatalkan beserta proses perbaikan yang berjalan.
   * Status "diproses" tidak diset manual: tiket diproses setelah pemilik memanggil teknisi
   * dan menyetujui estimasi biaya (setPersetujuanBiaya).
   */
  async ubahStatus(user: PenggunaRow, idTiket: number, ke: "selesai" | "dibatalkan", catatan?: string): Promise<TiketDetail> {
    auth.requireRole(user, "pemilik");
    if (ke !== "dibatalkan" && ke !== "selesai") {
      throw new ServiceError(422, "STATUS_TIDAK_DIDUKUNG", "Tiket diproses setelah pemilik memanggil teknisi dan menyetujui estimasi.");
    }
    const alasan = catatan?.trim().slice(0, 300) || undefined;
    await delay(jitter(250, 450));
    const t = complaintTicket.getTiketRow(idTiket);
    if (!complaintTicket.bolehLihat(user, t)) throw new ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.");
    if (ke === "selesai") {
      if (t.status !== "diklasifikasi") {
        throw new ServiceError(409, "TIDAK_BISA_DITUTUP", "Tiket bisa ditutup tanpa teknisi selama belum ada teknisi yang ditugaskan.");
      }
      complaintTicket.setStatusTiket(idTiket, "selesai", user.nama, alasan ?? null);
      complaintTicket.setPenanganan(idTiket, "sendiri", alasan ?? null);
      // Estimasi yang belum diputuskan tidak berlaku lagi; tidak ada work order, jadi tidak ada tagihan.
      for (const e of db().estimasi) if (e.id_tiket === idTiket && e.status === "menunggu") e.status = "ditolak";
      kabariPerubahan(t, "selesai", alasan);
      commit();
      return complaintTicket.toDetail(t);
    }
    complaintTicket.setStatusTiket(idTiket, ke, user.nama, alasan ?? null);
    // Batalkan juga proses perbaikan yang sedang berjalan.
    for (const e of db().estimasi) if (e.id_tiket === idTiket && e.status === "menunggu") e.status = "ditolak";
    const wo = workOrder.byTiket(idTiket);
    let invKunjungan: InvoiceRow | null = null;
    if (wo && wo.status !== "selesai" && wo.status !== "dibatalkan") {
      // Teknisi sudah tiba di lokasi -> pemilik tetap membayar biaya kunjungan.
      const sudahTiba = workOrder.getLog(wo.id).some((l) => l.aktivitas === "tiba");
      workOrder.setStatus(wo.id, "dibatalkan");
      workOrder.addLog(wo.id, "dibatalkan", user.nama, sudahTiba ? "Tiket dibatalkan pemilik setelah teknisi tiba; biaya kunjungan ditagihkan" : "Tiket dibatalkan pemilik");
      if (sudahTiba) {
        const est = db().estimasi.find((e) => e.id === wo.id_estimasi);
        const kunjungan = biayaKunjungan(est?.rincian ?? []);
        const komisi = hitungKomisi(kunjungan.total);
        invKunjungan = invoice.add({
          id_work_order: wo.id, jenis: "kunjungan", rincian: kunjungan.rincian, biaya: kunjungan.total,
          persen_komisi: komisi.persen, komisi: komisi.komisi,
        });
      }
    }
    kabariPerubahan(t, ke, alasan);
    if (invKunjungan) kabariTagihan(invKunjungan, "invoice");
    commit();
    return complaintTicket.toDetail(t);
  },

  async klasifikasiUlang(user: PenggunaRow, idTiket: number): Promise<TiketDetail> {
    auth.requireRole(user, "pemilik");
    const t = complaintTicket.getTiketRow(idTiket);
    if (!complaintTicket.bolehLihat(user, t)) throw new ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.");
    if (t.status !== "dibuat") throw new ServiceError(409, "SUDAH_DIKLASIFIKASI", "Tiket sudah diklasifikasi.");
    await delay(jitter(900, 1500));
    const k = complaintTicket.getKeluhanRow(t.id_keluhan);
    const gambar = mediaStorage.listByOwner(k.id).filter((l) => l.mime.startsWith("image/")).length;
    const hasil = aiClassification.classify(k.deskripsi.replace("#gagal-ai", ""), gambar);
    complaintTicket.setKategoriUrgensi(idTiket, hasil);
    complaintTicket.setStatusTiket(idTiket, "diklasifikasi", "AI Classification");
    kabariPerubahan(t, hasil.urgensi === "tinggi" ? "prioritas_tinggi" : "diklasifikasi");
    commit();
    return complaintTicket.toDetail(t);
  },

  /** Penghuni membuka ulang tiket yang ditutup pemilik tanpa teknisi -> kembali ke tahap tinjau pemilik. */
  async bukaUlang(user: PenggunaRow, idTiket: number, alasan: string): Promise<TiketDetail> {
    auth.requireRole(user, "penghuni");
    const teks = alasan.trim();
    if (teks.length < 5 || teks.length > 300) {
      throw new ServiceError(422, "ALASAN_TIDAK_VALID", "Ceritakan apa yang masih bermasalah (5 sampai 300 karakter).");
    }
    const t = complaintTicket.getTiketRow(idTiket);
    if (!complaintTicket.bolehLihat(user, t)) throw new ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.");
    if (!complaintTicket.bisaDibukaUlang(t)) {
      throw new ServiceError(409, "TIDAK_BISA_DIBUKA_ULANG", `Tiket hanya bisa dibuka ulang bila ditangani sendiri oleh pemilik, paling lama ${HARI_BUKA_ULANG} hari setelah ditutup.`);
    }
    await delay(jitter(250, 450));
    complaintTicket.setStatusTiket(idTiket, "diklasifikasi", user.nama, teks);
    complaintTicket.setPenanganan(idTiket, null);
    kabariPerubahan(t, "dibuka_ulang", teks);
    commit();
    return complaintTicket.toDetail(t);
  },
  /* ----------------------------------------------------------------- */
  /* Repair Verification (bagian HMR): estimasi, persetujuan, jadwal    */
  /* ----------------------------------------------------------------- */

  /**
   * Mencari teknisi dan menyajikan estimasi biaya (BPMN Repair Verification langkah 1-3).
   * Get Estimasi Biaya non-agnostic (D1), jadi catatan estimasi dimiliki Task HMR.
   */
  async buatEstimasi(user: PenggunaRow, idTiket: number): Promise<EstimasiResponse> {
    auth.requireRole(user, "pemilik");
    const tr = new Tracer();
    await tr.run("Handle Maintenance Request", "Task", `getEstimasiBiaya(tiket=${idTiket})`, 2, () => null);
    const t = await tr.run("Complaint Ticket", "Entity", (x: TiketRow) => `getTiket → ${x.kategori ?? "?"}, ${x.urgensi ?? "?"}`, jitter(3, 6), () => {
      const row = complaintTicket.getTiketRow(idTiket);
      if (!complaintTicket.bolehLihat(user, row)) throw new ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.");
      return row;
    });
    if (t.status !== "diklasifikasi" || !t.kategori || !t.urgensi) {
      throw new ServiceError(409, "TIKET_BELUM_SIAP", "Teknisi dicarikan untuk tiket yang sudah diklasifikasi dan belum diproses.");
    }
    const kategori = t.kategori;
    const urgensi = t.urgensi;
    const k = complaintTicket.getKeluhanRow(t.id_keluhan);
    const unit = tenantLease.unitRingkas(k.id_unit);
    const lokasi = tenantLease.lokasiProperti(k.id_unit);

    const calonRows = await tr.run("Technician", "Entity", (r: TeknisiRow[]) => `getTeknisiTersedia(${LABEL_KATEGORI[kategori]}) → ${r.length} teknisi`, jitter(4, 8), () =>
      technician.getTeknisi(),
    );
    await tr.run("Technician", "Entity", (n: number) => `getStatusVerifikasiTeknisi → ${n} terverifikasi`, jitter(3, 6), () =>
      calonRows.filter((r) => technician.getStatusVerifikasi(r.id_pengguna)).length,
    );
    const beban = await tr.run("Work Order", "Entity", "hitungBebanAktif(teknisi[])", jitter(3, 6), () =>
      new Map(calonRows.map((r) => [r.id_pengguna, workOrder.jumlahAktif(r.id_pengguna)])),
    );
    // Teknisi yang estimasinya sudah ditolak pemilik untuk tiket ini tidak dipilih lagi.
    const ditolak = new Set(
      db().estimasi.filter((e) => e.id_tiket === idTiket && e.status === "ditolak" && e.diputuskan_oleh !== null).map((e) => e.id_teknisi),
    );
    const kandidat = await tr.run(
      "Technician Matching", "Micro",
      (h: ReturnType<typeof matchTeknisi>) => `matchTeknisi(${LABEL_KATEGORI[kategori]}, ${urgensi}) → ${h.find((x) => x.lolos)?.teknisi.nama ?? "tidak ada"}`,
      jitter(180, 320),
      () =>
        matchTeknisi(kategori, urgensi, calonRows.map((r) => ({
          teknisi: technician.ringkas(r.id_pengguna),
          tersedia: r.tersedia,
          jarak_km: jarakKm(lokasi, r),
          beban: beban.get(r.id_pengguna) ?? 0,
          dikecualikan: ditolak.has(r.id_pengguna) ? "Estimasinya sudah kamu tolak" : undefined,
        }))),
    );
    const terpilih = kandidat.find((x) => x.lolos);
    if (!terpilih) {
      throw new ServiceError(
        422, "TEKNISI_TIDAK_ADA",
        ditolak.size
          ? "Tidak ada teknisi lain yang tersedia untuk kategori ini. Coba lagi nanti atau tangani sendiri."
          : "Belum ada teknisi terverifikasi yang tersedia untuk kategori ini.",
      );
    }
    const est = await tr.run("Cost Estimation", "Micro", (e: { total: number }) => `estimateBiaya → ${rupiah(e.total)}`, jitter(120, 240), () =>
      estimasiBiaya({ kategori, urgensi, deskripsi: k.deskripsi, jarak_km: terpilih.jarak_km }),
    );

    const row = await tr.run("Handle Maintenance Request", "Task", "simpan estimasi → menunggu persetujuan", jitter(3, 6), () => {
      // Estimasi lama yang belum diputuskan diganti yang baru.
      for (const e of db().estimasi) if (e.id_tiket === idTiket && e.status === "menunggu") e.status = "ditolak";
      const baru: EstimasiRow = {
        id: db().seq.estimasi++, id_tiket: idTiket, id_teknisi: terpilih.teknisi.id, kandidat, rincian: est.rincian,
        total: est.total, status: "menunggu", diputuskan_oleh: null, diputuskan_at: null, created_at: nowIso(),
      };
      db().estimasi.push(baru);
      return baru;
    });
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(estimasi) × ${n} (WA mock)`, jitter(6, 10), () =>
      notification.kirim([tenantLease.pengguna(unit.id_pemilik)], kodeTiket(t.id), "estimasi", () =>
        `Estimasi ${unit.nomor_unit}: ${rupiah(est.total)}, teknisi ${terpilih.teknisi.nama}. Biaya ditagihkan ke kamu bila disetujui. Buka Kosmos untuk memutuskan.`,
      ),
    );
    commit();
    return { estimasi: viewEstimasi(row), trace: tr.steps };
  },

  getEstimasi(user: PenggunaRow, idTiket: number): EstimasiBiaya | null {
    const t = complaintTicket.getTiketRow(idTiket);
    if (!complaintTicket.bolehLihat(user, t)) throw new ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.");
    const row = db().estimasi.filter((e) => e.id_tiket === idTiket).sort((a, b) => b.id - a.id)[0];
    return row ? viewEstimasi(row) : null;
  },

  /**
   * Set Persetujuan Biaya (non-agnostic). Disetujui -> Add Work Order + tiket diproses.
   * Ditolak -> tiket tetap diklasifikasi; pemilik bisa mencari teknisi lain atau menangani sendiri.
   */
  async setPersetujuan(user: PenggunaRow, idEstimasi: number, disetujui: boolean): Promise<PersetujuanResponse> {
    auth.requireRole(user, "pemilik");
    const est = db().estimasi.find((e) => e.id === idEstimasi);
    if (!est) throw new ServiceError(404, "ESTIMASI_TIDAK_ADA", "Estimasi tidak ditemukan.");
    const t = complaintTicket.getTiketRow(est.id_tiket);
    if (!complaintTicket.bolehLihat(user, t)) throw new ServiceError(404, "ESTIMASI_TIDAK_ADA", "Estimasi tidak ditemukan.");
    if (est.status !== "menunggu") throw new ServiceError(409, "SUDAH_DIPUTUSKAN", "Estimasi ini sudah diputuskan.");

    const tr = new Tracer();
    await tr.run("Handle Maintenance Request", "Task", `setPersetujuanBiaya(${disetujui ? "disetujui" : "ditolak"})`, jitter(3, 6), () => {
      est.status = disetujui ? "disetujui" : "ditolak";
      est.diputuskan_oleh = user.nama;
      est.diputuskan_at = nowIso();
    });

    if (!disetujui) {
      // Tiket tidak dibatalkan: kerusakannya masih ada, pemilik kembali ke tahap tinjau.
      commit();
      return { estimasi: viewEstimasi(est), tiket: complaintTicket.toDetail(t), work_order: null, trace: tr.steps };
    }

    const wo = await tr.run("Work Order", "Entity", (w: WorkOrderRow) => `addWorkOrder → ${kodeWo(w.id)}, status menunggu_jadwal`, jitter(6, 12), () =>
      workOrder.add({
        id_tiket: t.id, id_teknisi: est.id_teknisi, id_estimasi: est.id, biaya_final: est.total,
        slot_jadwal: usulanSlot(t.urgensi ?? "rendah"),
      }),
    );
    await tr.run("Complaint Ticket", "Entity", "setStatusTiket(diproses)", jitter(4, 8), () =>
      complaintTicket.setStatusTiket(t.id, "diproses", user.nama),
    );
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(teknisi_ditugaskan) × ${n} (WA mock)`, jitter(6, 10), () =>
      kabariPerbaikan(wo, "teknisi_ditugaskan"),
    );
    commit();
    return { estimasi: viewEstimasi(est), tiket: complaintTicket.toDetail(t), work_order: viewWorkOrder(wo), trace: tr.steps };
  },

  /** Set Persetujuan Biaya Tambahan: pemilik memutuskan biaya di luar estimasi yang diajukan teknisi. */
  async putuskanBiayaTambahan(user: PenggunaRow, idWo: number, idTambahan: number, disetujui: boolean): Promise<WorkOrder> {
    auth.requireRole(user, "pemilik");
    const wo = workOrder.getUntuk(user, idWo);
    const tambahan = wo.biaya_tambahan.find((b) => b.id === idTambahan);
    if (!tambahan) throw new ServiceError(404, "BIAYA_TAMBAHAN_TIDAK_ADA", "Pengajuan biaya tambahan tidak ditemukan.");
    if (tambahan.status !== "menunggu") throw new ServiceError(409, "SUDAH_DIPUTUSKAN", "Biaya tambahan ini sudah diputuskan.");
    if (wo.status === "selesai" || wo.status === "dibatalkan") throw new ServiceError(409, "WORK_ORDER_DITUTUP", "Work order sudah ditutup.");
    await delay(jitter(250, 450));
    workOrder.putuskanTambahan(wo.id, idTambahan, disetujui);
    workOrder.addLog(wo.id, disetujui ? "biaya_tambahan_disetujui" : "biaya_tambahan_ditolak", user.nama, `${rupiah(tambahan.jumlah)}: ${tambahan.alasan}`);
    kabariPerbaikan(wo, disetujui ? "tambahan_disetujui" : "tambahan_ditolak", `${rupiah(tambahan.jumlah)} (${tambahan.alasan})`);
    commit();
    return viewWorkOrder(wo);
  },

  /** Penghuni mengonfirmasi jadwal kunjungan (Set Jadwal Kunjungan). */
  async konfirmasiJadwal(user: PenggunaRow, idWo: number, waktu: string): Promise<WorkOrder> {
    auth.requireRole(user, "penghuni");
    const wo = workOrder.getUntuk(user, idWo);
    if (wo.status !== "menunggu_jadwal") throw new ServiceError(409, "JADWAL_SUDAH_ADA", "Jadwal kunjungan sudah dikonfirmasi.");
    if (!wo.slot_jadwal.includes(waktu)) throw new ServiceError(422, "SLOT_TIDAK_VALID", "Pilih salah satu jadwal yang ditawarkan.");
    await delay(jitter(250, 450));
    workOrder.setJadwal(wo.id, waktu);
    workOrder.addLog(wo.id, "jadwal", user.nama, fmtJadwal(waktu));
    kabariPerbaikan(wo, "jadwal");
    commit();
    return viewWorkOrder(wo);
  },
};

/** Usulan jadwal kunjungan: urgensi tinggi dalam hitungan jam, selain itu esok hari. */
function usulanSlot(urgensi: Urgensi, dari = new Date()): string[] {
  const jamKe = (tambahJam: number) => {
    const d = new Date(dari);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + tambahJam);
    return d.toISOString();
  };
  const hariKe = (tambahHari: number, jam: number) => {
    const d = new Date(dari);
    d.setDate(d.getDate() + tambahHari);
    d.setHours(jam, 0, 0, 0);
    return d.toISOString();
  };
  if (urgensi === "tinggi") return [jamKe(2), jamKe(4), hariKe(1, 9)];
  return [hariKe(1, 10), hariKe(1, 15), hariKe(2, 10)];
}

/* ===================================================================== */
/* Entity: Technician                                                     */
/* ===================================================================== */

export const technician = {
  getRow(idPengguna: number): TeknisiRow {
    const t = db().teknisi.find((x) => x.id_pengguna === idPengguna);
    if (!t) throw new ServiceError(404, "TEKNISI_TIDAK_ADA", "Teknisi tidak ditemukan.");
    return t;
  },

  /** Get Teknisi Tersedia: semua mitra beserta status ketersediaannya (difilter oleh Technician Matching). */
  getTeknisi(): TeknisiRow[] {
    return db().teknisi;
  },

  /** Get Status Verifikasi Teknisi. */
  getStatusVerifikasi(idPengguna: number): boolean {
    return technician.getRow(idPengguna).terverifikasi;
  },

  ringkas(idPengguna: number): TeknisiRingkas {
    const t = technician.getRow(idPengguna);
    const p = tenantLease.pengguna(idPengguna);
    return { id: p.id, nama: p.nama, keahlian: t.keahlian, terverifikasi: t.terverifikasi, rating: t.rating, no_wa: p.no_wa };
  },
};

/* ===================================================================== */
/* Entity: Work Order                                                     */
/* ===================================================================== */

const TRANSISI_WO: Record<StatusWorkOrder, StatusWorkOrder[]> = {
  menunggu_jadwal: ["dijadwalkan", "dibatalkan"],
  dijadwalkan: ["dikerjakan", "dibatalkan"],
  dikerjakan: ["menunggu_konfirmasi", "dibatalkan"],
  // menunggu_konfirmasi -> selesai: pemilik menerima hasil tanpa menunggu penghuni yang tidak merespons.
  menunggu_konfirmasi: ["menunggu_pemilik", "selesai", "dikerjakan", "dibatalkan"],
  menunggu_pemilik: ["selesai", "dikerjakan", "dibatalkan"],
  selesai: [],
  dibatalkan: [],
};

export const workOrder = {
  /** Add Work Order. */
  add(input: Pick<WorkOrderRow, "id_tiket" | "id_teknisi" | "id_estimasi" | "biaya_final" | "slot_jadwal">): WorkOrderRow {
    const waktu = nowIso();
    const row: WorkOrderRow = {
      ...input, id: db().seq.work_order++, status: "menunggu_jadwal", jadwal_kunjungan: null,
      id_bukti_sebelum: null, id_bukti_sesudah: null, verifikasi: null, biaya_tambahan: [], created_at: waktu, updated_at: waktu,
    };
    db().work_order.push(row);
    workOrder.addLog(row.id, "dibuat", "sistem", `Ditugaskan ke ${tenantLease.pengguna(row.id_teknisi).nama}`);
    return row;
  },

  get(idWo: number): WorkOrderRow {
    const w = db().work_order.find((x) => x.id === idWo);
    if (!w) throw new ServiceError(404, "WORK_ORDER_TIDAK_ADA", "Work order tidak ditemukan.");
    return w;
  },

  byTiket(idTiket: number): WorkOrderRow | undefined {
    return db().work_order.filter((w) => w.id_tiket === idTiket).sort((a, b) => b.id - a.id)[0];
  },

  bolehLihat(user: PenggunaRow, w: WorkOrderRow): boolean {
    if (user.role === "teknisi") return w.id_teknisi === user.id;
    return complaintTicket.bolehLihat(user, complaintTicket.getTiketRow(w.id_tiket));
  },

  /** Get Work Order dengan otorisasi data (404 bila bukan miliknya). */
  getUntuk(user: PenggunaRow, idWo: number): WorkOrderRow {
    const w = workOrder.get(idWo);
    if (!workOrder.bolehLihat(user, w)) throw new ServiceError(404, "WORK_ORDER_TIDAK_ADA", "Work order tidak ditemukan.");
    return w;
  },

  detail(user: PenggunaRow, idWo: number): WorkOrder {
    return viewWorkOrder(workOrder.getUntuk(user, idWo));
  },

  list(user: PenggunaRow, idTiket?: number): WorkOrder[] {
    return db()
      .work_order.filter((w) => (idTiket === undefined || w.id_tiket === idTiket) && workOrder.bolehLihat(user, w))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(viewWorkOrder);
  },

  jumlahAktif(idTeknisi: number): number {
    return db().work_order.filter((w) => w.id_teknisi === idTeknisi && w.status !== "selesai" && w.status !== "dibatalkan").length;
  },

  setStatus(idWo: number, ke: StatusWorkOrder): WorkOrderRow {
    const w = workOrder.get(idWo);
    if (!TRANSISI_WO[w.status].includes(ke)) {
      throw new ServiceError(409, "TRANSISI_TIDAK_VALID", `Work order tidak bisa berubah dari ${w.status} ke ${ke}.`);
    }
    w.status = ke;
    w.updated_at = nowIso();
    return w;
  },

  /** Set Jadwal Kunjungan. */
  setJadwal(idWo: number, waktu: string) {
    const w = workOrder.setStatus(idWo, "dijadwalkan");
    w.jadwal_kunjungan = waktu;
  },

  /** Add Log Servis. */
  addLog(idWo: number, aktivitas: LogServis["aktivitas"], oleh: string, catatan: string | null = null) {
    db().log_servis.push({ id_work_order: idWo, aktivitas, catatan, waktu: nowIso(), oleh });
  },

  /** Get Progress Servis. */
  getLog(idWo: number): LogServis[] {
    return db()
      .log_servis.filter((l) => l.id_work_order === idWo)
      .map(({ id_work_order: _, ...l }) => l);
  },

  setBukti(idWo: number, idSebelum: number, idSesudah: number, verifikasi: WorkOrderRow["verifikasi"]) {
    const w = workOrder.get(idWo);
    w.id_bukti_sebelum = idSebelum;
    w.id_bukti_sesudah = idSesudah;
    w.verifikasi = verifikasi;
    w.updated_at = nowIso();
  },

  /** Add Biaya Tambahan: satu pengajuan menunggu dalam satu waktu. */
  addTambahan(idWo: number, alasan: string, jumlah: number): BiayaTambahan {
    const w = workOrder.get(idWo);
    const row: BiayaTambahan = {
      id: db().seq.biaya_tambahan++, alasan, jumlah, status: "menunggu", diajukan_at: nowIso(), diputuskan_at: null,
    };
    w.biaya_tambahan.push(row);
    w.updated_at = row.diajukan_at;
    return row;
  },

  /** Disetujui menambah biaya final. */
  putuskanTambahan(idWo: number, idTambahan: number, disetujui: boolean) {
    const w = workOrder.get(idWo);
    const b = w.biaya_tambahan.find((x) => x.id === idTambahan)!;
    b.status = disetujui ? "disetujui" : "ditolak";
    b.diputuskan_at = nowIso();
    if (disetujui) w.biaya_final += b.jumlah;
    w.updated_at = b.diputuskan_at;
  },

  adaTambahanMenunggu(w: WorkOrderRow): boolean {
    return w.biaya_tambahan.some((b) => b.status === "menunggu");
  },

  /** Get Biaya Final. */
  getBiayaFinal(idWo: number): number {
    return workOrder.get(idWo).biaya_final;
  },
};

/* ===================================================================== */
/* Entity: Invoice                                                        */
/* ===================================================================== */

export const invoice = {
  /** Add Invoice. Jatuh tempo 7 hari setelah terbit. */
  add(input: Pick<InvoiceRow, "id_work_order" | "jenis" | "rincian" | "biaya" | "persen_komisi" | "komisi">): InvoiceRow {
    const terbit = new Date();
    const tempo = new Date(terbit);
    tempo.setDate(tempo.getDate() + 7);
    const row: InvoiceRow = {
      ...input, id: db().seq.invoice++, total: input.biaya, status: "belum_dibayar",
      jatuh_tempo: tempo.toISOString().slice(0, 10), dibayar_at: null, created_at: terbit.toISOString(),
    };
    db().invoice.push(row);
    return row;
  },

  get(idInvoice: number): InvoiceRow {
    const i = db().invoice.find((x) => x.id === idInvoice);
    if (!i) throw new ServiceError(404, "INVOICE_TIDAK_ADA", "Invoice tidak ditemukan.");
    return i;
  },

  byWorkOrder(idWo: number): InvoiceRow | undefined {
    return db().invoice.find((i) => i.id_work_order === idWo);
  },

  /** Invoice perbaikan ditagihkan ke pemilik properti; penghuni dan teknisi tidak melihatnya. */
  bolehLihat(user: PenggunaRow, i: InvoiceRow): boolean {
    if (user.role !== "pemilik") return false;
    return workOrder.bolehLihat(user, workOrder.get(i.id_work_order));
  },

  /** Get Invoice dengan otorisasi data. */
  getUntuk(user: PenggunaRow, idInvoice: number): InvoiceRow {
    const i = invoice.get(idInvoice);
    if (!invoice.bolehLihat(user, i)) throw new ServiceError(404, "INVOICE_TIDAK_ADA", "Invoice tidak ditemukan.");
    return i;
  },

  detail(user: PenggunaRow, idInvoice: number): Invoice {
    return viewInvoice(invoice.getUntuk(user, idInvoice));
  },

  list(user: PenggunaRow): Invoice[] {
    return db()
      .invoice.filter((i) => invoice.bolehLihat(user, i))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(viewInvoice);
  },

  /** Belum dibayar dan sudah lewat jatuh tempo (dihitung, tidak disimpan). */
  terlambat(i: InvoiceRow, hariIni = new Date().toISOString().slice(0, 10)): boolean {
    return i.status === "belum_dibayar" && hariIni > i.jatuh_tempo;
  },

  setLunas(idInvoice: number, waktu: string) {
    const i = invoice.get(idInvoice);
    i.status = "lunas";
    i.dibayar_at = waktu;
  },
};

/* ===================================================================== */
/* Entity: Payment (+ adapter payment gateway mock)                       */
/* ===================================================================== */

const refGateway = () => `PG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export const payment = {
  /**
   * Set Metode Pembayaran: membuka transaksi baru berstatus pending.
   * Bayar sekaligus: beberapa baris berbagi satu ref_gateway (satu transaksi di gateway).
   */
  setMetode(untuk: PembayaranRow["untuk"], idTagihan: number, metode: MetodePembayaran, jumlah: number, ref: string = refGateway()): PembayaranRow {
    const row: PembayaranRow = {
      id: db().seq.pembayaran++, untuk, id_tagihan: idTagihan, ref_gateway: ref,
      metode, jumlah, status: "pending", alasan_gagal: null, direkonsiliasi: false, created_at: nowIso(),
    };
    db().pembayaran.push(row);
    return row;
  },

  refBaru: (): string => refGateway(),

  /**
   * Process Payment ke payment gateway (adapter mock). Gateway sungguhan (mis. Midtrans/Xendit)
   * mengembalikan status lewat callback; di mock, status langsung diketahui.
   */
  processPayment(p: PembayaranRow, simulasiGagal: boolean): { status: "berhasil" | "gagal"; alasan: string | null } {
    if (!simulasiGagal) return { status: "berhasil", alasan: null };
    const alasan: Record<MetodePembayaran, string> = {
      qris: "QR kedaluwarsa sebelum dibayar",
      va_bca: "Virtual account tidak dibayar sampai batas waktu",
      va_mandiri: "Virtual account tidak dibayar sampai batas waktu",
      gopay: "Saldo e-wallet tidak cukup",
    };
    return { status: "gagal", alasan: alasan[p.metode] };
  },

  /** Get Status Pembayaran (dari gateway). */
  getStatus(p: PembayaranRow, hasil: { status: "berhasil" | "gagal" }) {
    return hasil.status === "berhasil" ? "settlement" : "deny";
  },

  /** Set Status Pembayaran. */
  setStatus(idPembayaran: number, status: "berhasil" | "gagal", alasan: string | null) {
    const p = db().pembayaran.find((x) => x.id === idPembayaran)!;
    p.status = status;
    p.alasan_gagal = alasan;
  },

  /** Reconcile Pembayaran: jumlah transaksi gateway harus sama dengan tagihan. */
  reconcile(idPembayaran: number, totalTagihan: number): boolean {
    const p = db().pembayaran.find((x) => x.id === idPembayaran)!;
    p.direkonsiliasi = p.status === "berhasil" && p.jumlah === totalTagihan;
    return p.direkonsiliasi;
  },

  list(untuk: PembayaranRow["untuk"], idTagihan: number): Pembayaran[] {
    return db()
      .pembayaran.filter((p) => p.untuk === untuk && p.id_tagihan === idTagihan)
      .map(viewPembayaran);
  },
};

/* ===================================================================== */
/* Entity: Rent Invoice (tagihan sewa bulanan)                            */
/* ===================================================================== */

export const rentInvoice = {
  get(id: number): TagihanSewaRow {
    const t = db().tagihan_sewa.find((x) => x.id === id);
    if (!t) throw new ServiceError(404, "TAGIHAN_SEWA_TIDAK_ADA", "Tagihan sewa tidak ditemukan.");
    return t;
  },

  sewa(t: TagihanSewaRow) {
    return db().sewa.find((s) => s.id === t.id_sewa)!;
  },

  /** Penghuni melihat tagihannya sendiri, pemilik melihat tagihan di propertinya. */
  bolehLihat(user: PenggunaRow, t: TagihanSewaRow): boolean {
    const sw = rentInvoice.sewa(t);
    if (user.role === "penghuni") return sw.id_penghuni === user.id;
    if (user.role === "pemilik") return tenantLease.unitRingkas(sw.id_unit).id_pemilik === user.id;
    return false;
  },

  getUntuk(user: PenggunaRow, id: number): TagihanSewaRow {
    const t = rentInvoice.get(id);
    if (!rentInvoice.bolehLihat(user, t)) throw new ServiceError(404, "TAGIHAN_SEWA_TIDAK_ADA", "Tagihan sewa tidak ditemukan.");
    return t;
  },

  detail(user: PenggunaRow, id: number): TagihanSewa {
    return viewTagihanSewa(rentInvoice.getUntuk(user, id));
  },

  list(user: PenggunaRow): TagihanSewa[] {
    return db()
      .tagihan_sewa.filter((t) => rentInvoice.bolehLihat(user, t))
      .sort((a, b) => b.periode.localeCompare(a.periode) || a.id - b.id)
      .map(viewTagihanSewa);
  },

  ada(idSewa: number, periode: string): boolean {
    return db().tagihan_sewa.some((t) => t.id_sewa === idSewa && t.periode === periode);
  },

  /** Add Tagihan Sewa. Jatuh tempo tanggal 10 bulan periode. */
  add(idSewa: number, periode: string, jumlah: number): TagihanSewaRow {
    const row: TagihanSewaRow = {
      id: db().seq.tagihan_sewa++, id_sewa: idSewa, periode, jumlah, jatuh_tempo: `${periode}-10`,
      status: "belum_dibayar", dibayar_at: null, created_at: nowIso(),
    };
    db().tagihan_sewa.push(row);
    return row;
  },

  terlambat(t: TagihanSewaRow, hariIni = new Date().toISOString().slice(0, 10)): boolean {
    return t.status === "belum_dibayar" && hariIni > t.jatuh_tempo;
  },

  setLunas(id: number, waktu: string) {
    const t = rentInvoice.get(id);
    t.status = "lunas";
    t.dibayar_at = waktu;
  },
};

/* ===================================================================== */
/* Task: Rent Billing                                                     */
/* ===================================================================== */

export const rb = {
  /** Terbitkan tagihan sewa bulan berjalan untuk semua sewa aktif yang belum ditagih (idempoten). */
  async terbitkan(user: PenggunaRow): Promise<TerbitkanSewaResponse> {
    auth.requireRole(user, "pemilik");
    const tr = new Tracer();
    const sekarang = new Date();
    const periode = periodeDari(sekarang);
    await tr.run("Rent Billing", "Task", `terbitkanTagihanSewa(${periode})`, 2, () => null);
    // Hanya sewa yang aktif hari ini (sama dengan seed dan plan §11b #6); sewa yang berakhir awal bulan tidak ditagih lagi.
    const sewaAktif = await tr.run("Tenant and Lease", "Entity", (r: SewaRow[]) => `getSewaAktif(pemilik=${user.id}) → ${r.length} sewa`, jitter(4, 8), () =>
      tenantLease.unitMilik(user.id).map((u) => tenantLease.sewaAktif(u.id)).filter((sw): sw is SewaRow => sw !== null),
    );
    const dibuat = await tr.run("Rent Invoice", "Entity", (r: TagihanSewaRow[]) => `addTagihanSewa × ${r.length}`, jitter(6, 12), () =>
      sewaAktif
        .filter((sw) => !rentInvoice.ada(sw.id, periode))
        .map((sw) => rentInvoice.add(sw.id, periode, db().unit.find((u) => u.id === sw.id_unit)!.harga_bulanan)),
    );
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(invoice) × ${n} (WA mock)`, jitter(6, 10), () => {
      for (const t of dibuat) kabariSewa(t, "invoice");
      return dibuat.length;
    });
    commit();
    return { periode, dibuat: dibuat.map(viewTagihanSewa), trace: tr.steps };
  },

  /** Penghuni membayar sewa: gateway -> status -> rekonsiliasi -> lunas -> pemasukan di laporan kas pemilik. */
  async bayar(user: PenggunaRow, idTagihan: number, metode: MetodePembayaran, simulasiGagal: boolean): Promise<BayarSewaResponse> {
    auth.requireRole(user, "penghuni");
    if (!(metode in LABEL_METODE)) throw new ServiceError(422, "METODE_TIDAK_VALID", "Metode pembayaran tidak didukung.");
    const tr = new Tracer();
    await tr.run("Rent Billing", "Task", `bayarTagihanSewa(${kodeTagihanSewa(idTagihan)}, ${metode})`, 2, () => null);
    const t = await tr.run("Rent Invoice", "Entity", (x: TagihanSewaRow) => `getTagihanSewa → ${x.status}, ${rupiah(x.jumlah)}`, jitter(3, 6), () =>
      rentInvoice.getUntuk(user, idTagihan),
    );
    if (t.status === "lunas") throw new ServiceError(409, "SUDAH_LUNAS", "Tagihan sewa ini sudah lunas.");
    const p = await tr.run("Payment", "Entity", `setMetodePembayaran(${LABEL_METODE[metode]})`, jitter(4, 8), () => payment.setMetode("sewa", t.id, metode, t.jumlah));
    const hasil = await tr.run("Payment", "Entity", (h: { status: string }) => `processPayment via payment gateway (mock) → ${h.status}`, jitter(900, 1500), () =>
      payment.processPayment(p, simulasiGagal),
    );
    await tr.run("Payment", "Entity", `setStatusPembayaran(${hasil.status})`, jitter(3, 6), () => payment.setStatus(p.id, hasil.status, hasil.alasan));
    if (hasil.status === "gagal") {
      kabariSewa(t, "bayar_gagal", hasil.alasan ?? undefined);
      commit();
      return { hasil: "gagal", tagihan: viewTagihanSewa(t), pembayaran: viewPembayaran(p), alasan: hasil.alasan, trace: tr.steps };
    }
    await tr.run("Payment", "Entity", "reconcilePembayaran → cocok", jitter(80, 160), () => {
      if (!payment.reconcile(p.id, t.jumlah)) throw new ServiceError(409, "REKONSILIASI_GAGAL", "Jumlah transaksi tidak cocok dengan tagihan.");
    });
    await tr.run("Rent Invoice", "Entity", "setStatus(lunas)", jitter(3, 6), () => rentInvoice.setLunas(t.id, nowIso()));
    await tr.run("Financial Ledger", "Entity", "addTransaksiKas(sewa)", jitter(6, 12), () => {
      const sw = rentInvoice.sewa(t);
      const unit = tenantLease.unitRingkas(sw.id_unit);
      ledger.add({
        id_pemilik: unit.id_pemilik, waktu: nowIso(), jenis: "sewa", ref: kodeTagihanSewa(t.id), properti: unit.nama_properti,
        keterangan: `Sewa ${unit.nomor_unit} ${labelPeriode(t.periode)} · ${user.nama}`, jumlah: t.jumlah,
      });
    });
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(lunas) × ${n} (WA mock)`, jitter(6, 10), () => kabariSewa(t, "lunas"));
    commit();
    return { hasil: "berhasil", tagihan: viewTagihanSewa(t), pembayaran: viewPembayaran(p), alasan: null, trace: tr.steps };
  },
};

function kabariSewa(t: TagihanSewaRow, jenis: "invoice" | "lunas" | "bayar_gagal", alasan?: string) {
  const sw = rentInvoice.sewa(t);
  const unit = tenantLease.unitRingkas(sw.id_unit);
  const penghuni = tenantLease.pengguna(sw.id_penghuni);
  const pemilik = tenantLease.pengguna(unit.id_pemilik);
  const kode = kodeTagihanSewa(t.id);
  const bulan = labelPeriode(t.periode);
  const pesan: Record<typeof jenis, Array<[PenggunaRow, string]>> = {
    invoice: [[penghuni, `Tagihan sewa ${unit.nomor_unit} ${bulan} ${rupiah(t.jumlah)} (${kode}) sudah terbit. Jatuh tempo ${tanggal(t.jatuh_tempo)}.`]],
    lunas: [
      [penghuni, `Pembayaran sewa ${bulan} ${rupiah(t.jumlah)} berhasil. Terima kasih!`],
      [pemilik, `Sewa ${unit.nomor_unit} ${bulan} dibayar ${penghuni.nama} (${rupiah(t.jumlah)}). Tercatat di laporan kas.`],
    ],
    bayar_gagal: [[penghuni, `Pembayaran sewa ${kode} gagal: ${alasan}. Silakan coba lagi.`]],
  };
  for (const [p, isi] of pesan[jenis]) notification.kirim([p], kode, jenis, () => isi);
  return pesan[jenis].length;
}

/* ===================================================================== */
/* Entity: Financial Ledger                                               */
/* ===================================================================== */

export const ledger = {
  /** Add Transaksi Kas. */
  add(row: Omit<TransaksiKasRow, "id">) {
    db().kas.push({ ...row, id: db().seq.kas++ });
  },

  /** Get Laporan Kas pemilik. Ringkasan invoice tertunda dihitung oleh Task (lihat csm.laporanKas). */
  list(idPemilik: number) {
    return db()
      .kas.filter((k) => k.id_pemilik === idPemilik)
      .sort((a, b) => b.waktu.localeCompare(a.waktu) || a.id - b.id)
      .map(({ id_pemilik: _, ...k }) => k);
  },
};

/* ===================================================================== */
/* Task: Complete and Settle Maintenance                                  */
/* ===================================================================== */

export const csm = {
  /** Teknisi mencatat log servis. "tiba" memindahkan work order ke dikerjakan. */
  async catatLog(user: PenggunaRow, idWo: number, aktivitas: "tiba" | "mulai" | "catatan", catatan?: string): Promise<WorkOrder> {
    auth.requireRole(user, "teknisi");
    const wo = workOrder.getUntuk(user, idWo);
    const sudah = (a: LogServis["aktivitas"]) => workOrder.getLog(wo.id).some((l) => l.aktivitas === a);
    if (aktivitas === "tiba" && wo.status !== "dijadwalkan") {
      throw new ServiceError(409, "BELUM_DIJADWALKAN", wo.status === "menunggu_jadwal" ? "Penghuni belum mengonfirmasi jadwal." : "Kedatangan sudah tercatat.");
    }
    if (aktivitas === "mulai" && (wo.status !== "dikerjakan" || sudah("mulai"))) {
      throw new ServiceError(409, "TIDAK_BISA_MULAI", "Catat kedatangan dulu sebelum mulai memperbaiki.");
    }
    if (aktivitas === "catatan" && !(catatan ?? "").trim()) {
      throw new ServiceError(422, "CATATAN_KOSONG", "Catatan tidak boleh kosong.");
    }
    if (aktivitas === "catatan" && (wo.status === "selesai" || wo.status === "dibatalkan")) {
      throw new ServiceError(409, "WORK_ORDER_DITUTUP", "Work order sudah ditutup.");
    }
    await delay(jitter(200, 400));
    if (aktivitas === "tiba") workOrder.setStatus(wo.id, "dikerjakan");
    workOrder.addLog(wo.id, aktivitas, user.nama, catatan?.trim() || null);
    if (aktivitas !== "catatan") kabariPerbaikan(wo, "progres", aktivitas === "tiba" ? `${user.nama} sudah tiba di lokasi.` : `${user.nama} mulai memperbaiki.`);
    commit();
    return viewWorkOrder(wo);
  },

  /** Teknisi mengajukan biaya di luar estimasi. Pemilik memutuskan lewat hmr.putuskanBiayaTambahan. */
  async ajukanBiayaTambahan(user: PenggunaRow, idWo: number, alasan: string, jumlah: number): Promise<WorkOrder> {
    auth.requireRole(user, "teknisi");
    const wo = workOrder.getUntuk(user, idWo);
    const teks = alasan.trim();
    if (teks.length < 5 || teks.length > 200) throw new ServiceError(422, "ALASAN_TIDAK_VALID", "Jelaskan alasan biaya tambahan (5 sampai 200 karakter).");
    if (!Number.isInteger(jumlah) || jumlah < 1_000 || jumlah > 5_000_000) {
      throw new ServiceError(422, "JUMLAH_TIDAK_VALID", "Biaya tambahan antara Rp 1.000 dan Rp 5.000.000.");
    }
    if (wo.status !== "dikerjakan") throw new ServiceError(409, "TIDAK_SEDANG_DIKERJAKAN", "Biaya tambahan diajukan saat perbaikan sedang dikerjakan.");
    if (workOrder.adaTambahanMenunggu(wo)) throw new ServiceError(409, "MASIH_MENUNGGU", "Masih ada biaya tambahan yang menunggu keputusan pemilik.");
    await delay(jitter(250, 450));
    workOrder.addTambahan(wo.id, teks, jumlah);
    workOrder.addLog(wo.id, "biaya_tambahan", user.nama, `${rupiah(jumlah)}: ${teks}`);
    kabariPerbaikan(wo, "tambahan_diajukan", `${rupiah(jumlah)} (${teks})`);
    commit();
    return viewWorkOrder(wo);
  },

  /** Teknisi mengunggah bukti -> Media Storage -> Evidence Verification -> status work order. */
  async unggahBukti(user: PenggunaRow, idWo: number, sebelum: File | null, sesudah: File | null): Promise<BuktiResponse> {
    auth.requireRole(user, "teknisi");
    const wo = workOrder.getUntuk(user, idWo);
    if (wo.status !== "dikerjakan") {
      throw new ServiceError(409, "TIDAK_SEDANG_DIKERJAKAN", "Bukti diunggah saat work order sedang dikerjakan.");
    }
    for (const f of [sebelum, sesudah]) if (f) mediaStorage.validasi([f]);

    const tr = new Tracer();
    await tr.run("Complete and Settle Maintenance", "Task", `unggahBukti(${kodeWo(wo.id)})`, 2, () => null);
    const [fSebelum, fSesudah] = await tr.run("Media Storage", "Utility", (l: Array<Lampiran | null>) => `addLampiranMedia(${l.filter(Boolean).length} file) → url`, jitter(150, 260), () =>
      [sebelum, sesudah].map((f) => (f ? mediaStorage.simpan(f, wo.id, "bukti") : null)),
    );
    const hasil = await tr.run("Evidence Verification", "Micro", (v: ReturnType<typeof verifikasiBukti>) => `verifyBuktiPerbaikan → ${v.valid ? "valid" : "ditolak"}, skor ${v.skor.toFixed(2)}`, jitter(600, 1100), () =>
      verifikasiBukti(fSebelum, fSesudah),
    );
    await tr.run("Work Order", "Entity", hasil.valid ? "setBukti + setStatus(menunggu_konfirmasi)" : "setBukti + addLogServis(bukti_ditolak)", jitter(4, 8), () => {
      workOrder.setBukti(wo.id, fSebelum?.id ?? 0, fSesudah?.id ?? 0, hasil);
      const gagal = hasil.pemeriksaan.filter((p) => !p.ok).map((p) => p.label.toLowerCase());
      if (hasil.valid) {
        workOrder.setStatus(wo.id, "menunggu_konfirmasi");
        workOrder.addLog(wo.id, "bukti_valid", "Evidence Verification", `${hasil.pemeriksaan.length} dari ${hasil.pemeriksaan.length} pemeriksaan lolos`);
      } else {
        workOrder.addLog(wo.id, "bukti_ditolak", "Evidence Verification", `Tidak lolos: ${gagal.join(", ")}`);
      }
    });
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(${hasil.valid ? "bukti_valid" : "bukti_ditolak"}) × ${n} (WA mock)`, jitter(6, 10), () =>
      kabariPerbaikan(wo, hasil.valid ? "bukti_valid" : "bukti_ditolak"),
    );
    commit();
    return { work_order: viewWorkOrder(wo), verifikasi: hasil, trace: tr.steps };
  },

  /**
   * Set Konfirmasi Selesai (non-agnostic) oleh penghuni. Sudah beres: work order menunggu pemilik
   * menerima hasil (invoice belum terbit). Belum beres: kembali dikerjakan.
   */
  async konfirmasi(user: PenggunaRow, idWo: number, selesai: boolean, catatan?: string): Promise<KonfirmasiResponse> {
    auth.requireRole(user, "penghuni");
    const wo = workOrder.getUntuk(user, idWo);
    if (wo.status !== "menunggu_konfirmasi") {
      throw new ServiceError(409, "BELUM_BISA_DIKONFIRMASI", "Perbaikan bisa dikonfirmasi setelah bukti terverifikasi.");
    }
    const t = complaintTicket.getTiketRow(wo.id_tiket);
    const tr = new Tracer();
    await tr.run("Complete and Settle Maintenance", "Task", `setKonfirmasiSelesai(${selesai ? "selesai" : "belum beres"})`, 2, () => null);

    if (!selesai) {
      await tr.run("Work Order", "Entity", "setStatus(dikerjakan) + addLogServis(belum_beres)", jitter(4, 8), () => {
        workOrder.setStatus(wo.id, "dikerjakan");
        workOrder.addLog(wo.id, "belum_beres", user.nama, catatan?.trim() || null);
      });
      await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(progres) × ${n} (WA mock)`, jitter(6, 10), () =>
        kabariPerbaikan(wo, "progres", `Penghuni menandai belum beres${catatan?.trim() ? `: ${catatan.trim()}` : "."}`),
      );
      commit();
      return { work_order: viewWorkOrder(wo), tiket: complaintTicket.toDetail(t), invoice: null, trace: tr.steps };
    }

    await tr.run("Work Order", "Entity", "setStatus(menunggu_pemilik) + addLogServis(dikonfirmasi_penghuni)", jitter(4, 8), () => {
      workOrder.setStatus(wo.id, "menunggu_pemilik");
      workOrder.addLog(wo.id, "dikonfirmasi_penghuni", user.nama, catatan?.trim() || null);
    });
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(menunggu_pemilik) × ${n} (WA mock)`, jitter(6, 10), () =>
      kabariPerbaikan(wo, "menunggu_pemilik"),
    );
    commit();
    return { work_order: viewWorkOrder(wo), tiket: complaintTicket.toDetail(t), invoice: null, trace: tr.steps };
  },

  /**
   * Set Penerimaan Pemilik (non-agnostic). Diterima: tutup tiket, Get Biaya Final, Calculate Komisi,
   * Add Invoice ke pemilik (awal Billing & Commission). Bisa langsung dari menunggu_konfirmasi bila
   * penghuni belum merespons. Tidak diterima: teknisi diminta memperbaiki ulang.
   */
  async terima(user: PenggunaRow, idWo: number, diterima: boolean, catatan?: string): Promise<KonfirmasiResponse> {
    auth.requireRole(user, "pemilik");
    const wo = workOrder.getUntuk(user, idWo);
    if (wo.status !== "menunggu_pemilik" && wo.status !== "menunggu_konfirmasi") {
      throw new ServiceError(409, "BELUM_BISA_DITERIMA", "Hasil perbaikan bisa diterima setelah bukti terverifikasi.");
    }
    if (workOrder.adaTambahanMenunggu(wo)) {
      throw new ServiceError(409, "TAMBAHAN_MENUNGGU", "Putuskan dulu biaya tambahan yang diajukan teknisi.");
    }
    const t = complaintTicket.getTiketRow(wo.id_tiket);
    const tanpaPenghuni = wo.status === "menunggu_konfirmasi";
    const alasan = catatan?.trim().slice(0, 300) || null;
    const tr = new Tracer();
    await tr.run("Complete and Settle Maintenance", "Task", `setPenerimaanPemilik(${diterima ? "diterima" : "perbaikan ulang"})`, 2, () => null);

    if (!diterima) {
      await tr.run("Work Order", "Entity", "setStatus(dikerjakan) + addLogServis(perbaikan_ulang)", jitter(4, 8), () => {
        workOrder.setStatus(wo.id, "dikerjakan");
        workOrder.addLog(wo.id, "perbaikan_ulang", user.nama, alasan);
      });
      await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(progres) × ${n} (WA mock)`, jitter(6, 10), () =>
        kabariPerbaikan(wo, "perbaikan_ulang", alasan ?? undefined),
      );
      commit();
      return { work_order: viewWorkOrder(wo), tiket: complaintTicket.toDetail(t), invoice: null, trace: tr.steps };
    }

    await tr.run("Work Order", "Entity", "setStatus(selesai)", jitter(4, 8), () => {
      workOrder.setStatus(wo.id, "selesai");
      workOrder.addLog(wo.id, "selesai", user.nama, tanpaPenghuni ? "Pemilik menerima hasil tanpa menunggu konfirmasi penghuni" : alasan ?? "Pemilik menerima hasil perbaikan");
    });
    await tr.run("Complaint Ticket", "Entity", "setStatusTiket(selesai) + setPenanganan(teknisi)", jitter(4, 8), () => {
      complaintTicket.setStatusTiket(t.id, "selesai", user.nama, alasan);
      complaintTicket.setPenanganan(t.id, "teknisi");
    });
    const biaya = await tr.run("Work Order", "Entity", (b: number) => `getBiayaFinal → ${rupiah(b)}`, jitter(3, 6), () => workOrder.getBiayaFinal(wo.id));
    const komisi = await tr.run("Commission Calculation", "Micro", (k: { persen: number; komisi: number }) => `calculateKomisi(${k.persen}%) → ${rupiah(k.komisi)}`, jitter(80, 160), () =>
      hitungKomisi(biaya),
    );
    const inv = await tr.run("Invoice", "Entity", (i: InvoiceRow) => `addInvoice → ${kodeInvoice(i.id)}`, jitter(6, 12), () => {
      const est = db().estimasi.find((e) => e.id === wo.id_estimasi);
      const rincian = [
        ...(est?.rincian ?? [{ label: "Biaya perbaikan", jumlah: est ? est.total : biaya }]),
        ...wo.biaya_tambahan.filter((b) => b.status === "disetujui").map((b) => ({ label: `Tambahan: ${b.alasan}`, jumlah: b.jumlah })),
      ];
      return invoice.add({ id_work_order: wo.id, jenis: "perbaikan", rincian, biaya, persen_komisi: komisi.persen, komisi: komisi.komisi });
    });
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(selesai, invoice) × ${n} (WA mock)`, jitter(6, 10), () =>
      kabariPerbaikan(wo, "selesai") + kabariTagihan(inv, "invoice"),
    );
    commit();
    return { work_order: viewWorkOrder(wo), tiket: complaintTicket.toDetail(t), invoice: viewInvoice(inv), trace: tr.steps };
  },

  /**
   * Orkestrasi pembayaran oleh pemilik (pihak yang memanggil teknisi):
   * metode -> gateway -> status -> rekonsiliasi -> invoice lunas -> laporan kas -> notifikasi.
   */
  async bayar(user: PenggunaRow, idInvoice: number, metode: MetodePembayaran, simulasiGagal: boolean): Promise<BayarResponse> {
    auth.requireRole(user, "pemilik");
    if (!(metode in LABEL_METODE)) throw new ServiceError(422, "METODE_TIDAK_VALID", "Metode pembayaran tidak didukung.");
    const tr = new Tracer();
    await tr.run("Complete and Settle Maintenance", "Task", `bayarInvoice(${kodeInvoice(idInvoice)}, ${metode})`, 2, () => null);
    const inv = await tr.run("Invoice", "Entity", (i: InvoiceRow) => `getInvoice → ${i.status}, ${rupiah(i.total)}`, jitter(3, 6), () =>
      invoice.getUntuk(user, idInvoice),
    );
    if (inv.status === "lunas") throw new ServiceError(409, "SUDAH_LUNAS", "Invoice ini sudah lunas.");

    const p = await tr.run("Payment", "Entity", `setMetodePembayaran(${LABEL_METODE[metode]})`, jitter(4, 8), () => payment.setMetode("invoice", inv.id, metode, inv.total));
    const hasil = await tr.run("Payment", "Entity", (h: { status: string }) => `processPayment via payment gateway (mock) → ${h.status}`, jitter(900, 1500), () =>
      payment.processPayment(p, simulasiGagal),
    );
    await tr.run("Payment", "Entity", (s: string) => `getStatusPembayaran → ${s}`, jitter(60, 120), () => payment.getStatus(p, hasil));
    await tr.run("Payment", "Entity", `setStatusPembayaran(${hasil.status})`, jitter(3, 6), () => payment.setStatus(p.id, hasil.status, hasil.alasan));

    if (hasil.status === "gagal") {
      await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(bayar_gagal) × ${n} (WA mock)`, jitter(6, 10), () =>
        kabariTagihan(inv, "bayar_gagal", hasil.alasan ?? undefined),
      );
      commit();
      return { hasil: "gagal", invoice: viewInvoice(inv), pembayaran: viewPembayaran(p), alasan: hasil.alasan, trace: tr.steps };
    }

    await tr.run("Payment", "Entity", (ok: boolean) => `reconcilePembayaran → ${ok ? "cocok" : "selisih"}`, jitter(80, 160), () => {
      const ok = payment.reconcile(p.id, inv.total);
      if (!ok) throw new ServiceError(409, "REKONSILIASI_GAGAL", "Jumlah transaksi tidak cocok dengan tagihan.");
      return ok;
    });
    await tr.run("Invoice", "Entity", "setStatus(lunas)", jitter(3, 6), () => invoice.setLunas(inv.id, nowIso()));
    await tr.run("Financial Ledger", "Entity", "addTransaksiKas × 2 (bagian teknisi, komisi)", jitter(6, 12), () => {
      const wo = workOrder.get(inv.id_work_order);
      const k = complaintTicket.getKeluhanRow(complaintTicket.getTiketRow(wo.id_tiket).id_keluhan);
      const unit = tenantLease.unitRingkas(k.id_unit);
      const dasar = { id_pemilik: unit.id_pemilik, waktu: nowIso(), ref: kodeInvoice(inv.id), properti: unit.nama_properti };
      ledger.add({ ...dasar, jenis: "pembayaran_teknisi", keterangan: `Biaya perbaikan ${unit.nomor_unit}, ke ${tenantLease.pengguna(wo.id_teknisi).nama}`, jumlah: -(inv.total - inv.komisi) });
      ledger.add({ ...dasar, jenis: "komisi", keterangan: `Komisi Kosmos ${inv.persen_komisi}% perbaikan ${unit.nomor_unit}`, jumlah: -inv.komisi });
    });
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(lunas) × ${n} (WA mock)`, jitter(6, 10), () => kabariTagihan(inv, "lunas"));
    commit();
    return { hasil: "berhasil", invoice: viewInvoice(inv), pembayaran: viewPembayaran(p), alasan: null, trace: tr.steps };
  },

  /**
   * Bayar beberapa invoice perbaikan dalam satu transaksi gateway (satu ref, satu baris pembayaran per invoice).
   * All-or-nothing: gagal di gateway -> tidak ada invoice yang lunas.
   */
  async bayarSekaligus(user: PenggunaRow, ids: number[], metode: MetodePembayaran, simulasiGagal: boolean): Promise<BayarSekaligusResponse> {
    auth.requireRole(user, "pemilik");
    if (!(metode in LABEL_METODE)) throw new ServiceError(422, "METODE_TIDAK_VALID", "Metode pembayaran tidak didukung.");
    const unik = [...new Set(ids)];
    if (unik.length === 0 || unik.length > 20) throw new ServiceError(422, "JUMLAH_INVOICE_TIDAK_VALID", "Pilih 1 sampai 20 invoice.");
    const tr = new Tracer();
    await tr.run("Complete and Settle Maintenance", "Task", `bayarInvoiceSekaligus(${unik.length} invoice, ${metode})`, 2, () => null);
    const daftar = await tr.run("Invoice", "Entity", (r: InvoiceRow[]) => `getInvoice × ${r.length} → ${rupiah(r.reduce((s, i) => s + i.total, 0))}`, jitter(4, 8), () =>
      unik.map((id) => invoice.getUntuk(user, id)),
    );
    const lunas = daftar.find((i) => i.status === "lunas");
    if (lunas) throw new ServiceError(409, "SUDAH_LUNAS", `${kodeInvoice(lunas.id)} sudah lunas.`);
    const total = daftar.reduce((s, i) => s + i.total, 0);
    const ref = payment.refBaru();
    const rows = await tr.run("Payment", "Entity", `setMetodePembayaran(${LABEL_METODE[metode]}) × ${daftar.length}, ref ${ref}`, jitter(4, 8), () =>
      daftar.map((i) => payment.setMetode("invoice", i.id, metode, i.total, ref)),
    );
    const hasil = await tr.run("Payment", "Entity", (h: { status: string }) => `processPayment ${rupiah(total)} via payment gateway (mock) → ${h.status}`, jitter(900, 1500), () =>
      payment.processPayment(rows[0], simulasiGagal),
    );
    await tr.run("Payment", "Entity", `setStatusPembayaran(${hasil.status}) × ${rows.length}`, jitter(3, 6), () => {
      for (const r of rows) payment.setStatus(r.id, hasil.status, hasil.alasan);
    });
    if (hasil.status === "gagal") {
      commit();
      return { hasil: "gagal", invoice: daftar.map(viewInvoice), ref_gateway: ref, total, alasan: hasil.alasan, trace: tr.steps };
    }
    await tr.run("Payment", "Entity", "reconcilePembayaran × n → cocok", jitter(80, 160), () => {
      if (!rows.every((r, k) => payment.reconcile(r.id, daftar[k].total))) {
        throw new ServiceError(409, "REKONSILIASI_GAGAL", "Jumlah transaksi tidak cocok dengan tagihan.");
      }
    });
    const waktu = nowIso();
    await tr.run("Invoice", "Entity", `setStatus(lunas) × ${daftar.length}`, jitter(3, 6), () => {
      for (const i of daftar) invoice.setLunas(i.id, waktu);
    });
    await tr.run("Financial Ledger", "Entity", `addTransaksiKas × ${daftar.length * 2}`, jitter(6, 12), () => {
      for (const inv of daftar) {
        const wo = workOrder.get(inv.id_work_order);
        const k = complaintTicket.getKeluhanRow(complaintTicket.getTiketRow(wo.id_tiket).id_keluhan);
        const unit = tenantLease.unitRingkas(k.id_unit);
        const dasar = { id_pemilik: unit.id_pemilik, waktu, ref: kodeInvoice(inv.id), properti: unit.nama_properti };
        ledger.add({ ...dasar, jenis: "pembayaran_teknisi", keterangan: `Biaya perbaikan ${unit.nomor_unit}, ke ${tenantLease.pengguna(wo.id_teknisi).nama}`, jumlah: -(inv.total - inv.komisi) });
        ledger.add({ ...dasar, jenis: "komisi", keterangan: `Komisi Kosmos ${inv.persen_komisi}% perbaikan ${unit.nomor_unit}`, jumlah: -inv.komisi });
      }
    });
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(lunas) × ${n} (WA mock)`, jitter(6, 10), () =>
      daftar.reduce((n, inv) => n + kabariTagihan(inv, "lunas"), 0),
    );
    commit();
    return { hasil: "berhasil", invoice: daftar.map(viewInvoice), ref_gateway: ref, total, alasan: null, trace: tr.steps };
  },

  /** Get Laporan Kas + ringkasan invoice tertunda (gabungan Financial Ledger dan Invoice). */
  laporanKas(user: PenggunaRow): LaporanKas {
    auth.requireRole(user, "pemilik");
    const transaksi = ledger.list(user.id);
    const jumlah = (j: string) => transaksi.filter((t) => t.jenis === j).reduce((s, t) => s + Math.abs(t.jumlah), 0);
    const semua = db().invoice.filter((i) => invoice.bolehLihat(user, i));
    const tertunda = semua.filter((i) => i.status === "belum_dibayar");
    const terlambat = tertunda.filter((i) => invoice.terlambat(i));
    const sewaTertunda = db().tagihan_sewa.filter((t) => rentInvoice.bolehLihat(user, t) && t.status === "belum_dibayar");
    const pengeluaran = jumlah("pembayaran_teknisi") + jumlah("komisi");
    return {
      ringkasan: {
        pemasukan_sewa: jumlah("sewa"),
        pengeluaran,
        saldo: jumlah("sewa") - pengeluaran,
        sewa_tertunda: sewaTertunda.length,
        nilai_sewa_tertunda: sewaTertunda.reduce((s, t) => s + t.jumlah, 0),
        pembayaran_teknisi: jumlah("pembayaran_teknisi"),
        komisi: jumlah("komisi"),
        invoice_lunas: semua.length - tertunda.length,
        invoice_tertunda: tertunda.length,
        invoice_terlambat: terlambat.length,
        nilai_tertunda: tertunda.reduce((s, i) => s + i.total, 0),
      },
      transaksi,
    };
  },
};

/* ===================================================================== */
/* Notifikasi Repair Verification & Billing (dipanggil oleh Task)         */
/* ===================================================================== */

/** Kabar perbaikan; tiap jenis dipetakan ke jenis notifikasi WhatsApp di kontrak. */
type JenisPerbaikan =
  | "teknisi_ditugaskan" | "jadwal" | "progres" | "bukti_valid" | "bukti_ditolak" | "selesai"
  | "menunggu_pemilik" | "perbaikan_ulang" | "tambahan_diajukan" | "tambahan_disetujui" | "tambahan_ditolak";

const NOTIF_PERBAIKAN: Record<JenisPerbaikan, NotifikasiRow["jenis"]> = {
  teknisi_ditugaskan: "teknisi_ditugaskan",
  jadwal: "jadwal",
  progres: "progres",
  bukti_valid: "bukti_valid",
  bukti_ditolak: "bukti_ditolak",
  selesai: "selesai",
  menunggu_pemilik: "progres",
  perbaikan_ulang: "progres",
  tambahan_diajukan: "estimasi",
  tambahan_disetujui: "progres",
  tambahan_ditolak: "progres",
};

function kabariPerbaikan(wo: WorkOrderRow, jenis: JenisPerbaikan, isi?: string) {
  const t = complaintTicket.getTiketRow(wo.id_tiket);
  const { penghuni, pemilik, unit } = penerimaTiket(t);
  const teknisi = tenantLease.pengguna(wo.id_teknisi);
  const kode = kodeTiket(t.id);
  const lokasi = `${tenantLease.unitRingkas(complaintTicket.getKeluhanRow(t.id_keluhan).id_unit).nama_properti} ${unit}`;
  const jam = wo.jadwal_kunjungan ? fmtJadwal(wo.jadwal_kunjungan) : "";
  const gagal = wo.verifikasi?.pemeriksaan.filter((p) => !p.ok).map((p) => p.label.toLowerCase()).join(", ");

  const pesan = (): Array<[PenggunaRow, string]> => {
    switch (jenis) {
      case "teknisi_ditugaskan":
        return [
          [pemilik, `Estimasi disetujui. ${teknisi.nama} ditugaskan ke ${unit}.`],
          [penghuni, `Teknisi ${teknisi.nama} ditugaskan untuk "${t.judul}". Biaya ditanggung pemilik. Pilih jadwal kunjungan di Kosmos.`],
          [teknisi, `Pekerjaan baru ${kodeWo(wo.id)}: ${t.judul}, ${lokasi}.`],
        ];
      case "jadwal":
        return [
          [teknisi, `Jadwal ${kodeWo(wo.id)} dikonfirmasi: ${jam}. ${lokasi} (${penghuni.nama}).`],
          [pemilik, `Jadwal kunjungan ${unit}: ${jam}, teknisi ${teknisi.nama}.`],
        ];
      // Progres dari teknisi dikabarkan ke penghuni; keberatan penghuni dikabarkan ke teknisi.
      case "progres":
        return isi?.startsWith("Penghuni")
          ? [[teknisi, `${kodeWo(wo.id)}: ${isi}`], [pemilik, `${unit}: ${isi}`]]
          : [[penghuni, isi ?? ""], [pemilik, `${unit}: ${isi ?? ""}`]];
      case "bukti_valid":
        return [
          [penghuni, `Perbaikan "${t.judul}" selesai dan bukti terverifikasi. Mohon konfirmasi di Kosmos.`],
          [pemilik, `Bukti perbaikan ${unit} terverifikasi, menunggu konfirmasi penghuni.`],
        ];
      case "bukti_ditolak":
        return [[teknisi, `Bukti ${kodeWo(wo.id)} ditolak: ${gagal}. Silakan unggah ulang.`]];
      case "menunggu_pemilik":
        return [
          [pemilik, `${penghuni.nama} mengonfirmasi perbaikan ${unit} beres. Cek hasilnya lalu terima untuk menerbitkan tagihan.`],
          [teknisi, `${kodeWo(wo.id)} dikonfirmasi penghuni, menunggu pemilik menerima hasil.`],
        ];
      case "perbaikan_ulang":
        return [
          [teknisi, `Pemilik meminta ${kodeWo(wo.id)} diperbaiki ulang${isi ? `: ${isi}` : "."}`],
          [penghuni, `Pemilik meminta teknisi memperbaiki ulang "${t.judul}".`],
        ];
      case "selesai":
        return [
          [penghuni, `Perbaikan "${t.judul}" sudah diterima pemilik. Tiket ditutup.`],
          [teknisi, `${kodeWo(wo.id)} diterima pemilik. Terima kasih!`],
        ];
      case "tambahan_diajukan":
        return [[pemilik, `${teknisi.nama} mengajukan biaya tambahan ${unit}: ${isi}. Setujui atau tolak di Kosmos.`]];
      case "tambahan_disetujui":
        return [[teknisi, `Biaya tambahan ${kodeWo(wo.id)} disetujui pemilik: ${isi}.`]];
      case "tambahan_ditolak":
        return [[teknisi, `Biaya tambahan ${kodeWo(wo.id)} ditolak pemilik: ${isi}. Lanjutkan sesuai estimasi.`]];
    }
  };
  const daftar = pesan();
  for (const [p, teks] of daftar) notification.kirim([p], kode, NOTIF_PERBAIKAN[jenis], () => teks);
  return daftar.length;
}

function kabariTagihan(inv: InvoiceRow, jenis: "invoice" | "lunas" | "bayar_gagal", alasan?: string) {
  const wo = workOrder.get(inv.id_work_order);
  const t = complaintTicket.getTiketRow(wo.id_tiket);
  const { penghuni, pemilik, unit } = penerimaTiket(t);
  const teknisi = tenantLease.pengguna(wo.id_teknisi);
  const kode = kodeInvoice(inv.id);
  const apa = inv.jenis === "kunjungan" ? "biaya kunjungan (perbaikan dibatalkan)" : "perbaikan";
  const pesan: Record<typeof jenis, Array<[PenggunaRow, string]>> = {
    invoice: [[pemilik, `Tagihan ${apa} ${unit} (${penghuni.nama}) ${kode} ${rupiah(inv.total)} sudah terbit. Jatuh tempo ${tanggal(inv.jatuh_tempo)}.`]],
    lunas: [
      [pemilik, `Pembayaran ${kode} ${rupiah(inv.total)} berhasil dan sudah tercatat di laporan kas.`],
      [teknisi, `Pembayaran ${kodeWo(wo.id)} ${rupiah(inv.total - inv.komisi)} diteruskan ke kamu.`],
    ],
    bayar_gagal: [[pemilik, `Pembayaran ${kode} gagal: ${alasan}. Silakan coba lagi.`]],
  };
  for (const [p, isi] of pesan[jenis]) notification.kirim([p], kodeTiket(t.id), jenis, () => isi);
  return pesan[jenis].length;
}

/* ===================================================================== */
/* View (read model): merakit DTO response dari beberapa service          */
/* ===================================================================== */

function viewEstimasi(e: EstimasiRow): EstimasiBiaya {
  return {
    id: e.id, id_tiket: e.id_tiket, kode_tiket: kodeTiket(e.id_tiket), teknisi: technician.ringkas(e.id_teknisi),
    kandidat: e.kandidat, rincian: e.rincian, total: e.total, status: e.status,
    diputuskan_oleh: e.diputuskan_oleh, diputuskan_at: e.diputuskan_at, created_at: e.created_at,
  };
}

function viewWorkOrder(w: WorkOrderRow): WorkOrder {
  const t = complaintTicket.getTiketRow(w.id_tiket);
  const k = complaintTicket.getKeluhanRow(t.id_keluhan);
  const { id_pemilik: _, ...unit } = tenantLease.unitRingkas(k.id_unit);
  return {
    id: w.id, kode: kodeWo(w.id), id_tiket: t.id, kode_tiket: kodeTiket(t.id), judul: t.judul, kategori: t.kategori,
    urgensi: t.urgensi, unit, penghuni: toPengguna(tenantLease.pengguna(k.id_penghuni)), teknisi: technician.ringkas(w.id_teknisi),
    status: w.status, biaya_final: w.biaya_final, slot_jadwal: w.slot_jadwal, jadwal_kunjungan: w.jadwal_kunjungan,
    biaya_tambahan: w.biaya_tambahan, log: workOrder.getLog(w.id), bukti_sebelum: mediaStorage.get(w.id_bukti_sebelum), bukti_sesudah: mediaStorage.get(w.id_bukti_sesudah),
    verifikasi: w.verifikasi, id_invoice: invoice.byWorkOrder(w.id)?.id ?? null, created_at: w.created_at, updated_at: w.updated_at,
  };
}

function viewPembayaran(p: PembayaranRow): Pembayaran {
  const { untuk: _u, id_tagihan: _t, ...rest } = p;
  return rest;
}

function viewTagihanSewa(t: TagihanSewaRow): TagihanSewa {
  const sw = rentInvoice.sewa(t);
  const { id_pemilik: _, ...unit } = tenantLease.unitRingkas(sw.id_unit);
  return {
    id: t.id, kode: kodeTagihanSewa(t.id), periode: t.periode, unit, penghuni: toPengguna(tenantLease.pengguna(sw.id_penghuni)),
    jumlah: t.jumlah, status: t.status, terlambat: rentInvoice.terlambat(t), jatuh_tempo: t.jatuh_tempo, dibayar_at: t.dibayar_at,
    pembayaran: payment.list("sewa", t.id), created_at: t.created_at,
  };
}

function viewInvoice(i: InvoiceRow): Invoice {
  const wo = workOrder.get(i.id_work_order);
  const t = complaintTicket.getTiketRow(wo.id_tiket);
  const k = complaintTicket.getKeluhanRow(t.id_keluhan);
  const { id_pemilik, ...unit } = tenantLease.unitRingkas(k.id_unit);
  return {
    id: i.id, kode: kodeInvoice(i.id), id_work_order: wo.id, id_tiket: t.id, kode_tiket: kodeTiket(t.id), judul: t.judul, unit,
    penghuni: toPengguna(tenantLease.pengguna(k.id_penghuni)), pemilik: toPengguna(tenantLease.pengguna(id_pemilik)),
    teknisi: tenantLease.pengguna(wo.id_teknisi).nama, rincian: i.rincian, biaya: i.biaya, persen_komisi: i.persen_komisi, komisi: i.komisi, total: i.total, status: i.status,
    terlambat: invoice.terlambat(i), jenis: i.jenis, jatuh_tempo: i.jatuh_tempo, dibayar_at: i.dibayar_at, pembayaran: payment.list("invoice", i.id), created_at: i.created_at,
  };
}
