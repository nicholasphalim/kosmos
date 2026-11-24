"""Endpoint baca Complaint Ticket. Response dirakit oleh read model (app.views) karena memuat nama unit dan penghuni."""

from fastapi import APIRouter

from app import views
from app.core.security import DB, CurrentUser
from app.views.schemas import KeluhanOut, TiketDetail, TiketRingkas

from . import service

router = APIRouter(tags=["Entity: Complaint Ticket"])


@router.get("/tiket", response_model=list[TiketRingkas],
            summary="Daftar tiket (penghuni melihat miliknya, pemilik melihat properti miliknya)")
def list_tiket(user: CurrentUser, db: DB):
    return [views.tiket_ringkas(db, t) for t in service.list_tiket(db) if views.boleh_lihat_tiket(db, user, t)]


@router.get("/tiket/{id_tiket}", response_model=TiketDetail, summary="Get Tiket beserta keluhan, lampiran, dan riwayat status")
def get_tiket(id_tiket: int, user: CurrentUser, db: DB):
    return views.tiket_detail(db, views.tiket_untuk(db, user, id_tiket))


@router.get("/keluhan/{id_keluhan}", response_model=KeluhanOut, summary="Get Keluhan")
def get_keluhan(id_keluhan: int, _user: CurrentUser, db: DB):
    return views.keluhan(db, service.get_keluhan(db, id_keluhan))
