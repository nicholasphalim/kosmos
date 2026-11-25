import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


@pytest.fixture
def butuh_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """Arahkan aplikasi ke TEST_DATABASE_URL. Test dilewati bila belum diisi."""
    url = get_settings().test_database_url
    if not url:
        pytest.skip("TEST_DATABASE_URL belum diisi")
    from app.core import db

    monkeypatch.setattr(get_settings(), "database_url", url)
    db.get_engine.cache_clear()
    db._session_factory.cache_clear()
    yield
    db.get_engine.cache_clear()
    db._session_factory.cache_clear()
