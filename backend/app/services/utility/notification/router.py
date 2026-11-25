from fastapi import APIRouter

from app.core.db import DB
from app.core.security import CurrentUser

from . import service
from .service import NotifikasiOut

router = APIRouter(tags=["Utility: Notification"])


@router.get("/notifikasi", response_model=list[NotifikasiOut], operation_id="listNotifikasiSaya")
def list_notifikasi_saya(user: CurrentUser, db: DB):
    """Outbox notifikasi untuk pengguna yang login."""
    return service.list_untuk(db, user.id)
