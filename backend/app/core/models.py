"""Daftar semua model supaya Base.metadata lengkap (dipakai Alembic autogenerate, seed, dan reset).

Tambahkan import di sini setiap kali sebuah service mendapat models.py baru.
"""

from app.core.db import Base
from app.services.entity.technician import models as _technician  # noqa: F401
from app.services.entity.tenant_lease import models as _tenant_lease  # noqa: F401

metadata = Base.metadata
