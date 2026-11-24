"""Pembulatan yang sama dengan Math.round JavaScript (setengah selalu ke atas).

round() bawaan Python memakai banker's rounding (2.5 -> 2), yang bisa membuat
hasil backend berbeda Rp1 dari mock frontend.
"""

import math


def round_half_up(x: float, digit: int = 0) -> float:
    faktor = 10**digit
    return math.floor(x * faktor + 0.5) / faktor


def bulat(x: float) -> int:
    return int(math.floor(x + 0.5))


def km(n: float) -> str:
    """Label jarak gaya Indonesia: 1,2 km."""
    return f"{n:.1f}".replace(".", ",") + " km"
