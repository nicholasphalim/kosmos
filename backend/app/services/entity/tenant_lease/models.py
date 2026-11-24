"""[Entity: Tenant and Lease] pemilik tabel pengguna, properti, unit, sewa."""

from datetime import date

from sqlalchemy import Date, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Pengguna(Base):
    __tablename__ = "pengguna"

    id: Mapped[int] = mapped_column(primary_key=True)
    nama: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10))  # penghuni | pemilik | teknisi
    no_wa: Mapped[str] = mapped_column(String(20))


class Properti(Base):
    __tablename__ = "properti"

    id: Mapped[int] = mapped_column(primary_key=True)
    nama: Mapped[str] = mapped_column(String(100))
    id_pemilik: Mapped[int] = mapped_column(ForeignKey("pengguna.id"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)


class Unit(Base):
    __tablename__ = "unit"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_properti: Mapped[int] = mapped_column(ForeignKey("properti.id"))
    nomor_unit: Mapped[str] = mapped_column(String(20))


class Sewa(Base):
    """Status sewa tidak disimpan: dihitung dari tanggal agar tidak pernah basi (plan §4)."""

    __tablename__ = "sewa"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_unit: Mapped[int] = mapped_column(ForeignKey("unit.id"))
    id_penghuni: Mapped[int] = mapped_column(ForeignKey("pengguna.id"))
    tanggal_mulai: Mapped[date] = mapped_column(Date)
    tanggal_selesai: Mapped[date] = mapped_column(Date)
