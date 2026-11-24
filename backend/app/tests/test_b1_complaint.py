"""B1: Complaint Handling + estimasi otomatis (skenario demo 1-4 dari plan §11)."""

from .conftest import login

API = "/api/v1"
PNG = ("ac.png", b"\x89PNG" + b"0" * 2048, "image/png")


def ajukan(client, id_pengguna, deskripsi, files=None):
    data = {"deskripsi": deskripsi}
    multipart = [("lampiran", f) for f in (files or [])]
    return client.post(f"{API}/hmr/keluhan", data=data, files=multipart or None, headers=login(client, id_pengguna))


def test_skenario1_diterima_diklasifikasi_dan_estimasi_otomatis(client):
    res = ajukan(client, 1, "AC kamar tidak dingin dan menetes air", [PNG])
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["hasil"] == "diterima"
    t = body["tiket"]
    assert t["kode"] == "TKT-0058" and t["status"] == "diklasifikasi"
    assert (t["kategori"], t["urgensi"]) == ("AC", "sedang")
    assert t["created_at"].endswith("Z")
    lamp = t["keluhan"]["lampiran"]
    assert len(lamp) == 1 and lamp[0]["url"].startswith("http://localhost:8000/media-files/")
    assert client.get(lamp[0]["url"].removeprefix("http://localhost:8000")).status_code == 200

    layanan = [(s["layer"], s["service"]) for s in body["trace"]]
    assert ("Utility", "AI Classification") in layanan
    assert ("Micro", "Technician Matching") in layanan and ("Micro", "Cost Estimation") in layanan

    pemilik = login(client, 4)
    est = client.get(f"{API}/hmr/tiket/{t['id']}/estimasi", headers=pemilik).json()
    assert est["status"] == "menunggu" and est["teknisi"]["nama"] == "Mas Bayu"
    outbox = [n["jenis"] for n in client.get(f"{API}/notifikasi", headers=pemilik).json() if n["kode_tiket"] == "TKT-0058"]
    assert outbox == ["tiket_dibuat", "diklasifikasi", "estimasi"]


def test_skenario2_sewa_berakhir_ditolak_tanpa_tiket(client):
    res = ajukan(client, 2, "Lampu kamar mati total sejak kemarin")
    assert res.status_code == 200
    body = res.json()
    assert body["hasil"] == "ditolak" and body["tiket"] is None
    assert body["alasan"].startswith("Sewa Kos Melati · A-102 berakhir ")
    assert len(client.get(f"{API}/tiket", headers=login(client, 2)).json()) == 0


def test_skenario3_pemilik_membatalkan_tiket(client):
    pemilik = login(client, 4)
    res = client.post(f"{API}/hmr/tiket/57/status", json={"status": "dibatalkan"}, headers=pemilik)
    assert res.status_code == 200 and res.json()["status"] == "dibatalkan"
    assert client.get(f"{API}/hmr/tiket/57/estimasi", headers=pemilik).json()["status"] == "ditolak"
    isi = [n["isi"] for n in client.get(f"{API}/notifikasi", headers=pemilik).json()]
    assert "Tiket B-201 dibatalkan." in isi
    ulang = client.post(f"{API}/hmr/tiket/57/status", json={"status": "dibatalkan"}, headers=pemilik)
    assert ulang.status_code == 409 and ulang.json()["error"]["kode"] == "TRANSISI_TIDAK_VALID"


def test_skenario4_ai_gagal_lalu_klasifikasi_ulang(client):
    res = ajukan(client, 1, "Keran wastafel bocor terus #gagal-ai")
    assert res.status_code == 201
    body = res.json()
    assert body["warning"] and body["tiket"]["status"] == "dibuat" and body["tiket"]["kategori"] is None
    pemilik = login(client, 4)
    t = client.post(f"{API}/hmr/tiket/{body['tiket']['id']}/klasifikasi-ulang", headers=pemilik).json()
    assert t["status"] == "diklasifikasi" and t["kategori"] == "air"
    assert client.get(f"{API}/hmr/tiket/{t['id']}/estimasi", headers=pemilik).json()["status"] == "menunggu"


def test_otorisasi_data_tiket(client):
    fredo = client.get(f"{API}/tiket", headers=login(client, 3)).json()
    assert {t["kode"] for t in fredo} == {"TKT-0049", "TKT-0051", "TKT-0057"}
    assert len(client.get(f"{API}/tiket", headers=login(client, 4)).json()) == 7
    assert client.get(f"{API}/tiket/57", headers=login(client, 1)).status_code == 404
    assert client.post(f"{API}/hmr/keluhan", data={"deskripsi": "x" * 20}, headers=login(client, 4)).status_code == 403


def test_validasi_lampiran(client):
    pdf = ("a.pdf", b"%PDF", "application/pdf")
    res = ajukan(client, 1, "Lampu kamar mati total sejak kemarin", [pdf])
    assert res.status_code == 422 and res.json()["error"]["kode"] == "TIPE_FILE_DITOLAK"
    res = ajukan(client, 1, "pendek")
    assert res.status_code == 422 and res.json()["error"]["kode"] == "DESKRIPSI_TIDAK_VALID"


def test_work_order_seed(client):
    pemilik = login(client, 4)
    wos = client.get(f"{API}/work-order", headers=pemilik).json()
    assert [w["kode"] for w in wos] == ["WO-0012", "WO-0011", "WO-0010", "WO-0009"]
    wo = client.get(f"{API}/work-order", params={"id_tiket": 51}, headers=pemilik).json()[0]
    assert wo["status"] == "dikerjakan" and [l["aktivitas"] for l in wo["log"]] == ["dibuat", "jadwal", "tiba", "mulai"]
    teknisi = client.get(f"{API}/work-order", headers=login(client, 8)).json()
    assert {w["kode"] for w in teknisi} == {"WO-0011", "WO-0012"}


def test_utility_endpoint_agnostic(client):
    h = login(client, 1)
    k = client.post(f"{API}/klasifikasi", json={"teks": "Stop kontak memercikkan api"}, headers=h).json()
    assert (k["kategori"], k["urgensi"]) == ("listrik", "tinggi")
    m = client.post(f"{API}/media", files={"file": PNG}, headers=h)
    assert m.status_code == 201 and m.json()["mime"] == "image/png"
