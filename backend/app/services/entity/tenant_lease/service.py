"""[Entity: Tenant and Lease] operasi publik. Service lain tidak boleh query tabelnya langsung."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ServiceError
from app.core.waktu import today

from .models import Pengguna, Properti, Sewa, Unit
from .schemas import PenggunaOut, ProfilPenghuni, StatusSewa, UnitRingkas


@dataclass(frozen=True)
class InfoUnit:
    id: int
    nomor_unit: str
    nama_properti: str
    id_pemilik: int
    lat: float
    lng: float


def get_pengguna(db: Session, id_pengguna: int) -> Pengguna:
    p = db.get(Pengguna, id_pengguna)
    if p is None:
        raise ServiceError(404, "PENGGUNA_TIDAK_ADA", "Pengguna tidak ditemukan.")
    return p


def to_pengguna(p: Pengguna) -> PenggunaOut:
    return PenggunaOut(id=p.id, nama=p.nama, role=p.role)  # type: ignore[arg-type]


def _sewa_terbaru(db: Session, **filter_) -> Sewa | None:
    q = select(Sewa).filter_by(**filter_).order_by(Sewa.tanggal_mulai.desc()).limit(1)
    return db.scalars(q).first()


def get_id_unit(db: Session, id_penghuni: int) -> int:
    """Get ID Unit: unit dari sewa terbaru milik penghuni."""
    sewa = _sewa_terbaru(db, id_penghuni=id_penghuni)
    if sewa is None:
        raise ServiceError(404, "UNIT_TIDAK_ADA", "Penghuni tidak memiliki unit.")
    return sewa.id_unit


def get_status_sewa(db: Session, id_unit: int) -> StatusSewa:
    """Get Status Sewa: aktif jika hari ini (WIB) berada di antara tanggal mulai dan selesai."""
    sewa = _sewa_terbaru(db, id_unit=id_unit)
    if sewa is None:
        raise ServiceError(404, "SEWA_TIDAK_ADA", "Unit belum pernah disewa.")
    hari_ini = today()
    aktif = sewa.tanggal_mulai <= hari_ini <= sewa.tanggal_selesai
    return StatusSewa(
        id_unit=id_unit,
        status_sewa="aktif" if aktif else "tidak_aktif",
        tanggal_mulai=sewa.tanggal_mulai,
        tanggal_selesai=sewa.tanggal_selesai,
    )


def info_unit(db: Session, id_unit: int) -> InfoUnit:
    u = db.get(Unit, id_unit)
    if u is None:
        raise ServiceError(404, "UNIT_TIDAK_ADA", "Unit tidak ditemukan.")
    p = db.get(Properti, u.id_properti)
    assert p is not None
    return InfoUnit(u.id, u.nomor_unit, p.nama, p.id_pemilik, p.lat, p.lng)


def unit_ringkas(db: Session, id_unit: int) -> UnitRingkas:
    i = info_unit(db, id_unit)
    return UnitRingkas(id=i.id, nomor_unit=i.nomor_unit, nama_properti=i.nama_properti)


def properti_milik(db: Session, id_pemilik: int) -> list[Properti]:
    return list(db.scalars(select(Properti).filter_by(id_pemilik=id_pemilik).order_by(Properti.id)))


def id_unit_milik(db: Session, id_pemilik: int) -> set[int]:
    """Semua unit di properti milik pemilik (dipakai untuk otorisasi data)."""
    q = select(Unit.id).join(Properti, Unit.id_properti == Properti.id).where(Properti.id_pemilik == id_pemilik)
    return set(db.scalars(q))


def profil(db: Session, id_penghuni: int) -> ProfilPenghuni:
    p = get_pengguna(db, id_penghuni)
    id_unit = get_id_unit(db, id_penghuni)
    return ProfilPenghuni(pengguna=to_pengguna(p), unit=unit_ringkas(db, id_unit), sewa=get_status_sewa(db, id_unit))
