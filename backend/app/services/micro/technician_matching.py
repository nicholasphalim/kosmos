"""[Micro: Technician Matching] filter + ranking teknisi. Stateless: semua data masuk lewat argumen."""

import math
from dataclasses import dataclass

from .angka import km, round_half_up

KAPASITAS_TEKNISI = 2


def jarak_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    """Jarak garis lurus (haversine), dibulatkan 1 desimal."""
    rad = math.radians
    d_lat = rad(b_lat - a_lat)
    d_lng = rad(b_lng - a_lng)
    h = math.sin(d_lat / 2) ** 2 + math.cos(rad(a_lat)) * math.cos(rad(b_lat)) * math.sin(d_lng / 2) ** 2
    return round_half_up(6371 * 2 * math.asin(math.sqrt(h)), 1)


@dataclass
class CalonTeknisi:
    teknisi: dict  # TeknisiRingkas: id, nama, keahlian, terverifikasi, rating, no_wa
    tersedia: bool
    jarak_km: float
    beban: int  # jumlah work order aktif yang sedang dipegang


def match_teknisi(kategori: str, urgensi: str, calon: list[CalonTeknisi]) -> list[dict]:
    """Match Teknisi: filter (keahlian, terverifikasi, tersedia, kapasitas) lalu ranking.
    Urgensi tinggi memberi bobot jarak lebih besar karena teknisi harus cepat tiba."""
    bobot_jarak = 0.7 if urgensi == "tinggi" else 0.5
    hasil: list[dict] = []
    for c in calon:
        t = c.teknisi

        def tolak(alasan: str) -> dict:
            return {"teknisi": t, "tersedia": c.tersedia, "jarak_km": c.jarak_km, "lolos": False, "skor": None, "alasan": alasan}

        if kategori not in t["keahlian"]:
            hasil.append(tolak("Bukan keahlian kategori ini"))
        elif not t["terverifikasi"]:
            hasil.append(tolak("Belum terverifikasi"))
        elif not c.tersedia:
            hasil.append(tolak("Sedang tidak tersedia"))
        elif c.beban >= KAPASITAS_TEKNISI:
            hasil.append(tolak(f"Sedang memegang {c.beban} pekerjaan"))
        else:
            skor = (1 - bobot_jarak) * (t["rating"] / 5) + bobot_jarak * max(0, 1 - c.jarak_km / 10)
            hasil.append({
                "teknisi": t,
                "tersedia": True,
                "jarak_km": c.jarak_km,
                "lolos": True,
                "skor": round_half_up(skor, 2),
                "alasan": f"Terverifikasi · {km(c.jarak_km)} · ★ {t['rating']:.1f}",
            })
    # Sama dengan sort di mock: lolos dulu, skor tertinggi, lalu jarak terdekat.
    return sorted(hasil, key=lambda k: (not k["lolos"], -(k["skor"] or 0), k["jarak_km"]))
