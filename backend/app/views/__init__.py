"""Read model: merakit DTO response dari beberapa service, setara bagian toRingkas/toDetail di mock frontend.

Bukan logika bisnis dan bukan layer SOA. Ada supaya Entity tidak perlu saling meng-import
hanya untuk menampilkan nama unit atau penghuni di response.
Termasuk di sini: otorisasi data (siapa boleh melihat tiket mana).
"""

from sqlalchemy.orm import Session

from app.core.errors import ServiceError
from app.services.entity.complaint_ticket import service as complaint_ticket
from app.services.entity.complaint_ticket.models import Keluhan as KeluhanRow
from app.services.entity.complaint_ticket.models import Tiket
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna
from app.services.utility.media_storage import service as media_storage

from .schemas import Keluhan, RiwayatStatus, TiketDetail, TiketRingkas

# ---------- Otorisasi data ----------


def boleh_lihat_keluhan(db: Session, user: Pengguna, k: KeluhanRow) -> bool:
    if user.role == "penghuni":
        return k.id_penghuni == user.id
    if user.role == "pemilik":
        return tenant_lease.info_unit(db, k.id_unit).id_pemilik == user.id
    return False


def boleh_lihat_tiket(db: Session, user: Pengguna, t: Tiket) -> bool:
    # Teknisi melihat tiket lewat work order yang ditugaskan kepadanya (ditambahkan di fase P5).
    return boleh_lihat_keluhan(db, user, complaint_ticket.get_keluhan(db, t.id_keluhan))


def tiket_untuk(db: Session, user: Pengguna, id_tiket: int) -> Tiket:
    t = complaint_ticket.get_tiket(db, id_tiket)
    if not boleh_lihat_tiket(db, user, t):
        raise ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.")
    return t


def keluhan_untuk(db: Session, user: Pengguna, id_keluhan: int) -> KeluhanRow:
    k = complaint_ticket.get_keluhan(db, id_keluhan)
    if not boleh_lihat_keluhan(db, user, k):
        raise ServiceError(404, "KELUHAN_TIDAK_ADA", "Keluhan tidak ditemukan.")
    return k


# ---------- DTO ----------


def keluhan(db: Session, k: KeluhanRow) -> Keluhan:
    return Keluhan(
        id=k.id,
        kode=complaint_ticket.kode_keluhan(k.id),
        id_penghuni=k.id_penghuni,
        id_unit=k.id_unit,
        deskripsi=k.deskripsi,
        status=k.status,  # type: ignore[arg-type]
        alasan_penolakan=k.alasan_penolakan,
        lampiran=media_storage.list_by_owner(db, "keluhan", k.id),
        created_at=k.created_at,
    )


def _ringkas_fields(db: Session, t: Tiket) -> dict:
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    return dict(
        id=t.id,
        kode=complaint_ticket.kode_tiket(t.id),
        judul=t.judul,
        status=t.status,
        kategori=t.kategori,
        urgensi=t.urgensi,
        perlu_review=t.perlu_review,
        penanganan=t.penanganan,
        unit=tenant_lease.unit_ringkas(db, k.id_unit),
        penghuni=tenant_lease.to_pengguna(tenant_lease.get_pengguna(db, k.id_penghuni)),
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def tiket_ringkas(db: Session, t: Tiket) -> TiketRingkas:
    return TiketRingkas(**_ringkas_fields(db, t))


def tiket_detail(db: Session, t: Tiket) -> TiketDetail:
    return TiketDetail(
        **_ringkas_fields(db, t),
        keluhan=keluhan(db, complaint_ticket.get_keluhan(db, t.id_keluhan)),
        ai_confidence=t.ai_confidence,
        ai_alasan=t.ai_alasan,
        catatan_penanganan=t.catatan_penanganan,
        bisa_dibuka_ulang=complaint_ticket.bisa_dibuka_ulang(db, t),
        riwayat=[
            RiwayatStatus(dari=r.dari, ke=r.ke, waktu=r.waktu, oleh=r.oleh, catatan=r.catatan)  # type: ignore[arg-type]
            for r in complaint_ticket.riwayat(db, t.id)
        ],
    )
