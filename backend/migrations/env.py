"""Lingkungan Alembic: URL dari Settings (DATABASE_URL), metadata dari semua model di app.core.models.

Test memakai database lain dengan mengisi config.attributes["url"] sebelum menjalankan upgrade.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.core.config import get_settings
from app.core.db import UTCDateTime
from app.core.models import metadata

config = context.config
if config.config_file_name is not None and not config.attributes.get("tanpa_logging"):
    fileConfig(config.config_file_name)

target_metadata = metadata


def _url() -> str:
    url = config.attributes.get("url") or get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL belum diisi di backend/.env.")
    return url


def render_item(type_, obj, autogen_context):
    """UTCDateTime (TypeDecorator aplikasi) ditulis sebagai sa.DateTime(timezone=True) di file migrasi,
    supaya migrasi tidak bergantung pada kode aplikasi."""
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime(timezone=True)"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=_url(), target_metadata=target_metadata, literal_binds=True, compare_type=True, render_item=render_item
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url())
    with engine.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, compare_type=True, render_item=render_item
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
