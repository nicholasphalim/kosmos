from fastapi import APIRouter

from app.core.security import DB, CurrentUser

from . import service
from .service import NotifikasiOut

router = APIRouter(tags=["Utility: Notification"])


@router.get("/notifikasi", response_model=list[NotifikasiOut], summary="Outbox notifikasi untuk pengguna yang login")
def list_notifikasi_saya(user: CurrentUser, db: DB):
    return service.list_untuk(db, user.id)
