"""[Utility: Payment Gateway] agnostic: menagih sejumlah uang lewat sebuah metode, tanpa tahu apa yang dibayar.

Dipanggil Task (Complete and Settle Maintenance, Rent Billing). Hasilnya dicatat oleh Entity Payment.
Pilihan adapter lewat PAYMENT_PROVIDER; prototype hanya punya adapter mock.
"""

import secrets
import string
from dataclasses import dataclass
from typing import Literal

from app.core.config import get_settings
from app.core.errors import ServiceError

from .adapters import mock

METODE = ("qris", "va_bca", "va_mandiri", "gopay")
LABEL_METODE = {
    "qris": "QRIS",
    "va_bca": "Virtual Account BCA",
    "va_mandiri": "Virtual Account Mandiri",
    "gopay": "GoPay",
}
_HURUF = string.ascii_uppercase + string.digits


@dataclass(frozen=True)
class HasilGateway:
    ref: str
    status: Literal["berhasil", "gagal"]
    status_gateway: str  # settlement | deny (istilah gateway)
    jumlah_tercatat: int  # jumlah yang benar-benar diterima gateway, dipakai untuk rekonsiliasi
    alasan: str | None


def validasi_metode(metode: str) -> None:
    if metode not in METODE:
        raise ServiceError(422, "METODE_TIDAK_VALID", "Metode pembayaran tidak didukung.")


def ref_baru() -> str:
    """Nomor transaksi gateway, mis. PG-8F3K2Q. Bayar sekaligus memakai satu ref untuk beberapa tagihan."""
    return "PG-" + "".join(secrets.choice(_HURUF) for _ in range(6))


def _adapter():
    provider = get_settings().payment_provider
    if provider != "mock":
        raise ServiceError(503, "PAYMENT_PROVIDER_TIDAK_DIKENAL", f"PAYMENT_PROVIDER '{provider}' belum tersedia.")
    return mock


def proses(ref: str, metode: str, jumlah: int, simulasi_gagal: bool = False) -> HasilGateway:
    """Process Payment. `simulasi_gagal` khusus demo (DEMO_MODE): gateway mock menolak transaksi."""
    validasi_metode(metode)
    simulasi_gagal = simulasi_gagal and get_settings().demo_mode
    status_gateway, tercatat, alasan = _adapter().charge(ref, metode, jumlah, simulasi_gagal)
    status: Literal["berhasil", "gagal"] = "berhasil" if status_gateway == "settlement" else "gagal"
    return HasilGateway(ref, status, status_gateway, tercatat, alasan)
