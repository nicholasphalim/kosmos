"""Complaint Handling (plan §3, skenario demo 1-4): HMR, Complaint Ticket, Media Storage, AI, Notification."""

import pytest

from app.core.config import get_settings
from app.tests.conftest import login_demo

V = "/api/v1"
FOTO = ("ac.jpg", b"\xff\xd8" + b"x" * 2048, "image/jpeg")


@pytest.fixture(autouse=True)
def upload_sementara(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "upload_dir", tmp_path)


def _ajukan(api, id_penghuni: int, deskripsi: str, files=None):
    return api.post(
        f"{V}/hmr/keluhan",
        headers=login_demo(api, id_penghuni),
        data={"deskripsi": deskripsi},
        files=[("lampiran", f) for f in (files or [])],
    )


def test_skenario_1_keluhan_diterima_dan_diklasifikasi(api, tmp_path):
    res = _ajukan(api, 1, "AC kamar tidak dingin dan menetes air", [FOTO])
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["hasil"] == "diterima" and body["warning"] is None
    tiket = body["tiket"]
    assert (tiket["status"], tiket["kategori"], tiket["urgensi"]) == ("diklasifikasi", "AC", "sedang")
    assert tiket["kode"] == "TKT-0058"
    assert [r["ke"] for r in tiket["riwayat"]] == ["dibuat", "diklasifikasi"]
    lampiran = body["keluhan"]["lampiran"]
    assert len(lampiran) == 1 and lampiran[0]["url"].startswith("http://localhost:8000/media-files/keluhan/")
    assert len(list(tmp_path.rglob("*.jpg"))) == 1
    layanan = [s["service"] for s in body["trace"]]
    assert layanan[:4] == ["Handle Maintenance Request", "Tenant and Lease", "Tenant and Lease", "Media Storage"]
    assert "AI Classification" in layanan

    pesan_dea = [n["isi"] for n in api.get(f"{V}/notifikasi", headers=login_demo(api, 1)).json()]
    assert any("Laporanmu diterima" in p for p in pesan_dea)
    assert any("dikategorikan AC, prioritas sedang" in p for p in pesan_dea)
    pesan_pemilik = [
        n for n in api.get(f"{V}/notifikasi", headers=login_demo(api, 4)).json() if n["kode_tiket"] == "TKT-0058"
    ]
    assert len(pesan_pemilik) == 2


def test_skenario_2_sewa_berakhir_ditolak(api):
    res = _ajukan(api, 2, "Lampu kamar mati sejak kemarin malam")
    assert res.status_code == 200
    body = res.json()
    assert body["hasil"] == "ditolak" and body["tiket"] is None
    assert body["keluhan"]["status"] == "ditolak" and "berakhir" in body["alasan"]
    assert api.get(f"{V}/tiket", headers=login_demo(api, 2)).json() == []


def test_validasi_keluhan(api):
    assert _ajukan(api, 1, "pendek").json()["error"]["kode"] == "DESKRIPSI_TIDAK_VALID"
    assert _ajukan(api, 1, "1234567890 !!!").json()["error"]["kode"] == "DESKRIPSI_TIDAK_VALID"
    assert _ajukan(api, 1, "AC kamar tidak dingin", [FOTO] * 6).json()["error"]["kode"] == "LAMPIRAN_TERLALU_BANYAK"
    pdf = ("x.pdf", b"%PDF", "application/pdf")
    assert _ajukan(api, 1, "AC kamar tidak dingin", [pdf]).json()["error"]["kode"] == "TIPE_FILE_DITOLAK"
    # SVG bisa berisi script, dan tipe image/* sembarang bisa disimpan dengan ekstensi .html.
    svg = ("x.svg", b"<svg onload=alert(1)>" * 100, "image/svg+xml")
    html = ("x.html", b"<script>alert(1)</script>" * 100, "image/x-palsu")
    for f in (svg, html):
        assert _ajukan(api, 1, "AC kamar tidak dingin", [f]).json()["error"]["kode"] == "TIPE_FILE_DITOLAK"


def test_hanya_penghuni_yang_bisa_melapor(api):
    assert _ajukan(api, 4, "AC kamar tidak dingin dan menetes air").status_code == 403


def test_skenario_4_ai_gagal_lalu_klasifikasi_ulang(api):
    res = _ajukan(api, 1, "Lampu kamar korslet dan berasap #gagal-ai")
    assert res.status_code == 201
    body = res.json()
    assert body["warning"] and body["tiket"]["status"] == "dibuat" and body["tiket"]["kategori"] is None
    id_tiket = body["tiket"]["id"]

    pemilik = login_demo(api, 4)
    res = api.post(f"{V}/hmr/tiket/{id_tiket}/klasifikasi-ulang", headers=pemilik)
    assert res.status_code == 200, res.text
    assert (res.json()["status"], res.json()["kategori"], res.json()["urgensi"]) == (
        "diklasifikasi",
        "listrik",
        "tinggi",
    )
    assert api.post(f"{V}/hmr/tiket/{id_tiket}/klasifikasi-ulang", headers=pemilik).status_code == 409


def test_skenario_3_pemilik_membatalkan_tiket(api):
    pemilik = login_demo(api, 4)
    res = api.post(f"{V}/hmr/tiket/57/status", headers=pemilik, json={"status": "dibatalkan", "catatan": "Sudah dicek"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "dibatalkan"
    assert res.json()["riwayat"][-1] == {**res.json()["riwayat"][-1], "ke": "dibatalkan", "catatan": "Sudah dicek"}
    fredo = [n["isi"] for n in api.get(f"{V}/notifikasi", headers=login_demo(api, 3)).json()]
    assert any("dibatalkan oleh pemilik. Catatan: Sudah dicek" in p for p in fredo)
    again = api.post(f"{V}/hmr/tiket/57/status", headers=pemilik, json={"status": "dibatalkan"})
    assert again.status_code == 409 and again.json()["error"]["kode"] == "TRANSISI_TIDAK_VALID"


def test_tangani_sendiri_lalu_buka_ulang(api):
    pemilik = login_demo(api, 4)
    res = api.post(
        f"{V}/hmr/tiket/54/status", headers=pemilik, json={"status": "selesai", "catatan": "Engsel sudah saya ganti"}
    )
    assert res.status_code == 200, res.text
    assert (res.json()["penanganan"], res.json()["catatan_penanganan"]) == ("sendiri", "Engsel sudah saya ganti")

    nicholas = login_demo(api, 6)
    detail = api.get(f"{V}/tiket/54", headers=nicholas).json()
    assert detail["bisa_dibuka_ulang"] is True
    assert api.post(f"{V}/hmr/tiket/54/buka-ulang", headers=nicholas, json={"alasan": "ok"}).status_code == 422
    res = api.post(f"{V}/hmr/tiket/54/buka-ulang", headers=nicholas, json={"alasan": "Pintunya miring lagi"})
    assert res.status_code == 200, res.text
    assert (res.json()["status"], res.json()["penanganan"]) == ("diklasifikasi", None)


def test_aturan_tutup_dan_buka_ulang(api):
    pemilik = login_demo(api, 4)
    # Tiket "dibuat" belum diklasifikasi: tidak bisa ditutup tanpa teknisi.
    res = api.post(f"{V}/hmr/tiket/56/status", headers=pemilik, json={"status": "selesai"})
    assert res.status_code == 409 and res.json()["error"]["kode"] == "TIDAK_BISA_DITUTUP"
    # Tiket selesai lewat teknisi tidak bisa dibuka ulang.
    res = api.post(f"{V}/hmr/tiket/48/buka-ulang", headers=login_demo(api, 1), json={"alasan": "AC panas lagi"})
    assert res.status_code == 409 and res.json()["error"]["kode"] == "TIDAK_BISA_DIBUKA_ULANG"
    # Penghuni tidak boleh mengubah status, pemilik tidak boleh membuka ulang.
    assert (
        api.post(f"{V}/hmr/tiket/57/status", headers=login_demo(api, 3), json={"status": "dibatalkan"}).status_code
        == 403
    )
    assert api.post(f"{V}/hmr/tiket/54/buka-ulang", headers=pemilik, json={"alasan": "coba coba"}).status_code == 403


def test_otorisasi_daftar_dan_detail_tiket(api):
    assert {t["id"] for t in api.get(f"{V}/tiket", headers=login_demo(api, 1)).json()} == {48, 52}
    assert len(api.get(f"{V}/tiket", headers=login_demo(api, 4)).json()) == 8
    # Teknisi hanya melihat tiket yang work order-nya ditugaskan kepadanya (Pak Slamet: WO-0011, WO-0012).
    assert {t["id"] for t in api.get(f"{V}/tiket", headers=login_demo(api, 8)).json()} == {51, 52}
    assert api.get(f"{V}/tiket/57", headers=login_demo(api, 8)).status_code == 404
    assert api.get(f"{V}/tiket/57", headers=login_demo(api, 1)).status_code == 404  # tiket Fredo
    assert api.get(f"{V}/keluhan/101", headers=login_demo(api, 1)).status_code == 404
    assert api.get(f"{V}/keluhan/101", headers=login_demo(api, 3)).json()["kode"] == "KLH-0101"


def test_detail_tiket_seed(api):
    t = api.get(f"{V}/tiket/48", headers=login_demo(api, 4)).json()
    assert [r["ke"] for r in t["riwayat"]] == ["dibuat", "diklasifikasi", "diproses", "selesai"]
    assert t["penanganan"] == "teknisi" and t["bisa_dibuka_ulang"] is False


def test_utility_klasifikasi_dan_media(api):
    h = login_demo(api, 1)
    res = api.post(f"{V}/klasifikasi", headers=h, json={"teks": "Pipa wastafel bocor dan menetes"})
    assert (res.json()["kategori"], res.json()["urgensi"]) == ("air", "sedang")
    res = api.post(f"{V}/media", headers=h, files={"file": FOTO})
    assert res.status_code == 201 and res.json()["mime"] == "image/jpeg"
