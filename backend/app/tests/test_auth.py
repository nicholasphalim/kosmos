"""Auth (plan §7.2): token demo, token Supabase (login Google), dan guard role."""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select

from app.core.config import get_settings
from app.core.waktu import tanggal_geser
from app.services.entity.tenant_lease.models import Pengguna
from app.tests.conftest import SUPABASE_TEST_URL, bearer, login_demo, token_supabase

ME = "/api/v1/auth/me"


def test_tanpa_token_401(api):
    res = api.get(ME)
    assert res.status_code == 401
    assert res.json()["error"]["kode"] == "TIDAK_TERAUTENTIKASI"


def test_token_sampah_401(api):
    assert api.get(ME, headers=bearer("bukan.jwt")).status_code == 401


def test_demo_login_lalu_me(api):
    res = api.get(ME, headers=login_demo(api, 1))
    assert res.status_code == 200
    assert res.json() == {"id": 1, "nama": "Dea", "role": "penghuni", "email": "dea@kosmos.test"}


def test_demo_accounts(api):
    akun = api.get("/api/v1/auth/demo-accounts").json()
    assert [a["pengguna"]["id"] for a in akun] == [1, 2, 3, 4, 8, 9, 10]
    label = {a["pengguna"]["nama"]: a["label_sewa"] for a in akun}
    assert label["Dea"] == "aktif" and label["Qiqa"] == "berakhir" and label["Pak Derren"] == "pemilik"


def test_demo_login_akun_tidak_ada_404(api):
    assert api.post("/api/v1/auth/demo-login", json={"id_pengguna": 999}).status_code == 404


def test_token_demo_ditolak_bila_demo_mode_mati(api, monkeypatch):
    headers = login_demo(api, 1)
    monkeypatch.setattr(get_settings(), "demo_mode", False)
    assert api.get(ME, headers=headers).status_code == 401


def test_token_demo_kedaluwarsa_401(api):
    lama = jwt.encode(
        {"iss": "kosmos-demo", "sub": "1", "exp": datetime.now(UTC) - timedelta(minutes=1)},
        get_settings().demo_jwt_secret.get_secret_value(),
        algorithm="HS256",
    )
    assert api.get(ME, headers=bearer(lama)).status_code == 401


def test_google_email_terdaftar_menghubungkan_akun(api, seeded):
    sub = uuid.uuid4()
    res = api.get(ME, headers=bearer(token_supabase("Dea@Kosmos.test", sub)))
    assert res.status_code == 200
    assert res.json()["id"] == 1
    assert seeded.get(Pengguna, 1).auth_user_id == sub
    # Login berikutnya dikenali dari sub, walau email di token berubah.
    assert api.get(ME, headers=bearer(token_supabase("lain@gmail.com", sub))).json()["id"] == 1


def test_google_email_belum_terdaftar_403(api):
    res = api.get(ME, headers=bearer(token_supabase("orang.asing@gmail.com")))
    assert res.status_code == 403
    assert res.json()["error"]["kode"] == "EMAIL_BELUM_TERDAFTAR"


def test_email_sudah_terhubung_ke_akun_google_lain_403(api):
    assert api.get(ME, headers=bearer(token_supabase("dea@kosmos.test"))).status_code == 200
    res = api.get(ME, headers=bearer(token_supabase("dea@kosmos.test")))  # sub berbeda
    assert res.status_code == 403
    assert res.json()["error"]["kode"] == "EMAIL_BELUM_TERDAFTAR"


def test_google_token_tidak_sah_401(api):
    kunci_lain = ec.generate_private_key(ec.SECP256R1())
    kasus = [
        token_supabase("dea@kosmos.test", aud="anon"),
        token_supabase("dea@kosmos.test", iss="https://lain.supabase.co/auth/v1"),
        token_supabase("dea@kosmos.test", exp=datetime.now(UTC) - timedelta(minutes=1)),
        jwt.encode(
            {
                "iss": f"{SUPABASE_TEST_URL}/auth/v1",
                "aud": "authenticated",
                "sub": str(uuid.uuid4()),
                "email": "dea@kosmos.test",
                "exp": datetime.now(UTC) + timedelta(hours=1),
            },
            kunci_lain,
            algorithm="ES256",
        ),
    ]
    for t in kasus:
        assert api.get(ME, headers=bearer(t)).status_code == 401


def test_hanya_login_google_yang_diterima(api, seeded):
    """Akun email/password Supabase dengan email penghuni tidak boleh menghubungkan diri ke akun penghuni."""
    kasus = [
        token_supabase("dea@kosmos.test", app_metadata={"provider": "email", "providers": ["email"]}),
        token_supabase("dea@kosmos.test", app_metadata={}),
        token_supabase("dea@kosmos.test", app_metadata="google"),
    ]
    for t in kasus:
        assert api.get(ME, headers=bearer(t)).status_code == 401
    assert seeded.get(Pengguna, 1).auth_user_id is None
    # Akun yang memakai beberapa provider tetap diterima selama salah satunya Google.
    t = token_supabase("dea@kosmos.test", app_metadata={"provider": "email", "providers": ["email", "google"]})
    assert api.get(ME, headers=bearer(t)).status_code == 200


def test_role_salah_403(api):
    res = api.get("/api/v1/pemilik/unit", headers=login_demo(api, 1))
    assert res.status_code == 403
    assert res.json()["error"]["kode"] == "AKSES_DITOLAK"


def test_penghuni_baru_bisa_login_google(api, seeded):
    pemilik = login_demo(api, 4)
    res = api.post(
        "/api/v1/pemilik/penghuni",
        headers=pemilik,
        json={
            "nama": "Anggota Baru",
            "email": "Anggota.Baru@Gmail.com",
            "no_wa": "0812-0000-1111",
            "id_unit": 8,
            "tanggal_mulai": tanggal_geser(1).isoformat(),
            "tanggal_selesai": tanggal_geser(365).isoformat(),
        },
    )
    assert res.status_code == 201, res.text
    google = bearer(token_supabase("anggota.baru@gmail.com"))
    assert api.get(ME, headers=google).json()["role"] == "penghuni"
    profil = api.get("/api/v1/penghuni/me", headers=google).json()
    assert profil["unit"]["nomor_unit"] == "A-102"
    terhubung = seeded.scalars(select(Pengguna.auth_user_id).where(Pengguna.email == "anggota.baru@gmail.com")).one()
    assert terhubung is not None
