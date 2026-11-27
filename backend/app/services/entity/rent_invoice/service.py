"""[Entity: Rent Invoice] tagihan sewa bulanan. Aturan sama dengan `rentInvoice` di frontend/src/mocks/services.ts."""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ServiceError
from app.core.waktu import WIB, now_utc, today

from .models import TagihanSewa

TANGGAL_JATUH_TEMPO = 10


def kode_tagihan_sewa(id_: int) -> str:
    return f"SWA-{id_:04d}"


def periode_dari(waktu: datetime | None = None) -> str:
    """'2026-11' dari waktu (WIB)."""
    d = (waktu or now_utc()).astimezone(WIB)
    return f"{d.year}-{d.month:02d}"


def get(db: Session, id_tagihan: int) -> TagihanSewa:
    t = db.get(TagihanSewa, id_tagihan)
    if t is None:
        raise ServiceError(404, "TAGIHAN_SEWA_TIDAK_ADA", "Tagihan sewa tidak ditemukan.")
    return t


def list_tagihan(db: Session) -> list[TagihanSewa]:
    """Semua tagihan sewa, periode terbaru dulu. Filter otorisasi dilakukan pemanggil."""
    return list(db.scalars(select(TagihanSewa).order_by(TagihanSewa.periode.desc(), TagihanSewa.id)))


def ada(db: Session, id_sewa: int, periode: str) -> bool:
    return db.scalars(select(TagihanSewa.id).filter_by(id_sewa=id_sewa, periode=periode)).first() is not None


def add(db: Session, id_sewa: int, periode: str, jumlah: int, terbit: datetime | None = None) -> TagihanSewa:
    """Add Tagihan Sewa. Jatuh tempo tanggal 10 bulan periode."""
    tahun, bulan = (int(x) for x in periode.split("-"))
    t = TagihanSewa(
        id_sewa=id_sewa,
        periode=periode,
        jumlah=jumlah,
        jatuh_tempo=date(tahun, bulan, TANGGAL_JATUH_TEMPO),
        status="belum_dibayar",
        created_at=terbit or now_utc(),
    )
    db.add(t)
    db.flush()
    return t


def terlambat(t: TagihanSewa, hari_ini: date | None = None) -> bool:
    """Belum dibayar dan sudah lewat jatuh tempo (dihitung, tidak disimpan)."""
    return t.status == "belum_dibayar" and (hari_ini or today()) > t.jatuh_tempo


def set_lunas(db: Session, t: TagihanSewa, waktu: datetime) -> None:
    t.status, t.dibayar_at = "lunas", waktu
    db.flush()
