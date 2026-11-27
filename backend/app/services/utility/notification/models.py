"""[Utility: Notification] outbox pesan. Agnostic: hanya tahu penerima, nomor tujuan, dan isi pesan."""

from datetime import datetime

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class Notifikasi(Base):
    __tablename__ = "notifikasi"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_penerima: Mapped[int] = mapped_column(Integer, index=True)
    kode_tiket: Mapped[str] = mapped_column(String(20))
    jenis: Mapped[str] = mapped_column(String(30))
    isi: Mapped[str] = mapped_column(Text)
    kanal: Mapped[str] = mapped_column(String(20))
    no_tujuan: Mapped[str] = mapped_column(String(20))
    status_kirim: Mapped[str] = mapped_column(String(10))  # terkirim | gagal
    provider: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
