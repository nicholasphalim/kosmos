"""[Entity: Financial Ledger] pemilik tabel kas: buku kas per pemilik."""

from datetime import datetime

from sqlalchemy import CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class TransaksiKas(Base):
    __tablename__ = "kas"
    __table_args__ = (CheckConstraint("jenis IN ('sewa', 'pembayaran_teknisi', 'komisi')", name="ck_kas_jenis"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # id_pemilik milik Entity Tenant and Lease: angka tanpa FK (plan §4).
    id_pemilik: Mapped[int] = mapped_column(Integer, index=True)
    waktu: Mapped[datetime] = mapped_column(UTCDateTime)
    # sewa = uang masuk dari penghuni; pembayaran_teknisi + komisi = uang keluar untuk perbaikan.
    jenis: Mapped[str] = mapped_column(String(20))
    keterangan: Mapped[str] = mapped_column(String(200))
    jumlah: Mapped[int] = mapped_column(Integer)  # positif = masuk, negatif = keluar
    ref: Mapped[str] = mapped_column(String(20))  # INV-0012 atau SWA-0003
    properti: Mapped[str] = mapped_column(String(100))
