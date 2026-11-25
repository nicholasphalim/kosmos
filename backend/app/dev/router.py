"""Alat bantu demo. Router ini hanya didaftarkan bila DEMO_MODE=true (lihat app/main.py)."""

from fastapi import APIRouter, Response

from app.core.db import DB
from app.seed import reset_semua

router = APIRouter(prefix="/dev", tags=["Dev (demo)"])


@router.post(
    "/reset",
    status_code=204,
    summary="Hapus semua data lalu isi ulang data seed demo. Hanya tersedia bila DEMO_MODE=true",
    operation_id="resetDataDemo",
)
def reset_data_demo(db: DB) -> Response:
    reset_semua(db)
    return Response(status_code=204)
