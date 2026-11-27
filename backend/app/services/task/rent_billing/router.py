"""[Task: Rent Billing] endpoint HTTP. Orkestrasi ada di service.py."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.db import DB
from app.core.security import Pemilik, Penghuni
from app.views.schemas import BayarSewaResponse, TerbitkanSewaResponse

from . import service

router = APIRouter(prefix="/rb", tags=["Task: Rent Billing"])


class BayarRequest(BaseModel):
    # metode diperiksa service agar kode error-nya spesifik (METODE_TIDAK_VALID).
    metode: str
    simulasi_gagal: bool = False  # khusus demo: payment gateway mock menolak transaksi


@router.post(
    "/tagihan-sewa/terbitkan",
    response_model=TerbitkanSewaResponse,
    status_code=201,
    operation_id="terbitkanTagihanSewa",
)
def terbitkan(user: Pemilik, db: DB):
    """Pemilik menerbitkan tagihan sewa bulan berjalan untuk semua sewa aktif yang belum ditagih."""
    return service.terbitkan(db, user)


@router.post("/tagihan-sewa/{id_tagihan}/bayar", response_model=BayarSewaResponse, operation_id="bayarTagihanSewa")
def bayar(id_tagihan: int, body: BayarRequest, user: Penghuni, db: DB):
    """Penghuni membayar tagihan sewa via payment gateway, lalu dicatat sebagai pemasukan di laporan kas pemilik."""
    return service.bayar(db, user, id_tagihan, body.metode, body.simulasi_gagal)
