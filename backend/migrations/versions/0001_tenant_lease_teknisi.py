"""Tabel Tenant and Lease (pengguna, properti, unit, sewa) dan Technician (teknisi), dengan RLS.

Revision ID: 0001
Revises:
Create Date: 2026-11-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABEL = ("pengguna", "properti", "unit", "sewa", "teknisi")


def aktifkan_rls(*tabel: str) -> None:
    """RLS tanpa policy: Data API Supabase tidak bisa membaca/menulis apa pun.
    Backend tetap bisa karena terhubung sebagai pemilik tabel (plan §7.4)."""
    for t in tabel:
        op.execute(f'ALTER TABLE "{t}" ENABLE ROW LEVEL SECURITY')


def upgrade() -> None:
    op.create_table(
        "pengguna",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nama", sa.String(100), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("no_wa", sa.String(20), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("auth_user_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint("role IN ('penghuni', 'pemilik', 'teknisi')", name="ck_pengguna_role"),
        sa.CheckConstraint("email = lower(email)", name="ck_pengguna_email_lowercase"),
        sa.UniqueConstraint("email", name="uq_pengguna_email"),
        sa.UniqueConstraint("auth_user_id", name="uq_pengguna_auth_user_id"),
    )
    op.create_table(
        "properti",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nama", sa.String(100), nullable=False),
        sa.Column("id_pemilik", sa.Integer(), sa.ForeignKey("pengguna.id"), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
    )
    op.create_table(
        "unit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("id_properti", sa.Integer(), sa.ForeignKey("properti.id"), nullable=False),
        sa.Column("nomor_unit", sa.String(20), nullable=False),
        sa.Column("harga_bulanan", sa.Integer(), nullable=False),
        sa.CheckConstraint("harga_bulanan > 0", name="ck_unit_harga_positif"),
    )
    op.create_table(
        "sewa",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("id_unit", sa.Integer(), sa.ForeignKey("unit.id"), nullable=False),
        sa.Column("id_penghuni", sa.Integer(), sa.ForeignKey("pengguna.id"), nullable=False),
        sa.Column("tanggal_mulai", sa.Date(), nullable=False),
        sa.Column("tanggal_selesai", sa.Date(), nullable=False),
        sa.CheckConstraint("tanggal_mulai <= tanggal_selesai", name="ck_sewa_periode"),
    )
    op.create_index("ix_sewa_id_unit", "sewa", ["id_unit"])
    op.create_index("ix_sewa_id_penghuni", "sewa", ["id_penghuni"])
    op.create_table(
        "teknisi",
        sa.Column("id_pengguna", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("keahlian", postgresql.JSONB(), nullable=False),
        sa.Column("terverifikasi", sa.Boolean(), nullable=False),
        sa.Column("no_sertifikat", sa.String(30), nullable=True),
        sa.Column("tersedia", sa.Boolean(), nullable=False),
        sa.Column("rating", sa.Float(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
    )
    aktifkan_rls(*TABEL, "alembic_version")


def downgrade() -> None:
    for t in reversed(TABEL):
        op.drop_table(t)
