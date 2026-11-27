"""Billing dan Rent Billing (plan §11b #3, #6, #8; skenario demo 7, 9, 10, 11): CSM, Rent Billing, Payment,
Financial Ledger, Rent Invoice, Payment Gateway."""

from app.core.format import label_periode
from app.services.entity.rent_invoice.service import periode_dari
from app.tests.conftest import login_demo

V = "/api/v1"
DEA, FREDO, DERREN, HALIM, PUTRA, SLAMET = 1, 3, 4, 5, 7, 8


def _invoice(api, kode: str) -> dict:
    return next(i for i in api.get(f"{V}/invoice", headers=login_demo(api, DERREN)).json() if i["kode"] == kode)


def _kas(api) -> dict:
    return api.get(f"{V}/laporan-kas", headers=login_demo(api, DERREN)).json()


def _isi_notif(api, id_pengguna: int) -> list[str]:
    return [n["isi"] for n in api.get(f"{V}/notifikasi", headers=login_demo(api, id_pengguna)).json()]


def test_skenario_7_bayar_gagal_lalu_berhasil(api):
    pemilik = login_demo(api, DERREN)
    inv = _invoice(api, "INV-0003")
    assert (inv["status"], inv["total"], inv["komisi"], inv["pembayaran"]) == ("belum_dibayar", 165_000, 16_500, [])
    kas_awal = _kas(api)

    res = api.post(
        f"{V}/csm/invoice/{inv['id']}/bayar", headers=pemilik, json={"metode": "gopay", "simulasi_gagal": True}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["hasil"], body["alasan"]) == ("gagal", "Saldo e-wallet tidak cukup")
    assert body["invoice"]["status"] == "belum_dibayar"
    assert (body["pembayaran"]["status"], body["pembayaran"]["direkonsiliasi"]) == ("gagal", False)
    assert any("Pembayaran INV-0003 gagal: Saldo e-wallet tidak cukup" in p for p in _isi_notif(api, DERREN))
    assert _kas(api)["transaksi"] == kas_awal["transaksi"]

    res = api.post(f"{V}/csm/invoice/{inv['id']}/bayar", headers=pemilik, json={"metode": "qris"})
    body = res.json()
    assert body["hasil"] == "berhasil" and body["invoice"]["status"] == "lunas" and body["invoice"]["dibayar_at"]
    assert [p["status"] for p in body["invoice"]["pembayaran"]] == ["gagal", "berhasil"]
    assert body["pembayaran"]["direkonsiliasi"] is True and body["pembayaran"]["ref_gateway"].startswith("PG-")
    layanan = [(s["service"], s["layer"]) for s in body["trace"]]
    assert ("Payment Gateway", "Utility") in layanan and ("Financial Ledger", "Entity") in layanan

    kas = _kas(api)
    baru = [k for k in kas["transaksi"] if k["ref"] == "INV-0003"]
    assert sorted((k["jenis"], k["jumlah"]) for k in baru) == [("komisi", -16_500), ("pembayaran_teknisi", -148_500)]
    assert "Biaya perbaikan A-101, ke Pak Slamet" in {k["keterangan"] for k in baru}
    r0, r1 = kas_awal["ringkasan"], kas["ringkasan"]
    assert r1["pengeluaran"] - r0["pengeluaran"] == 165_000 and r1["komisi"] - r0["komisi"] == 16_500
    assert (r1["invoice_lunas"], r1["invoice_tertunda"]) == (r0["invoice_lunas"] + 1, r0["invoice_tertunda"] - 1)
    assert any("Pembayaran WO-" in p and "Rp 148.500 diteruskan ke kamu" in p for p in _isi_notif(api, SLAMET))

    again = api.post(f"{V}/csm/invoice/{inv['id']}/bayar", headers=pemilik, json={"metode": "qris"})
    assert again.status_code == 409 and again.json()["error"]["kode"] == "SUDAH_LUNAS"


def test_validasi_dan_otorisasi_bayar_invoice(api):
    inv = _invoice(api, "INV-0003")
    pemilik = login_demo(api, DERREN)
    res = api.post(f"{V}/csm/invoice/{inv['id']}/bayar", headers=pemilik, json={"metode": "kartu_kredit"})
    assert res.status_code == 422 and res.json()["error"]["kode"] == "METODE_TIDAK_VALID"
    assert api.post(f"{V}/csm/invoice/999/bayar", headers=pemilik, json={"metode": "qris"}).status_code == 404
    # Penghuni tidak membayar perbaikan dan tidak melihat invoice.
    dea = login_demo(api, DEA)
    assert api.post(f"{V}/csm/invoice/{inv['id']}/bayar", headers=dea, json={"metode": "qris"}).status_code == 403
    assert api.get(f"{V}/invoice", headers=dea).json() == []
    assert api.get(f"{V}/laporan-kas", headers=dea).status_code == 403


def test_skenario_11_bayar_sekaligus(api):
    pemilik = login_demo(api, DERREN)
    semua = api.get(f"{V}/invoice", headers=pemilik).json()
    ids = [i["id"] for i in semua if i["status"] == "belum_dibayar"]
    lunas = [i["id"] for i in semua if i["status"] == "lunas"]
    assert len(ids) == 2
    url = f"{V}/csm/invoice/bayar-sekaligus"

    res = api.post(url, headers=pemilik, json={"id_invoice": [], "metode": "qris"})
    assert res.status_code == 422 and res.json()["error"]["kode"] == "JUMLAH_INVOICE_TIDAK_VALID"
    res = api.post(url, headers=pemilik, json={"id_invoice": [*ids, lunas[0]], "metode": "qris"})
    assert res.status_code == 409 and res.json()["error"]["kode"] == "SUDAH_LUNAS"

    # All-or-nothing: gateway menolak -> tidak ada yang lunas.
    gagal = api.post(url, headers=pemilik, json={"id_invoice": ids, "metode": "va_bca", "simulasi_gagal": True}).json()
    assert gagal["hasil"] == "gagal" and {i["status"] for i in gagal["invoice"]} == {"belum_dibayar"}

    res = api.post(url, headers=pemilik, json={"id_invoice": ids + ids[:1], "metode": "va_mandiri"})
    body = res.json()
    assert res.status_code == 200 and body["hasil"] == "berhasil"
    assert [i["status"] for i in body["invoice"]] == ["lunas", "lunas"]
    assert body["total"] == sum(i["total"] for i in semua if i["id"] in ids)
    # Satu transaksi gateway: baris Payment yang berhasil berbagi ref_gateway yang sama.
    refs = {p["ref_gateway"] for i in body["invoice"] for p in i["pembayaran"] if p["status"] == "berhasil"}
    assert refs == {body["ref_gateway"]}
    kode = {i["kode"] for i in body["invoice"]}
    assert len([k for k in _kas(api)["transaksi"] if k["ref"] in kode]) == 4


def test_skenario_10_terbitkan_tagihan_sewa_idempoten(api):
    pemilik = login_demo(api, DERREN)
    res = api.post(f"{V}/rb/tagihan-sewa/terbitkan", headers=pemilik)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["periode"] == periode_dari()
    assert [(t["unit"]["nomor_unit"], t["penghuni"]["nama"]) for t in body["dibuat"]] == [("A-104", "Putra")]
    t = body["dibuat"][0]
    assert (t["kode"], t["jumlah"], t["status"], t["jatuh_tempo"]) == (
        f"SWA-{t['id']:04d}",
        1_250_000,
        "belum_dibayar",
        f"{body['periode']}-10",
    )
    assert any(f"Tagihan sewa A-104 {label_periode(body['periode'])}" in p for p in _isi_notif(api, PUTRA))

    lagi = api.post(f"{V}/rb/tagihan-sewa/terbitkan", headers=pemilik).json()
    assert lagi["dibuat"] == []
    assert api.post(f"{V}/rb/tagihan-sewa/terbitkan", headers=login_demo(api, DEA)).status_code == 403


def test_skenario_9_penghuni_membayar_sewa(api):
    dea = login_demo(api, DEA)
    periode = periode_dari()
    daftar = api.get(f"{V}/tagihan-sewa", headers=dea).json()
    assert {t["penghuni"]["nama"] for t in daftar} == {"Dea"}
    t = next(x for x in daftar if x["periode"] == periode)
    assert t["status"] == "belum_dibayar" and t["jumlah"] == 1_200_000
    url = f"{V}/rb/tagihan-sewa/{t['id']}/bayar"

    # Tagihan Dea tidak terlihat oleh penghuni lain, dan pemilik tidak membayar sewa.
    assert api.get(f"{V}/tagihan-sewa/{t['id']}", headers=login_demo(api, FREDO)).status_code == 404
    assert api.post(url, headers=login_demo(api, FREDO), json={"metode": "qris"}).status_code == 404
    assert api.post(url, headers=login_demo(api, DERREN), json={"metode": "qris"}).status_code == 403

    gagal = api.post(url, headers=dea, json={"metode": "qris", "simulasi_gagal": True}).json()
    assert (gagal["hasil"], gagal["alasan"]) == ("gagal", "QR kedaluwarsa sebelum dibayar")
    assert any(f"Pembayaran sewa {t['kode']} gagal" in p for p in _isi_notif(api, DEA))

    body = api.post(url, headers=dea, json={"metode": "va_bca"}).json()
    assert body["hasil"] == "berhasil" and body["tagihan"]["status"] == "lunas"
    assert [p["status"] for p in body["tagihan"]["pembayaran"]] == ["gagal", "berhasil"]
    bulan = label_periode(periode)
    kas = [k for k in _kas(api)["transaksi"] if k["ref"] == t["kode"]]
    assert [(k["jenis"], k["jumlah"], k["keterangan"]) for k in kas] == [
        ("sewa", 1_200_000, f"Sewa A-101 {bulan} · Dea")
    ]
    assert any(f"Sewa A-101 {bulan} dibayar Dea" in p for p in _isi_notif(api, DERREN))
    assert api.post(url, headers=dea, json={"metode": "qris"}).json()["error"]["kode"] == "SUDAH_LUNAS"


def test_seed_billing(api):
    pemilik = login_demo(api, DERREN)
    inv = {i["kode"]: i for i in api.get(f"{V}/invoice", headers=pemilik).json()}
    # INV-0002 dibayar dengan VA BCA setelah percobaan GoPay gagal.
    assert [(p["metode"], p["status"]) for p in inv["INV-0002"]["pembayaran"]] == [
        ("gopay", "gagal"),
        ("va_bca", "berhasil"),
    ]
    assert [p["metode"] for p in inv["INV-0001"]["pembayaran"]] == ["qris"]

    kas = _kas(api)
    r = kas["ringkasan"]
    assert (r["invoice_lunas"], r["invoice_tertunda"], r["sewa_tertunda"]) == (2, 2, 4)
    assert r["pengeluaran"] == inv["INV-0001"]["total"] + inv["INV-0002"]["total"]
    assert r["pemasukan_sewa"] == sum(k["jumlah"] for k in kas["transaksi"] if k["jenis"] == "sewa") > 0
    assert r["saldo"] == r["pemasukan_sewa"] - r["pengeluaran"]
    waktu = [k["waktu"] for k in kas["transaksi"]]
    assert waktu == sorted(waktu, reverse=True)

    # Halim belum membayar bulan lalu -> terlambat; Putra belum ditagih bulan ini.
    halim = api.get(f"{V}/tagihan-sewa", headers=login_demo(api, HALIM)).json()
    lalu = [t for t in halim if t["status"] == "belum_dibayar" and t["periode"] < periode_dari()]
    assert len(lalu) == 1 and lalu[0]["terlambat"] is True
    putra = api.get(f"{V}/tagihan-sewa", headers=login_demo(api, PUTRA)).json()
    assert periode_dari() not in {t["periode"] for t in putra}
    # Teknisi tidak punya tagihan sewa.
    assert api.get(f"{V}/tagihan-sewa", headers=login_demo(api, SLAMET)).json() == []
