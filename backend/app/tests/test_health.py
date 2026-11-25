from app.core.config import _ke_psycopg


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_health_db_terhubung(client, butuh_db):
    res = client.get("/health/db")
    assert res.status_code == 200
    assert res.json()["database"] == "terhubung"


def test_connection_string_supabase_diubah_ke_psycopg():
    assert _ke_psycopg("postgresql://u:p@host:5432/postgres") == "postgresql+psycopg://u:p@host:5432/postgres"
    assert _ke_psycopg("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_error_404_seragam(client):
    res = client.get("/tidak-ada")
    assert res.status_code == 404
    assert res.json()["error"]["kode"] == "TIDAK_DITEMUKAN"
