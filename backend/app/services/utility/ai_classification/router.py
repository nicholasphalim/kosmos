from fastapi import APIRouter
from pydantic import BaseModel

from app.core.security import CurrentUser

from . import service
from .service import KlasifikasiOut

router = APIRouter(tags=["Utility: AI Classification"])


class KlasifikasiRequest(BaseModel):
    teks: str
    media_url: list[str] | None = None


@router.post("/klasifikasi", response_model=KlasifikasiOut, summary="Klasifikasi kategori dan urgensi dari teks dan gambar")
def classify_keluhan(body: KlasifikasiRequest, _user: CurrentUser):
    return service.classify(body.teks, len(body.media_url or []))
