"""[Entity: Rent Invoice] pemilik tabel tagihan_sewa: satu tagihan per sewa per bulan."""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class TagihanSewa(Base):
    __tablename__ = "tagihan_sewa"
    __table_args__ = (
        UniqueConstraint("id_sewa", "periode", name="uq_tagihan_sewa_periode"),
        CheckConstraint("status IN ('belum_dibayar', 'lunas')", name="ck_tagihan_sewa_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # id_sewa milik Entity Tenant and Lease: angka tanpa FK (plan §4).
    id_sewa: Mapped[int] = mapped_column(Integer, index=True)
    periode: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    jumlah: Mapped[int] = mapped_column(Integer)
    jatuh_tempo: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(15))
    dibayar_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
