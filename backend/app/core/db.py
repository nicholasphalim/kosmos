"""Koneksi database, Base model, dan tipe kolom bersama.

Default SQLite (satu file). Kode tetap portabel: ganti DATABASE_URL ke Postgres saat deploy.
"""

from collections.abc import Iterator
from datetime import UTC, datetime

from sqlalchemy import DateTime, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings


class UTCDateTime(TypeDecorator[datetime]):
    """Disimpan sebagai UTC tanpa zona, dibaca kembali sebagai datetime UTC (serialisasi berakhiran Z)."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Datetime harus punya zona waktu (pakai app.core.waktu.now_utc).")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        return value.replace(tzinfo=UTC) if value is not None else None


class Base(DeclarativeBase):
    pass


def _buat_engine() -> Engine:
    url = get_settings().database_url
    if url.startswith("sqlite"):
        eng = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(eng, "connect")
        def _pragma(dbapi_conn, _record):  # SQLite tidak menegakkan foreign key tanpa ini.
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return eng
    return create_engine(url, pool_pre_ping=True)


engine = _buat_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Dependency FastAPI: satu session per request. Service yang menulis memanggil commit() sendiri."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def import_semua_model() -> None:
    """Daftarkan semua tabel ke Base.metadata sebelum create_all/drop_all."""
    from app.services.entity.complaint_ticket import models as _ct  # noqa: F401
    from app.services.entity.technician import models as _tk  # noqa: F401
    from app.services.entity.tenant_lease import models as _tl  # noqa: F401


def buat_tabel() -> None:
    import_semua_model()
    Base.metadata.create_all(engine)


def hapus_tabel() -> None:
    import_semua_model()
    Base.metadata.drop_all(engine)
