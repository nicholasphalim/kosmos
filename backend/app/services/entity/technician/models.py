"""[Entity: Technician] profil mitra teknisi. Satu baris per pengguna ber-role teknisi."""

from sqlalchemy import JSON, Boolean, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Teknisi(Base):
    __tablename__ = "teknisi"

    # Referensi lintas service (pengguna milik Tenant and Lease) disimpan sebagai angka tanpa FK (plan §4).
    id_pengguna: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    keahlian: Mapped[list[str]] = mapped_column(JSON)
    terverifikasi: Mapped[bool] = mapped_column(Boolean)
    no_sertifikat: Mapped[str | None] = mapped_column(String(30))
    tersedia: Mapped[bool] = mapped_column(Boolean)
    rating: Mapped[float] = mapped_column(Float)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
