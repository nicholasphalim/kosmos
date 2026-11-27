"""[Entity: Payment] catatan percobaan pembayaran. Aturan sama dengan `payment` di frontend/src/mocks/services.ts.

Panggilan ke payment gateway dilakukan Task lewat Utility Payment Gateway; Entity ini hanya menyimpan hasilnya.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.waktu import now_utc

from .models import Pembayaran


def set_metode(
    db: Session,
    untuk: str,
    id_tagihan: int,
    metode: str,
    jumlah: int,
    ref: str,
    waktu: datetime | None = None,
) -> Pembayaran:
    """Set Metode Pembayaran: membuka transaksi baru berstatus pending."""
    p = Pembayaran(
        untuk=untuk,
        id_tagihan=id_tagihan,
        ref_gateway=ref,
        metode=metode,
        jumlah=jumlah,
        status="pending",
        alasan_gagal=None,
        direkonsiliasi=False,
        created_at=waktu or now_utc(),
    )
    db.add(p)
    db.flush()
    return p


def set_status(db: Session, p: Pembayaran, status: str, alasan: str | None) -> None:
    """Set Status Pembayaran (berhasil | gagal) dari hasil gateway."""
    p.status, p.alasan_gagal = status, alasan
    db.flush()


def reconcile(db: Session, p: Pembayaran, jumlah_gateway: int, total_tagihan: int) -> bool:
    """Reconcile Pembayaran: transaksi berhasil dan jumlah di gateway sama dengan tagihan."""
    p.direkonsiliasi = p.status == "berhasil" and p.jumlah == jumlah_gateway == total_tagihan
    db.flush()
    return p.direkonsiliasi


def list_untuk(db: Session, untuk: str, id_tagihan: int) -> list[Pembayaran]:
    q = select(Pembayaran).filter_by(untuk=untuk, id_tagihan=id_tagihan).order_by(Pembayaran.id)
    return list(db.scalars(q))
