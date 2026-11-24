"""Format teks Indonesia untuk isi notifikasi, sama dengan frontend/src/lib/format.ts."""

from datetime import date

BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
LABEL_KATEGORI = {"AC": "AC", "listrik": "Listrik", "air": "Air", "lainnya": "Lainnya"}


def rupiah(n: int) -> str:
    """Rp 285.000 (negatif: −Rp 25.000)."""
    s = "Rp " + f"{abs(n):,}".replace(",", ".")
    return f"−{s}" if n < 0 else s


def tanggal(d: date) -> str:
    """12 Nov 2026."""
    return f"{d.day} {BULAN[d.month - 1]} {d.year}"
