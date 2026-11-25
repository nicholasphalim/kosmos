"""[Utility: AI Classification] agnostic: menerima teks + jumlah gambar, mengembalikan kategori dan urgensi."""

from typing import Literal

from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import ServiceError

from .adapters import mock


class KlasifikasiOut(BaseModel):
    kategori: Literal["AC", "listrik", "air", "lainnya"]
    urgensi: Literal["rendah", "sedang", "tinggi"]
    confidence: float
    alasan: str
    judul: str


def judul_sementara(teks: str) -> str:
    """Ringkasan kalimat pertama, dipakai sebagai judul tiket sebelum klasifikasi selesai."""
    return mock.buat_judul(teks)


def classify(teks: str, jumlah_gambar: int) -> KlasifikasiOut:
    """Tulis "#gagal-ai" di teks untuk menyimulasikan layanan AI tidak tersedia (skenario demo 4)."""
    if "#gagal-ai" in teks:
        raise ServiceError(503, "AI_TIDAK_TERSEDIA", "Layanan AI Classification sedang tidak tersedia.")
    provider = get_settings().ai_provider
    if provider != "mock":
        raise ServiceError(503, "AI_PROVIDER_TIDAK_DIKENAL", f"AI_PROVIDER '{provider}' belum tersedia.")
    return KlasifikasiOut(**mock.klasifikasi(teks, jumlah_gambar))
