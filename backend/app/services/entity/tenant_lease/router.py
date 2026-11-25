"""[Entity: Tenant and Lease] endpoint HTTP. Logika ada di service.py."""

from fastapi import APIRouter

from app.core.db import DB
from app.core.security import CurrentUser, Pemilik, Penghuni

from . import service
from .schemas import (
    PenghuniBaruRequest,
    PenghuniTerdaftar,
    ProfilPenghuni,
    SewaBaruRequest,
    StatusSewa,
    UbahPenghuniRequest,
    UnitPemilik,
)

router = APIRouter(tags=["Entity: Tenant and Lease"])


@router.get("/penghuni/me", response_model=ProfilPenghuni, operation_id="getPenghuniSaya")
def get_penghuni_saya(user: Penghuni, db: DB):
    """Get ID Penghuni + Get ID Unit untuk pengguna yang login."""
    return service.profil(db, user.id)


@router.get("/pemilik/unit", response_model=list[UnitPemilik], operation_id="listUnitPemilik")
def list_unit_pemilik(user: Pemilik, db: DB):
    """Unit di properti milik pemilik, beserta penghuni dan sewa yang sedang aktif."""
    return service.list_unit_pemilik(db, user.id)


@router.get("/pemilik/penghuni", response_model=list[PenghuniTerdaftar], operation_id="listPenghuniTerdaftar")
def list_penghuni(user: Pemilik, db: DB):
    """Penghuni yang pernah atau sedang menyewa unit di properti milik pemilik."""
    return service.list_penghuni(db, user.id)


@router.post("/pemilik/penghuni", status_code=201, response_model=PenghuniTerdaftar, operation_id="addPenghuni")
def add_penghuni(body: PenghuniBaruRequest, user: Pemilik, db: DB):
    """Daftarkan penghuni baru (email Google + unit + periode sewa), pengganti sign up."""
    return service.add_penghuni(db, user.id, body)


@router.patch("/pemilik/penghuni/{id_pengguna}", response_model=PenghuniTerdaftar, operation_id="ubahPenghuni")
def ubah_penghuni(id_pengguna: int, body: UbahPenghuniRequest, user: Pemilik, db: DB):
    """Koreksi nama, email, atau nomor WhatsApp. Email terkunci setelah penghuni login Google."""
    return service.ubah_penghuni(db, user.id, id_pengguna, body)


@router.post(
    "/pemilik/penghuni/{id_pengguna}/sewa",
    status_code=201,
    response_model=PenghuniTerdaftar,
    operation_id="addSewaPenghuni",
)
def add_sewa(id_pengguna: int, body: SewaBaruRequest, user: Pemilik, db: DB):
    """Sewa baru untuk penghuni yang sudah terdaftar (perpanjang atau pindah unit)."""
    return service.add_sewa(db, user.id, id_pengguna, body)


@router.get("/unit/{id_unit}/sewa", response_model=StatusSewa, operation_id="getStatusSewa")
def get_status_sewa(id_unit: int, user: CurrentUser, db: DB):
    """Get Status Sewa sebuah unit. Hanya pemilik unit atau penghuni yang pernah menyewanya."""
    return service.status_sewa_untuk(db, user, id_unit)
