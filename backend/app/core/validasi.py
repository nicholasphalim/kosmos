"""Aturan validasi input yang mengikuti dunia nyata, sama dengan frontend/src/lib/validasi.ts.

Dipakai service saat menerima input pengguna. Pesan error ditulis untuk ditampilkan langsung di UI.
"""

import re
from datetime import date

from app.core.errors import ServiceError
from app.core.waktu import tanggal_geser, today

TANDA_NAMA = " .'-"
MIN_HURUF_TEKS = 3
MAKS_HARI_MULAI_DEPAN = 365  # sewa paling lambat dimulai 1 tahun dari hari ini
MAKS_TAHUN_SEWA = 5


def _galat(pesan: str) -> ServiceError:
    return ServiceError(422, "VALIDASI_GAGAL", pesan)


def nama_orang(nama: str) -> str:
    """Huruf (termasuk huruf beraksen), spasi, titik, tanda petik, tanda hubung. Diawali huruf, minimal 2 huruf."""
    nama = " ".join(nama.split())
    if not 2 <= len(nama) <= 100:
        raise _galat("Nama harus 2 sampai 100 karakter.")
    if not nama[0].isalpha() or not all(c.isalpha() or c in TANDA_NAMA for c in nama):
        raise _galat("Nama hanya boleh berisi huruf, spasi, titik, tanda petik, atau tanda hubung.")
    if sum(c.isalpha() for c in nama) < 2:
        raise _galat("Nama minimal 2 huruf.")
    return nama


def no_wa_indonesia(no_wa: str) -> str:
    """Nomor HP Indonesia (+62, 62, atau 08), 10-13 digit. Disimpan seragam: 0812-3456-7890."""
    angka = re.sub(r"[\s\-.()]", "", no_wa)
    if angka.startswith("+62"):
        angka = "0" + angka[3:]
    elif angka.startswith("62"):
        angka = "0" + angka[2:]
    if not re.fullmatch(r"08\d{8,11}", angka):
        raise _galat("Nomor WhatsApp harus nomor HP Indonesia, contoh 0812-3456-7890.")
    return f"{angka[:4]}-{angka[4:8]}-{angka[8:]}"


def periode_sewa(mulai: date, selesai: date, hari_ini: date | None = None) -> None:
    """Periode sewa baru: selesai setelah mulai, belum berakhir, mulai paling lambat 1 tahun lagi, maks. 5 tahun."""
    hari_ini = hari_ini or today()
    if selesai <= mulai:
        raise _galat("Tanggal selesai sewa harus setelah tanggal mulai.")
    if selesai < hari_ini:
        raise _galat("Periode sewa sudah berakhir. Masukkan sewa yang masih berjalan atau akan datang.")
    if mulai > tanggal_geser(MAKS_HARI_MULAI_DEPAN, hari_ini):
        raise _galat("Sewa paling lambat dimulai 1 tahun dari hari ini.")
    try:
        batas = mulai.replace(year=mulai.year + MAKS_TAHUN_SEWA)
    except ValueError:  # 29 Februari
        batas = mulai.replace(year=mulai.year + MAKS_TAHUN_SEWA, day=28)
    if selesai > batas:
        raise _galat(f"Periode sewa maksimal {MAKS_TAHUN_SEWA} tahun.")


def teks_bermakna(teks: str, min_huruf: int = MIN_HURUF_TEKS) -> bool:
    """Teks bebas harus berisi kata, bukan hanya angka atau tanda baca."""
    return sum(c.isalpha() for c in teks) >= min_huruf
