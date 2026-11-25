"""Skema response yang menggabungkan data beberapa service (nama mengikuti contracts/openapi.yaml)."""

from datetime import datetime
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
