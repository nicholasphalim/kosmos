"""[Entity: Financial Ledger] endpoint baca laporan kas pemilik."""

from fastapi import APIRouter

from app import views
from app.core.db import DB
from app.core.security import Pemilik
from app.views.schemas import LaporanKas

router = APIRouter(tags=["Entity: Financial Ledger"])


@router.get("/laporan-kas", response_model=LaporanKas, operation_id="getLaporanKas")
def get_laporan_kas(user: Pemilik, db: DB):
    """Get Laporan Kas pemilik (pemasukan sewa, pengeluaran perbaikan, bagian teknisi, komisi)."""
    return views.laporan_kas(db, user)
