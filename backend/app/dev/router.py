"""Endpoint khusus demo. Hanya dipasang saat DEMO_MODE=true."""

import shutil

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings
from app.seed import reset_semua

router = APIRouter(prefix="/dev", tags=["Dev (demo)"])


class ResetResponse(BaseModel):
    ok: bool


@router.post("/reset", response_model=ResetResponse, summary="Kembalikan semua data ke kondisi awal demo")
def reset_demo():
    reset_semua()
    upload = get_settings().upload_dir
    shutil.rmtree(upload, ignore_errors=True)
    upload.mkdir(parents=True, exist_ok=True)
    return ResetResponse(ok=True)
