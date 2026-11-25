"""Endpoint auth. `/auth/me` selalu ada; demo login hanya didaftarkan bila DEMO_MODE=true (app/main.py)."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.db import DB
from app.core.errors import ServiceError
from app.core.format import LABEL_KATEGORI
from app.core.security import CurrentUser, buat_token_demo
from app.services.entity.technician import service as technician
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.schemas import Pengguna, PenggunaSaya

router = APIRouter(prefix="/auth", tags=["Auth"])
demo_router = APIRouter(prefix="/auth", tags=["Auth (demo)"])

# Akun yang ditampilkan di halaman login, urutannya sama dengan mock frontend.
ID_AKUN_DEMO = [1, 2, 3, 4, 8, 9, 10]


class AkunDemo(BaseModel):
    pengguna: Pengguna
    keterangan: str
    label_sewa: Literal["aktif", "berakhir", "pemilik", "teknisi"]
    jumlah_properti: int | None = None


class DemoLoginRequest(BaseModel):
    id_pengguna: int


class LoginResponse(BaseModel):
    token: str
    pengguna: Pengguna


@router.get("/me", response_model=PenggunaSaya, operation_id="getPenggunaSaya")
def get_pengguna_saya(user: CurrentUser):
    """Pengguna yang sedang login beserta role-nya. Dipanggil frontend setelah login Google."""
    return PenggunaSaya(id=user.id, nama=user.nama, role=user.role, email=user.email)  # type: ignore[arg-type]


@demo_router.get("/demo-accounts", response_model=list[AkunDemo], operation_id="listDemoAccounts")
def list_demo_accounts(db: DB):
    """Daftar akun demo untuk halaman login."""
    hasil: list[AkunDemo] = []
    for id_ in ID_AKUN_DEMO:
        try:
            p = tenant_lease.get_pengguna(db, id_)
        except ServiceError:
            continue  # data demo sudah diubah: lewati akun yang tidak ada
        out = tenant_lease.to_pengguna(p)
        if p.role == "teknisi":
            t = technician.get_row(db, p.id)
            keahlian = ", ".join(LABEL_KATEGORI[k].lower() for k in t.keahlian)
            status = "terverifikasi" if t.terverifikasi else "belum terverifikasi"
            hasil.append(AkunDemo(pengguna=out, keterangan=f"Teknisi {keahlian} · {status}", label_sewa="teknisi"))
        elif p.role == "pemilik":
            props = tenant_lease.properti_milik(db, p.id)
            hasil.append(
                AkunDemo(
                    pengguna=out,
                    keterangan=", ".join(x.nama for x in props),
                    label_sewa="pemilik",
                    jumlah_properti=len(props),
                )
            )
        else:
            prof = tenant_lease.profil(db, p.id)
            hasil.append(
                AkunDemo(
                    pengguna=out,
                    keterangan=f"{prof.unit.nama_properti} · {prof.unit.nomor_unit}",
                    label_sewa="aktif" if prof.sewa.status_sewa == "aktif" else "berakhir",
                )
            )
    return hasil


@demo_router.post("/demo-login", response_model=LoginResponse, operation_id="demoLogin")
def demo_login(body: DemoLoginRequest, db: DB):
    """Masuk sebagai akun demo dan menerima token JWT."""
    try:
        p = tenant_lease.get_pengguna(db, body.id_pengguna)
    except ServiceError:
        raise ServiceError(404, "PENGGUNA_TIDAK_ADA", "Akun demo tidak ditemukan.") from None
    return LoginResponse(token=buat_token_demo(p.id), pengguna=tenant_lease.to_pengguna(p))
