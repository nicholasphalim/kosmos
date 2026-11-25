"""[Entity: Work Order] endpoint baca.

Response dirakit read model (app.views) karena memuat nama unit, penghuni, teknisi, dan bukti.
"""

from fastapi import APIRouter

from app import views
from app.core.db import DB
from app.core.security import CurrentUser
from app.views.schemas import WorkOrder

from . import service

router = APIRouter(tags=["Entity: Work Order"])


@router.get("/work-order", response_model=list[WorkOrder], operation_id="listWorkOrder")
def list_work_order(user: CurrentUser, db: DB, id_tiket: int | None = None):
    """Daftar work order (teknisi miliknya, penghuni unitnya, pemilik propertinya)."""
    return [
        views.work_order(db, w)
        for w in service.list_work_order(db, id_tiket)
        if views.boleh_lihat_work_order(db, user, w)
    ]


@router.get("/work-order/{id_work_order}", response_model=WorkOrder, operation_id="getWorkOrder")
def get_work_order(id_work_order: int, user: CurrentUser, db: DB):
    """Get Work Order beserta log servis (Get Progress Servis) dan bukti."""
    return views.work_order(db, views.work_order_untuk(db, user, id_work_order))
