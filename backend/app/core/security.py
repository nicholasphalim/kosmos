"""Auth demo: login memilih akun, lalu server menerbitkan JWT asli (HS256)."""

from datetime import timedelta
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ServiceError
from app.core.waktu import now_utc
from app.services.entity.tenant_lease.models import Pengguna

_bearer = HTTPBearer(auto_error=False)


def buat_token(id_pengguna: int) -> str:
    s = get_settings()
    payload = {"sub": str(id_pengguna), "exp": now_utc() + timedelta(hours=s.jwt_expire_jam)}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def current_user(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> Pengguna:
    gagal = ServiceError(401, "TIDAK_TERAUTENTIKASI", "Silakan masuk terlebih dahulu.")
    if cred is None:
        raise gagal
    try:
        payload = jwt.decode(cred.credentials, get_settings().jwt_secret, algorithms=["HS256"])
        p = db.get(Pengguna, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise gagal from None
    if p is None:  # misalnya token dari sebelum reset data
        raise gagal
    return p


def require_role(user: Pengguna, role: str) -> None:
    if user.role != role:
        raise ServiceError(403, "AKSES_DITOLAK", f"Operasi ini hanya untuk {role}.")


CurrentUser = Annotated[Pengguna, Depends(current_user)]
DB = Annotated[Session, Depends(get_db)]
