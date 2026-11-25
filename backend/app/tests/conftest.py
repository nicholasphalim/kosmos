"""Fixture test.

Test yang butuh database memakai TEST_DATABASE_URL (lokal: kosmos-dev, CI: Postgres service).
Migrasi dijalankan sekali per sesi test. Setiap test berjalan di dalam satu transaksi yang
di-rollback di akhir, jadi data di database tidak pernah berubah oleh test.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.core.db import get_db


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


@pytest.fixture(scope="session")
def engine_test() -> Iterator[Engine]:
    url = get_settings().test_database_url
    if not url:
        pytest.skip("TEST_DATABASE_URL belum diisi")
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["url"] = url
    cfg.attributes["tanpa_logging"] = True
    command.upgrade(cfg, "head")
    engine = create_engine(url)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine_test: Engine) -> Iterator[Session]:
    """Session di dalam transaksi luar. commit() di kode aplikasi hanya melepas savepoint."""
    conn = engine_test.connect()
    trans = conn.begin()
    sesi = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    try:
        yield sesi
    finally:
        sesi.close()
        trans.rollback()
        conn.close()


@pytest.fixture
def seeded(db: Session) -> Session:
    """Database berisi data demo (§4.1), hanya untuk test ini."""
    from app.seed import reset_semua

    reset_semua(db)
    return db


@pytest.fixture
def api(seeded: Session) -> Iterator[TestClient]:
    """TestClient yang memakai session test (data demo, di-rollback setelah test)."""
    from app.main import app

    app.dependency_overrides[get_db] = lambda: seeded
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


SUPABASE_TEST_URL = "https://uji.supabase.co"
_KUNCI_TEST = ec.generate_private_key(ec.SECP256R1())


@pytest.fixture(autouse=True)
def atur_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    """Konfigurasi auth untuk test: DEMO_MODE aktif, secret demo, dan project Supabase palsu
    yang kunci publiknya adalah kunci test (tidak menghubungi Supabase)."""
    from app.core import security

    s = get_settings()
    monkeypatch.setattr(s, "demo_mode", True)
    monkeypatch.setattr(s, "demo_jwt_secret", SecretStr("x" * 48))
    monkeypatch.setattr(s, "supabase_url", SUPABASE_TEST_URL)
    monkeypatch.setattr(security, "kunci_publik_supabase", lambda _token: _KUNCI_TEST.public_key())


def token_supabase(email: str, sub: uuid.UUID | None = None, **ubah) -> str:
    """JWT seperti yang diterbitkan Supabase Auth setelah login Google."""
    payload = {
        "iss": f"{SUPABASE_TEST_URL}/auth/v1",
        "aud": "authenticated",
        "sub": str(sub or uuid.uuid4()),
        "email": email,
        "role": "authenticated",
        "exp": datetime.now(UTC) + timedelta(hours=1),
    } | ubah
    return jwt.encode(payload, _KUNCI_TEST, algorithm="ES256")


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login_demo(api: TestClient, id_pengguna: int) -> dict[str, str]:
    res = api.post("/api/v1/auth/demo-login", json={"id_pengguna": id_pengguna})
    assert res.status_code == 200, res.text
    return bearer(res.json()["token"])


@pytest.fixture
def butuh_db(engine_test: Engine, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Arahkan engine aplikasi ke TEST_DATABASE_URL (untuk test yang memakai get_engine langsung)."""
    from app.core import db as core_db

    monkeypatch.setattr(get_settings(), "database_url", get_settings().test_database_url)
    core_db.get_engine.cache_clear()
    core_db._session_factory.cache_clear()
    yield
    core_db.get_engine.cache_clear()
    core_db._session_factory.cache_clear()
