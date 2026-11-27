"""[Entity: Invoice] pemilik tabel invoice (tagihan perbaikan dan biaya kunjungan ke pemilik)."""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class Invoice(Base):
    __tablename__ = "invoice"
    __table_args__ = (
        CheckConstraint("jenis IN ('perbaikan', 'kunjungan')", name="ck_invoice_jenis"),
        CheckConstraint("status IN ('belum_dibayar', 'lunas')", name="ck_invoice_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # id_work_order milik Entity Work Order: angka tanpa FK (plan §4).
    id_work_order: Mapped[int] = mapped_column(Integer, index=True)
    # perbaikan = hasil diterima pemilik; kunjungan = tiket dibatalkan setelah teknisi tiba.
    jenis: Mapped[str] = mapped_column(String(10))
    rincian: Mapped[list[dict]] = mapped_column(JSONB)
    biaya: Mapped[int] = mapped_column(Integer)
    persen_komisi: Mapped[int] = mapped_column(Integer)
    komisi: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(15))
    jatuh_tempo: Mapped[date] = mapped_column(Date)
    dibayar_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
