"""[Entity: Tenant and Lease] pemilik tabel pengguna, properti, unit, sewa."""

import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, Float, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

ROLE = ("penghuni", "pemilik", "teknisi")


class Pengguna(Base):
    __tablename__ = "pengguna"
    __table_args__ = (
        CheckConstraint(f"role IN {ROLE}", name="ck_pengguna_role"),
        CheckConstraint("email = lower(email)", name="ck_pengguna_email_lowercase"),
        UniqueConstraint("email", name="uq_pengguna_email"),
        UniqueConstraint("auth_user_id", name="uq_pengguna_auth_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    nama: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10))
    no_wa: Mapped[str] = mapped_column(String(20))
    # Email Google yang didaftarkan pemilik/admin. Login Google dicocokkan lewat email ini (plan §7.2).
    email: Mapped[str] = mapped_column(String(254))
    # ID akun Supabase Auth (klaim `sub`), diisi saat pertama kali login Google.
    auth_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)


class Properti(Base):
    __tablename__ = "properti"

    id: Mapped[int] = mapped_column(primary_key=True)
    nama: Mapped[str] = mapped_column(String(100))
    id_pemilik: Mapped[int] = mapped_column(ForeignKey("pengguna.id"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)


class Unit(Base):
    __tablename__ = "unit"
    __table_args__ = (CheckConstraint("harga_bulanan > 0", name="ck_unit_harga_positif"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    id_properti: Mapped[int] = mapped_column(ForeignKey("properti.id"))
    nomor_unit: Mapped[str] = mapped_column(String(20))
    harga_bulanan: Mapped[int] = mapped_column(Integer)


class Sewa(Base):
    """Status sewa tidak disimpan: dihitung dari tanggal agar tidak pernah basi (plan §4)."""

    __tablename__ = "sewa"
    __table_args__ = (CheckConstraint("tanggal_mulai <= tanggal_selesai", name="ck_sewa_periode"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    id_unit: Mapped[int] = mapped_column(ForeignKey("unit.id"), index=True)
    id_penghuni: Mapped[int] = mapped_column(ForeignKey("pengguna.id"), index=True)
    tanggal_mulai: Mapped[date] = mapped_column(Date)
    tanggal_selesai: Mapped[date] = mapped_column(Date)
