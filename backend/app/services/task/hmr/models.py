"""[Task: Handle Maintenance Request] tabel estimasi.

Get Estimasi Biaya dan Set Persetujuan Biaya non-agnostic (D1), jadi catatan estimasi dimiliki Task ini,
bukan Micro Cost Estimation yang stateless (plan §11b #2).
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class Estimasi(Base):
    __tablename__ = "estimasi"
    __table_args__ = (CheckConstraint("status IN ('menunggu', 'disetujui', 'ditolak')", name="ck_estimasi_status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # id_tiket (Complaint Ticket) dan id_teknisi (Tenant and Lease): angka tanpa FK (plan §4).
    id_tiket: Mapped[int] = mapped_column(Integer, index=True)
    id_teknisi: Mapped[int] = mapped_column(Integer)
    # Hasil Technician Matching (KandidatTeknisi[]) dan Cost Estimation (RincianBiaya[]) saat estimasi dibuat.
    kandidat: Mapped[list[dict]] = mapped_column(JSONB)
    rincian: Mapped[list[dict]] = mapped_column(JSONB)
    total: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10))
    # Nama pemilik yang memutuskan. null + status ditolak = diganti estimasi baru atau tiket ditutup/dibatalkan.
    diputuskan_oleh: Mapped[str | None] = mapped_column(String(100))
    diputuskan_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
