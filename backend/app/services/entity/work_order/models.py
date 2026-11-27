"""[Entity: Work Order] pemilik tabel work_order, biaya_tambahan, log_servis."""

from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime

STATUS_WO = (
    "menunggu_jadwal",
    "dijadwalkan",
    "dikerjakan",
    "menunggu_konfirmasi",
    "menunggu_pemilik",
    "selesai",
    "dibatalkan",
)


class WorkOrder(Base):
    __tablename__ = "work_order"
    __table_args__ = (CheckConstraint(f"status IN {STATUS_WO}", name="ck_work_order_status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # id_tiket (Complaint Ticket), id_teknisi (Tenant and Lease) dan id_estimasi (Task HMR): angka tanpa FK (plan §4).
    id_tiket: Mapped[int] = mapped_column(Integer, index=True)
    id_teknisi: Mapped[int] = mapped_column(Integer, index=True)
    id_estimasi: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))
    biaya_final: Mapped[int] = mapped_column(Integer)
    # Usulan waktu kunjungan (ISO 8601 UTC) yang bisa dipilih penghuni.
    slot_jadwal: Mapped[list[str]] = mapped_column(JSONB)
    jadwal_kunjungan: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # id lampiran_media (Utility Media Storage).
    id_bukti_sebelum: Mapped[int | None] = mapped_column(Integer)
    id_bukti_sesudah: Mapped[int | None] = mapped_column(Integer)
    # Hasil Evidence Verification terakhir: {valid, skor, pemeriksaan[]}.
    verifikasi: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class BiayaTambahan(Base):
    """Biaya di luar estimasi yang diajukan teknisi dan diputuskan pemilik."""

    __tablename__ = "biaya_tambahan"
    __table_args__ = (
        CheckConstraint("status IN ('menunggu', 'disetujui', 'ditolak')", name="ck_biaya_tambahan_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    id_work_order: Mapped[int] = mapped_column(ForeignKey("work_order.id"), index=True)
    alasan: Mapped[str] = mapped_column(String(200))
    jumlah: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10))
    diajukan_at: Mapped[datetime] = mapped_column(UTCDateTime)
    diputuskan_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class LogServis(Base):
    """Jejak pekerjaan (Get Progress Servis), ditampilkan sebagai timeline di UI."""

    __tablename__ = "log_servis"

    id: Mapped[int] = mapped_column(primary_key=True)
    id_work_order: Mapped[int] = mapped_column(ForeignKey("work_order.id"), index=True)
    aktivitas: Mapped[str] = mapped_column(String(30))
    catatan: Mapped[str | None] = mapped_column(Text)
    oleh: Mapped[str] = mapped_column(String(100))
    waktu: Mapped[datetime] = mapped_column(UTCDateTime)
