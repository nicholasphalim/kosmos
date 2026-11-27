"""[Task: Complete and Settle Maintenance] endpoint HTTP. Orkestrasi ada di service.py."""

from typing import Literal

from fastapi import APIRouter, UploadFile
from pydantic import BaseModel, Field

from app.core.db import DB
from app.core.security import Pemilik, Penghuni, Teknisi
from app.services.utility.media_storage.router import baca_upload
from app.views.schemas import BayarResponse, BayarSekaligusResponse, BuktiResponse, KonfirmasiResponse, WorkOrder

from . import service

router = APIRouter(prefix="/csm", tags=["Task: Complete and Settle Maintenance"])


class LogRequest(BaseModel):
    aktivitas: Literal["tiba", "mulai", "catatan"]
    catatan: str | None = Field(default=None, max_length=300)


class BiayaTambahanRequest(BaseModel):
    # Batas alasan (5-200 karakter) dan jumlah (Rp 1.000-5.000.000) diperiksa service agar kode error-nya spesifik.
    alasan: str
    jumlah: int


class KonfirmasiRequest(BaseModel):
    selesai: bool
    catatan: str | None = Field(default=None, max_length=300)


class PenerimaanRequest(BaseModel):
    diterima: bool
    catatan: str | None = Field(default=None, max_length=300)


class BayarRequest(BaseModel):
    # metode dan jumlah invoice diperiksa service agar kode error-nya spesifik (METODE_TIDAK_VALID, dst.).
    metode: str
    simulasi_gagal: bool = False  # khusus demo: payment gateway mock menolak transaksi


class BayarSekaligusRequest(BayarRequest):
    id_invoice: list[int] = []


@router.post("/work-order/{id_work_order}/log", response_model=WorkOrder, operation_id="catatLogServis")
def catat_log(id_work_order: int, body: LogRequest, user: Teknisi, db: DB):
    """Teknisi mencatat log servis (Add Log Servis) lalu progres dikabarkan."""
    return service.catat_log(db, user, id_work_order, body.aktivitas, body.catatan)


@router.post(
    "/work-order/{id_work_order}/biaya-tambahan",
    response_model=WorkOrder,
    status_code=201,
    operation_id="ajukanBiayaTambahan",
)
def ajukan_biaya_tambahan(id_work_order: int, body: BiayaTambahanRequest, user: Teknisi, db: DB):
    """Teknisi mengajukan biaya tambahan di luar estimasi (saat dikerjakan)."""
    return service.ajukan_biaya_tambahan(db, user, id_work_order, body.alasan, body.jumlah)


@router.post("/work-order/{id_work_order}/bukti", response_model=BuktiResponse, operation_id="unggahBukti")
async def unggah_bukti(
    id_work_order: int,
    user: Teknisi,
    db: DB,
    sebelum: UploadFile | None = None,
    sesudah: UploadFile | None = None,
):
    """Teknisi mengunggah foto sebelum dan sesudah, lalu Evidence Verification memeriksanya."""

    async def baca(f: UploadFile | None):
        if f is None or not f.filename:
            return None
        hasil = await baca_upload(f)
        return hasil if hasil.ukuran > 0 else None

    return service.unggah_bukti(db, user, id_work_order, await baca(sebelum), await baca(sesudah))


@router.post(
    "/work-order/{id_work_order}/konfirmasi", response_model=KonfirmasiResponse, operation_id="setKonfirmasiSelesai"
)
def konfirmasi(id_work_order: int, body: KonfirmasiRequest, user: Penghuni, db: DB):
    """Penghuni mengonfirmasi perbaikan selesai (menunggu pemilik) atau belum beres (kembali dikerjakan)."""
    return service.konfirmasi(db, user, id_work_order, body.selesai, body.catatan)


@router.post(
    "/work-order/{id_work_order}/terima", response_model=KonfirmasiResponse, operation_id="setPenerimaanPemilik"
)
def terima(id_work_order: int, body: PenerimaanRequest, user: Pemilik, db: DB):
    """Pemilik menerima hasil (tutup tiket, hitung komisi, terbitkan invoice) atau meminta perbaikan ulang."""
    return service.terima(db, user, id_work_order, body.diterima, body.catatan)


# Rute statis didaftarkan sebelum /invoice/{id_invoice}/bayar supaya tidak tertukar.
@router.post("/invoice/bayar-sekaligus", response_model=BayarSekaligusResponse, operation_id="bayarInvoiceSekaligus")
def bayar_sekaligus(body: BayarSekaligusRequest, user: Pemilik, db: DB):
    """Pemilik membayar beberapa invoice perbaikan dalam satu transaksi payment gateway (all-or-nothing)."""
    return service.bayar_sekaligus(db, user, body.id_invoice, body.metode, body.simulasi_gagal)


@router.post("/invoice/{id_invoice}/bayar", response_model=BayarResponse, operation_id="bayarInvoice")
def bayar(id_invoice: int, body: BayarRequest, user: Pemilik, db: DB):
    """Pemilik membayar invoice via payment gateway, rekonsiliasi, catat ke laporan kas, kirim notifikasi lunas."""
    return service.bayar(db, user, id_invoice, body.metode, body.simulasi_gagal)
