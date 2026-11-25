"""Titik masuk FastAPI. Jalankan: `uv run uvicorn app.main:app --reload --port 8000` lalu buka /docs."""

import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.db import cek_koneksi
from app.core.errors import pasang_error_handler

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

if settings.demo_mode:
    from app.dev.router import router as dev_router

    app.include_router(dev_router, prefix=API_PREFIX)


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
