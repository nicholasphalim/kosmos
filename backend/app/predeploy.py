"""Dijalankan Railway sebelum setiap deploy: terapkan migrasi lalu isi data demo bila database kosong.

Jalankan manual: `uv run python -m app.predeploy`.
"""

from alembic import command
from alembic.config import Config

from app.core.config import BACKEND_DIR
from app.core.db import get_db
from app.seed import seed_jika_kosong


def main() -> None:
    command.upgrade(Config(str(BACKEND_DIR / "alembic.ini")), "head")
    sesi = next(get_db())
    try:
        print("Data demo diisi." if seed_jika_kosong(sesi) else "Database sudah berisi data, seed dilewati.")
    finally:
        sesi.close()


if __name__ == "__main__":
    main()
