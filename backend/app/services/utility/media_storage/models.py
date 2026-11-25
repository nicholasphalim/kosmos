"""[Utility: Media Storage] metadata file. Agnostic: pemilik file hanya dicatat sebagai (owner_type, owner_id).

Isi file tidak disimpan di database. `storage_path` menunjuk ke objek di adapter storage
(Supabase Storage atau folder lokal); URL untuk browser dibuat saat dibaca (signed URL).
"""

from datetime import datetime

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime


class Lampiran(Base):
    __tablename__ = "lampiran_media"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_type: Mapped[str] = mapped_column(String(20))  # keluhan | bukti | umum
    owner_id: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str] = mapped_column(String(300))
    nama_file: Mapped[str] = mapped_column(String(200))
    mime: Mapped[str] = mapped_column(String(100))
    ukuran_byte: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
