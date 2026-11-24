"""Fondasi B0: auth demo, Tenant and Lease, format error, reset."""

from datetime import UTC, datetime

from sqlalchemy import select

from app.core.db import SessionLocal
from app.services.entity.complaint_ticket.models import Tiket

from .conftest import login


def test_daftar_akun_demo_sama_dengan_mock(client):
    res = client.get("/api/v1/auth/demo-accounts")
    assert res.status_code == 200
    akun = {a["pengguna"]["nama"]: a for a in res.json()}
    assert list(akun) == ["Dea", "Qiqa", "Fredo", "Pak Derren", "Pak Slamet", "Mas Bayu", "Bang Ucok"]
    assert akun["Dea"]["keterangan"] == "Kos Melati · A-101"
    assert akun["Dea"]["label_sewa"] == "aktif"
    assert akun["Qiqa"]["label_sewa"] == "berakhir"
    assert akun["Pak Derren"]["jumlah_properti"] == 2
    assert akun["Bang Ucok"]["keterangan"] == "Teknisi air, lainnya · terverifikasi"


def test_login_dan_profil_penghuni(client):
    res = client.get("/api/v1/penghuni/me", headers=login(client, 1))
    assert res.status_code == 200
    body = res.json()
    assert body["unit"] == {"id": 7, "nomor_unit": "A-101", "nama_properti": "Kos Melati"}
    assert body["sewa"]["status_sewa"] == "aktif"


def test_status_sewa_berakhir(client):
    res = client.get("/api/v1/unit/8/sewa", headers=login(client, 2))
    assert res.json()["status_sewa"] == "tidak_aktif"


def test_tanpa_token_401_format_seragam(client):
    res = client.get("/api/v1/penghuni/me")
    assert res.status_code == 401
    assert res.json() == {"error": {"kode": "TIDAK_TERAUTENTIKASI", "pesan": "Silakan masuk terlebih dahulu."}}


def test_role_salah_403(client):
    res = client.get("/api/v1/penghuni/me", headers=login(client, 4))
    assert res.status_code == 403
    assert res.json()["error"]["kode"] == "AKSES_DITOLAK"


def test_akun_tidak_ada_404(client):
    res = client.post("/api/v1/auth/demo-login", json={"id_pengguna": 999})
    assert res.status_code == 404
    assert res.json()["error"]["kode"] == "PENGGUNA_TIDAK_ADA"


def test_validasi_422_format_seragam(client):
    res = client.post("/api/v1/auth/demo-login", json={})
    assert res.status_code == 422
    assert res.json()["error"]["kode"] == "VALIDASI_GAGAL"


def test_waktu_disimpan_utc_dan_dibaca_aware(client):
    with SessionLocal() as db:
        t = db.scalars(select(Tiket).where(Tiket.id == 57)).one()
        assert t.created_at.tzinfo is UTC
        assert t.created_at < datetime.now(UTC)


def test_reset_mengembalikan_data(client):
    with SessionLocal() as db:
        db.get(Tiket, 57).status = "dibatalkan"
        db.commit()
    assert client.post("/api/v1/dev/reset").json() == {"ok": True}
    with SessionLocal() as db:
        assert db.get(Tiket, 57).status == "diklasifikasi"
