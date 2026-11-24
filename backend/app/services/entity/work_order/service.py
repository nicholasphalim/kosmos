"""[Entity: Work Order] state machine work order dan log servis (Get Progress Servis)."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ServiceError
from app.core.waktu import now_utc

from .models import LogServis, WorkOrder

TRANSISI = {
    "menunggu_jadwal": {"dijadwalkan", "dibatalkan"},
    "dijadwalkan": {"dikerjakan", "dibatalkan"},
    "dikerjakan": {"menunggu_konfirmasi", "dibatalkan"},
    "menunggu_konfirmasi": {"selesai", "dikerjakan", "dibatalkan"},
    "selesai": set(),
    "dibatalkan": set(),
}
AKTIF_SELESAI = ("selesai", "dibatalkan")


def kode_wo(id_: int) -> str:
    return f"WO-{id_:04d}"


def get(db: Session, id_wo: int) -> WorkOrder:
    w = db.get(WorkOrder, id_wo)
    if w is None:
        raise ServiceError(404, "WORK_ORDER_TIDAK_ADA", "Work order tidak ditemukan.")
    return w


def by_tiket(db: Session, id_tiket: int) -> WorkOrder | None:
    return db.scalars(select(WorkOrder).filter_by(id_tiket=id_tiket).order_by(WorkOrder.id.desc()).limit(1)).first()


def list_semua(db: Session, id_tiket: int | None = None) -> list[WorkOrder]:
    q = select(WorkOrder).order_by(WorkOrder.created_at.desc(), WorkOrder.id.desc())
    if id_tiket is not None:
        q = q.filter_by(id_tiket=id_tiket)
    return list(db.scalars(q))


def jumlah_aktif(db: Session, id_teknisi: int) -> int:
    q = select(func.count()).select_from(WorkOrder).where(WorkOrder.id_teknisi == id_teknisi, WorkOrder.status.not_in(AKTIF_SELESAI))
    return db.scalar(q) or 0


def set_status(db: Session, id_wo: int, ke: str) -> WorkOrder:
    w = get(db, id_wo)
    if ke not in TRANSISI[w.status]:
        raise ServiceError(409, "TRANSISI_TIDAK_VALID", f"Work order tidak bisa berubah dari {w.status} ke {ke}.")
    w.status = ke
    w.updated_at = now_utc()
    db.flush()
    return w


def add_log(db: Session, id_wo: int, aktivitas: str, oleh: str, catatan: str | None = None, waktu: datetime | None = None) -> None:
    db.add(LogServis(id_work_order=id_wo, aktivitas=aktivitas, catatan=catatan, oleh=oleh, waktu=waktu or now_utc()))
    db.flush()


def get_log(db: Session, id_wo: int) -> list[LogServis]:
    return list(db.scalars(select(LogServis).filter_by(id_work_order=id_wo).order_by(LogServis.id)))
