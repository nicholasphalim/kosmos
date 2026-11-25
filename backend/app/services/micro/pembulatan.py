"""Helper angka bersama untuk Micro (bukan service).

round() bawaan Python memakai pembulatan bankir (round(2.5) == 2), jadi angka hasil Micro bisa
berbeda satu digit dengan mode mock. Semua Micro memakai `bulat` (setengah ke atas, sama dengan Math.round).
"""

import math


def bulat(x: float) -> int:
    return math.floor(x + 0.5)


def km(n: float) -> str:
    """3.2 -> "3,2 km"."""
    return f"{n:.1f}".replace(".", ",") + " km"
