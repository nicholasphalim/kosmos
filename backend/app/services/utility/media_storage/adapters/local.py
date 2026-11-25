"""Adapter storage lokal: file disimpan di UPLOAD_DIR dan disajikan FastAPI di /media-files.

Dipakai test otomatis (cepat, tanpa internet). Jangan dipakai di Railway: disk-nya terhapus setiap redeploy.
"""

from app.core.config import get_settings


def unggah(path: str, isi: bytes, mime: str) -> None:
    tujuan = get_settings().upload_dir / path
    tujuan.parent.mkdir(parents=True, exist_ok=True)
    tujuan.write_bytes(isi)


def url(path: str) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/media-files/{path}"
