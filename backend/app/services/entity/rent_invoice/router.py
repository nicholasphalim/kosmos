"""[Entity: Rent Invoice] endpoint baca. Penghuni melihat tagihannya, pemilik melihat tagihan di propertinya."""

from fastapi import APIRouter

from app import views
from app.core.db import DB
from app.core.security import CurrentUser
from app.views.schemas import TagihanSewa

from . import service

router = APIRouter(tags=["Entity: Rent Invoice"])


@router.get("/tagihan-sewa", response_model=list[TagihanSewa], operation_id="listTagihanSewa")
def list_tagihan_sewa(user: CurrentUser, db: DB):
    """Daftar tagihan sewa (penghuni miliknya, pemilik propertinya)."""
    return [views.tagihan_sewa(db, t) for t in service.list_tagihan(db) if views.boleh_lihat_tagihan_sewa(db, user, t)]


@router.get("/tagihan-sewa/{id_tagihan}", response_model=TagihanSewa, operation_id="getTagihanSewa")
def get_tagihan_sewa(id_tagihan: int, user: CurrentUser, db: DB):
    """Get Tagihan Sewa beserta riwayat percobaan pembayaran."""
    return views.tagihan_sewa(db, views.tagihan_sewa_untuk(db, user, id_tagihan))
