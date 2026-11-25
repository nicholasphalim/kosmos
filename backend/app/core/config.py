"""Konfigurasi dari environment (file backend/.env saat lokal, env Render saat deploy)."""

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _ke_psycopg(url: str) -> str:
    """Connection string Supabase diawali postgresql://; SQLAlchemy butuh nama driver psycopg 3."""
    for awalan in ("postgresql://", "postgres://"):
        if url.startswith(awalan):
            return "postgresql+psycopg://" + url.removeprefix(awalan)
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = ""
    test_database_url: str = ""

    supabase_url: str = ""
    supabase_secret_key: SecretStr = SecretStr("")
    supabase_storage_bucket: str = "kosmos-media"

    demo_jwt_secret: SecretStr = SecretStr("")
    demo_jwt_expire_jam: int = 12
    demo_mode: bool = False

    cors_origins: str = "http://localhost:3000"

    storage_provider: str = "local"
    upload_dir: Path = BACKEND_DIR / "uploads"
    # Alamat backend ini, untuk URL file adapter storage `local` (/media-files/...).
    public_base_url: str = "http://localhost:8000"
    signed_url_detik: int = 3600
    ai_provider: str = "mock"
    wa_provider: str = "mock"
    payment_provider: str = "mock"

    @field_validator("database_url", "test_database_url")
    @classmethod
    def _driver(cls, v: str) -> str:
        return _ke_psycopg(v.strip())

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
