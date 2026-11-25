"""[Utility: Media Storage] endpoint agnostic, bisa dipakai proses lain."""

from fastapi import APIRouter, UploadFile

from app.core.db import DB
from app.core.errors import ServiceError
from app.core.security import CurrentUser

from . import service
from .service import FileMasuk, LampiranOut

router = APIRouter(tags=["Utility: Media Storage"])


async def baca_upload(f: UploadFile) -> FileMasuk:
    return FileMasuk(nama=f.filename or "file", mime=f.content_type or "application/octet-stream", isi=await f.read())


@router.post("/media", status_code=201, response_model=LampiranOut, operation_id="addLampiranMedia")
async def add_lampiran_media(_user: CurrentUser, db: DB, file: UploadFile | None = None):
    """Simpan satu file media dan kembalikan URL-nya."""
    if file is None:
        raise ServiceError(422, "FILE_KOSONG", "Field file wajib diisi.")
    f = await baca_upload(file)
    service.validasi([f])
    row = service.simpan(db, f, owner_type="umum")
    db.commit()
    return service.to_out(row)
