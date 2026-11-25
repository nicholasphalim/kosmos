"""[Utility: Media Storage] validasi, simpan file lewat adapter (STORAGE_PROVIDER), dan buat URL baca.

Agnostic: tidak tahu apa itu keluhan atau work order, hanya (owner_type, owner_id).
"""

import uuid
from dataclasses import dataclass
from pathlib import PurePosixPath

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ServiceError
from app.core.waktu import now_utc

from .adapters import local, supabase
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


def _adapter():
    provider = get_settings().storage_provider
    if provider == "supabase":
        return supabase
    if provider == "local":
        return local
    raise ServiceError(503, "STORAGE_PROVIDER_TIDAK_DIKENAL", f"STORAGE_PROVIDER '{provider}' tidak dikenal.")


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
    """Add Lampiran Media: unggah ke storage, lalu catat metadata. Nama objek acak supaya tidak bisa ditebak."""
    ekstensi = EKSTENSI.get(f.mime) or PurePosixPath(f.nama).suffix.lower()[:8]
    path = f"{owner_type}/{now_utc():%Y/%m}/{uuid.uuid4().hex}{ekstensi}"
    _adapter().unggah(path, f.isi, f.mime)
    row = Lampiran(
        owner_type=owner_type,
        owner_id=owner_id,
        storage_path=path,
        nama_file=f.nama[:200],
        mime=f.mime,
        ukuran_byte=f.ukuran,
        created_at=now_utc(),
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


def url_baca(storage_path: str) -> str:
    # Gambar contoh di seed (mis. "/bukti/sebelum.svg") adalah file statis milik frontend.
    if storage_path.startswith("/"):
        return storage_path
    return _adapter().url(storage_path)


def to_out(r: Lampiran) -> LampiranOut:
    return LampiranOut(
        id=r.id, url=url_baca(r.storage_path), nama_file=r.nama_file, mime=r.mime, ukuran_byte=r.ukuran_byte
    )
