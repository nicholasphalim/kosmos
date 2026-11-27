"""Repair Verification (plan §11b, skenario demo 5, 5b, 5c, 6, 8, 8b): HMR, CSM, Work Order, Invoice, Micro."""

import pytest

from app.core.config import get_settings
from app.services.micro.commission_calculation import hitung_komisi
from app.services.micro.cost_estimation import biaya_kunjungan, estimasi_biaya
from app.services.micro.evidence_verification import Foto, verifikasi_bukti
from app.services.micro.technician_matching import CalonTeknisi, match_teknisi
from app.tests.conftest import login_demo

V = "/api/v1"
DEA, FREDO, DERREN, SLAMET = 1, 3, 4, 8


@pytest.fixture(autouse=True)
def upload_sementara(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "upload_dir", tmp_path)


def _png(nama: str, isi: int) -> tuple[str, bytes, str]:
    return (nama, bytes([isi]) * 4096, "image/png")


def _sampai_dikerjakan(api, id_tiket: int = 57) -> int:
    """Pemilik panggil teknisi + setujui, penghuni pilih jadwal, teknisi tiba. Mengembalikan id work order."""
    pemilik = login_demo(api, DERREN)
    est = api.post(f"{V}/hmr/tiket/{id_tiket}/estimasi", headers=pemilik)
    assert est.status_code == 201, est.text
    res = api.post(
        f"{V}/hmr/estimasi/{est.json()['estimasi']['id']}/persetujuan", headers=pemilik, json={"disetujui": True}
    )
    assert res.status_code == 200, res.text
    wo = res.json()["work_order"]
    res = api.post(
        f"{V}/hmr/work-order/{wo['id']}/jadwal", headers=login_demo(api, FREDO), json={"jadwal": wo["slot_jadwal"][0]}
    )
    assert res.status_code == 200, res.text
    res = api.post(f"{V}/csm/work-order/{wo['id']}/log", headers=login_demo(api, SLAMET), json={"aktivitas": "tiba"})
    assert res.status_code == 200, res.text
    return wo["id"]


def test_skenario_5_panggil_teknisi_sampai_invoice_terbit(api):
    pemilik = login_demo(api, DERREN)
    res = api.post(f"{V}/hmr/tiket/57/estimasi", headers=pemilik)
    assert res.status_code == 201, res.text
    est = res.json()["estimasi"]
    assert est["teknisi"]["nama"] == "Pak Slamet" and est["status"] == "menunggu"
    alasan = {k["teknisi"]["nama"]: k["alasan"] for k in est["kandidat"] if not k["lolos"]}
    assert alasan["Mas Andi"] == "Belum terverifikasi" and alasan["Pak Joko"] == "Sedang tidak tersedia"
    assert "Penanganan prioritas (< 4 jam)" in [r["label"] for r in est["rincian"]]
    assert [s["layer"] for s in res.json()["trace"]].count("Micro") == 2
    assert api.get(f"{V}/hmr/tiket/57/estimasi", headers=pemilik).json()["id"] == est["id"]

    res = api.post(f"{V}/hmr/estimasi/{est['id']}/persetujuan", headers=pemilik, json={"disetujui": True})
    assert res.status_code == 200, res.text
    body = res.json()
    wo = body["work_order"]
    assert body["tiket"]["status"] == "diproses" and wo["status"] == "menunggu_jadwal" and len(wo["slot_jadwal"]) == 3
    assert wo["kode"] == "WO-0014" and wo["biaya_final"] == est["total"]

    fredo, slamet = login_demo(api, FREDO), login_demo(api, SLAMET)
    assert (
        api.post(
            f"{V}/hmr/work-order/{wo['id']}/jadwal", headers=fredo, json={"jadwal": "2020-01-01T00:00:00Z"}
        ).status_code
        == 422
    )
    res = api.post(f"{V}/hmr/work-order/{wo['id']}/jadwal", headers=fredo, json={"jadwal": wo["slot_jadwal"][1]})
    assert res.status_code == 200 and res.json()["status"] == "dijadwalkan", res.text

    assert (
        api.post(f"{V}/csm/work-order/{wo['id']}/log", headers=slamet, json={"aktivitas": "mulai"}).status_code == 409
    )
    for aktivitas in ("tiba", "mulai"):
        res = api.post(f"{V}/csm/work-order/{wo['id']}/log", headers=slamet, json={"aktivitas": aktivitas})
        assert res.status_code == 200, res.text
    assert res.json()["status"] == "dikerjakan"
    # Teknisi melihat tiket yang ditugaskan kepadanya.
    assert api.get(f"{V}/tiket/57", headers=slamet).status_code == 200

    res = api.post(
        f"{V}/csm/work-order/{wo['id']}/bukti",
        headers=slamet,
        files={"sebelum": _png("sebelum.png", 1), "sesudah": _png("sesudah.png", 2)},
    )
    assert res.status_code == 200, res.text
    assert res.json()["verifikasi"]["valid"] and res.json()["work_order"]["status"] == "menunggu_konfirmasi"
    assert res.json()["work_order"]["bukti_sesudah"]["url"].startswith("http://localhost:8000/media-files/bukti/")

    res = api.post(f"{V}/csm/work-order/{wo['id']}/konfirmasi", headers=fredo, json={"selesai": True})
    assert res.status_code == 200 and res.json()["work_order"]["status"] == "menunggu_pemilik"
    assert res.json()["invoice"] is None

    res = api.post(f"{V}/csm/work-order/{wo['id']}/terima", headers=pemilik, json={"diterima": True})
    assert res.status_code == 200, res.text
    body = res.json()
    inv = body["invoice"]
    assert body["tiket"]["status"] == "selesai" and body["tiket"]["penanganan"] == "teknisi"
    assert inv["kode"] == "INV-0005" and inv["jenis"] == "perbaikan" and inv["total"] == est["total"]
    assert inv["komisi"] == hitung_komisi(est["total"])[1] and inv["pemilik"]["nama"] == "Pak Derren"
    assert body["work_order"]["id_invoice"] == inv["id"]

    # Invoice hanya untuk pemilik; penghuni dan teknisi tidak melihatnya.
    assert api.get(f"{V}/invoice/{inv['id']}", headers=pemilik).status_code == 200
    assert api.get(f"{V}/invoice/{inv['id']}", headers=fredo).status_code == 404
    assert api.get(f"{V}/invoice", headers=slamet).json() == []
    pesan_slamet = [n["isi"] for n in api.get(f"{V}/notifikasi", headers=slamet).json()]
    assert any("Pekerjaan baru WO-0014" in p for p in pesan_slamet)
    assert any("diterima pemilik. Terima kasih!" in p for p in pesan_slamet)


def test_skenario_5b_tangani_sendiri_tanpa_tagihan(api):
    pemilik = login_demo(api, DERREN)
    api.post(f"{V}/hmr/tiket/54/estimasi", headers=pemilik)
    res = api.post(
        f"{V}/hmr/tiket/54/status", headers=pemilik, json={"status": "selesai", "catatan": "Engsel saya ganti"}
    )
    assert res.status_code == 200 and res.json()["penanganan"] == "sendiri"
    assert api.get(f"{V}/hmr/tiket/54/estimasi", headers=pemilik).json()["status"] == "ditolak"
    assert api.get(f"{V}/work-order", headers=pemilik, params={"id_tiket": 54}).json() == []
    assert len(api.get(f"{V}/invoice", headers=pemilik).json()) == 4


def test_skenario_5c_estimasi_ditolak_teknisi_lain(api):
    pemilik = login_demo(api, DERREN)
    est = api.post(f"{V}/hmr/tiket/57/estimasi", headers=pemilik).json()["estimasi"]
    res = api.post(f"{V}/hmr/estimasi/{est['id']}/persetujuan", headers=pemilik, json={"disetujui": False})
    assert res.status_code == 200 and res.json()["work_order"] is None
    assert res.json()["tiket"]["status"] == "diklasifikasi"
    again = api.post(f"{V}/hmr/estimasi/{est['id']}/persetujuan", headers=pemilik, json={"disetujui": True})
    assert again.json()["error"]["kode"] == "SUDAH_DIPUTUSKAN"

    # Pak Slamet dikecualikan; teknisi listrik lain belum terverifikasi atau tidak tersedia.
    res = api.post(f"{V}/hmr/tiket/57/estimasi", headers=pemilik)
    assert res.status_code == 422 and res.json()["error"]["kode"] == "TEKNISI_TIDAK_ADA"
    assert "Tidak ada teknisi lain" in res.json()["error"]["pesan"]


def test_skenario_6_bukti_foto_sama_ditolak(api):
    slamet = login_demo(api, SLAMET)
    foto = _png("sama.png", 7)
    res = api.post(f"{V}/csm/work-order/12/bukti", headers=slamet, files={"sebelum": foto, "sesudah": foto})
    assert res.status_code == 200, res.text
    body = res.json()
    assert not body["verifikasi"]["valid"] and body["work_order"]["status"] == "dikerjakan"
    gagal = [p["label"] for p in body["verifikasi"]["pemeriksaan"] if not p["ok"]]
    assert gagal == ["Bukan foto yang sama"]
    assert body["work_order"]["log"][-1]["aktivitas"] == "bukti_ditolak"


def test_skenario_8_biaya_tambahan_sebelum_terima(api):
    slamet, pemilik = login_demo(api, SLAMET), login_demo(api, DERREN)
    url = f"{V}/csm/work-order/12/biaya-tambahan"
    assert (
        api.post(url, headers=slamet, json={"alasan": "x", "jumlah": 40000}).json()["error"]["kode"]
        == "ALASAN_TIDAK_VALID"
    )
    res = api.post(url, headers=slamet, json={"alasan": "Fitting lampu ikut meleleh", "jumlah": 40000})
    assert res.status_code == 201, res.text
    id_tambahan = res.json()["biaya_tambahan"][0]["id"]
    assert api.post(url, headers=slamet, json={"alasan": "Kabel tambahan", "jumlah": 5000}).status_code == 409

    api.post(
        f"{V}/csm/work-order/12/bukti",
        headers=slamet,
        files={"sebelum": _png("a.png", 1), "sesudah": _png("b.png", 2)},
    )
    terima = api.post(f"{V}/csm/work-order/12/terima", headers=pemilik, json={"diterima": True})
    assert terima.json()["error"]["kode"] == "TAMBAHAN_MENUNGGU"

    biaya_awal = api.get(f"{V}/work-order/12", headers=pemilik).json()["biaya_final"]
    res = api.post(
        f"{V}/hmr/work-order/12/biaya-tambahan/{id_tambahan}/persetujuan", headers=pemilik, json={"disetujui": True}
    )
    assert res.status_code == 200 and res.json()["biaya_final"] == biaya_awal + 40000

    # Penghuni belum merespons: pemilik boleh menerima langsung dari menunggu_konfirmasi.
    res = api.post(f"{V}/csm/work-order/12/terima", headers=pemilik, json={"diterima": True})
    assert res.status_code == 200, res.text
    inv = res.json()["invoice"]
    assert inv["biaya"] == biaya_awal + 40000
    assert inv["rincian"][-1] == {"label": "Tambahan: Fitting lampu ikut meleleh", "jumlah": 40000}


def test_skenario_8b_batal_setelah_teknisi_tiba_biaya_kunjungan(api):
    pemilik = login_demo(api, DERREN)
    res = api.post(f"{V}/hmr/tiket/51/status", headers=pemilik, json={"status": "dibatalkan"})
    assert res.status_code == 200, res.text
    wo = api.get(f"{V}/work-order/12", headers=pemilik).json()
    assert wo["status"] == "dibatalkan" and wo["id_invoice"] is not None
    inv = api.get(f"{V}/invoice/{wo['id_invoice']}", headers=pemilik).json()
    assert inv["jenis"] == "kunjungan" and inv["rincian"][0]["label"] == "Biaya pengecekan (perbaikan dibatalkan)"
    assert inv["total"] == 50_000 + inv["rincian"][1]["jumlah"]


def test_batal_sebelum_teknisi_tiba_tanpa_tagihan(api):
    pemilik = login_demo(api, DERREN)
    est = api.post(f"{V}/hmr/tiket/57/estimasi", headers=pemilik).json()["estimasi"]
    wo = api.post(f"{V}/hmr/estimasi/{est['id']}/persetujuan", headers=pemilik, json={"disetujui": True}).json()
    api.post(f"{V}/hmr/tiket/57/status", headers=pemilik, json={"status": "dibatalkan"})
    detail = api.get(f"{V}/work-order/{wo['work_order']['id']}", headers=pemilik).json()
    assert detail["status"] == "dibatalkan" and detail["id_invoice"] is None


def test_penghuni_belum_beres_dan_perbaikan_ulang(api):
    id_wo = _sampai_dikerjakan(api)
    slamet, fredo, pemilik = login_demo(api, SLAMET), login_demo(api, FREDO), login_demo(api, DERREN)
    bukti = {"sebelum": _png("a.png", 1), "sesudah": _png("b.png", 2)}
    api.post(f"{V}/csm/work-order/{id_wo}/bukti", headers=slamet, files=bukti)
    res = api.post(
        f"{V}/csm/work-order/{id_wo}/konfirmasi", headers=fredo, json={"selesai": False, "catatan": "Masih bau"}
    )
    assert res.json()["work_order"]["status"] == "dikerjakan"

    api.post(f"{V}/csm/work-order/{id_wo}/bukti", headers=slamet, files=bukti)
    api.post(f"{V}/csm/work-order/{id_wo}/konfirmasi", headers=fredo, json={"selesai": True})
    res = api.post(
        f"{V}/csm/work-order/{id_wo}/terima", headers=pemilik, json={"diterima": False, "catatan": "Rapikan"}
    )
    assert res.json()["work_order"]["status"] == "dikerjakan" and res.json()["invoice"] is None
    log = [lg["aktivitas"] for lg in res.json()["work_order"]["log"]]
    assert log[-3:] == ["bukti_valid", "dikonfirmasi_penghuni", "perbaikan_ulang"]


def test_otorisasi_work_order(api):
    # Teknisi lain dan penghuni lain tidak melihat WO-0012 (Pak Slamet, Fredo).
    assert api.get(f"{V}/work-order/12", headers=login_demo(api, 9)).status_code == 404
    assert api.get(f"{V}/work-order/12", headers=login_demo(api, DEA)).status_code == 404
    assert [w["kode"] for w in api.get(f"{V}/work-order", headers=login_demo(api, SLAMET)).json()] == [
        "WO-0012",
        "WO-0011",
    ]
    assert (
        api.post(f"{V}/csm/work-order/12/log", headers=login_demo(api, DERREN), json={"aktivitas": "tiba"}).status_code
        == 403
    )
    assert api.post(f"{V}/hmr/tiket/57/estimasi", headers=login_demo(api, FREDO)).status_code == 403
    assert (
        api.post(f"{V}/hmr/tiket/56/estimasi", headers=login_demo(api, DERREN)).json()["error"]["kode"]
        == "TIKET_BELUM_SIAP"
    )


def test_seed_repair_verification(api):
    pemilik = login_demo(api, DERREN)
    invoice = {i["kode"]: i for i in api.get(f"{V}/invoice", headers=pemilik).json()}
    assert sorted(invoice) == ["INV-0001", "INV-0002", "INV-0003", "INV-0004"]
    assert invoice["INV-0003"]["status"] == "belum_dibayar" and invoice["INV-0003"]["total"] == 165_000
    assert invoice["INV-0001"]["status"] == "lunas"
    wo = api.get(f"{V}/work-order/12", headers=pemilik).json()
    assert (wo["kode_tiket"], wo["status"], wo["teknisi"]["nama"]) == ("TKT-0051", "dikerjakan", "Pak Slamet")
    selesai = api.get(f"{V}/work-order/9", headers=pemilik).json()
    assert selesai["bukti_sebelum"]["url"] == "/bukti/sebelum.svg" and selesai["verifikasi"]["valid"]


# ---------- Micro (tanpa database) ----------


def test_micro_sama_dengan_mock():
    rincian, total = estimasi_biaya("listrik", "rendah", "Lampu depan kamar berkedip", 1.5)
    assert total == 165_000 and rincian[-1] == {"label": "Transport teknisi (1,5 km)", "jumlah": 10_000}
    _, total = estimasi_biaya("AC", "tinggi", "AC tidak dingin", 2.5)
    assert total == 150_000 + 250_000 + 50_000 + 13_000  # bulat(12.5) = 13, bukan pembulatan bankir
    kunjungan, total = biaya_kunjungan(rincian)
    assert total == 60_000 and len(kunjungan) == 2
    assert hitung_komisi(165_000) == (10, 16_500) and hitung_komisi(123_450) == (10, 12_300)

    t = {"id": 1, "nama": "A", "keahlian": ["AC"], "terverifikasi": True, "rating": 5.0, "no_wa": "-"}
    hasil = match_teknisi(
        "AC",
        "sedang",
        [
            CalonTeknisi(teknisi=t | {"id": 2}, tersedia=True, jarak_km=1.0, beban=2),
            CalonTeknisi(teknisi=t, tersedia=True, jarak_km=1.0, beban=0),
        ],
    )
    assert hasil[0]["lolos"] and hasil[0]["skor"] == 0.95 and hasil[1]["alasan"] == "Sedang memegang 2 pekerjaan"

    sama = Foto("x.png", "image/png", 4096)
    assert verifikasi_bukti(sama, sama)["skor"] == 0.75
    assert verifikasi_bukti(None, sama)["valid"] is False
