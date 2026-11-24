from typing import Literal

from fastapi import APIRouter, Form, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.security import DB, CurrentUser
from app.services.utility.media_storage.router import baca_upload
from app.views.schemas import EstimasiBiaya, EstimasiResponse, KeluhanResponse, TiketDetail

from . import service

router = APIRouter(prefix="/hmr", tags=["Task: Handle Maintenance Request"])


class UbahStatusRequest(BaseModel):
    status: Literal["dibatalkan"]


@router.post(
    "/keluhan",
    response_model=KeluhanResponse,
    status_code=201,
    responses={200: {"model": KeluhanResponse, "description": "Keluhan ditolak (sewa tidak aktif)"}},
    summary="Ajukan keluhan (orkestrasi validasi sewa, media, tiket, klasifikasi AI, notifikasi)",
)
async def ajukan_keluhan(user: CurrentUser, db: DB, deskripsi: str = Form(""), lampiran: list[UploadFile] | None = None):
    files = [await baca_upload(f) for f in (lampiran or []) if f.filename]
    status, body = service.ajukan_keluhan(db, user, deskripsi, files)
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


@router.post("/tiket/{id_tiket}/status", response_model=TiketDetail,
             summary="Batalkan tiket (beserta work order yang berjalan) lalu kirim notifikasi ke penghuni dan pemilik")
def ubah_status_tiket(id_tiket: int, body: UbahStatusRequest, user: CurrentUser, db: DB):
    return service.ubah_status(db, user, id_tiket, body.status)


@router.post("/tiket/{id_tiket}/klasifikasi-ulang", response_model=TiketDetail,
             summary='Jalankan ulang klasifikasi AI untuk tiket berstatus "dibuat"')
def klasifikasi_ulang(id_tiket: int, user: CurrentUser, db: DB):
    return service.klasifikasi_ulang(db, user, id_tiket)


@router.get("/tiket/{id_tiket}/estimasi", response_model=EstimasiBiaya | None,
            summary="Get Estimasi Biaya terakhir untuk tiket (null bila belum dicarikan teknisi)")
def get_estimasi_tiket(id_tiket: int, user: CurrentUser, db: DB):
    return service.get_estimasi(db, user, id_tiket)


@router.post("/tiket/{id_tiket}/estimasi", response_model=EstimasiResponse, status_code=201,
             summary="Cari ulang teknisi dan hitung estimasi biaya (fallback bila estimasi otomatis belum terbentuk)")
def buat_estimasi(id_tiket: int, user: CurrentUser, db: DB):
    return service.buat_estimasi(db, user, id_tiket)
