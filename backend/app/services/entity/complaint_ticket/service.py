"""[Entity: Complaint Ticket] keluhan, tiket, state machine status, riwayat."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ServiceError
from app.core.waktu import now_utc

from .models import Keluhan, Tiket, TiketRiwayat

# Transisi status legal (plan §3.2). Transisi lain -> 409.
TRANSISI = {
    "dibuat": {"diklasifikasi", "dibatalkan"},
    "diklasifikasi": {"diproses", "dibatalkan"},
    "diproses": {"selesai", "dibatalkan"},
    "selesai": set(),
    "dibatalkan": set(),
}


def kode_tiket(id_: int) -> str:
    return f"TKT-{id_:04d}"


def kode_keluhan(id_: int) -> str:
    return f"KLH-{id_:04d}"


def add_keluhan(db: Session, id_penghuni: int, id_unit: int, deskripsi: str, status: str, alasan: str | None) -> Keluhan:
    k = Keluhan(id_penghuni=id_penghuni, id_unit=id_unit, deskripsi=deskripsi, status=status,
                alasan_penolakan=alasan, created_at=now_utc())
    db.add(k)
    db.flush()
    return k


def add_tiket(db: Session, id_keluhan: int, judul: str) -> Tiket:
    waktu = now_utc()
    t = Tiket(id_keluhan=id_keluhan, judul=judul, status="dibuat", perlu_review=True, created_at=waktu, updated_at=waktu)
    db.add(t)
    db.flush()
    db.add(TiketRiwayat(id_tiket=t.id, dari=None, ke="dibuat", oleh="sistem", waktu=waktu))
    return t


def get_tiket(db: Session, id_tiket: int) -> Tiket:
    t = db.get(Tiket, id_tiket)
    if t is None:
        raise ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.")
    return t


def get_keluhan(db: Session, id_keluhan: int) -> Keluhan:
    k = db.get(Keluhan, id_keluhan)
    if k is None:
        raise ServiceError(404, "KELUHAN_TIDAK_ADA", "Keluhan tidak ditemukan.")
    return k


def set_kategori_urgensi(db: Session, id_tiket: int, kategori: str, urgensi: str, confidence: float, alasan: str, judul: str) -> None:
    t = get_tiket(db, id_tiket)
    t.kategori, t.urgensi, t.ai_confidence, t.ai_alasan, t.judul = kategori, urgensi, confidence, alasan, judul
    t.perlu_review = confidence < 0.6


def set_status_tiket(db: Session, id_tiket: int, ke: str, oleh: str) -> Tiket:
    t = get_tiket(db, id_tiket)
    if ke not in TRANSISI[t.status]:
        raise ServiceError(409, "TRANSISI_TIDAK_VALID", f"Status tidak bisa berubah dari {t.status} ke {ke}.")
    waktu = now_utc()
    db.add(TiketRiwayat(id_tiket=id_tiket, dari=t.status, ke=ke, oleh=oleh, waktu=waktu))
    t.status = ke
    t.updated_at = waktu
    db.flush()
    return t


def riwayat(db: Session, id_tiket: int) -> list[TiketRiwayat]:
    return list(db.scalars(select(TiketRiwayat).filter_by(id_tiket=id_tiket).order_by(TiketRiwayat.id)))


def list_tiket(db: Session) -> list[Tiket]:
    """Semua tiket, terbaru dulu. Filter otorisasi dilakukan pemanggil (penghuni/pemilik/teknisi)."""
    return list(db.scalars(select(Tiket).order_by(Tiket.created_at.desc(), Tiket.id.desc())))
