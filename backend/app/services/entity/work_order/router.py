from fastapi import APIRouter

from app import views
from app.core.security import DB, CurrentUser
from app.views.schemas import WorkOrderOut

from . import service

router = APIRouter(tags=["Entity: Work Order"])


@router.get("/work-order", response_model=list[WorkOrderOut],
            summary="Daftar work order (teknisi miliknya, penghuni unitnya, pemilik propertinya)")
def list_work_order(user: CurrentUser, db: DB, id_tiket: int | None = None):
    return [views.work_order_out(db, w) for w in service.list_semua(db, id_tiket) if views.boleh_lihat_wo(db, user, w)]


@router.get("/work-order/{id_work_order}", response_model=WorkOrderOut,
            summary="Get Work Order beserta log servis (Get Progress Servis) dan bukti")
def get_work_order(id_work_order: int, user: CurrentUser, db: DB):
    return views.work_order_out(db, views.wo_untuk(db, user, id_work_order))
