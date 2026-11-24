"""Titik masuk FastAPI. Jalankan: `uv run uvicorn app.main:app --port 8000` lalu buka /docs."""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.core.errors import pasang_error_handler
from app.seed import seed_jika_kosong
from app.services.entity.complaint_ticket.router import router as complaint_ticket_router
from app.services.entity.tenant_lease.router import router as tenant_lease_router
from app.services.entity.work_order.router import router as work_order_router
from app.services.task.hmr.router import router as hmr_router
from app.services.utility.ai_classification.router import router as ai_router
from app.services.utility.media_storage.router import router as media_router
from app.services.utility.notification.router import router as notification_router

API_PREFIX = "/api/v1"

# Konsol Windows lama tidak selalu UTF-8; tanpa ini panah "→" di log trace tampil sebagai →.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")
logging.basicConfig(level=logging.INFO, format="%(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if seed_jika_kosong():
        logging.getLogger("kosmos").info("Database baru dibuat dan diisi data demo.")
    yield


settings = get_settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Kosmos API",
    version="0.2.0",
    description=(
        "Service SOA Kosmos. Tag menunjukkan layer: Task, Entity, Utility. "
        "Microservice dipanggil in-process oleh Task sehingga tidak punya endpoint sendiri."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)
pasang_error_handler(app)

ROUTERS = (
    auth_router,
    hmr_router,  # Task
    tenant_lease_router, complaint_ticket_router, work_order_router,  # Entity
    media_router, ai_router, notification_router,  # Utility
)
for r in ROUTERS:
    app.include_router(r, prefix=API_PREFIX)

if settings.demo_mode:
    from app.dev.router import router as dev_router

    app.include_router(dev_router, prefix=API_PREFIX)

# File lampiran dan bukti perbaikan (URL dibentuk dari PUBLIC_BASE_URL).
app.mount("/media-files", StaticFiles(directory=settings.upload_dir), name="media-files")
