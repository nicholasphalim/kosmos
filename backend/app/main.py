"""Titik masuk FastAPI. Jalankan: `uv run uvicorn app.main:app --reload --port 8000` lalu buka /docs."""

import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.auth.router import demo_router as auth_demo_router
from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.core.db import cek_koneksi
from app.core.errors import pasang_error_handler
from app.services.entity.complaint_ticket.router import router as complaint_ticket_router
from app.services.entity.financial_ledger.router import router as financial_ledger_router
from app.services.entity.invoice.router import router as invoice_router
from app.services.entity.rent_invoice.router import router as rent_invoice_router
from app.services.entity.tenant_lease.router import router as tenant_lease_router
from app.services.entity.work_order.router import router as work_order_router
from app.services.task.csm.router import router as csm_router
from app.services.task.hmr.router import router as hmr_router
from app.services.task.rent_billing.router import router as rent_billing_router
from app.services.utility.ai_classification.router import router as ai_router
from app.services.utility.media_storage.router import router as media_router
from app.services.utility.notification.router import router as notification_router

API_PREFIX = "/api/v1"

# Konsol Windows lama tidak selalu UTF-8; tanpa ini panah "→" di log trace tampil rusak.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")
logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("kosmos")

settings = get_settings()

app = FastAPI(
    title="Kosmos API",
    version="0.3.0",
    description=(
        "Service SOA Kosmos. Tag menunjukkan layer: Task, Entity, Utility. "
        "Microservice dipanggil in-process oleh Task sehingga tidak punya endpoint sendiri."
    ),
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
    csm_router,
    rent_billing_router,
    tenant_lease_router,  # Entity
    complaint_ticket_router,
    work_order_router,
    invoice_router,
    rent_invoice_router,
    financial_ledger_router,
    media_router,  # Utility
    ai_router,
    notification_router,
)
for r in ROUTERS:
    app.include_router(r, prefix=API_PREFIX)

if settings.demo_mode:
    from app.dev.router import router as dev_router

    app.include_router(auth_demo_router, prefix=API_PREFIX)
    app.include_router(dev_router, prefix=API_PREFIX)

if settings.storage_provider == "local":
    # Adapter storage lokal (test/pengembangan): file disajikan langsung oleh FastAPI.
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/media-files", StaticFiles(directory=settings.upload_dir), name="media-files")


@app.get("/health", tags=["Ops"], summary="Liveness: server hidup (tanpa cek database)")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health/db", tags=["Ops"], summary="Readiness: database bisa dihubungi")
def health_db() -> JSONResponse:
    try:
        cek_koneksi()
    except Exception as e:  # pesan ke client disederhanakan, nama error hanya di log server
        log.warning("Cek database gagal: %s", e.__class__.__name__)
        return JSONResponse(status_code=503, content={"status": "gagal", "database": "tidak terhubung"})
    return JSONResponse(content={"status": "ok", "database": "terhubung"})
