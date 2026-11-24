"""[Micro: Commission Calculation] persentase dari biaya final, dibulatkan ke ratusan rupiah."""

from .angka import bulat

PERSEN_KOMISI = 10


def hitung_komisi(biaya: int, persen: int = PERSEN_KOMISI) -> dict:
    return {"persen": persen, "komisi": bulat(biaya * persen / 100 / 100) * 100}
