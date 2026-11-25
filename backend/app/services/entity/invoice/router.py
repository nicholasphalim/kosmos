"""[Entity: Invoice] endpoint baca. Invoice hanya terlihat oleh pemilik properti yang ditagih."""

from fastapi import APIRouter

from app import views
from app.core.db import DB
from app.core.security import CurrentUser
from app.views.schemas import Invoice

from . import service

router = APIRouter(tags=["Entity: Invoice"])


@router.get("/invoice", response_model=list[Invoice], operation_id="listInvoice")
def list_invoice(user: CurrentUser, db: DB):
    """Daftar invoice perbaikan yang ditagihkan ke pemilik (properti miliknya)."""
    return [views.invoice(db, i) for i in service.list_invoice(db) if views.boleh_lihat_invoice(db, user, i)]


@router.get("/invoice/{id_invoice}", response_model=Invoice, operation_id="getInvoice")
def get_invoice(id_invoice: int, user: CurrentUser, db: DB):
    """Get Invoice beserta riwayat percobaan pembayaran."""
    return views.invoice(db, views.invoice_untuk(db, user, id_invoice))
