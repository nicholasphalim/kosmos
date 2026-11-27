"""[Entity: Work Order] work order, state machine, log servis, bukti, biaya tambahan.

Aturan sama dengan `workOrder` di frontend/src/mocks/services.ts.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ServiceError
from app.core.waktu import now_utc

from .models import BiayaTambahan, LogServis, WorkOrder

# Transisi status legal (plan §3.2). Transisi lain -> 409.
TRANSISI = {
    "menunggu_jadwal": {"dijadwalkan", "dibatalkan"},
    "dijadwalkan": {"dikerjakan", "dibatalkan"},
    "dikerjakan": {"menunggu_konfirmasi", "dibatalkan"},
    # menunggu_konfirmasi -> selesai: pemilik menerima hasil tanpa menunggu penghuni yang tidak merespons.
    "menunggu_konfirmasi": {"menunggu_pemilik", "selesai", "dikerjakan", "dibatalkan"},
    "menunggu_pemilik": {"selesai", "dikerjakan", "dibatalkan"},
    "selesai": set(),
    "dibatalkan": set(),
}

DITUTUP = ("selesai", "dibatalkan")


def kode_wo(id_: int) -> str:
    return f"WO-{id_:04d}"


def add_log(db: Session, id_wo: int, aktivitas: str, oleh: str, catatan: str | None = None) -> None:
    """Add Log Servis."""
    db.add(LogServis(id_work_order=id_wo, aktivitas=aktivitas, catatan=catatan, oleh=oleh, waktu=now_utc()))
    db.flush()


def add(
    db: Session, id_tiket: int, id_teknisi: int, id_estimasi: int, biaya: int, slot: list[str], nama_teknisi: str
) -> WorkOrder:
    """Add Work Order, status awal menunggu_jadwal."""
    waktu = now_utc()
    w = WorkOrder(
        id_tiket=id_tiket,
        id_teknisi=id_teknisi,
        id_estimasi=id_estimasi,
        status="menunggu_jadwal",
        biaya_final=biaya,
        slot_jadwal=slot,
        created_at=waktu,
        updated_at=waktu,
    )
    db.add(w)
    db.flush()
    add_log(db, w.id, "dibuat", "sistem", f"Ditugaskan ke {nama_teknisi}")
    return w


def get(db: Session, id_wo: int) -> WorkOrder:
    w = db.get(WorkOrder, id_wo)
    if w is None:
        raise ServiceError(404, "WORK_ORDER_TIDAK_ADA", "Work order tidak ditemukan.")
    return w


def by_tiket(db: Session, id_tiket: int) -> WorkOrder | None:
    """Work order terbaru untuk tiket."""
    return db.scalars(select(WorkOrder).filter_by(id_tiket=id_tiket).order_by(WorkOrder.id.desc())).first()


def list_work_order(db: Session, id_tiket: int | None = None) -> list[WorkOrder]:
    """Semua work order, terbaru dulu. Filter otorisasi dilakukan pemanggil."""
    q = select(WorkOrder).order_by(WorkOrder.created_at.desc(), WorkOrder.id.desc())
    if id_tiket is not None:
        q = q.filter_by(id_tiket=id_tiket)
    return list(db.scalars(q))


def ada_untuk_teknisi(db: Session, id_tiket: int, id_teknisi: int) -> bool:
    q = select(WorkOrder.id).filter_by(id_tiket=id_tiket, id_teknisi=id_teknisi)
    return db.scalars(q).first() is not None


def jumlah_aktif(db: Session, id_teknisi: int) -> int:
    q = select(WorkOrder.id).filter_by(id_teknisi=id_teknisi).where(WorkOrder.status.not_in(DITUTUP))
    return len(db.scalars(q).all())


def set_status(db: Session, id_wo: int, ke: str) -> WorkOrder:
    w = get(db, id_wo)
    if ke not in TRANSISI[w.status]:
        raise ServiceError(409, "TRANSISI_TIDAK_VALID", f"Work order tidak bisa berubah dari {w.status} ke {ke}.")
    w.status = ke
    w.updated_at = now_utc()
    db.flush()
    return w


def set_jadwal(db: Session, id_wo: int, waktu: datetime) -> None:
    """Set Jadwal Kunjungan."""
    w = set_status(db, id_wo, "dijadwalkan")
    w.jadwal_kunjungan = waktu


def get_log(db: Session, id_wo: int) -> list[LogServis]:
    """Get Progress Servis."""
    q = select(LogServis).filter_by(id_work_order=id_wo).order_by(LogServis.waktu, LogServis.id)
    return list(db.scalars(q))


def sudah_ada_log(db: Session, id_wo: int, aktivitas: str) -> bool:
    return any(lg.aktivitas == aktivitas for lg in get_log(db, id_wo))


def set_bukti(db: Session, id_wo: int, id_sebelum: int | None, id_sesudah: int | None, verifikasi: dict) -> None:
    w = get(db, id_wo)
    w.id_bukti_sebelum, w.id_bukti_sesudah, w.verifikasi = id_sebelum, id_sesudah, verifikasi
    w.updated_at = now_utc()
    db.flush()


def list_tambahan(db: Session, id_wo: int) -> list[BiayaTambahan]:
    q = select(BiayaTambahan).filter_by(id_work_order=id_wo).order_by(BiayaTambahan.id)
    return list(db.scalars(q))


def add_tambahan(db: Session, id_wo: int, alasan: str, jumlah: int) -> BiayaTambahan:
    """Add Biaya Tambahan: satu pengajuan menunggu dalam satu waktu (dijaga pemanggil)."""
    w = get(db, id_wo)
    waktu = now_utc()
    b = BiayaTambahan(id_work_order=id_wo, alasan=alasan, jumlah=jumlah, status="menunggu", diajukan_at=waktu)
    db.add(b)
    w.updated_at = waktu
    db.flush()
    return b


def get_tambahan(db: Session, id_wo: int, id_tambahan: int) -> BiayaTambahan:
    b = db.get(BiayaTambahan, id_tambahan)
    if b is None or b.id_work_order != id_wo:
        raise ServiceError(404, "BIAYA_TAMBAHAN_TIDAK_ADA", "Pengajuan biaya tambahan tidak ditemukan.")
    return b


def putuskan_tambahan(db: Session, id_wo: int, id_tambahan: int, disetujui: bool) -> BiayaTambahan:
    """Disetujui menambah biaya final."""
    w = get(db, id_wo)
    b = get_tambahan(db, id_wo, id_tambahan)
    waktu = now_utc()
    b.status = "disetujui" if disetujui else "ditolak"
    b.diputuskan_at = waktu
    if disetujui:
        w.biaya_final += b.jumlah
    w.updated_at = waktu
    db.flush()
    return b


def ada_tambahan_menunggu(db: Session, id_wo: int) -> bool:
    return any(b.status == "menunggu" for b in list_tambahan(db, id_wo))


def get_biaya_final(db: Session, id_wo: int) -> int:
    """Get Biaya Final: estimasi disetujui + biaya tambahan yang disetujui."""
    return get(db, id_wo).biaya_final
