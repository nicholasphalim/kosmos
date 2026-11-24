"""[Entity: Complaint Ticket] pemilik tabel keluhan, tiket, tiket_riwayat."""

from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class Keluhan(Base):
    __tablename__ = "keluhan"

    id: Mapped[int] = mapped_column(primary_key=True)
    # id_penghuni dan id_unit milik Tenant and Lease: angka tanpa FK (plan §4).
    id_penghuni: Mapped[int] = mapped_column(Integer)
    id_unit: Mapped[int] = mapped_column(Integer)
    deskripsi: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10))  # diterima | ditolak
    alasan_penolakan: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class Tiket(Base):
    __tablename__ = "tiket"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_keluhan: Mapped[int] = mapped_column(ForeignKey("keluhan.id"), unique=True)
    judul: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(15))  # dibuat | diklasifikasi | diproses | selesai | dibatalkan
    kategori: Mapped[str | None] = mapped_column(String(10))
    urgensi: Mapped[str | None] = mapped_column(String(10))
    perlu_review: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_confidence: Mapped[float | None] = mapped_column(Float)
    ai_alasan: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class TiketRiwayat(Base):
    """Jejak perubahan status untuk timeline UI."""

    __tablename__ = "tiket_riwayat"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_tiket: Mapped[int] = mapped_column(ForeignKey("tiket.id"))
    dari: Mapped[str | None] = mapped_column(String(15))
    ke: Mapped[str] = mapped_column(String(15))
    oleh: Mapped[str] = mapped_column(String(100))
    waktu: Mapped[datetime] = mapped_column(UTCDateTime)
