"""Adapter Supabase Storage tanpa jaringan: request ke REST API Storage diganti tiruan."""

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import get_settings
from app.core.errors import ServiceError
from app.services.utility.media_storage.adapters import supabase


@pytest.fixture(autouse=True)
def atur(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "supabase_url", "https://uji.supabase.co")
    monkeypatch.setattr(s, "supabase_secret_key", SecretStr("sb_secret_uji"))
    monkeypatch.setattr(s, "supabase_storage_bucket", "kosmos-media")
    supabase._cache.clear()


def test_unggah_memakai_secret_key_tanpa_bearer(monkeypatch):
    dikirim = {}

    def post(url, **kw):
        dikirim.update(url=url, headers=kw["headers"])
        return httpx.Response(200, json={"Key": "x"})

    monkeypatch.setattr(httpx, "post", post)
    supabase.unggah("keluhan/2026/11/a.jpg", b"isi", "image/jpeg")
    assert dikirim["url"] == "https://uji.supabase.co/storage/v1/object/kosmos-media/keluhan/2026/11/a.jpg"
    assert dikirim["headers"]["apikey"] == "sb_secret_uji"
    assert "Authorization" not in dikirim["headers"]


def test_unggah_gagal_503(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda url, **kw: httpx.Response(400, json={"error": "x"}))
    with pytest.raises(ServiceError) as e:
        supabase.unggah("a.jpg", b"isi", "image/jpeg")
    assert e.value.status == 503


def test_signed_url_dan_cache(monkeypatch):
    panggilan = []

    def post(url, **kw):
        panggilan.append(url)
        return httpx.Response(200, json={"signedURL": "/object/sign/kosmos-media/a.jpg?token=abc"})

    monkeypatch.setattr(httpx, "post", post)
    url = supabase.url("a.jpg")
    assert url == "https://uji.supabase.co/storage/v1/object/sign/kosmos-media/a.jpg?token=abc"
    assert supabase.url("a.jpg") == url
    assert len(panggilan) == 1  # dipakai ulang dari cache
