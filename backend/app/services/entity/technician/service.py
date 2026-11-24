"""[Entity: Technician] operasi publik."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ServiceError

from .models import Teknisi


def get_row(db: Session, id_pengguna: int) -> Teknisi:
    t = db.get(Teknisi, id_pengguna)
    if t is None:
        raise ServiceError(404, "TEKNISI_TIDAK_ADA", "Teknisi tidak ditemukan.")
    return t


def get_teknisi(db: Session) -> list[Teknisi]:
    """Get Teknisi Tersedia: semua mitra beserta status ketersediaannya (difilter oleh Technician Matching)."""
    return list(db.scalars(select(Teknisi).order_by(Teknisi.id_pengguna)))


def get_status_verifikasi(db: Session, id_pengguna: int) -> bool:
    return get_row(db, id_pengguna).terverifikasi
