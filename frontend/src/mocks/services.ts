/**
 * Service layer palsu. Strukturnya sengaja meniru backend FastAPI (plan §1.2, §7):
 *
 *   Task     hmr                  -> satu-satunya yang mengorkestrasi
 *   Entity   tenantLease, complaintTicket -> hanya mengelola tabelnya sendiri
 *   Utility  mediaStorage, aiClassification, notification -> tidak tahu domain
 *
 * Aturan: Task boleh memanggil Entity & Utility; Entity/Utility tidak saling memanggil.
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
} from "@/lib/api/types";
import { LABEL_KATEGORI, tanggal } from "@/lib/format";
import { buatJudul, klasifikasiKeyword } from "@/lib/klasifikasi";
import { commit, db, type KeluhanRow, type NotifikasiRow, type PenggunaRow, type TiketRow } from "./db";

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
    const ids = [1, 2, 3, 4];
    return ids.map((id) => {
      const p = db().pengguna.find((x) => x.id === id)!;
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
  simpan(file: File, ownerId: number | null): Lampiran {
    const row = {
      id: db().seq.lampiran++,
      owner_type: "keluhan" as const,
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
function kabariPerubahan(t: TiketRow, jenis: NotifikasiRow["jenis"]) {
  const { penghuni, pemilik, unit } = penerimaTiket(t);
  const kode = kodeTiket(t.id);
  const kat = t.kategori ? LABEL_KATEGORI[t.kategori] : "";
  // Judul yang dipotong sudah berakhir "…", jangan ditambah titik lagi.
  const judul = t.judul.endsWith("…") ? t.judul : `${t.judul}.`;
  const pesan: Record<NotifikasiRow["jenis"], [string, string]> = {
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

  async ubahStatus(user: PenggunaRow, idTiket: number, ke: "diproses" | "dibatalkan"): Promise<TiketDetail> {
    auth.requireRole(user, "pemilik");
    await delay(jitter(250, 450));
    const t = complaintTicket.getTiketRow(idTiket);
    if (!complaintTicket.bolehLihat(user, t)) throw new ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.");
    complaintTicket.setStatusTiket(idTiket, ke, user.nama);
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
};
