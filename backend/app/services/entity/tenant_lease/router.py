from fastapi import APIRouter

from app.core.security import DB, CurrentUser, require_role

from . import service
from .schemas import ProfilPenghuni, StatusSewa

router = APIRouter(tags=["Entity: Tenant and Lease"])


@router.get("/penghuni/me", response_model=ProfilPenghuni, summary="Get ID Penghuni + Get ID Unit untuk pengguna yang login")
def get_penghuni_saya(user: CurrentUser, db: DB):
    require_role(user, "penghuni")
    return service.profil(db, user.id)


@router.get("/unit/{id_unit}/sewa", response_model=StatusSewa, summary="Get Status Sewa sebuah unit")
def get_status_sewa(id_unit: int, _user: CurrentUser, db: DB):
    return service.get_status_sewa(db, id_unit)
