"""[Entity: Technician] operasi publik."""

from sqlalchemy.orm import Session

from app.core.errors import ServiceError

from .models import Teknisi


def get_row(db: Session, id_pengguna: int) -> Teknisi:
    t = db.get(Teknisi, id_pengguna)
    if t is None:
        raise ServiceError(404, "TEKNISI_TIDAK_ADA", "Teknisi tidak ditemukan.")
    return t
