"""Auth demo: daftar akun untuk halaman login + login yang menerbitkan JWT."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.errors import ServiceError
from app.core.security import DB, buat_token
from app.services.entity.technician import service as technician
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.schemas import PenggunaOut

router = APIRouter(prefix="/auth", tags=["Auth (demo)"])

# Akun yang ditampilkan di halaman login, urutannya sama dengan mock frontend.
ID_AKUN_DEMO = [1, 2, 3, 4, 8, 9, 10]
LABEL_KATEGORI = {"AC": "AC", "listrik": "Listrik", "air": "Air", "lainnya": "Lainnya"}


class AkunDemo(BaseModel):
    pengguna: PenggunaOut
    keterangan: str
    label_sewa: Literal["aktif", "berakhir", "pemilik", "teknisi"]
    jumlah_properti: int | None = None


class DemoLoginRequest(BaseModel):
    id_pengguna: int


class LoginResponse(BaseModel):
    token: str
    pengguna: PenggunaOut


@router.get("/demo-accounts", response_model=list[AkunDemo], summary="Daftar akun demo untuk halaman login")
def list_demo_accounts(db: DB):
    hasil: list[AkunDemo] = []
    for id_ in ID_AKUN_DEMO:
        p = tenant_lease.get_pengguna(db, id_)
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


@router.post("/demo-login", response_model=LoginResponse, summary="Masuk sebagai akun demo dan menerima token JWT")
def demo_login(body: DemoLoginRequest, db: DB):
    try:
        p = tenant_lease.get_pengguna(db, body.id_pengguna)
    except ServiceError:
        raise ServiceError(404, "PENGGUNA_TIDAK_ADA", "Akun demo tidak ditemukan.") from None
    return LoginResponse(token=buat_token(p.id), pengguna=tenant_lease.to_pengguna(p))
