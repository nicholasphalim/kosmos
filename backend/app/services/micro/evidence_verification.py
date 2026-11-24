"""[Micro: Evidence Verification] kelengkapan dan keaslian foto (aturan mock berbasis metadata)."""

from dataclasses import dataclass

from .angka import round_half_up


@dataclass
class Foto:
    nama_file: str
    mime: str
    ukuran_byte: int


def verifikasi_bukti(sebelum: Foto | None, sesudah: Foto | None) -> dict:
    dua = [f for f in (sebelum, sesudah) if f is not None]
    sama = bool(sebelum and sesudah and sebelum.nama_file == sesudah.nama_file and sebelum.ukuran_byte == sesudah.ukuran_byte)
    pemeriksaan = [
        {"label": "Foto sebelum dan sesudah lengkap", "ok": len(dua) == 2},
        {"label": "Berformat gambar (JPG, PNG, WebP)", "ok": bool(dua) and all(f.mime.startswith("image/") for f in dua)},
        {"label": "Bukan foto yang sama", "ok": not sama},
        {"label": "Ukuran foto wajar (≥ 1 KB)", "ok": bool(dua) and all(f.ukuran_byte >= 1024 for f in dua)},
    ]
    lolos = sum(p["ok"] for p in pemeriksaan)
    return {"valid": lolos == len(pemeriksaan), "skor": round_half_up(lolos / len(pemeriksaan), 2), "pemeriksaan": pemeriksaan}
