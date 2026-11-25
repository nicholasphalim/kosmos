"""Skema, keamanan Supabase, seed, dan reset data demo."""

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import func, select, text

from app.core.models import metadata
from app.services.entity.technician.models import Teknisi
from app.services.entity.tenant_lease.models import Pengguna, Sewa


def test_migrasi_sama_dengan_model(db):
    """Model SQLAlchemy dan migrasi Alembic tidak boleh menyimpang (lupa membuat migrasi)."""
    selisih = compare_metadata(MigrationContext.configure(db.connection()), metadata)
    assert not selisih, f"Model berubah tanpa migrasi: {selisih}"


def test_semua_tabel_public_ber_rls(db):
    """Data API Supabase tidak boleh bisa membaca tabel mana pun (plan §7.4)."""
    tanpa_rls = db.scalars(
        text(
            "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity"
        )
    ).all()
    assert not tanpa_rls, f"Tabel tanpa RLS: {tanpa_rls}"


def test_seed_lengkap(seeded):
    assert seeded.scalar(select(func.count()).select_from(Pengguna)) == 12
    assert seeded.scalar(select(func.count()).select_from(Sewa)) == 6
    assert seeded.scalar(select(func.count()).select_from(Teknisi)) == 5
    emails = seeded.scalars(select(Pengguna.email)).all()
    assert all(e.endswith("@kosmos.test") and e == e.lower() for e in emails)


def test_sequence_dimajukan_setelah_seed(seeded):
    baru = Pengguna(nama="Uji", role="penghuni", no_wa="0800-0000-0000", email="uji@kosmos.test")
    seeded.add(baru)
    seeded.flush()
    assert baru.id == 13


def test_reset_mengembalikan_data_demo(api, seeded):
    seeded.add(Pengguna(nama="Sementara", role="penghuni", no_wa="0800-0000-0000", email="x@kosmos.test"))
    seeded.flush()
    res = api.post("/api/v1/dev/reset")
    assert res.status_code == 204
    assert seeded.scalar(select(func.count()).select_from(Pengguna)) == 12
