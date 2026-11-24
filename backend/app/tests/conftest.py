"""Tes memakai database SQLite sementara, terpisah dari kosmos.db milik demo."""

import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="kosmos-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(_tmp / "uploads")
os.environ["DEMO_MODE"] = "true"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import reset_semua  # noqa: E402


@pytest.fixture
def client():
    reset_semua()
    with TestClient(app) as c:
        yield c


def login(client: TestClient, id_pengguna: int) -> dict[str, str]:
    res = client.post("/api/v1/auth/demo-login", json={"id_pengguna": id_pengguna})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}
