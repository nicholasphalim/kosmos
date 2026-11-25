"""[Task: Handle Maintenance Request] endpoint HTTP. Orkestrasi ada di service.py."""

from typing import Literal

from fastapi import APIRouter, Form, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.db import DB
from app.core.security import Pemilik, Penghuni
from app.services.utility.media_storage.router import baca_upload
from app.views.schemas import KeluhanResponse, TiketDetail

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
