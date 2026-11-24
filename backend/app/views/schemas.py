"""Skema response yang menggabungkan data beberapa service (nama mengikuti contracts/openapi.yaml)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.services.entity.tenant_lease.schemas import PenggunaOut, StatusSewa, UnitRingkas
from app.services.utility.media_storage.service import LampiranOut

StatusTiket = Literal["dibuat", "diklasifikasi", "diproses", "selesai", "dibatalkan"]
Kategori = Literal["AC", "listrik", "air", "lainnya"]
Urgensi = Literal["rendah", "sedang", "tinggi"]
StatusWorkOrder = Literal["menunggu_jadwal", "dijadwalkan", "dikerjakan", "menunggu_konfirmasi", "selesai", "dibatalkan"]


class TraceStep(BaseModel):
    service: str
    layer: Literal["Task", "Micro", "Entity", "Utility"]
    operasi: str
    ok: bool
    ms: float


class KeluhanOut(BaseModel):
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
    unit: UnitRingkas
    penghuni: PenggunaOut
    created_at: datetime
    updated_at: datetime


class RiwayatStatus(BaseModel):
    dari: StatusTiket | None
    ke: StatusTiket
    waktu: datetime
    oleh: str


class TiketDetail(TiketRingkas):
    keluhan: KeluhanOut
    ai_confidence: float | None
    ai_alasan: str | None
    riwayat: list[RiwayatStatus]


class KeluhanResponse(BaseModel):
    hasil: Literal["diterima", "ditolak"]
    keluhan: KeluhanOut
    tiket: TiketDetail | None
    alasan: str | None
    sewa: StatusSewa | None
    warning: str | None
    trace: list[TraceStep]


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
    status: Literal["menunggu", "disetujui", "ditolak"]
    diputuskan_oleh: str | None
    diputuskan_at: datetime | None
    created_at: datetime


class EstimasiResponse(BaseModel):
    estimasi: EstimasiBiaya
    trace: list[TraceStep]


class LogServisOut(BaseModel):
    aktivitas: str
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


class WorkOrderOut(BaseModel):
    id: int
    kode: str
    id_tiket: int
    kode_tiket: str
    judul: str
    kategori: Kategori | None
    urgensi: Urgensi | None
    unit: UnitRingkas
    penghuni: PenggunaOut
    teknisi: TeknisiRingkas
    status: StatusWorkOrder
    biaya_final: int
    slot_jadwal: list[datetime]
    jadwal_kunjungan: datetime | None
    log: list[LogServisOut]
    bukti_sebelum: LampiranOut | None
    bukti_sesudah: LampiranOut | None
    verifikasi: VerifikasiBukti | None
    id_invoice: int | None
    created_at: datetime
    updated_at: datetime
