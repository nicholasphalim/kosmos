"""Skema response yang menggabungkan data beberapa service (nama mengikuti contracts/openapi.yaml)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from app.services.entity.tenant_lease.schemas import Pengguna, StatusSewa, UnitRingkas
from app.services.utility.media_storage.service import LampiranOut

StatusTiket = Literal["dibuat", "diklasifikasi", "diproses", "selesai", "dibatalkan"]
Kategori = Literal["AC", "listrik", "air", "lainnya"]
Urgensi = Literal["rendah", "sedang", "tinggi"]
Penanganan = Literal["sendiri", "teknisi"]


class TraceStep(BaseModel):
    service: str
    layer: Literal["Task", "Micro", "Entity", "Utility"]
    operasi: str
    ok: bool
    ms: float


class Keluhan(BaseModel):
    id: int
    kode: str
    id_penghuni: int
    id_unit: int
    deskripsi: str
    status: Literal["diterima", "ditolak"]
    alasan_penolakan: str | None
    lampiran: list[LampiranOut]
    created_at: datetime


class TiketRingkas(BaseModel):
    id: int
    kode: str
    judul: str
    status: StatusTiket
    kategori: Kategori | None
    urgensi: Urgensi | None
    perlu_review: bool
    penanganan: Penanganan | None
    unit: UnitRingkas
    penghuni: Pengguna
    created_at: datetime
    updated_at: datetime


class RiwayatStatus(BaseModel):
    dari: StatusTiket | None
    ke: StatusTiket
    waktu: datetime
    oleh: str
    catatan: str | None


class TiketDetail(TiketRingkas):
    keluhan: Keluhan
    ai_confidence: float | None
    ai_alasan: str | None
    catatan_penanganan: str | None
    bisa_dibuka_ulang: bool
    riwayat: list[RiwayatStatus]


class KeluhanResponse(BaseModel):
    hasil: Literal["diterima", "ditolak"]
    keluhan: Keluhan
    tiket: TiketDetail | None
    alasan: str | None
    sewa: StatusSewa | None
    warning: str | None
    trace: list[TraceStep]


# ---------- Repair Verification ----------

StatusWorkOrder = Literal[
    "menunggu_jadwal", "dijadwalkan", "dikerjakan", "menunggu_konfirmasi", "menunggu_pemilik", "selesai", "dibatalkan"
]
StatusPersetujuan = Literal["menunggu", "disetujui", "ditolak"]
AktivitasLog = Literal[
    "dibuat",
    "jadwal",
    "tiba",
    "mulai",
    "catatan",
    "bukti_valid",
    "bukti_ditolak",
    "belum_beres",
    "dikonfirmasi_penghuni",
    "perbaikan_ulang",
    "biaya_tambahan",
    "biaya_tambahan_disetujui",
    "biaya_tambahan_ditolak",
    "selesai",
    "dibatalkan",
]


class RincianBiaya(BaseModel):
    label: str
    jumlah: int


class TeknisiRingkas(BaseModel):
    id: int
    nama: str
    keahlian: list[Kategori]
    terverifikasi: bool
    rating: float
    no_wa: str


class KandidatTeknisi(BaseModel):
    teknisi: TeknisiRingkas
    tersedia: bool
    jarak_km: float
    lolos: bool
    skor: float | None
    alasan: str


class EstimasiBiaya(BaseModel):
    id: int
    id_tiket: int
    kode_tiket: str
    teknisi: TeknisiRingkas
    kandidat: list[KandidatTeknisi]
    rincian: list[RincianBiaya]
    total: int
    status: StatusPersetujuan
    diputuskan_oleh: str | None
    diputuskan_at: datetime | None
    created_at: datetime


class EstimasiResponse(BaseModel):
    estimasi: EstimasiBiaya
    trace: list[TraceStep]


class LogServis(BaseModel):
    aktivitas: AktivitasLog
    catatan: str | None
    waktu: datetime
    oleh: str


class PemeriksaanBukti(BaseModel):
    label: str
    ok: bool


class VerifikasiBukti(BaseModel):
    valid: bool
    skor: float
    pemeriksaan: list[PemeriksaanBukti]


class BiayaTambahan(BaseModel):
    id: int
    alasan: str
    jumlah: int
    status: StatusPersetujuan
    diajukan_at: datetime
    diputuskan_at: datetime | None


class WorkOrder(BaseModel):
    id: int
    kode: str
    id_tiket: int
    kode_tiket: str
    judul: str
    kategori: Kategori | None
    urgensi: Urgensi | None
    unit: UnitRingkas
    penghuni: Pengguna
    teknisi: TeknisiRingkas
    status: StatusWorkOrder
    biaya_final: int
    biaya_tambahan: list[BiayaTambahan]
    slot_jadwal: list[datetime]
    jadwal_kunjungan: datetime | None
    log: list[LogServis]
    bukti_sebelum: LampiranOut | None
    bukti_sesudah: LampiranOut | None
    verifikasi: VerifikasiBukti | None
    id_invoice: int | None
    created_at: datetime
    updated_at: datetime


class PersetujuanResponse(BaseModel):
    estimasi: EstimasiBiaya
    tiket: TiketDetail
    work_order: WorkOrder | None
    trace: list[TraceStep]


class BuktiResponse(BaseModel):
    work_order: WorkOrder
    verifikasi: VerifikasiBukti
    trace: list[TraceStep]


# ---------- Billing ----------


class Pembayaran(BaseModel):
    id: int
    ref_gateway: str
    metode: Literal["qris", "va_bca", "va_mandiri", "gopay"]
    jumlah: int
    status: Literal["pending", "berhasil", "gagal"]
    alasan_gagal: str | None
    direkonsiliasi: bool
    created_at: datetime


class Invoice(BaseModel):
    id: int
    kode: str
    id_work_order: int
    id_tiket: int
    kode_tiket: str
    judul: str
    unit: UnitRingkas
    penghuni: Pengguna
    pemilik: Pengguna
    teknisi: str
    rincian: list[RincianBiaya]
    biaya: int
    persen_komisi: float
    komisi: int
    total: int
    status: Literal["belum_dibayar", "lunas"]
    terlambat: bool
    jenis: Literal["perbaikan", "kunjungan"]
    jatuh_tempo: date
    dibayar_at: datetime | None
    pembayaran: list[Pembayaran]
    created_at: datetime


class KonfirmasiResponse(BaseModel):
    work_order: WorkOrder
    tiket: TiketDetail
    invoice: Invoice | None
    trace: list[TraceStep]


class BayarResponse(BaseModel):
    hasil: Literal["berhasil", "gagal"]
    invoice: Invoice
    pembayaran: Pembayaran
    alasan: str | None
    trace: list[TraceStep]


class BayarSekaligusResponse(BaseModel):
    hasil: Literal["berhasil", "gagal"]
    invoice: list[Invoice]
    ref_gateway: str
    total: int
    alasan: str | None
    trace: list[TraceStep]


# ---------- Rent Billing ----------


class TagihanSewa(BaseModel):
    id: int
    kode: str
    periode: str
    unit: UnitRingkas
    penghuni: Pengguna
    jumlah: int
    status: Literal["belum_dibayar", "lunas"]
    terlambat: bool
    jatuh_tempo: date
    dibayar_at: datetime | None
    pembayaran: list[Pembayaran]
    created_at: datetime


class TerbitkanSewaResponse(BaseModel):
    periode: str
    dibuat: list[TagihanSewa]
    trace: list[TraceStep]


class BayarSewaResponse(BaseModel):
    hasil: Literal["berhasil", "gagal"]
    tagihan: TagihanSewa
    pembayaran: Pembayaran
    alasan: str | None
    trace: list[TraceStep]


# ---------- Financial Ledger ----------


class TransaksiKas(BaseModel):
    id: int
    waktu: datetime
    jenis: Literal["sewa", "pembayaran_teknisi", "komisi"]
    keterangan: str
    jumlah: int
    ref: str
    properti: str


class RingkasanKas(BaseModel):
    pemasukan_sewa: int
    pengeluaran: int
    saldo: int
    sewa_tertunda: int
    nilai_sewa_tertunda: int
    pembayaran_teknisi: int
    komisi: int
    invoice_lunas: int
    invoice_tertunda: int
    invoice_terlambat: int
    nilai_tertunda: int


class LaporanKas(BaseModel):
    ringkasan: RingkasanKas
    transaksi: list[TransaksiKas]
