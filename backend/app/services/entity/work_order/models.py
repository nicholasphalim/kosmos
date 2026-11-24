"""[Entity: Work Order] work order dan log servis."""

from datetime import datetime

from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class WorkOrder(Base):
    __tablename__ = "work_order"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Referensi lintas service (tiket, teknisi, estimasi, lampiran) disimpan sebagai angka tanpa FK.
    id_tiket: Mapped[int] = mapped_column(Integer)
    id_teknisi: Mapped[int] = mapped_column(Integer)
    id_estimasi: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(25))
    biaya_final: Mapped[int] = mapped_column(Integer)
    slot_jadwal: Mapped[list[str]] = mapped_column(JSON)
    jadwal_kunjungan: Mapped[datetime | None] = mapped_column(UTCDateTime)
    id_bukti_sebelum: Mapped[int | None] = mapped_column(Integer)
    id_bukti_sesudah: Mapped[int | None] = mapped_column(Integer)
    verifikasi: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class LogServis(Base):
    __tablename__ = "log_servis"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_work_order: Mapped[int] = mapped_column(ForeignKey("work_order.id"))
    aktivitas: Mapped[str] = mapped_column(String(20))
    catatan: Mapped[str | None] = mapped_column(Text)
    oleh: Mapped[str] = mapped_column(String(100))
    waktu: Mapped[datetime] = mapped_column(UTCDateTime)
