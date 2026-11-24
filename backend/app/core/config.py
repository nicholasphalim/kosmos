"""Konfigurasi dari environment (file .env opsional). Semua nilai punya default untuk demo lokal."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'kosmos.db').as_posix()}"
    jwt_secret: str = "kosmos-demo-secret-hanya-untuk-lokal-ganti-saat-deploy"
    jwt_expire_jam: int = 12
    demo_mode: bool = True
    cors_origins: str = "http://localhost:3000,http://localhost:3100"
    public_base_url: str = "http://localhost:8000"
    upload_dir: Path = BACKEND_DIR / "uploads"
    ai_provider: str = "mock"
    wa_provider: str = "mock"
    payment_provider: str = "mock"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
