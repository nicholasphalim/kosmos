"""[Micro: Evidence Verification] Verify Bukti Perbaikan. Stateless, tanpa database.

Versi prototype memeriksa metadata foto (plan §11b #7). Versi akhir bisa memakai model LLM multimodal
seperti AI Classification, tanpa mengubah Task yang memanggilnya.
"""

from dataclasses import dataclass

from .pembulatan import bulat

FORMAT_FOTO = ("image/jpeg", "image/png", "image/webp")


@dataclass(frozen=True)
class Foto:
    nama_file: str
    mime: str
    ukuran_byte: int


def verifikasi_bukti(sebelum: Foto | None, sesudah: Foto | None) -> dict:
    """Kelengkapan dan keaslian foto. Hasil berbentuk VerifikasiBukti (kontrak)."""
    dua = [f for f in (sebelum, sesudah) if f is not None]
    sama = bool(
        sebelum and sesudah and sebelum.nama_file == sesudah.nama_file and sebelum.ukuran_byte == sesudah.ukuran_byte
    )
    pemeriksaan = [
        {"label": "Foto sebelum dan sesudah lengkap", "ok": len(dua) == 2},
        {
            "label": "Berformat gambar (JPG, PNG, WebP)",
            "ok": bool(dua) and all(f.mime in FORMAT_FOTO for f in dua),
        },
        {"label": "Bukan foto yang sama", "ok": not sama},
        {"label": "Ukuran foto wajar (≥ 1 KB)", "ok": bool(dua) and all(f.ukuran_byte >= 1024 for f in dua)},
    ]
    lolos = sum(p["ok"] for p in pemeriksaan)
    return {
        "valid": lolos == len(pemeriksaan),
        "skor": bulat(lolos / len(pemeriksaan) * 100) / 100,
        "pemeriksaan": pemeriksaan,
    }
