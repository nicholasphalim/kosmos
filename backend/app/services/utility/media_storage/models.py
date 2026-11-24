"""[Utility: Media Storage] metadata file. Agnostic: pemilik file hanya dicatat sebagai (owner_type, owner_id)."""

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Lampiran(Base):
    __tablename__ = "lampiran_media"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_type: Mapped[str] = mapped_column(String(20))  # keluhan | bukti
    owner_id: Mapped[int] = mapped_column(Integer, default=0)
    url: Mapped[str] = mapped_column(String(300))
    nama_file: Mapped[str] = mapped_column(String(200))
    mime: Mapped[str] = mapped_column(String(50))
    ukuran_byte: Mapped[int] = mapped_column(Integer)
