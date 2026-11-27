"""Entity Tenant and Lease: profil penghuni, status sewa, unit, dan pendaftaran penghuni oleh pemilik."""

from app.core.waktu import tanggal_geser
from app.tests.conftest import login_demo

V = "/api/v1"


def _baru(**ubah) -> dict:
    return {
        "nama": "Penghuni Baru",
        "email": "baru@gmail.com",
        "no_wa": "0812-0000-2222",
        "id_unit": 8,  # A-102, kosong sejak sewa Qiqa berakhir
        "tanggal_mulai": tanggal_geser(1).isoformat(),
        "tanggal_selesai": tanggal_geser(365).isoformat(),
    } | ubah


def test_profil_penghuni(api):
    res = api.get(f"{V}/penghuni/me", headers=login_demo(api, 1))
    assert res.status_code == 200
    body = res.json()
    assert body["unit"] == {"id": 7, "nomor_unit": "A-101", "nama_properti": "Kos Melati"}
    assert body["sewa"]["status_sewa"] == "aktif"


def test_profil_penghuni_sewa_berakhir(api):
    assert api.get(f"{V}/penghuni/me", headers=login_demo(api, 2)).json()["sewa"]["status_sewa"] == "tidak_aktif"


def test_status_sewa_hanya_untuk_yang_berhak(api):
    dea = login_demo(api, 1)
    assert api.get(f"{V}/unit/7/sewa", headers=dea).status_code == 200
    assert api.get(f"{V}/unit/8/sewa", headers=dea).status_code == 404  # unit orang lain
    assert api.get(f"{V}/unit/8/sewa", headers=login_demo(api, 4)).status_code == 200  # pemilik
    assert api.get(f"{V}/unit/999/sewa", headers=login_demo(api, 4)).status_code == 404


def test_unit_pemilik(api):
    unit = api.get(f"{V}/pemilik/unit", headers=login_demo(api, 4)).json()
    assert len(unit) == 6
    a102 = next(u for u in unit if u["nomor_unit"] == "A-102")
    assert a102["penghuni"] is None and a102["sewa"] is None and a102["harga_bulanan"] == 1_200_000
    a101 = next(u for u in unit if u["nomor_unit"] == "A-101")
    assert a101["penghuni"]["nama"] == "Dea"


def test_daftar_penghuni(api):
    rows = api.get(f"{V}/pemilik/penghuni", headers=login_demo(api, 4)).json()
    assert [r["pengguna"]["nama"] for r in rows] == ["Dea", "Fredo", "Halim", "Nicholas", "Putra", "Qiqa"]
    assert all(r["terhubung_google"] is False for r in rows)


def test_tambah_penghuni(api):
    res = api.post(f"{V}/pemilik/penghuni", headers=login_demo(api, 4), json=_baru(email="  Baru@Gmail.COM "))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["email"] == "baru@gmail.com"
    assert body["pengguna"]["role"] == "penghuni" and body["pengguna"]["id"] == 13
    assert body["unit"]["nomor_unit"] == "A-102"


def test_tambah_penghuni_ditolak(api):
    h = login_demo(api, 4)
    kasus = [
        (_baru(email="dea@kosmos.test"), 409, "EMAIL_SUDAH_TERDAFTAR"),
        (_baru(id_unit=7), 409, "UNIT_SUDAH_DISEWA"),
        (_baru(id_unit=999), 404, "UNIT_TIDAK_ADA"),
        (_baru(email="bukan-email"), 422, "VALIDASI_GAGAL"),
        (_baru(tanggal_mulai="2027-01-01", tanggal_selesai="2026-01-01"), 422, "VALIDASI_GAGAL"),
        (_baru(nama="A"), 422, "VALIDASI_GAGAL"),
        (_baru(nama="12345"), 422, "VALIDASI_GAGAL"),
        (_baru(nama="Budi_99"), 422, "VALIDASI_GAGAL"),
        (_baru(no_wa="abcdefgh"), 422, "VALIDASI_GAGAL"),
        (_baru(no_wa="12345678"), 422, "VALIDASI_GAGAL"),
        (_baru(no_wa="0812-34"), 422, "VALIDASI_GAGAL"),
        (
            _baru(tanggal_mulai=tanggal_geser(1).isoformat(), tanggal_selesai=tanggal_geser(1).isoformat()),
            422,
            "VALIDASI_GAGAL",
        ),
        (
            _baru(tanggal_mulai=tanggal_geser(-60).isoformat(), tanggal_selesai=tanggal_geser(-1).isoformat()),
            422,
            "VALIDASI_GAGAL",
        ),
        (
            _baru(tanggal_mulai=tanggal_geser(400).isoformat(), tanggal_selesai=tanggal_geser(800).isoformat()),
            422,
            "VALIDASI_GAGAL",
        ),
        (_baru(tanggal_selesai=tanggal_geser(6 * 366).isoformat()), 422, "VALIDASI_GAGAL"),
    ]
    for body, status, kode in kasus:
        res = api.post(f"{V}/pemilik/penghuni", headers=h, json=body)
        assert (res.status_code, res.json()["error"]["kode"]) == (status, kode), body


def test_tambah_penghuni_hanya_pemilik(api):
    assert api.post(f"{V}/pemilik/penghuni", headers=login_demo(api, 8), json=_baru()).status_code == 403


def test_ubah_penghuni(api):
    h = login_demo(api, 4)
    res = api.patch(
        f"{V}/pemilik/penghuni/2", headers=h, json={"email": "qiqa.baru@gmail.com", "no_wa": "0813-1111-2222"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["email"] == "qiqa.baru@gmail.com"
    assert api.patch(f"{V}/pemilik/penghuni/2", headers=h, json={}).status_code == 422
    assert api.patch(f"{V}/pemilik/penghuni/8", headers=h, json={"nama": "Teknisi"}).status_code == 404
    res = api.patch(f"{V}/pemilik/penghuni/2", headers=h, json={"email": "dea@kosmos.test"})
    assert res.json()["error"]["kode"] == "EMAIL_SUDAH_TERDAFTAR"


def test_email_terkunci_setelah_login_google(api):
    from app.tests.conftest import bearer, token_supabase

    assert api.get(f"{V}/auth/me", headers=bearer(token_supabase("qiqa@kosmos.test"))).status_code == 200
    res = api.patch(f"{V}/pemilik/penghuni/2", headers=login_demo(api, 4), json={"email": "qiqa2@gmail.com"})
    assert res.status_code == 409
    assert res.json()["error"]["kode"] == "SUDAH_TERHUBUNG"
    rows = api.get(f"{V}/pemilik/penghuni", headers=login_demo(api, 4)).json()
    assert next(r for r in rows if r["pengguna"]["id"] == 2)["terhubung_google"] is True


def test_sewa_lagi(api):
    h = login_demo(api, 4)
    body = {
        "id_unit": 8,
        "tanggal_mulai": tanggal_geser(0).isoformat(),
        "tanggal_selesai": tanggal_geser(180).isoformat(),
    }
    res = api.post(f"{V}/pemilik/penghuni/2/sewa", headers=h, json=body)
    assert res.status_code == 201, res.text
    assert res.json()["sewa"]["status_sewa"] == "aktif"
    # Qiqa kembali aktif: keluhan berikutnya akan diterima.
    assert api.get(f"{V}/penghuni/me", headers=login_demo(api, 2)).json()["sewa"]["status_sewa"] == "aktif"


def test_sewa_lagi_ditolak(api):
    h = login_demo(api, 4)
    depan = {"tanggal_mulai": tanggal_geser(0).isoformat(), "tanggal_selesai": tanggal_geser(30).isoformat()}
    kasus = [
        (1, {"id_unit": 8, **depan}, 409, "SEWA_BENTROK"),  # Dea masih menyewa A-101
        (2, {"id_unit": 7, **depan}, 409, "UNIT_SUDAH_DISEWA"),
        (2, {"id_unit": 999, **depan}, 404, "UNIT_TIDAK_ADA"),
        (8, {"id_unit": 8, **depan}, 404, "PENGHUNI_TIDAK_ADA"),
    ]
    for id_, body, status, kode in kasus:
        res = api.post(f"{V}/pemilik/penghuni/{id_}/sewa", headers=h, json=body)
        assert (res.status_code, res.json()["error"]["kode"]) == (status, kode), (id_, body)


def test_nama_dan_nomor_wa_dinormalisasi(api):
    body = _baru(nama="  Indanna   Halwah Raqiqah M. ", no_wa="+62 812 3456 7890")
    res = api.post(f"{V}/pemilik/penghuni", headers=login_demo(api, 4), json=body)
    assert res.status_code == 201, res.text
    assert res.json()["pengguna"]["nama"] == "Indanna Halwah Raqiqah M."
    assert res.json()["no_wa"] == "0812-3456-7890"
