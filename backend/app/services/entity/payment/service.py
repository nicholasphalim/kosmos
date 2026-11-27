"""[Entity: Payment] Set Metode Pembayaran, Process Payment, Get/Set Status Pembayaran, Reconcile Pembayaran (D2).

Aturan sama dengan `payment` di frontend/src/mocks/services.ts. Payment gateway adalah sistem eksternal
(participant Payment Gateway di SoaML Billing) yang diakses lewat adapter milik Entity ini.
Pilihan adapter lewat PAYMENT_PROVIDER; prototype hanya punya adapter mock.
"""

import secrets
import string
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ServiceError
from app.core.waktu import now_utc

from .adapters import mock
from .models import Pembayaran

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


def set_metode(
    db: Session,
    untuk: str,
    id_tagihan: int,
    metode: str,
    jumlah: int,
    ref: str,
    waktu: datetime | None = None,
) -> Pembayaran:
    """Set Metode Pembayaran: membuka transaksi baru berstatus pending."""
    validasi_metode(metode)
    p = Pembayaran(
        untuk=untuk,
        id_tagihan=id_tagihan,
        ref_gateway=ref,
        metode=metode,
        jumlah=jumlah,
        status="pending",
        alasan_gagal=None,
        direkonsiliasi=False,
        created_at=waktu or now_utc(),
    )
    db.add(p)
    db.flush()
    return p


def _adapter():
    provider = get_settings().payment_provider
    if provider != "mock":
        raise ServiceError(503, "PAYMENT_PROVIDER_TIDAK_DIKENAL", f"PAYMENT_PROVIDER '{provider}' belum tersedia.")
    return mock


def process_payment(ref: str, metode: str, jumlah: int, simulasi_gagal: bool = False) -> HasilGateway:
    """Process Payment ke payment gateway. Bayar sekaligus: satu panggilan untuk total beberapa tagihan.

    `simulasi_gagal` khusus demo (DEMO_MODE): gateway mock menolak transaksi.
    """
    validasi_metode(metode)
    simulasi_gagal = simulasi_gagal and get_settings().demo_mode
    status_gateway, tercatat, alasan = _adapter().charge(ref, metode, jumlah, simulasi_gagal)
    status: Literal["berhasil", "gagal"] = "berhasil" if status_gateway == "settlement" else "gagal"
    return HasilGateway(status, status_gateway, tercatat, alasan)


def get_status(hasil: HasilGateway) -> str:
    """Get Status Pembayaran dari gateway (settlement | deny). Gateway mock langsung tahu statusnya."""
    return hasil.status_gateway


def set_status(db: Session, p: Pembayaran, status: str, alasan: str | None) -> None:
    """Set Status Pembayaran (berhasil | gagal) dari hasil gateway."""
    p.status, p.alasan_gagal = status, alasan
    db.flush()


def reconcile(db: Session, p: Pembayaran, jumlah_gateway: int, total_tagihan: int) -> bool:
    """Reconcile Pembayaran: transaksi berhasil dan jumlah di gateway sama dengan tagihan."""
    p.direkonsiliasi = p.status == "berhasil" and p.jumlah == jumlah_gateway == total_tagihan
    db.flush()
    return p.direkonsiliasi


def list_untuk(db: Session, untuk: str, id_tagihan: int) -> list[Pembayaran]:
    q = select(Pembayaran).filter_by(untuk=untuk, id_tagihan=id_tagihan).order_by(Pembayaran.id)
    return list(db.scalars(q))
