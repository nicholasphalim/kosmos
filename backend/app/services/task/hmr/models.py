"""Tabel milik Task HMR. Get Estimasi Biaya dan Set Persetujuan Biaya non-agnostic (D1),
jadi catatan estimasi dimiliki HMR; microservice Cost Estimation tetap stateless (plan §11b #2)."""

from datetime import datetime

from sqlalchemy import JSON, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class Estimasi(Base):
    __tablename__ = "estimasi"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_tiket: Mapped[int] = mapped_column(Integer)
    id_teknisi: Mapped[int] = mapped_column(Integer)
    kandidat: Mapped[list[dict]] = mapped_column(JSON)
    rincian: Mapped[list[dict]] = mapped_column(JSON)
    total: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10))  # menunggu | disetujui | ditolak
    diputuskan_oleh: Mapped[str | None] = mapped_column(String(100))
    diputuskan_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
