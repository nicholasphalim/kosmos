"""[Micro: Cost Estimation] tarif jasa per kategori + material dari deskripsi + prioritas + transport."""

import re

from .angka import bulat, km

JASA = {
    "AC": ("Jasa servis AC", 150_000),
    "listrik": ("Jasa perbaikan listrik", 120_000),
    "air": ("Jasa perbaikan saluran air", 100_000),
    "lainnya": ("Jasa perbaikan umum", 80_000),
}

MATERIAL = [
    (re.compile(r"freon|tidak dingin|kurang dingin", re.I), "Isi ulang freon", 250_000),
    (re.compile(r"stop ?kontak|colokan", re.I), "Material: stop kontak & kabel", 45_000),
    (re.compile(r"saklar", re.I), "Material: saklar", 30_000),
    (re.compile(r"lampu|bohlam", re.I), "Material: bohlam & fitting", 35_000),
    (re.compile(r"keran|kran", re.I), "Material: keran & seal", 60_000),
    (re.compile(r"pipa|bocor", re.I), "Material: pipa & lem PVC", 75_000),
    (re.compile(r"mampet|wastafel|wc|toilet", re.I), "Material: pembersih saluran", 40_000),
    (re.compile(r"engsel|pintu|lemari", re.I), "Material: engsel & sekrup", 25_000),
]


def estimasi_biaya(kategori: str, urgensi: str, deskripsi: str, jarak_km: float) -> dict:
    label_m, jumlah_m = next(((l, j) for p, l, j in MATERIAL if p.search(deskripsi)), ("Material umum", 30_000))
    label_j, jumlah_j = JASA[kategori]
    rincian = [{"label": label_j, "jumlah": jumlah_j}, {"label": label_m, "jumlah": jumlah_m}]
    if urgensi == "tinggi":
        rincian.append({"label": "Penanganan prioritas (< 4 jam)", "jumlah": 50_000})
    rincian.append({"label": f"Transport teknisi ({km(jarak_km)})", "jumlah": max(10_000, bulat(jarak_km * 5) * 1000)})
    return {"rincian": rincian, "total": sum(r["jumlah"] for r in rincian)}
