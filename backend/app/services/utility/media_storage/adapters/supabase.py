"""Adapter Supabase Storage (bucket private) lewat REST API, memakai secret key milik backend.

Browser tidak pernah memegang kunci: URL yang dikirim ke frontend adalah signed URL yang berlaku sementara
(SIGNED_URL_DETIK), dibuat ulang saat data dibaca (plan §7.5).
"""

import time

import httpx

from app.core.config import get_settings
from app.core.errors import ServiceError

# path -> (signed url, kedaluwarsa). Dipakai ulang selama masih berlaku lebih dari 5 menit.
_cache: dict[str, tuple[str, float]] = {}


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    key = get_settings().supabase_secret_key.get_secret_value()
    h = {"apikey": key}
    if not key.startswith("sb_"):  # kunci legacy (JWT service_role) juga dikirim sebagai Bearer
        h["Authorization"] = f"Bearer {key}"
    return h | (extra or {})


def _base() -> tuple[str, str]:
    s = get_settings()
    if not s.supabase_url or not s.supabase_secret_key.get_secret_value():
        raise ServiceError(503, "STORAGE_BELUM_DIATUR", "Penyimpanan file belum dikonfigurasi di server.")
    return f"{s.supabase_url.rstrip('/')}/storage/v1", s.supabase_storage_bucket


def unggah(path: str, isi: bytes, mime: str) -> None:
    base, bucket = _base()
    try:
        res = httpx.post(
            f"{base}/object/{bucket}/{path}", content=isi, headers=_headers({"Content-Type": mime}), timeout=30
        )
    except httpx.HTTPError:
        raise ServiceError(503, "STORAGE_GAGAL", "Gagal menyimpan file. Coba lagi.") from None
    if res.status_code >= 300:
        raise ServiceError(503, "STORAGE_GAGAL", "Gagal menyimpan file. Coba lagi.")


def url(path: str) -> str:
    sekarang = time.time()
    simpanan = _cache.get(path)
    if simpanan and simpanan[1] - sekarang > 300:
        return simpanan[0]
    base, bucket = _base()
    detik = get_settings().signed_url_detik
    try:
        res = httpx.post(
            f"{base}/object/sign/{bucket}/{path}", json={"expiresIn": detik}, headers=_headers(), timeout=15
        )
        if res.status_code >= 300:
            return ""
        signed = f"{base}{res.json()['signedURL']}"
    except (httpx.HTTPError, KeyError, ValueError):
        return ""  # file tetap tercatat; frontend menampilkan placeholder bila URL kosong
    _cache[path] = (signed, sekarang + detik)
    return signed
