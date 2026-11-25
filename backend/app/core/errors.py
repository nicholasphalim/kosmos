"""Error seragam sesuai kontrak: { "error": { "kode": "...", "pesan": "..." } }."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ServiceError(Exception):
    """Dilempar service bila aturan bisnis dilanggar. Bentuknya sama dengan ServiceError di mock frontend."""

    def __init__(self, status: int, kode: str, pesan: str):
        super().__init__(pesan)
        self.status = status
        self.kode = kode
        self.pesan = pesan


def _error(status: int, kode: str, pesan: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"kode": kode, "pesan": pesan}})


def pasang_error_handler(app: FastAPI) -> None:
    @app.exception_handler(ServiceError)
    async def _service(_req: Request, e: ServiceError):
        return _error(e.status, e.kode, e.pesan)

    @app.exception_handler(RequestValidationError)
    async def _validasi(_req: Request, e: RequestValidationError):
        pertama = e.errors()[0] if e.errors() else {}
        lokasi = ".".join(str(x) for x in pertama.get("loc", []) if x != "body")
        pesan = f"{lokasi}: {pertama.get('msg', 'tidak valid')}" if lokasi else "Request tidak valid."
        return _error(422, "VALIDASI_GAGAL", pesan)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_req: Request, e: StarletteHTTPException):
        kode = {401: "TIDAK_TERAUTENTIKASI", 403: "AKSES_DITOLAK", 404: "TIDAK_DITEMUKAN", 405: "METODE_TIDAK_DIDUKUNG"}
        return _error(e.status_code, kode.get(e.status_code, "HTTP_ERROR"), str(e.detail))
