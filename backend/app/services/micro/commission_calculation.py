"""[Micro: Commission Calculation] Calculate Komisi. Stateless, tanpa database."""

from .pembulatan import bulat

PERSEN_KOMISI = 10


def hitung_komisi(biaya: int, persen: int = PERSEN_KOMISI) -> tuple[int, int]:
    """Persentase dari biaya final, dibulatkan ke ratusan rupiah. Mengembalikan (persen, komisi)."""
    return persen, bulat(biaya * persen / 100 / 100) * 100
