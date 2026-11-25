"""Koneksi PostgreSQL (Supabase), Base model, dan session per request."""

from collections.abc import Iterator
from datetime import datetime
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import DateTime, Engine, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings


class UTCDateTime(TypeDecorator[datetime]):
    """Kolom `timestamptz`. Menolak datetime tanpa zona supaya tidak ada waktu lokal yang tersimpan diam-diam."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Datetime harus punya zona waktu (pakai app.core.waktu.now_utc).")
        return value


class Base(DeclarativeBase):
    pass


class DatabaseBelumDiatur(RuntimeError):
    pass


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    if not url:
        raise DatabaseBelumDiatur("DATABASE_URL belum diisi di backend/.env.")
    # pool_pre_ping: koneksi yang diputus pooler Supabase dibuka ulang otomatis.
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5, connect_args={"connect_timeout": 10})


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Dependency FastAPI: satu session per request. Service yang menulis memanggil commit() sendiri."""
    db = _session_factory()()
    try:
        yield db
    finally:
        db.close()


DB = Annotated[Session, Depends(get_db)]
"""Tipe parameter router: `def endpoint(db: DB)`."""


def cek_koneksi() -> None:
    """Melempar exception bila database tidak bisa dihubungi."""
    with get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))
