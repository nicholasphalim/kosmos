"""[Entity: Payment] pemilik tabel pembayaran: satu baris per percobaan pembayaran ke payment gateway."""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class Pembayaran(Base):
    __tablename__ = "pembayaran"
    __table_args__ = (
        CheckConstraint("untuk IN ('invoice', 'sewa')", name="ck_pembayaran_untuk"),
        CheckConstraint("metode IN ('qris', 'va_bca', 'va_mandiri', 'gopay')", name="ck_pembayaran_metode"),
        CheckConstraint("status IN ('pending', 'berhasil', 'gagal')", name="ck_pembayaran_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Tagihan yang dibayar: invoice perbaikan (Entity Invoice) atau tagihan sewa (Entity Rent Invoice). Tanpa FK.
    untuk: Mapped[str] = mapped_column(String(10))
    id_tagihan: Mapped[int] = mapped_column(Integer, index=True)
    # Bayar sekaligus = beberapa baris dengan ref_gateway yang sama.
    ref_gateway: Mapped[str] = mapped_column(String(20), index=True)
    metode: Mapped[str] = mapped_column(String(15))
    jumlah: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10))
    alasan_gagal: Mapped[str | None] = mapped_column(String(200))
    direkonsiliasi: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
