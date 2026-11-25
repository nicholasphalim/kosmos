"""Daftar semua model supaya Base.metadata lengkap (dipakai Alembic autogenerate, seed, dan reset).

Tambahkan import di sini setiap kali sebuah service mendapat models.py baru.
"""

from app.core.db import Base
from app.services.entity.complaint_ticket import models as _complaint_ticket  # noqa: F401
from app.services.entity.technician import models as _technician  # noqa: F401
from app.services.entity.tenant_lease import models as _tenant_lease  # noqa: F401
from app.services.utility.media_storage import models as _media_storage  # noqa: F401
from app.services.utility.notification import models as _notification  # noqa: F401

metadata = Base.metadata
