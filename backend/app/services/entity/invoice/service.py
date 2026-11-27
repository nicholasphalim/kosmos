"""[Entity: Invoice] tagihan ke pemilik. Aturan sama dengan `invoice` di frontend/src/mocks/services.ts.

Riwayat pembayaran disimpan Entity Payment; pencatatan kas oleh Entity Financial Ledger.
"""

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ServiceError
from app.core.waktu import WIB, now_utc, today

from .models import Invoice

HARI_JATUH_TEMPO = 7


def kode_invoice(id_: int) -> str:
    return f"INV-{id_:04d}"


def add(
    db: Session,
    id_work_order: int,
    jenis: str,
    rincian: list[dict],
    biaya: int,
    persen_komisi: int,
    komisi: int,
    terbit: datetime | None = None,
) -> Invoice:
    """Add Invoice. Jatuh tempo 7 hari setelah terbit; total = biaya (komisi dipotong dari bagian teknisi)."""
    terbit = terbit or now_utc()
    i = Invoice(
        id_work_order=id_work_order,
        jenis=jenis,
        rincian=rincian,
        biaya=biaya,
        persen_komisi=persen_komisi,
        komisi=komisi,
        total=biaya,
        status="belum_dibayar",
        jatuh_tempo=terbit.astimezone(WIB).date() + timedelta(days=HARI_JATUH_TEMPO),
        created_at=terbit,
    )
    db.add(i)
    db.flush()
    return i


def get(db: Session, id_invoice: int) -> Invoice:
    i = db.get(Invoice, id_invoice)
    if i is None:
        raise ServiceError(404, "INVOICE_TIDAK_ADA", "Invoice tidak ditemukan.")
    return i


def by_work_order(db: Session, id_wo: int) -> Invoice | None:
    return db.scalars(select(Invoice).filter_by(id_work_order=id_wo).order_by(Invoice.id)).first()


def list_invoice(db: Session) -> list[Invoice]:
    """Semua invoice, terbaru dulu. Filter otorisasi dilakukan pemanggil."""
    return list(db.scalars(select(Invoice).order_by(Invoice.created_at.desc(), Invoice.id.desc())))


def terlambat(i: Invoice, hari_ini: date | None = None) -> bool:
    """Belum dibayar dan sudah lewat jatuh tempo (dihitung, tidak disimpan)."""
    return i.status == "belum_dibayar" and (hari_ini or today()) > i.jatuh_tempo


def set_lunas(db: Session, id_invoice: int, waktu: datetime) -> None:
    i = get(db, id_invoice)
    i.status, i.dibayar_at = "lunas", waktu
    db.flush()
