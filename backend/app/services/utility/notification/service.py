"""[Utility: Notification] Set Notifikasi + outbox. Gagal kirim tidak membatalkan proses (plan §3.1)."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.waktu import now_utc

from .adapters import mock
from .models import Notifikasi


@dataclass(frozen=True)
class Penerima:
    id: int
    no_wa: str


class NotifikasiOut(BaseModel):
    id: int
    kode_tiket: str
    jenis: str
    isi: str
    kanal: Literal["whatsapp"]
    no_tujuan: str
    status_kirim: Literal["terkirim", "gagal"]
    created_at: datetime


def _adapter():
    # Hanya WA_PROVIDER=mock untuk prototype. Adapter WhatsApp sungguhan cukup ditambahkan di sini.
    return mock


def kirim(
    db: Session,
    penerima: list[Penerima],
    kode: str,
    jenis: str,
    isi: Callable[[Penerima], str],
    waktu: datetime | None = None,
) -> int:
    adapter = _adapter()
    for p in penerima:
        teks = isi(p)
        try:
            ok = adapter.kirim(p.no_wa, teks)
        except Exception:
            ok = False
        db.add(
            Notifikasi(
                id_penerima=p.id,
                kode_tiket=kode,
                jenis=jenis,
                isi=teks,
                kanal="whatsapp",
                no_tujuan=p.no_wa,
                status_kirim="terkirim" if ok else "gagal",
                provider=get_settings().wa_provider,
                created_at=waktu or now_utc(),
            )
        )
    db.flush()
    return len(penerima)


def list_untuk(db: Session, id_penerima: int) -> list[NotifikasiOut]:
    q = select(Notifikasi).filter_by(id_penerima=id_penerima).order_by(Notifikasi.created_at, Notifikasi.id)
    return [NotifikasiOut.model_validate(n, from_attributes=True) for n in db.scalars(q)]
