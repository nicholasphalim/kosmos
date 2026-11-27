"""[Micro: Cost Estimation] Estimate Biaya dan biaya kunjungan. Stateless, tanpa database.

Catatan estimasi (siapa menyetujui, kapan) dimiliki Task HMR, bukan Micro ini (plan §11b #2).
Tarif sama dengan estimasiBiaya di frontend/src/mocks/micro.ts.
"""

import re

from .pembulatan import bulat, km

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

BIAYA_PENGECEKAN = 50_000
PREFIX_TRANSPORT = "Transport teknisi"


def _rincian(label: str, jumlah: int) -> dict:
    return {"label": label, "jumlah": jumlah}


def estimasi_biaya(kategori: str, urgensi: str, deskripsi: str, jarak_km: float) -> tuple[list[dict], int]:
    """Tarif jasa per kategori + material dari deskripsi + prioritas + transport. Mengembalikan (rincian, total)."""
    material = next(((label, j) for pola, label, j in MATERIAL if pola.search(deskripsi)), ("Material umum", 30_000))
    rincian = [_rincian(*JASA[kategori]), _rincian(*material)]
    if urgensi == "tinggi":
        rincian.append(_rincian("Penanganan prioritas (< 4 jam)", 50_000))
    rincian.append(_rincian(f"{PREFIX_TRANSPORT} ({km(jarak_km)})", max(10_000, bulat(jarak_km * 5) * 1000)))
    return rincian, sum(r["jumlah"] for r in rincian)


def biaya_kunjungan(rincian_estimasi: list[dict]) -> tuple[list[dict], int]:
    """Biaya saat tiket dibatalkan setelah teknisi tiba: biaya pengecekan + transport dari estimasi."""
    transport = next((r for r in rincian_estimasi if r["label"].startswith(PREFIX_TRANSPORT)), None)
    rincian = [_rincian("Biaya pengecekan (perbaikan dibatalkan)", BIAYA_PENGECEKAN)]
    if transport:
        rincian.append(dict(transport))
    return rincian, sum(r["jumlah"] for r in rincian)
