"""[Entity: Financial Ledger] Add Transaksi Kas dan Get Laporan Kas. Sama dengan `ledger` di mock frontend.

Ringkasan invoice dan tagihan sewa tertunda di laporan kas dirakit read model (app/views), karena datanya
milik Entity Invoice dan Rent Invoice.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import TransaksiKas


def add(
    db: Session,
    id_pemilik: int,
    waktu: datetime,
    jenis: str,
    keterangan: str,
    jumlah: int,
    ref: str,
    properti: str,
) -> TransaksiKas:
    k = TransaksiKas(
        id_pemilik=id_pemilik,
        waktu=waktu,
        jenis=jenis,
        keterangan=keterangan,
        jumlah=jumlah,
        ref=ref,
        properti=properti,
    )
    db.add(k)
    db.flush()
    return k


def list_kas(db: Session, id_pemilik: int) -> list[TransaksiKas]:
    """Transaksi kas pemilik, terbaru dulu."""
    q = select(TransaksiKas).filter_by(id_pemilik=id_pemilik).order_by(TransaksiKas.waktu.desc(), TransaksiKas.id)
    return list(db.scalars(q))
