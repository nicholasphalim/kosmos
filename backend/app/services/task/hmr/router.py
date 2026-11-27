"""[Task: Handle Maintenance Request] endpoint HTTP. Orkestrasi ada di service.py."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Form, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.db import DB
from app.core.security import CurrentUser, Pemilik, Penghuni
from app.services.utility.media_storage.router import baca_upload
from app.views.schemas import (
    EstimasiBiaya,
    EstimasiResponse,
    KeluhanResponse,
    PersetujuanResponse,
    TiketDetail,
    WorkOrder,
)

from . import service

router = APIRouter(prefix="/hmr", tags=["Task: Handle Maintenance Request"])


class UbahStatusRequest(BaseModel):
    status: Literal["selesai", "dibatalkan"]
    catatan: str | None = Field(default=None, max_length=300)


class BukaUlangRequest(BaseModel):
    alasan: str = Field(max_length=300)


@router.post(
    "/keluhan",
    response_model=KeluhanResponse,
    status_code=201,
    responses={200: {"model": KeluhanResponse, "description": "Keluhan ditolak (sewa tidak aktif)"}},
    operation_id="ajukanKeluhan",
)
async def ajukan_keluhan(user: Penghuni, db: DB, deskripsi: str = Form(""), lampiran: list[UploadFile] | None = None):
    """Ajukan keluhan: validasi sewa, simpan media, buat tiket, klasifikasi AI, kirim notifikasi."""
    files = [await baca_upload(f) for f in (lampiran or []) if f.filename]
    status, body = service.ajukan_keluhan(db, user, deskripsi, files)
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


@router.post("/tiket/{id_tiket}/status", response_model=TiketDetail, operation_id="ubahStatusTiket")
def ubah_status_tiket(id_tiket: int, body: UbahStatusRequest, user: Pemilik, db: DB):
    """Tutup tiket tanpa teknisi (selesai) atau batalkan, lalu kabari penghuni dan pemilik."""
    return service.ubah_status(db, user, id_tiket, body.status, body.catatan)


@router.post("/tiket/{id_tiket}/klasifikasi-ulang", response_model=TiketDetail, operation_id="klasifikasiUlang")
def klasifikasi_ulang(id_tiket: int, user: Pemilik, db: DB):
    """Jalankan ulang klasifikasi AI untuk tiket berstatus "dibuat"."""
    return service.klasifikasi_ulang(db, user, id_tiket)


@router.post("/tiket/{id_tiket}/buka-ulang", response_model=TiketDetail, operation_id="bukaUlangTiket")
def buka_ulang(id_tiket: int, body: BukaUlangRequest, user: Penghuni, db: DB):
    """Penghuni membuka ulang tiket yang ditangani sendiri oleh pemilik (≤ 7 hari setelah ditutup)."""
    return service.buka_ulang(db, user, id_tiket, body.alasan)


# ---------- Repair Verification ----------


class PersetujuanRequest(BaseModel):
    disetujui: bool


class JadwalRequest(BaseModel):
    jadwal: datetime


@router.get("/tiket/{id_tiket}/estimasi", response_model=EstimasiBiaya | None, operation_id="getEstimasiTiket")
def get_estimasi(id_tiket: int, user: CurrentUser, db: DB):
    """Get Estimasi Biaya terakhir untuk tiket (null bila belum dicarikan teknisi)."""
    return service.get_estimasi(db, user, id_tiket)


@router.post(
    "/tiket/{id_tiket}/estimasi", response_model=EstimasiResponse, status_code=201, operation_id="buatEstimasi"
)
def buat_estimasi(id_tiket: int, user: Pemilik, db: DB):
    """Cari teknisi terverifikasi terdekat, hitung estimasi biaya, lalu sajikan ke pemilik (dashboard + WA)."""
    return service.buat_estimasi(db, user, id_tiket)


@router.post(
    "/estimasi/{id_estimasi}/persetujuan", response_model=PersetujuanResponse, operation_id="setPersetujuanBiaya"
)
def set_persetujuan(id_estimasi: int, body: PersetujuanRequest, user: Pemilik, db: DB):
    """Set Persetujuan Biaya. Disetujui membuat work order; ditolak mengembalikan tiket ke tahap tinjau."""
    return service.set_persetujuan(db, user, id_estimasi, body.disetujui)


@router.post("/work-order/{id_work_order}/jadwal", response_model=WorkOrder, operation_id="konfirmasiJadwal")
def konfirmasi_jadwal(id_work_order: int, body: JadwalRequest, user: Penghuni, db: DB):
    """Penghuni mengonfirmasi jadwal kunjungan teknisi (Set Jadwal Kunjungan)."""
    return service.konfirmasi_jadwal(db, user, id_work_order, body.jadwal)


@router.post(
    "/work-order/{id_work_order}/biaya-tambahan/{id_tambahan}/persetujuan",
    response_model=WorkOrder,
    operation_id="setPersetujuanBiayaTambahan",
)
def set_persetujuan_tambahan(id_work_order: int, id_tambahan: int, body: PersetujuanRequest, user: Pemilik, db: DB):
    """Pemilik menyetujui atau menolak biaya tambahan. Disetujui menambah biaya final."""
    return service.putuskan_biaya_tambahan(db, user, id_work_order, id_tambahan, body.disetujui)
