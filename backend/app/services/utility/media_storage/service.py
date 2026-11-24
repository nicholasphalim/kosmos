"""[Utility: Media Storage] validasi, simpan ke disk (backend/uploads), dan sajikan lewat /media-files."""

import uuid
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ServiceError

from .models import Lampiran

MAKS_FILE = 3
BATAS_GAMBAR = 5 * 1024 * 1024
BATAS_VIDEO = 20 * 1024 * 1024
EKSTENSI = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4"}


@dataclass
class FileMasuk:
    nama: str
    mime: str
    isi: bytes

    @property
    def ukuran(self) -> int:
        return len(self.isi)


class LampiranOut(BaseModel):
    id: int
    url: str
    nama_file: str
    mime: str
    ukuran_byte: int


def validasi(files: list[FileMasuk]) -> None:
    if len(files) > MAKS_FILE:
        raise ServiceError(422, "LAMPIRAN_TERLALU_BANYAK", "Maksimal 3 file lampiran.")
    for f in files:
        gambar = f.mime.startswith("image/")
        video = f.mime == "video/mp4"
        if not gambar and not video:
            raise ServiceError(422, "TIPE_FILE_DITOLAK", f"{f.nama}: hanya gambar atau video mp4.")
        if (gambar and f.ukuran > BATAS_GAMBAR) or (video and f.ukuran > BATAS_VIDEO):
            raise ServiceError(422, "FILE_TERLALU_BESAR", f"{f.nama} melebihi batas ukuran.")


def simpan(db: Session, f: FileMasuk, owner_type: str, owner_id: int = 0) -> Lampiran:
    """Add Lampiran Media: tulis file ke disk, catat metadata, kembalikan URL publik."""
    s = get_settings()
    s.upload_dir.mkdir(parents=True, exist_ok=True)
    nama_disk = uuid.uuid4().hex + EKSTENSI.get(f.mime, Path(f.nama).suffix.lower())
    (s.upload_dir / nama_disk).write_bytes(f.isi)
    row = Lampiran(
        owner_type=owner_type, owner_id=owner_id, url=f"{s.public_base_url.rstrip('/')}/media-files/{nama_disk}",
        nama_file=f.nama, mime=f.mime, ukuran_byte=f.ukuran,
    )
    db.add(row)
    db.flush()
    return row


def tautkan(db: Session, id_lampiran: list[int], owner_id: int) -> None:
    for row in db.scalars(select(Lampiran).where(Lampiran.id.in_(id_lampiran))):
        row.owner_id = owner_id


def list_by_owner(db: Session, owner_type: str, owner_id: int) -> list[LampiranOut]:
    q = select(Lampiran).filter_by(owner_type=owner_type, owner_id=owner_id).order_by(Lampiran.id)
    return [to_out(r) for r in db.scalars(q)]


def get(db: Session, id_lampiran: int | None) -> LampiranOut | None:
    row = db.get(Lampiran, id_lampiran) if id_lampiran is not None else None
    return to_out(row) if row else None


def to_out(r: Lampiran) -> LampiranOut:
    return LampiranOut(id=r.id, url=r.url, nama_file=r.nama_file, mime=r.mime, ukuran_byte=r.ukuran_byte)
