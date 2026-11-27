"""[Micro: Technician Matching] Match Teknisi: filter lalu ranking kandidat. Stateless, tanpa database.

Semua data masuk lewat argumen dari Task. Aturan sama dengan matchTeknisi di frontend/src/mocks/micro.ts.
"""

import math
from dataclasses import dataclass

from .pembulatan import bulat, km

KAPASITAS_TEKNISI = 2


@dataclass(frozen=True)
class Titik:
    lat: float
    lng: float


@dataclass(frozen=True)
class CalonTeknisi:
    # Ringkasan teknisi sesuai skema TeknisiRingkas di kontrak (id, nama, keahlian, terverifikasi, rating, no_wa).
    teknisi: dict
    tersedia: bool
    jarak_km: float
    beban: int  # jumlah work order aktif yang sedang dipegang
    dikecualikan: str | None = None  # mis. estimasinya sudah ditolak pemilik untuk tiket ini


def jarak_km(a: Titik, b: Titik) -> float:
    """Jarak garis lurus (haversine), dibulatkan 1 desimal."""
    rad = math.radians
    d_lat = rad(b.lat - a.lat)
    d_lng = rad(b.lng - a.lng)
    h = math.sin(d_lat / 2) ** 2 + math.cos(rad(a.lat)) * math.cos(rad(b.lat)) * math.sin(d_lng / 2) ** 2
    return bulat(6371 * 2 * math.asin(math.sqrt(h)) * 10) / 10


def match_teknisi(kategori: str, urgensi: str, calon: list[CalonTeknisi]) -> list[dict]:
    """Filter (keahlian, terverifikasi, tersedia, kapasitas) lalu ranking.

    Urgensi tinggi memberi bobot jarak lebih besar karena teknisi harus cepat tiba.
    Hasil berbentuk KandidatTeknisi (kontrak): yang lolos di atas, skor tertinggi dulu.
    """
    bobot_jarak = 0.7 if urgensi == "tinggi" else 0.5
    hasil = []
    for c in calon:
        t = c.teknisi

        def tolak(alasan: str, c: CalonTeknisi = c) -> dict:
            return {
                "teknisi": c.teknisi,
                "tersedia": c.tersedia,
                "jarak_km": c.jarak_km,
                "lolos": False,
                "skor": None,
                "alasan": alasan,
            }

        if c.dikecualikan:
            hasil.append(tolak(c.dikecualikan))
        elif kategori not in t["keahlian"]:
            hasil.append(tolak("Bukan keahlian kategori ini"))
        elif not t["terverifikasi"]:
            hasil.append(tolak("Belum terverifikasi"))
        elif not c.tersedia:
            hasil.append(tolak("Sedang tidak tersedia"))
        elif c.beban >= KAPASITAS_TEKNISI:
            hasil.append(tolak(f"Sedang memegang {c.beban} pekerjaan"))
        else:
            skor = (1 - bobot_jarak) * (t["rating"] / 5) + bobot_jarak * max(0.0, 1 - c.jarak_km / 10)
            hasil.append(
                {
                    "teknisi": t,
                    "tersedia": True,
                    "jarak_km": c.jarak_km,
                    "lolos": True,
                    "skor": bulat(skor * 100) / 100,
                    "alasan": f"Terverifikasi · {km(c.jarak_km)} · ★ {t['rating']:.1f}",
                }
            )
    # Urutan stabil seperti Array.sort: lolos dulu, skor tertinggi, lalu yang terdekat.
    return sorted(hasil, key=lambda k: (not k["lolos"], -(k["skor"] or 0), k["jarak_km"]))
