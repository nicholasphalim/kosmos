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
  ProfilPenghuni,
  StatusSewa,
  StatusTiket,
  TiketDetail,
  TiketRingkas,
  TraceStep,
  BayarResponse,
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
  TeknisiRingkas,
  Urgensi,
  WorkOrder,
} from "@/lib/api/types";
import { jadwal as fmtJadwal, kodeInvoice, LABEL_KATEGORI, LABEL_METODE, rupiah, tanggal } from "@/lib/format";
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
  type TransaksiKasRow,
  type WorkOrderRow,
} from "./db";
import { estimasiBiaya, hitungKomisi, jarakKm, matchTeknisi, verifikasiBukti } from "./micro";

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
};

/* ===================================================================== */
/* Entity: Complaint Ticket                                               */
/* ===================================================================== */

/** Transisi status legal (plan §3.2). Transisi lain -> 409. */
const TRANSISI: Record<StatusTiket, StatusTiket[]> = {
  dibuat: ["diklasifikasi", "dibatalkan"],
  diklasifikasi: ["diproses", "dibatalkan"],
  diproses: ["selesai", "dibatalkan"],
  selesai: [],
  dibatalkan: [],
};

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
      created_at: waktu, updated_at: waktu,
    };
    db().tiket.push(row);
    db().riwayat.push({ id_tiket: row.id, dari: null, ke: "dibuat", waktu, oleh: "sistem" });
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

  setStatusTiket(idTiket: number, ke: StatusTiket, oleh: string): TiketRow {
    const t = complaintTicket.getTiketRow(idTiket);
    if (!TRANSISI[t.status].includes(ke)) {
      throw new ServiceError(409, "TRANSISI_TIDAK_VALID", `Status tidak bisa berubah dari ${t.status} ke ${ke}.`);
    }
    const waktu = nowIso();
    db().riwayat.push({ id_tiket: idTiket, dari: t.status, ke, waktu, oleh });
    t.status = ke;
    t.updated_at = waktu;
    return t;
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
      urgensi: t.urgensi, perlu_review: t.perlu_review, unit,
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
      riwayat: db()
        .riwayat.filter((r) => r.id_tiket === t.id)
        .map(({ dari, ke, waktu, oleh }) => ({ dari, ke, waktu, oleh })),
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
type JenisTiket = Extract<NotifikasiRow["jenis"], "tiket_dibuat" | "diklasifikasi" | "prioritas_tinggi" | "diproses" | "dibatalkan">;

function kabariPerubahan(t: TiketRow, jenis: JenisTiket) {
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
    dibatalkan: [`Tiket ${unit} dibatalkan.`, "Laporanmu dibatalkan oleh pemilik."],
  };
  return notification.kirim([pemilik, penghuni], kode, jenis, (p) =>
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
   * Pemilik membatalkan tiket. Status "diproses" tidak lagi diset manual:
   * tiket diproses setelah estimasi biaya disetujui (setPersetujuanBiaya).
   */
  async ubahStatus(user: PenggunaRow, idTiket: number, ke: "dibatalkan"): Promise<TiketDetail> {
    auth.requireRole(user, "pemilik");
    if (ke !== "dibatalkan") {
      throw new ServiceError(422, "STATUS_TIDAK_DIDUKUNG", "Tiket diproses setelah estimasi biaya disetujui.");
    }
    await delay(jitter(250, 450));
    const t = complaintTicket.getTiketRow(idTiket);
    if (!complaintTicket.bolehLihat(user, t)) throw new ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.");
    complaintTicket.setStatusTiket(idTiket, ke, user.nama);
    // Batalkan juga proses perbaikan yang sedang berjalan.
    for (const e of db().estimasi) if (e.id_tiket === idTiket && e.status === "menunggu") e.status = "ditolak";
    const wo = workOrder.byTiket(idTiket);
    if (wo && wo.status !== "selesai" && wo.status !== "dibatalkan") {
      workOrder.setStatus(wo.id, "dibatalkan");
      workOrder.addLog(wo.id, "dibatalkan", user.nama, "Tiket dibatalkan pemilik");
    }
    kabariPerubahan(t, ke);
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
        }))),
    );
    const terpilih = kandidat.find((x) => x.lolos);
    if (!terpilih) {
      throw new ServiceError(422, "TEKNISI_TIDAK_ADA", "Belum ada teknisi terverifikasi yang tersedia untuk kategori ini.");
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
        `Estimasi ${unit.nomor_unit}: ${rupiah(est.total)}, teknisi ${terpilih.teknisi.nama}. Buka Kosmos untuk menyetujui.`,
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

  /** Set Persetujuan Biaya (non-agnostic). Disetujui -> Add Work Order + tiket diproses. Ditolak -> perbaikan dibatalkan. */
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
      await tr.run("Complaint Ticket", "Entity", "setStatusTiket(dibatalkan)", jitter(4, 8), () =>
        complaintTicket.setStatusTiket(t.id, "dibatalkan", user.nama),
      );
      await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(dibatalkan) × ${n} (WA mock)`, jitter(6, 10), () =>
        kabariPerubahan(t, "dibatalkan"),
      );
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
  menunggu_konfirmasi: ["selesai", "dikerjakan", "dibatalkan"],
  selesai: [],
  dibatalkan: [],
};

export const workOrder = {
  /** Add Work Order. */
  add(input: Pick<WorkOrderRow, "id_tiket" | "id_teknisi" | "id_estimasi" | "biaya_final" | "slot_jadwal">): WorkOrderRow {
    const waktu = nowIso();
    const row: WorkOrderRow = {
      ...input, id: db().seq.work_order++, status: "menunggu_jadwal", jadwal_kunjungan: null,
      id_bukti_sebelum: null, id_bukti_sesudah: null, verifikasi: null, created_at: waktu, updated_at: waktu,
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
  add(input: Pick<InvoiceRow, "id_work_order" | "rincian" | "biaya" | "persen_komisi" | "komisi">): InvoiceRow {
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

  bolehLihat(user: PenggunaRow, i: InvoiceRow): boolean {
    if (user.role === "teknisi") return false;
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

  setLunas(idInvoice: number, waktu: string) {
    const i = invoice.get(idInvoice);
    i.status = "lunas";
    i.dibayar_at = waktu;
  },
};

/* ===================================================================== */
/* Entity: Payment (+ adapter payment gateway mock)                       */
/* ===================================================================== */

export const payment = {
  /** Set Metode Pembayaran: membuka transaksi baru berstatus pending. */
  setMetode(idInvoice: number, metode: MetodePembayaran, jumlah: number): PembayaranRow {
    const row: PembayaranRow = {
      id: db().seq.pembayaran++, id_invoice: idInvoice, ref_gateway: `PG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      metode, jumlah, status: "pending", alasan_gagal: null, direkonsiliasi: false, created_at: nowIso(),
    };
    db().pembayaran.push(row);
    return row;
  },

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

  list(idInvoice: number): Pembayaran[] {
    return db()
      .pembayaran.filter((p) => p.id_invoice === idInvoice)
      .map(({ id_invoice: _, ...p }) => p);
  },
};

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
   * Set Konfirmasi Selesai (non-agnostic). Selesai: tutup tiket, Get Biaya Final,
   * Calculate Komisi, Add Invoice (awal Billing & Commission). Belum beres: kembali dikerjakan.
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

    await tr.run("Work Order", "Entity", "setStatus(selesai)", jitter(4, 8), () => {
      workOrder.setStatus(wo.id, "selesai");
      workOrder.addLog(wo.id, "selesai", user.nama, "Penghuni mengonfirmasi perbaikan selesai");
    });
    await tr.run("Complaint Ticket", "Entity", "setStatusTiket(selesai)", jitter(4, 8), () =>
      complaintTicket.setStatusTiket(t.id, "selesai", user.nama),
    );
    const biaya = await tr.run("Work Order", "Entity", (b: number) => `getBiayaFinal → ${rupiah(b)}`, jitter(3, 6), () => workOrder.getBiayaFinal(wo.id));
    const komisi = await tr.run("Commission Calculation", "Micro", (k: { persen: number; komisi: number }) => `calculateKomisi(${k.persen}%) → ${rupiah(k.komisi)}`, jitter(80, 160), () =>
      hitungKomisi(biaya),
    );
    const inv = await tr.run("Invoice", "Entity", (i: InvoiceRow) => `addInvoice → ${kodeInvoice(i.id)}`, jitter(6, 12), () => {
      const est = db().estimasi.find((e) => e.id === wo.id_estimasi);
      return invoice.add({ id_work_order: wo.id, rincian: est?.rincian ?? [{ label: "Biaya perbaikan", jumlah: biaya }], biaya, persen_komisi: komisi.persen, komisi: komisi.komisi });
    });
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(selesai, invoice) × ${n} (WA mock)`, jitter(6, 10), () =>
      kabariPerbaikan(wo, "selesai") + kabariTagihan(inv, "invoice"),
    );
    commit();
    return { work_order: viewWorkOrder(wo), tiket: complaintTicket.toDetail(t), invoice: viewInvoice(inv), trace: tr.steps };
  },

  /** Orkestrasi pembayaran: metode -> gateway -> status -> rekonsiliasi -> invoice lunas -> laporan kas -> notifikasi. */
  async bayar(user: PenggunaRow, idInvoice: number, metode: MetodePembayaran, simulasiGagal: boolean): Promise<BayarResponse> {
    auth.requireRole(user, "penghuni");
    if (!(metode in LABEL_METODE)) throw new ServiceError(422, "METODE_TIDAK_VALID", "Metode pembayaran tidak didukung.");
    const tr = new Tracer();
    await tr.run("Complete and Settle Maintenance", "Task", `bayarInvoice(${kodeInvoice(idInvoice)}, ${metode})`, 2, () => null);
    const inv = await tr.run("Invoice", "Entity", (i: InvoiceRow) => `getInvoice → ${i.status}, ${rupiah(i.total)}`, jitter(3, 6), () =>
      invoice.getUntuk(user, idInvoice),
    );
    if (inv.status === "lunas") throw new ServiceError(409, "SUDAH_LUNAS", "Invoice ini sudah lunas.");

    const p = await tr.run("Payment", "Entity", `setMetodePembayaran(${LABEL_METODE[metode]})`, jitter(4, 8), () => payment.setMetode(inv.id, metode, inv.total));
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
    await tr.run("Financial Ledger", "Entity", "addTransaksiKas × 3 (pemasukan, teknisi, komisi)", jitter(6, 12), () => {
      const wo = workOrder.get(inv.id_work_order);
      const k = complaintTicket.getKeluhanRow(complaintTicket.getTiketRow(wo.id_tiket).id_keluhan);
      const unit = tenantLease.unitRingkas(k.id_unit);
      const dasar = { id_pemilik: unit.id_pemilik, waktu: nowIso(), ref: kodeInvoice(inv.id), properti: unit.nama_properti };
      ledger.add({ ...dasar, jenis: "pemasukan", keterangan: `Pembayaran perbaikan ${unit.nomor_unit} oleh ${user.nama}`, jumlah: inv.total });
      ledger.add({ ...dasar, jenis: "pembayaran_teknisi", keterangan: `Diteruskan ke ${tenantLease.pengguna(wo.id_teknisi).nama}`, jumlah: -(inv.total - inv.komisi) });
      ledger.add({ ...dasar, jenis: "komisi", keterangan: `Komisi Kosmos ${inv.persen_komisi}%`, jumlah: -inv.komisi });
    });
    await tr.run("Notification", "Utility", (n: number) => `setNotifikasi(lunas) × ${n} (WA mock)`, jitter(6, 10), () => kabariTagihan(inv, "lunas"));
    commit();
    return { hasil: "berhasil", invoice: viewInvoice(inv), pembayaran: viewPembayaran(p), alasan: null, trace: tr.steps };
  },

  /** Get Laporan Kas + ringkasan invoice tertunda (gabungan Financial Ledger dan Invoice). */
  laporanKas(user: PenggunaRow): LaporanKas {
    auth.requireRole(user, "pemilik");
    const transaksi = ledger.list(user.id);
    const jumlah = (j: string) => transaksi.filter((t) => t.jenis === j).reduce((s, t) => s + Math.abs(t.jumlah), 0);
    const semua = db().invoice.filter((i) => invoice.bolehLihat(user, i));
    const tertunda = semua.filter((i) => i.status === "belum_dibayar");
    return {
      ringkasan: {
        pemasukan: jumlah("pemasukan"),
        pembayaran_teknisi: jumlah("pembayaran_teknisi"),
        komisi: jumlah("komisi"),
        invoice_lunas: semua.length - tertunda.length,
        invoice_tertunda: tertunda.length,
        nilai_tertunda: tertunda.reduce((s, i) => s + i.total, 0),
      },
      transaksi,
    };
  },
};

/* ===================================================================== */
/* Notifikasi Repair Verification & Billing (dipanggil oleh Task)         */
/* ===================================================================== */

type JenisPerbaikan = Extract<NotifikasiRow["jenis"], "teknisi_ditugaskan" | "jadwal" | "progres" | "bukti_valid" | "bukti_ditolak" | "selesai">;

function kabariPerbaikan(wo: WorkOrderRow, jenis: JenisPerbaikan, isiProgres?: string) {
  const t = complaintTicket.getTiketRow(wo.id_tiket);
  const { penghuni, pemilik, unit } = penerimaTiket(t);
  const teknisi = tenantLease.pengguna(wo.id_teknisi);
  const kode = kodeTiket(t.id);
  const lokasi = `${tenantLease.unitRingkas(complaintTicket.getKeluhanRow(t.id_keluhan).id_unit).nama_properti} ${unit}`;
  const jam = wo.jadwal_kunjungan ? fmtJadwal(wo.jadwal_kunjungan) : "";
  const gagal = wo.verifikasi?.pemeriksaan.filter((p) => !p.ok).map((p) => p.label.toLowerCase()).join(", ");

  const pesan: Record<JenisPerbaikan, Array<[PenggunaRow, string]>> = {
    teknisi_ditugaskan: [
      [pemilik, `Estimasi disetujui. ${teknisi.nama} ditugaskan ke ${unit}.`],
      [penghuni, `Teknisi ${teknisi.nama} ditugaskan untuk "${t.judul}". Pilih jadwal kunjungan di Kosmos.`],
      [teknisi, `Pekerjaan baru ${kodeWo(wo.id)}: ${t.judul}, ${lokasi}.`],
    ],
    jadwal: [
      [teknisi, `Jadwal ${kodeWo(wo.id)} dikonfirmasi: ${jam}. ${lokasi} (${penghuni.nama}).`],
      [pemilik, `Jadwal kunjungan ${unit}: ${jam}, teknisi ${teknisi.nama}.`],
    ],
    // Progres dari teknisi dikabarkan ke penghuni; keberatan penghuni dikabarkan ke teknisi.
    progres: isiProgres?.startsWith("Penghuni")
      ? [[teknisi, `${kodeWo(wo.id)}: ${isiProgres}`], [pemilik, `${unit}: ${isiProgres}`]]
      : [[penghuni, isiProgres ?? ""], [pemilik, `${unit}: ${isiProgres ?? ""}`]],
    bukti_valid: [
      [penghuni, `Perbaikan "${t.judul}" selesai dan bukti terverifikasi. Mohon konfirmasi di Kosmos.`],
      [pemilik, `Bukti perbaikan ${unit} terverifikasi, menunggu konfirmasi penghuni.`],
    ],
    bukti_ditolak: [[teknisi, `Bukti ${kodeWo(wo.id)} ditolak: ${gagal}. Silakan unggah ulang.`]],
    selesai: [
      [pemilik, `Perbaikan ${unit} dikonfirmasi selesai oleh ${penghuni.nama}.`],
      [teknisi, `${kodeWo(wo.id)} dikonfirmasi selesai. Terima kasih!`],
    ],
  };
  const daftar = pesan[jenis];
  for (const [p, isi] of daftar) notification.kirim([p], kode, jenis, () => isi);
  return daftar.length;
}

function kabariTagihan(inv: InvoiceRow, jenis: "invoice" | "lunas" | "bayar_gagal", alasan?: string) {
  const wo = workOrder.get(inv.id_work_order);
  const t = complaintTicket.getTiketRow(wo.id_tiket);
  const { penghuni, pemilik, unit } = penerimaTiket(t);
  const teknisi = tenantLease.pengguna(wo.id_teknisi);
  const kode = kodeInvoice(inv.id);
  const pesan: Record<typeof jenis, Array<[PenggunaRow, string]>> = {
    invoice: [[penghuni, `Tagihan ${kode} ${rupiah(inv.total)} sudah terbit. Jatuh tempo ${tanggal(inv.jatuh_tempo)}.`]],
    lunas: [
      [penghuni, `Pembayaran ${kode} ${rupiah(inv.total)} berhasil. Terima kasih!`],
      [pemilik, `${kode} lunas (${penghuni.nama}, ${unit}). Sudah tercatat di laporan kas.`],
      [teknisi, `Pembayaran ${kodeWo(wo.id)} ${rupiah(inv.total - inv.komisi)} diteruskan ke kamu.`],
    ],
    bayar_gagal: [[penghuni, `Pembayaran ${kode} gagal: ${alasan}. Silakan coba lagi.`]],
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
    log: workOrder.getLog(w.id), bukti_sebelum: mediaStorage.get(w.id_bukti_sebelum), bukti_sesudah: mediaStorage.get(w.id_bukti_sesudah),
    verifikasi: w.verifikasi, id_invoice: invoice.byWorkOrder(w.id)?.id ?? null, created_at: w.created_at, updated_at: w.updated_at,
  };
}

function viewPembayaran(p: PembayaranRow): Pembayaran {
  const { id_invoice: _, ...rest } = p;
  return rest;
}

function viewInvoice(i: InvoiceRow): Invoice {
  const wo = workOrder.get(i.id_work_order);
  const t = complaintTicket.getTiketRow(wo.id_tiket);
  const k = complaintTicket.getKeluhanRow(t.id_keluhan);
  const { id_pemilik: _, ...unit } = tenantLease.unitRingkas(k.id_unit);
  return {
    id: i.id, kode: kodeInvoice(i.id), id_work_order: wo.id, id_tiket: t.id, kode_tiket: kodeTiket(t.id), judul: t.judul, unit,
    penghuni: toPengguna(tenantLease.pengguna(k.id_penghuni)), teknisi: tenantLease.pengguna(wo.id_teknisi).nama,
    rincian: i.rincian, biaya: i.biaya, persen_komisi: i.persen_komisi, komisi: i.komisi, total: i.total, status: i.status,
    jatuh_tempo: i.jatuh_tempo, dibayar_at: i.dibayar_at, pembayaran: payment.list(i.id), created_at: i.created_at,
  };
}
