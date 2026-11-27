"""[Entity: Complaint Ticket] endpoint baca.

Response dirakit read model (app.views) karena memuat nama unit dan penghuni.
"""

from fastapi import APIRouter

from app import views
from app.core.db import DB
from app.core.security import CurrentUser
from app.views.schemas import Keluhan, TiketDetail, TiketRingkas

from . import service

router = APIRouter(tags=["Entity: Complaint Ticket"])


@router.get("/tiket", response_model=list[TiketRingkas], operation_id="listTiket")
def list_tiket(user: CurrentUser, db: DB):
    """Daftar tiket (penghuni melihat miliknya, pemilik melihat properti miliknya)."""
    return [views.tiket_ringkas(db, t) for t in service.list_tiket(db) if views.boleh_lihat_tiket(db, user, t)]


@router.get("/tiket/{id_tiket}", response_model=TiketDetail, operation_id="getTiket")
def get_tiket(id_tiket: int, user: CurrentUser, db: DB):
    """Get Tiket beserta keluhan, lampiran, dan riwayat status."""
    return views.tiket_detail(db, views.tiket_untuk(db, user, id_tiket))


@router.get("/keluhan/{id_keluhan}", response_model=Keluhan, operation_id="getKeluhan")
def get_keluhan(id_keluhan: int, user: CurrentUser, db: DB):
    """Get Keluhan (penghuni pemiliknya atau pemilik unitnya)."""
    return views.keluhan(db, views.keluhan_untuk(db, user, id_keluhan))
