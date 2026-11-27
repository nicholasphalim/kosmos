"""Autentikasi dan otorisasi (plan §7.2).

Dua jenis token Bearer, dibedakan dari klaim `iss`:
- Token Supabase Auth (login Google): diverifikasi dengan kunci publik JWKS project Supabase,
  lalu pengguna dicari lewat Tenant and Lease (auth_user_id, atau email saat login pertama).
- Token demo (`iss = kosmos-demo`): diterbitkan /auth/demo-login, HS256, hanya berlaku bila DEMO_MODE=true.

Endpoint memakai `CurrentUser` (siapa pun yang login) atau `require_role(...)`.
"""

import uuid
from datetime import timedelta
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.db import DB
from app.core.errors import ServiceError
from app.core.waktu import now_utc
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna

ISS_DEMO = "kosmos-demo"
AUDIENCE_SUPABASE = "authenticated"

_bearer = HTTPBearer(auto_error=False, description="JWT Supabase (login Google) atau token demo")


def _tidak_terautentikasi() -> ServiceError:
    return ServiceError(401, "TIDAK_TERAUTENTIKASI", "Silakan masuk terlebih dahulu.")


def _belum_terdaftar() -> ServiceError:
    return ServiceError(
        403,
        "EMAIL_BELUM_TERDAFTAR",
        "Email ini belum terdaftar di Kosmos. Minta pemilik kos mendaftarkan email kamu.",
    )


# ----- Token demo -----


def _secret_demo() -> str:
    s = get_settings()
    secret = s.demo_jwt_secret.get_secret_value()
    if not s.demo_mode or len(secret) < 32:
        raise _tidak_terautentikasi()
    return secret


def buat_token_demo(id_pengguna: int) -> str:
    s = get_settings()
    payload = {
        "iss": ISS_DEMO,
        "sub": str(id_pengguna),
        "iat": now_utc(),
        "exp": now_utc() + timedelta(hours=s.demo_jwt_expire_jam),
    }
    return jwt.encode(payload, _secret_demo(), algorithm="HS256")


def _pengguna_dari_token_demo(token: str, db) -> Pengguna:
    try:
        payload = jwt.decode(token, _secret_demo(), algorithms=["HS256"], issuer=ISS_DEMO, options={"require": ["exp"]})
        p = db.get(Pengguna, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _tidak_terautentikasi() from None
    if p is None:  # misalnya token dari sebelum reset data
        raise _tidak_terautentikasi()
    return p


# ----- Token Supabase -----


def iss_supabase() -> str:
    return f"{get_settings().supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    # Kunci publik di-cache supaya tidak mengambil JWKS di setiap request.
    return jwt.PyJWKClient(f"{iss_supabase()}/.well-known/jwks.json", cache_keys=True, lifespan=3600, timeout=10)


def kunci_publik_supabase(token: str):
    """Kunci publik untuk memverifikasi token Supabase. Test mengganti fungsi ini dengan kunci test."""
    return _jwks_client().get_signing_key_from_jwt(token).key


def _pengguna_dari_token_supabase(token: str, db) -> Pengguna:
    try:
        payload = jwt.decode(
            token,
            kunci_publik_supabase(token),
            algorithms=["ES256", "RS256"],
            audience=AUDIENCE_SUPABASE,
            issuer=iss_supabase(),
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
        auth_user_id = uuid.UUID(payload["sub"])
        email = payload["email"]
        meta = payload.get("app_metadata") or {}
        provider = meta.get("providers") or [meta.get("provider")]
    except (jwt.PyJWTError, KeyError, ValueError, TypeError, AttributeError):
        raise _tidak_terautentikasi() from None
    if not isinstance(email, str) or not email:
        raise _tidak_terautentikasi()
    # Hanya login Google: email dari Google sudah terverifikasi. Tanpa cek ini, akun email/password Supabase
    # (bila provider itu aktif) dengan email penghuni yang belum login bisa mengambil alih akun penghuni itu.
    if not isinstance(provider, list) or "google" not in provider:
        raise _tidak_terautentikasi()
    p = tenant_lease.cari_untuk_login_google(db, auth_user_id, email)
    if p is None:
        raise _belum_terdaftar()
    return p


# ----- Dependency -----


def current_user(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: DB,
) -> Pengguna:
    if cred is None:
        raise _tidak_terautentikasi()
    token = cred.credentials
    try:
        iss = jwt.decode(token, options={"verify_signature": False}).get("iss")
    except jwt.PyJWTError:
        raise _tidak_terautentikasi() from None
    if iss == ISS_DEMO:
        return _pengguna_dari_token_demo(token, db)
    if get_settings().supabase_url and iss == iss_supabase():
        return _pengguna_dari_token_supabase(token, db)
    raise _tidak_terautentikasi()


CurrentUser = Annotated[Pengguna, Depends(current_user)]


def require_role(*roles: str):
    """Dependency: pengguna yang login dan role-nya termasuk `roles`, selain itu 403."""

    def _cek(user: CurrentUser) -> Pengguna:
        if user.role not in roles:
            raise ServiceError(403, "AKSES_DITOLAK", f"Operasi ini hanya untuk {' atau '.join(roles)}.")
        return user

    return _cek


Penghuni = Annotated[Pengguna, Depends(require_role("penghuni"))]
Pemilik = Annotated[Pengguna, Depends(require_role("pemilik"))]
Teknisi = Annotated[Pengguna, Depends(require_role("teknisi"))]
